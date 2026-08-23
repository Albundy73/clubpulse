import { prisma } from "@/lib/db";
import { fetchTheSportsDbSupportedCompetitionTeams } from "@/lib/sources/thesportsdb-competition-teams";

const PROVIDER = "thesportsdb";
const FOOTBALL_SPORT_ID = "football";

export async function syncTheSportsDbCompetitionTeamCatalog() {
  const catalogs = await fetchTheSportsDbSupportedCompetitionTeams();

  let teamsObserved = 0;
  let teamsUpserted = 0;
  let membershipsRebuilt = 0;
  let staleMembershipsRemoved = 0;
  const diagnostics: Array<{
    competitionId: string;
    competitionName: string;
    returnedTeams: number;
    expectedTeamCount?: number;
    complete: boolean;
    sources: string[];
    matchObservedTeams: number;
  }> = [];

  for (const catalog of catalogs) {
    const competitionId = `thesportsdb-league-${catalog.competitionExternalId}`;
    const competition = await prisma.competition.findUnique({ where: { id: competitionId } });
    if (!competition) {
      throw new Error(`Competition ${competitionId} must be ingested before its team catalog`);
    }

    const membershipTeamIds = new Set<string>();

    for (const providerTeam of catalog.teams) {
      teamsObserved += 1;

      const existingTeam = await prisma.team.findUnique({
        where: {
          sourceProvider_sourceExternalId: {
            sourceProvider: PROVIDER,
            sourceExternalId: providerTeam.idTeam,
          },
        },
        include: { club: true },
      });

      let teamId: string;

      if (existingTeam) {
        teamId = existingTeam.id;
        await prisma.team.update({
          where: { id: teamId },
          data: {
            name: providerTeam.strTeam,
            category: "Senior Men",
          },
        });

        // Preserve canonical ClubPulse club IDs/city mappings for teams such as
        // Benfica and Sporting while refreshing provider-backed display data.
        await prisma.club.update({
          where: { id: existingTeam.clubId },
          data: {
            name: providerTeam.strTeam,
            shortName: providerTeam.strTeamShort ?? providerTeam.strTeam,
            sportId: FOOTBALL_SPORT_ID,
          },
        });
      } else {
        const clubId = `thesportsdb-club-${providerTeam.idTeam}`;
        teamId = `thesportsdb-team-${providerTeam.idTeam}`;

        await prisma.club.upsert({
          where: { id: clubId },
          create: {
            id: clubId,
            name: providerTeam.strTeam,
            shortName: providerTeam.strTeamShort ?? providerTeam.strTeam,
            cityId: null,
            sportId: FOOTBALL_SPORT_ID,
            sourceProvider: PROVIDER,
            sourceExternalId: providerTeam.idTeam,
            sourceUrl: providerTeam.strWebsite ?? null,
          },
          update: {
            name: providerTeam.strTeam,
            shortName: providerTeam.strTeamShort ?? providerTeam.strTeam,
            sportId: FOOTBALL_SPORT_ID,
            sourceUrl: providerTeam.strWebsite ?? null,
          },
        });

        await prisma.team.upsert({
          where: { id: teamId },
          create: {
            id: teamId,
            clubId,
            name: providerTeam.strTeam,
            category: "Senior Men",
            sourceProvider: PROVIDER,
            sourceExternalId: providerTeam.idTeam,
            sourceUrl: providerTeam.strWebsite ?? null,
          },
          update: {
            clubId,
            name: providerTeam.strTeam,
            category: "Senior Men",
            sourceProvider: PROVIDER,
            sourceExternalId: providerTeam.idTeam,
            sourceUrl: providerTeam.strWebsite ?? null,
          },
        });
      }

      teamsUpserted += 1;
      membershipTeamIds.add(teamId);
    }

    // Stored fixtures are also trusted evidence of membership. This preserves
    // legitimate teams when the free catalog endpoints return a capped subset.
    const matches = await prisma.match.findMany({
      where: { competitionId },
      select: { homeTeamId: true, awayTeamId: true },
    });
    const matchTeamIds = new Set<string>();
    for (const match of matches) {
      membershipTeamIds.add(match.homeTeamId);
      membershipTeamIds.add(match.awayTeamId);
      matchTeamIds.add(match.homeTeamId);
      matchTeamIds.add(match.awayTeamId);
    }

    // Membership is a synchronized set, not an append-only history. Removing
    // everything first cleans the bogus teams introduced by the old legacy
    // lookup_all_teams endpoint and prevents counts from growing on refresh.
    const removed = await prisma.competitionTeam.deleteMany({ where: { competitionId } });
    staleMembershipsRemoved += removed.count;

    const memberships = Array.from(membershipTeamIds).map((teamId) => ({ competitionId, teamId }));
    if (memberships.length > 0) {
      await prisma.competitionTeam.createMany({ data: memberships, skipDuplicates: true });
    }
    membershipsRebuilt += memberships.length;

    diagnostics.push({
      competitionId,
      competitionName: catalog.competitionName,
      returnedTeams: catalog.teams.length,
      expectedTeamCount: catalog.expectedTeamCount,
      complete: catalog.complete,
      sources: catalog.sources,
      matchObservedTeams: matchTeamIds.size,
    });
  }

  return {
    competitionTeamCatalogsFetched: catalogs.length,
    competitionTeamsObserved: teamsObserved,
    competitionTeamsUpserted: teamsUpserted,
    competitionTeamMembershipsRebuilt: membershipsRebuilt,
    staleCompetitionTeamMembershipsRemoved: staleMembershipsRemoved,
    competitionTeamCatalogDiagnostics: diagnostics,
  };
}

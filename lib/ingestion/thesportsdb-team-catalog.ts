import { prisma } from "@/lib/db";
import { fetchTheSportsDbSupportedCompetitionTeams } from "@/lib/sources/thesportsdb-competition-teams";

const PROVIDER = "thesportsdb";
const FOOTBALL_SPORT_ID = "football";

export async function syncTheSportsDbCompetitionTeamCatalog() {
  const competitions = await prisma.competition.findMany({
    where: { sourceProvider: PROVIDER },
    select: { sourceExternalId: true, season: true },
  });
  const seasonByExternalId = new Map(
    competitions.map((competition) => [competition.sourceExternalId, competition.season ?? undefined]),
  );
  const catalogs = await fetchTheSportsDbSupportedCompetitionTeams(seasonByExternalId);

  let teamsObserved = 0;
  let teamsUpserted = 0;
  let membershipsRebuilt = 0;
  let staleMembershipsRemoved = 0;
  const diagnostics: Array<{
    competitionId: string;
    competitionName: string;
    season?: string;
    returnedTeams: number;
    expectedTeamCount?: number;
    complete: boolean;
    authoritativeRebuild: boolean;
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
          data: { name: providerTeam.strTeam, category: "Senior Men" },
        });
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

    const authoritativeRebuild = catalog.expectedTeamCount !== undefined
      && membershipTeamIds.size >= catalog.expectedTeamCount;

    if (authoritativeRebuild) {
      const removed = await prisma.competitionTeam.deleteMany({ where: { competitionId } });
      staleMembershipsRemoved += removed.count;
    }

    const memberships = Array.from(membershipTeamIds).map((teamId) => ({ competitionId, teamId }));
    if (memberships.length > 0) {
      await prisma.competitionTeam.createMany({ data: memberships, skipDuplicates: true });
    }
    membershipsRebuilt += memberships.length;

    diagnostics.push({
      competitionId,
      competitionName: catalog.competitionName,
      season: catalog.season,
      returnedTeams: catalog.teams.length,
      expectedTeamCount: catalog.expectedTeamCount,
      complete: catalog.expectedTeamCount !== undefined
        ? membershipTeamIds.size >= catalog.expectedTeamCount
        : false,
      authoritativeRebuild,
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

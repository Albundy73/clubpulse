import { prisma } from "@/lib/db";
import { fetchTheSportsDbSupportedCompetitionTeams } from "@/lib/sources/thesportsdb-competition-teams";

const PROVIDER = "thesportsdb";
const FOOTBALL_SPORT_ID = "football";

export async function syncTheSportsDbCompetitionTeamCatalog() {
  const catalogs = await fetchTheSportsDbSupportedCompetitionTeams();

  let teamsObserved = 0;
  let teamsUpserted = 0;
  let membershipsUpserted = 0;
  const diagnostics: Array<{
    competitionId: string;
    competitionName: string;
    returnedTeams: number;
    possiblyTruncated: boolean;
  }> = [];

  for (const catalog of catalogs) {
    const competitionId = `thesportsdb-league-${catalog.competitionExternalId}`;
    const competition = await prisma.competition.findUnique({ where: { id: competitionId } });
    if (!competition) {
      throw new Error(`Competition ${competitionId} must be ingested before its team catalog`);
    }

    diagnostics.push({
      competitionId,
      competitionName: catalog.competitionName,
      returnedTeams: catalog.teams.length,
      possiblyTruncated: catalog.possiblyTruncated,
    });

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
        // Benfica and Sporting, while still refreshing the display name.
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

      await prisma.competitionTeam.upsert({
        where: { competitionId_teamId: { competitionId, teamId } },
        create: { competitionId, teamId },
        update: {},
      });
      membershipsUpserted += 1;
    }
  }

  return {
    competitionTeamCatalogsFetched: catalogs.length,
    competitionTeamsObserved: teamsObserved,
    competitionTeamsUpserted: teamsUpserted,
    competitionTeamMembershipsUpserted: membershipsUpserted,
    competitionTeamCatalogDiagnostics: diagnostics,
  };
}

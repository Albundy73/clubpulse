import { prisma } from "@/lib/db";
import { fetchTheSportsDbSupportedCompetitionTeams, SUPPORTED_FOOTBALL_COMPETITIONS } from "@/lib/sources/thesportsdb-competition-teams";

const PROVIDER = "thesportsdb";
const FOOTBALL_SPORT_ID = "football";

function alignSupportedTeamCatalogCompetitions() {
  const competitions = SUPPORTED_FOOTBALL_COMPETITIONS as unknown as Array<{
    externalId: string;
    name: string;
    expectedTeamCount?: number;
    tournament?: boolean;
  }>;
  const ligue2Index = competitions.findIndex((competition) => competition.externalId === "4401");
  if (ligue2Index >= 0) competitions.splice(ligue2Index, 1, { externalId: "4484", name: "Coupe de France", tournament: true });
  else if (!competitions.some((competition) => competition.externalId === "4484")) competitions.push({ externalId: "4484", name: "Coupe de France", tournament: true });
}

export async function syncTheSportsDbCompetitionTeamCatalog() {
  alignSupportedTeamCatalogCompetitions();
  const competitions = await prisma.competition.findMany({ where: { sourceProvider: PROVIDER }, select: { sourceExternalId: true, season: true } });
  const seasonByExternalId = new Map<string, string | undefined>();
  for (const competition of competitions) if (competition.sourceExternalId) seasonByExternalId.set(competition.sourceExternalId, competition.season ?? undefined);
  const catalogs = await fetchTheSportsDbSupportedCompetitionTeams(seasonByExternalId);

  let teamsObserved = 0; let teamsUpserted = 0; let membershipsRebuilt = 0; let staleMembershipsRemoved = 0;
  const diagnostics: Array<{ competitionId: string; competitionName: string; season?: string; returnedTeams: number; expectedTeamCount?: number; complete: boolean; authoritativeRebuild: boolean; sources: string[]; matchObservedTeams: number }> = [];

  for (const catalog of catalogs) {
    const competitionId = `thesportsdb-league-${catalog.competitionExternalId}`;
    const competition = await prisma.competition.findUnique({ where: { id: competitionId } });
    if (!competition) throw new Error(`Competition ${competitionId} must be ingested before its team catalog`);
    if (catalog.competitionBadgeUrl) await prisma.competition.update({ where: { id: competitionId }, data: { imageUrl: catalog.competitionBadgeUrl } });

    const membershipTeamIds = new Set<string>();
    for (const providerTeam of catalog.teams) {
      teamsObserved += 1;
      const existingTeam = await prisma.team.findUnique({ where: { sourceProvider_sourceExternalId: { sourceProvider: PROVIDER, sourceExternalId: providerTeam.idTeam } }, include: { club: true } });
      let teamId: string;
      if (existingTeam) {
        teamId = existingTeam.id;
        await prisma.team.update({ where: { id: teamId }, data: { name: providerTeam.strTeam, category: "Senior Men", imageUrl: providerTeam.strBadge ?? existingTeam.imageUrl } });
        await prisma.club.update({ where: { id: existingTeam.clubId }, data: { name: providerTeam.strTeam, shortName: providerTeam.strTeamShort ?? providerTeam.strTeam, sportId: FOOTBALL_SPORT_ID } });
      } else {
        const clubId = `thesportsdb-club-${providerTeam.idTeam}`; teamId = `thesportsdb-team-${providerTeam.idTeam}`;
        await prisma.club.upsert({ where: { id: clubId }, create: { id: clubId, name: providerTeam.strTeam, shortName: providerTeam.strTeamShort ?? providerTeam.strTeam, cityId: null, sportId: FOOTBALL_SPORT_ID, sourceProvider: PROVIDER, sourceExternalId: providerTeam.idTeam, sourceUrl: providerTeam.strWebsite ?? null }, update: { name: providerTeam.strTeam, shortName: providerTeam.strTeamShort ?? providerTeam.strTeam, sportId: FOOTBALL_SPORT_ID, sourceUrl: providerTeam.strWebsite ?? null } });
        await prisma.team.upsert({ where: { id: teamId }, create: { id: teamId, clubId, name: providerTeam.strTeam, category: "Senior Men", imageUrl: providerTeam.strBadge ?? null, sourceProvider: PROVIDER, sourceExternalId: providerTeam.idTeam, sourceUrl: providerTeam.strWebsite ?? null }, update: { clubId, name: providerTeam.strTeam, category: "Senior Men", imageUrl: providerTeam.strBadge ?? null, sourceProvider: PROVIDER, sourceExternalId: providerTeam.idTeam, sourceUrl: providerTeam.strWebsite ?? null } });
      }
      teamsUpserted += 1; membershipTeamIds.add(teamId);
    }

    const matches = await prisma.match.findMany({ where: { competitionId }, select: { homeTeamId: true, awayTeamId: true } });
    const matchTeamIds = new Set<string>();
    for (const match of matches) { membershipTeamIds.add(match.homeTeamId); membershipTeamIds.add(match.awayTeamId); matchTeamIds.add(match.homeTeamId); matchTeamIds.add(match.awayTeamId); }
    const expected = catalog.expectedTeamCount; const authoritativeRebuild = expected ? membershipTeamIds.size >= expected : membershipTeamIds.size > 0;
    if (authoritativeRebuild) { const removed = await prisma.competitionTeam.deleteMany({ where: { competitionId } }); staleMembershipsRemoved += removed.count; }
    const memberships = Array.from(membershipTeamIds).map((teamId) => ({ competitionId, teamId }));
    if (memberships.length > 0) await prisma.competitionTeam.createMany({ data: memberships, skipDuplicates: true });
    membershipsRebuilt += memberships.length;
    diagnostics.push({ competitionId, competitionName: catalog.competitionName, season: catalog.season, returnedTeams: catalog.teams.length, expectedTeamCount: catalog.expectedTeamCount, complete: catalog.complete, authoritativeRebuild, sources: catalog.sources, matchObservedTeams: matchTeamIds.size });
  }

  return { competitionTeamCatalogsFetched: catalogs.length, competitionTeamsObserved: teamsObserved, competitionTeamsUpserted: teamsUpserted, competitionTeamMembershipsRebuilt: membershipsRebuilt, staleCompetitionTeamMembershipsRemoved: staleMembershipsRemoved, competitionTeamCatalogDiagnostics: diagnostics };
}

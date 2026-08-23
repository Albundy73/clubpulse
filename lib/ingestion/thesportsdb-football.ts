import { FOOTBALL_SPORT } from "@/lib/catalog/portugal-football";
import { prisma } from "@/lib/db";
import { fetchTheSportsDbFootballFeed } from "@/lib/sources/thesportsdb-football";

const PROVIDER = "thesportsdb";

function competitionExternalId(competitionId: string) {
  return competitionId.replace("thesportsdb-league-", "");
}

function competitionSeason(date: string) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return null;

  const year = value.getUTCFullYear();
  const month = value.getUTCMonth();
  const startYear = month >= 6 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

export async function ingestTheSportsDbFootball() {
  const feed = await fetchTheSportsDbFootballFeed();

  await prisma.sport.upsert({
    where: { id: FOOTBALL_SPORT.id },
    create: FOOTBALL_SPORT,
    update: { name: FOOTBALL_SPORT.name },
  });

  // Match discovery uses canonical TheSportsDB identities, but the database may
  // already contain the same provider team under an older ClubPulse id (for
  // example a previously tracked local team). Reconcile on provider identity
  // first and remap every incoming match to the existing canonical database id.
  const canonicalTeamId = new Map<string, string>();

  for (const team of feed.teams) {
    const sourceExternalId = team.source?.externalId;
    if (!sourceExternalId) {
      throw new Error(`TheSportsDB team ${team.id} is missing source metadata`);
    }

    const existing = await prisma.team.findUnique({
      where: {
        sourceProvider_sourceExternalId: {
          sourceProvider: PROVIDER,
          sourceExternalId,
        },
      },
    });

    if (existing) {
      await prisma.team.update({
        where: { id: existing.id },
        data: {
          name: team.name,
          category: team.category,
          sourceProvider: PROVIDER,
          sourceExternalId,
          sourceUrl: team.source?.url ?? existing.sourceUrl,
        },
      });
      canonicalTeamId.set(team.id, existing.id);
      continue;
    }

    const providerClubId = `thesportsdb-club-${sourceExternalId}`;
    await prisma.club.upsert({
      where: { id: providerClubId },
      create: {
        id: providerClubId,
        name: team.name,
        shortName: team.name,
        cityId: null,
        sportId: FOOTBALL_SPORT.id,
        sourceProvider: PROVIDER,
        sourceExternalId,
        sourceUrl: team.source?.url ?? null,
      },
      update: {
        name: team.name,
        shortName: team.name,
        sportId: FOOTBALL_SPORT.id,
        sourceProvider: PROVIDER,
        sourceExternalId,
        sourceUrl: team.source?.url ?? undefined,
      },
    });

    await prisma.team.create({
      data: {
        id: team.id,
        clubId: providerClubId,
        name: team.name,
        category: team.category,
        sourceProvider: PROVIDER,
        sourceExternalId,
        sourceUrl: team.source?.url ?? null,
      },
    });
    canonicalTeamId.set(team.id, team.id);
  }

  const competitions = new Map<
    string,
    { name: string; season: string | null; externalId: string }
  >();

  for (const match of feed.matches) {
    if (competitions.has(match.competitionId)) continue;
    competitions.set(match.competitionId, {
      name: match.competition,
      season: competitionSeason(match.date),
      externalId: competitionExternalId(match.competitionId),
    });
  }

  for (const [id, competition] of competitions) {
    await prisma.competition.upsert({
      where: { id },
      create: {
        id,
        sportId: FOOTBALL_SPORT.id,
        countryId: null,
        name: competition.name,
        season: competition.season,
        sourceProvider: PROVIDER,
        sourceExternalId: competition.externalId,
      },
      // Preserve catalog-owned country and artwork fields during frequent match
      // refreshes. Match ingestion only refreshes volatile competition metadata.
      update: {
        sportId: FOOTBALL_SPORT.id,
        name: competition.name,
        season: competition.season,
        sourceProvider: PROVIDER,
        sourceExternalId: competition.externalId,
      },
    });
  }

  let createdOrUpdated = 0;
  for (const match of feed.matches) {
    const homeTeamId = canonicalTeamId.get(match.homeTeamId) ?? match.homeTeamId;
    const awayTeamId = canonicalTeamId.get(match.awayTeamId) ?? match.awayTeamId;

    await prisma.match.upsert({
      where: {
        sourceProvider_sourceExternalId: {
          sourceProvider: PROVIDER,
          sourceExternalId: match.source.externalId,
        },
      },
      create: {
        id: match.id,
        sportId: match.sportId,
        competitionId: match.competitionId,
        homeTeamId,
        awayTeamId,
        scheduledAt: new Date(match.date),
        venue: match.venue ?? null,
        status: match.status,
        homeScore: match.homeScore ?? null,
        awayScore: match.awayScore ?? null,
        sourceProvider: PROVIDER,
        sourceExternalId: match.source.externalId,
        sourceUrl: match.source.url ?? null,
      },
      update: {
        sportId: match.sportId,
        competitionId: match.competitionId,
        homeTeamId,
        awayTeamId,
        scheduledAt: new Date(match.date),
        venue: match.venue ?? null,
        status: match.status,
        homeScore: match.homeScore ?? null,
        awayScore: match.awayScore ?? null,
        sourceUrl: match.source.url ?? null,
      },
    });
    createdOrUpdated += 1;
  }

  return {
    provider: feed.provider,
    fetchedAt: feed.fetchedAt,
    teamsUpserted: feed.teams.length,
    competitionsUpserted: competitions.size,
    matchesUpserted: createdOrUpdated,
    diagnostics: feed.diagnostics,
  };
}

import {
  FOOTBALL_SPORT,
  PORTUGAL,
  PORTUGAL_COMPETITION_EXTERNAL_IDS,
  PORTUGAL_FOOTBALL_CITIES,
  TRACKED_PORTUGAL_FOOTBALL_TEAM_BY_ID,
} from "@/lib/catalog/portugal-football";
import { prisma } from "@/lib/db";
import { fetchTheSportsDbFootballFeed } from "@/lib/sources/thesportsdb-football";

const PROVIDER = "thesportsdb";

function sourceFields(source?: { provider: string; externalId: string; url?: string }) {
  return {
    sourceProvider: source?.provider ?? null,
    sourceExternalId: source?.externalId ?? null,
    sourceUrl: source?.url ?? null,
  };
}

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

  await prisma.country.upsert({
    where: { id: PORTUGAL.id },
    create: PORTUGAL,
    update: { name: PORTUGAL.name },
  });

  for (const city of PORTUGAL_FOOTBALL_CITIES) {
    await prisma.city.upsert({
      where: { id: city.id },
      create: city,
      update: { name: city.name, countryId: city.countryId },
    });
  }

  // Canonical local identities come from one catalog. Provider IDs are stored
  // only as source metadata on the Team, so changing providers does not change
  // ClubPulse IDs or city mappings.
  for (const tracked of feed.trackedTeams) {
    const local = TRACKED_PORTUGAL_FOOTBALL_TEAM_BY_ID.get(tracked.localTeamId);
    if (!local) {
      throw new Error(`Missing canonical mapping for tracked team ${tracked.localTeamId}`);
    }

    await prisma.club.upsert({
      where: { id: local.club.id },
      create: {
        id: local.club.id,
        name: local.club.name,
        shortName: tracked.providerTeamName,
        cityId: local.club.cityId,
        sportId: FOOTBALL_SPORT.id,
      },
      update: {
        name: local.club.name,
        shortName: tracked.providerTeamName,
        cityId: local.club.cityId,
        sportId: FOOTBALL_SPORT.id,
      },
    });

    await prisma.team.upsert({
      where: { id: tracked.localTeamId },
      create: {
        id: tracked.localTeamId,
        clubId: local.club.id,
        name: tracked.providerTeamName,
        category: "Senior Men",
        sourceProvider: PROVIDER,
        sourceExternalId: tracked.providerTeamId,
      },
      update: {
        clubId: local.club.id,
        name: tracked.providerTeamName,
        category: "Senior Men",
        sourceProvider: PROVIDER,
        sourceExternalId: tracked.providerTeamId,
      },
    });
  }

  // Opponents discovered through a provider do not automatically become local
  // clubs. Keep their location unknown instead of assigning a fabricated city.
  for (const team of feed.teams) {
    const source = team.source;
    if (!source?.externalId) {
      throw new Error(`TheSportsDB team ${team.id} is missing source metadata`);
    }

    const providerClubId = `thesportsdb-club-${source.externalId}`;

    await prisma.club.upsert({
      where: { id: providerClubId },
      create: {
        id: providerClubId,
        name: team.name,
        shortName: team.name,
        cityId: null,
        sportId: FOOTBALL_SPORT.id,
        ...sourceFields(source),
      },
      update: {
        name: team.name,
        shortName: team.name,
        cityId: null,
        sportId: FOOTBALL_SPORT.id,
        ...sourceFields(source),
      },
    });

    await prisma.team.upsert({
      where: { id: team.id },
      create: {
        id: team.id,
        clubId: providerClubId,
        name: team.name,
        category: team.category,
        ...sourceFields(source),
      },
      update: {
        clubId: providerClubId,
        name: team.name,
        category: team.category,
        ...sourceFields(source),
      },
    });
  }

  const competitions = new Map<
    string,
    { name: string; season: string | null; externalId: string; countryId: string | null }
  >();

  for (const match of feed.matches) {
    if (competitions.has(match.competitionId)) continue;

    const externalId = competitionExternalId(match.competitionId);
    competitions.set(match.competitionId, {
      name: match.competition,
      season: competitionSeason(match.date),
      externalId,
      countryId: PORTUGAL_COMPETITION_EXTERNAL_IDS.has(externalId) ? PORTUGAL.id : null,
    });
  }

  for (const [id, competition] of competitions) {
    await prisma.competition.upsert({
      where: { id },
      create: {
        id,
        sportId: FOOTBALL_SPORT.id,
        countryId: competition.countryId,
        name: competition.name,
        season: competition.season,
        sourceProvider: PROVIDER,
        sourceExternalId: competition.externalId,
      },
      update: {
        sportId: FOOTBALL_SPORT.id,
        countryId: competition.countryId,
        name: competition.name,
        season: competition.season,
        sourceProvider: PROVIDER,
        sourceExternalId: competition.externalId,
      },
    });
  }

  let createdOrUpdated = 0;
  for (const match of feed.matches) {
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
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
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
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
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

  // Remove legacy placeholder geography once no clubs reference it. These
  // deleteMany calls are intentionally safe to repeat on every ingestion.
  await prisma.city.deleteMany({ where: { id: "external", clubs: { none: {} } } });
  await prisma.country.deleteMany({ where: { id: "external", cities: { none: {} } } });

  return {
    provider: feed.provider,
    fetchedAt: feed.fetchedAt,
    teamsUpserted: feed.trackedTeams.length + feed.teams.length,
    competitionsUpserted: competitions.size,
    matchesUpserted: createdOrUpdated,
  };
}

import { prisma } from "@/lib/db";
import { fetchTheSportsDbFootballFeed } from "@/lib/sources/thesportsdb-football";

const PROVIDER = "thesportsdb";
const EXTERNAL_COUNTRY_ID = "external";
const EXTERNAL_CITY_ID = "external";

const localTrackedTeams: Record<string, { clubId: string; clubName: string; cityId: string; cityName: string }> = {
  "benfica-senior": {
    clubId: "benfica-football",
    clubName: "SL Benfica",
    cityId: "lisbon",
    cityName: "Lisbon",
  },
  "sporting-senior": {
    clubId: "sporting-football",
    clubName: "Sporting CP",
    cityId: "lisbon",
    cityName: "Lisbon",
  },
  "farense-senior": {
    clubId: "farense-football",
    clubName: "SC Farense",
    cityId: "faro",
    cityName: "Faro",
  },
};

function sourceFields(source?: { provider: string; externalId: string; url?: string }) {
  return {
    sourceProvider: source?.provider ?? null,
    sourceExternalId: source?.externalId ?? null,
    sourceUrl: source?.url ?? null,
  };
}

export async function ingestTheSportsDbFootball() {
  const feed = await fetchTheSportsDbFootballFeed();

  await prisma.sport.upsert({
    where: { id: "football" },
    create: { id: "football", name: "Football" },
    update: { name: "Football" },
  });

  await prisma.country.upsert({
    where: { id: "pt" },
    create: { id: "pt", name: "Portugal" },
    update: { name: "Portugal" },
  });

  for (const location of [
    { id: "lisbon", name: "Lisbon" },
    { id: "faro", name: "Faro" },
  ]) {
    await prisma.city.upsert({
      where: { id: location.id },
      create: { id: location.id, name: location.name, countryId: "pt" },
      update: { name: location.name, countryId: "pt" },
    });
  }

  await prisma.country.upsert({
    where: { id: EXTERNAL_COUNTRY_ID },
    create: { id: EXTERNAL_COUNTRY_ID, name: "External" },
    update: { name: "External" },
  });

  await prisma.city.upsert({
    where: { id: EXTERNAL_CITY_ID },
    create: { id: EXTERNAL_CITY_ID, name: "External", countryId: EXTERNAL_COUNTRY_ID },
    update: { name: "External", countryId: EXTERNAL_COUNTRY_ID },
  });

  for (const tracked of feed.trackedTeams) {
    const local = localTrackedTeams[tracked.localTeamId];
    if (!local) continue;

    await prisma.club.upsert({
      where: { id: local.clubId },
      create: {
        id: local.clubId,
        name: local.clubName,
        shortName: tracked.providerTeamName,
        cityId: local.cityId,
        sportId: "football",
      },
      update: {
        name: local.clubName,
        shortName: tracked.providerTeamName,
        cityId: local.cityId,
        sportId: "football",
      },
    });

    await prisma.team.upsert({
      where: { id: tracked.localTeamId },
      create: {
        id: tracked.localTeamId,
        clubId: local.clubId,
        name: tracked.providerTeamName,
        category: "Senior Men",
        sourceProvider: PROVIDER,
        sourceExternalId: tracked.providerTeamId,
      },
      update: {
        clubId: local.clubId,
        name: tracked.providerTeamName,
        category: "Senior Men",
        sourceProvider: PROVIDER,
        sourceExternalId: tracked.providerTeamId,
      },
    });
  }

  for (const team of feed.teams) {
    const externalClubId = `thesportsdb-club-${team.source.externalId}`;

    await prisma.club.upsert({
      where: { id: externalClubId },
      create: {
        id: externalClubId,
        name: team.name,
        shortName: team.name,
        cityId: EXTERNAL_CITY_ID,
        sportId: "football",
        ...sourceFields(team.source),
      },
      update: {
        name: team.name,
        shortName: team.name,
        cityId: EXTERNAL_CITY_ID,
        sportId: "football",
        ...sourceFields(team.source),
      },
    });

    await prisma.team.upsert({
      where: { id: team.id },
      create: {
        id: team.id,
        clubId: externalClubId,
        name: team.name,
        category: team.category,
        ...sourceFields(team.source),
      },
      update: {
        clubId: externalClubId,
        name: team.name,
        category: team.category,
        ...sourceFields(team.source),
      },
    });
  }

  const competitionIds = new Set<string>();
  for (const match of feed.matches) {
    if (competitionIds.has(match.competitionId)) continue;
    competitionIds.add(match.competitionId);

    await prisma.competition.upsert({
      where: { id: match.competitionId },
      create: {
        id: match.competitionId,
        sportId: "football",
        countryId: match.competition.toLowerCase().includes("portuguese") ? "pt" : null,
        name: match.competition,
        season: "2026-2027",
        sourceProvider: PROVIDER,
        sourceExternalId: match.competitionId.replace("thesportsdb-league-", ""),
      },
      update: {
        name: match.competition,
        season: "2026-2027",
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

  return {
    provider: feed.provider,
    fetchedAt: feed.fetchedAt,
    teamsUpserted: feed.trackedTeams.length + feed.teams.length,
    competitionsUpserted: competitionIds.size,
    matchesUpserted: createdOrUpdated,
  };
}

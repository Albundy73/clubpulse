import { competitions, clubs, countries, cities, sports, teams } from "@/lib/mock-data";
import { prisma } from "@/lib/db";
import type { Match } from "@/lib/types";

function sourceFields(source?: { provider: string; externalId: string; url?: string }) {
  return source
    ? {
        sourceProvider: source.provider,
        sourceExternalId: source.externalId,
        sourceUrl: source.url,
      }
    : {
        sourceProvider: null,
        sourceExternalId: null,
        sourceUrl: null,
      };
}

async function ensureMatchDependencies(match: Match) {
  const sport = sports.find((item) => item.id === match.sportId);
  const competition = competitions.find((item) => item.id === match.competitionId);
  const homeTeam = teams.find((item) => item.id === match.homeTeamId);
  const awayTeam = teams.find((item) => item.id === match.awayTeamId);

  if (!sport || !competition || !homeTeam || !awayTeam) {
    throw new Error(`Missing canonical dependency for match ${match.id}`);
  }

  const requiredTeams = [homeTeam, awayTeam];
  const requiredClubs = requiredTeams.map((team) => {
    const club = clubs.find((item) => item.id === team.clubId);
    if (!club) throw new Error(`Missing club ${team.clubId}`);
    return club;
  });
  const requiredCities = requiredClubs.map((club) => {
    const city = cities.find((item) => item.id === club.cityId);
    if (!city) throw new Error(`Missing city ${club.cityId}`);
    return city;
  });
  const requiredCountries = requiredCities.map((city) => {
    const country = countries.find((item) => item.id === city.countryId);
    if (!country) throw new Error(`Missing country ${city.countryId}`);
    return country;
  });

  await prisma.sport.upsert({
    where: { id: sport.id },
    update: { name: sport.name },
    create: { id: sport.id, name: sport.name },
  });

  for (const country of requiredCountries) {
    await prisma.country.upsert({
      where: { id: country.id },
      update: { name: country.name },
      create: { id: country.id, name: country.name },
    });
  }

  for (const city of requiredCities) {
    await prisma.city.upsert({
      where: { id: city.id },
      update: { name: city.name, countryId: city.countryId },
      create: { id: city.id, name: city.name, countryId: city.countryId },
    });
  }

  for (const club of requiredClubs) {
    const data = {
      name: club.name,
      shortName: club.shortName,
      cityId: club.cityId,
      sportId: club.sportId,
      ...sourceFields(club.source),
    };
    await prisma.club.upsert({
      where: { id: club.id },
      update: data,
      create: { id: club.id, ...data },
    });
  }

  for (const team of requiredTeams) {
    const data = {
      clubId: team.clubId,
      name: team.name,
      category: team.category,
      ...sourceFields(team.source),
    };
    await prisma.team.upsert({
      where: { id: team.id },
      update: data,
      create: { id: team.id, ...data },
    });
  }

  if (competition.countryId) {
    const country = countries.find((item) => item.id === competition.countryId);
    if (country) {
      await prisma.country.upsert({
        where: { id: country.id },
        update: { name: country.name },
        create: { id: country.id, name: country.name },
      });
    }
  }

  const competitionData = {
    sportId: competition.sportId,
    countryId: competition.countryId,
    name: competition.name,
    season: competition.season,
    ...sourceFields(competition.source),
  };
  await prisma.competition.upsert({
    where: { id: competition.id },
    update: competitionData,
    create: { id: competition.id, ...competitionData },
  });
}

export async function storeMatches(matches: Match[]) {
  let stored = 0;

  for (const match of matches) {
    await ensureMatchDependencies(match);

    const data = {
      sportId: match.sportId,
      competitionId: match.competitionId,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      scheduledAt: new Date(match.date),
      venue: match.venue,
      status: match.status,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      sourceProvider: match.source.provider,
      sourceExternalId: match.source.externalId,
      sourceUrl: match.source.url,
    };

    await prisma.match.upsert({
      where: {
        sourceProvider_sourceExternalId: {
          sourceProvider: match.source.provider,
          sourceExternalId: match.source.externalId,
        },
      },
      update: data,
      create: { id: match.id, ...data },
    });

    stored += 1;
  }

  return { stored };
}

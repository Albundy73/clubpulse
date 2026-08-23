import { prisma } from "@/lib/db";
import { fetchTheSportsDbFootballCompetitions } from "@/lib/sources/thesportsdb-competitions";

const PROVIDER = "thesportsdb";
const FOOTBALL_SPORT_ID = "football";
const COUNTRY_BY_PROVIDER_NAME = new Map([
  ["Portugal", { id: "pt", name: "Portugal" }],
  ["France", { id: "fr", name: "France" }],
]);

export async function syncTheSportsDbCompetitionCatalog() {
  const discovered = await fetchTheSportsDbFootballCompetitions();

  for (const country of COUNTRY_BY_PROVIDER_NAME.values()) {
    await prisma.country.upsert({
      where: { id: country.id },
      create: country,
      update: { name: country.name },
    });
  }

  let competitionsUpserted = 0;
  for (const competition of discovered) {
    const existing = await prisma.competition.findUnique({ where: { id: competition.id } });
    const mappedCountry = competition.country
      ? COUNTRY_BY_PROVIDER_NAME.get(competition.country)
      : undefined;
    const countryId = mappedCountry?.id ?? existing?.countryId ?? null;

    await prisma.competition.upsert({
      where: { id: competition.id },
      create: {
        id: competition.id,
        sportId: FOOTBALL_SPORT_ID,
        countryId,
        name: competition.name,
        season: competition.season ?? null,
        sourceProvider: PROVIDER,
        sourceExternalId: competition.externalId,
      },
      update: {
        sportId: FOOTBALL_SPORT_ID,
        countryId,
        name: competition.name,
        season: competition.season ?? existing?.season ?? null,
        sourceProvider: PROVIDER,
        sourceExternalId: competition.externalId,
      },
    });
    competitionsUpserted += 1;
  }

  // Every ingested fixture is trusted evidence that both teams participate in
  // its competition. This complements the seasonal catalog when provider list
  // endpoints are capped on the free tier.
  const matches = await prisma.match.findMany({
    select: { competitionId: true, homeTeamId: true, awayTeamId: true },
  });

  const membershipByKey = new Map<string, { competitionId: string; teamId: string }>();
  for (const match of matches) {
    membershipByKey.set(`${match.competitionId}:${match.homeTeamId}`, {
      competitionId: match.competitionId,
      teamId: match.homeTeamId,
    });
    membershipByKey.set(`${match.competitionId}:${match.awayTeamId}`, {
      competitionId: match.competitionId,
      teamId: match.awayTeamId,
    });
  }

  const memberships = Array.from(membershipByKey.values());
  if (memberships.length > 0) {
    await prisma.competitionTeam.createMany({ data: memberships, skipDuplicates: true });
  }

  return {
    competitionsDiscovered: discovered.length,
    competitionsCatalogUpserted: competitionsUpserted,
    competitionTeamMembershipsObserved: memberships.length,
  };
}

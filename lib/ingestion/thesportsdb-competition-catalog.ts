import { prisma } from "@/lib/db";
import { fetchTheSportsDbFootballCompetitions } from "@/lib/sources/thesportsdb-competitions";

const PROVIDER = "thesportsdb";
const FOOTBALL_SPORT_ID = "football";

export async function syncTheSportsDbCompetitionCatalog() {
  const discovered = await fetchTheSportsDbFootballCompetitions();

  let competitionsUpserted = 0;
  for (const competition of discovered) {
    const existing = await prisma.competition.findUnique({ where: { id: competition.id } });
    const portugalCountryId = competition.country === "Portugal" ? "pt" : existing?.countryId ?? null;

    await prisma.competition.upsert({
      where: { id: competition.id },
      create: {
        id: competition.id,
        sportId: FOOTBALL_SPORT_ID,
        countryId: portugalCountryId,
        name: competition.name,
        season: null,
        sourceProvider: PROVIDER,
        sourceExternalId: competition.externalId,
      },
      update: {
        sportId: FOOTBALL_SPORT_ID,
        countryId: portugalCountryId,
        name: competition.name,
        sourceProvider: PROVIDER,
        sourceExternalId: competition.externalId,
      },
    });
    competitionsUpserted += 1;
  }

  // Every ingested fixture is authoritative evidence that both teams
  // participate in its competition. This also keeps membership current when
  // the provider introduces a competition that discovery did not return.
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

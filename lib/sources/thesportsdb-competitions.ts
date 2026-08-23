const API_BASE_URL = "https://www.thesportsdb.com/api/v1/json/123";
const PROVIDER = "thesportsdb";

type SportsDbLeague = {
  idLeague: string;
  strLeague: string;
  strSport?: string | null;
  strCountry?: string | null;
  strLeagueAlternate?: string | null;
  strCurrentSeason?: string | null;
};

type LeagueLookupResponse = {
  leagues?: SportsDbLeague[] | null;
};

export type DiscoveredCompetition = {
  id: string;
  externalId: string;
  name: string;
  sport: string;
  country?: string;
  alternateName?: string;
  season?: string;
};

// Deliberate MVP catalog. Metadata is still resolved dynamically from
// TheSportsDB so provider naming and season changes do not have to be duplicated here.
export const SUPPORTED_FOOTBALL_COMPETITION_EXTERNAL_IDS = [
  "4344", // Portuguese Primeira Liga / Liga Portugal
  "4662", // Portuguese LigaPro / Liga Portugal 2
  "4510", // Taca de Portugal
  "4334", // French Ligue 1
  "4401", // French Ligue 2
  "4480", // UEFA Champions League
  "4481", // UEFA Europa League
] as const;

export const SUPPORTED_FOOTBALL_COMPETITION_IDS = SUPPORTED_FOOTBALL_COMPETITION_EXTERNAL_IDS.map(
  (externalId) => `${PROVIDER}-league-${externalId}`,
);

async function fetchLeague(externalId: string) {
  const response = await fetch(`${API_BASE_URL}/lookupleague.php?id=${encodeURIComponent(externalId)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`TheSportsDB league lookup failed (${response.status}) for ${externalId}`);
  }

  const payload = await response.json() as LeagueLookupResponse;
  return payload.leagues?.[0] ?? null;
}

export async function fetchTheSportsDbFootballCompetitions(): Promise<DiscoveredCompetition[]> {
  const leagues = await Promise.all(
    SUPPORTED_FOOTBALL_COMPETITION_EXTERNAL_IDS.map((externalId) => fetchLeague(externalId)),
  );

  return leagues
    .filter((league): league is SportsDbLeague => Boolean(league?.idLeague && league.strLeague))
    .filter((league) => league.strSport === "Soccer" || !league.strSport)
    .map((league) => ({
      id: `${PROVIDER}-league-${league.idLeague}`,
      externalId: league.idLeague,
      name: league.strLeague,
      sport: league.strSport ?? "Soccer",
      country: league.strCountry ?? undefined,
      alternateName: league.strLeagueAlternate ?? undefined,
      season: league.strCurrentSeason ?? undefined,
    }));
}

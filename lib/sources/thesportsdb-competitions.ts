const API_BASE_URL = "https://www.thesportsdb.com/api/v1/json/123";
const PROVIDER = "thesportsdb";

type SportsDbLeague = {
  idLeague: string;
  strLeague: string;
  strSport?: string | null;
  strCountry?: string | null;
  strLeagueAlternate?: string | null;
};

type LeagueSearchResponse = {
  countries?: SportsDbLeague[] | null;
  leagues?: SportsDbLeague[] | null;
};

export type DiscoveredCompetition = {
  id: string;
  externalId: string;
  name: string;
  sport: string;
  country?: string;
  alternateName?: string;
};

// Initial ClubPulse football scope. We still discover these through the
// provider instead of hard-coding display metadata, but restrict the product
// catalog to a deliberate, testable set while competition-first UX is built.
const TARGET_LEAGUE_IDS = new Set([
  "4344", // Portuguese Primeira Liga / Liga Portugal
  "4662", // Portuguese LigaPro / Liga Portugal 2
  "4510", // Taca de Portugal
  "4334", // French Ligue 1
  "4401", // French Ligue 2
]);

async function fetchCountryLeagues(country: "Portugal" | "France") {
  const params = new URLSearchParams({ c: country, s: "Soccer" });
  const response = await fetch(`${API_BASE_URL}/search_all_leagues.php?${params.toString()}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`TheSportsDB competition discovery failed (${response.status}) for ${country}`);
  }

  const payload = await response.json() as LeagueSearchResponse;
  return payload.countries ?? payload.leagues ?? [];
}

export async function fetchTheSportsDbFootballCompetitions(): Promise<DiscoveredCompetition[]> {
  const responses = await Promise.all([
    fetchCountryLeagues("Portugal"),
    fetchCountryLeagues("France"),
  ]);

  const byId = new Map<string, SportsDbLeague>();
  for (const leagues of responses) {
    for (const league of leagues) {
      if (TARGET_LEAGUE_IDS.has(league.idLeague)) byId.set(league.idLeague, league);
    }
  }

  return Array.from(byId.values())
    .filter((league) => league.idLeague && league.strLeague)
    .map((league) => ({
      id: `${PROVIDER}-league-${league.idLeague}`,
      externalId: league.idLeague,
      name: league.strLeague,
      sport: league.strSport ?? "Soccer",
      country: league.strCountry ?? undefined,
      alternateName: league.strLeagueAlternate ?? undefined,
    }));
}

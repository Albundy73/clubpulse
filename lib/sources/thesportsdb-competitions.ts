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

export async function fetchTheSportsDbFootballCompetitions(): Promise<DiscoveredCompetition[]> {
  const response = await fetch(`${API_BASE_URL}/search_all_leagues.php?s=Soccer`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`TheSportsDB competition discovery failed (${response.status})`);
  }

  const payload = await response.json() as LeagueSearchResponse;
  const leagues = payload.countries ?? payload.leagues ?? [];

  return leagues
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

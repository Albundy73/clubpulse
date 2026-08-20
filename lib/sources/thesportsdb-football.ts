const API_BASE_URL = "https://www.thesportsdb.com/api/v1/json/123";

type Team = {
  idTeam: string;
  strTeam: string;
  strCountry?: string | null;
  strSport?: string | null;
};

type Event = {
  idEvent: string;
  strEvent: string;
  strHomeTeam?: string | null;
  strAwayTeam?: string | null;
  dateEvent?: string | null;
  strTime?: string | null;
  intHomeScore?: string | null;
  intAwayScore?: string | null;
  strLeague?: string | null;
};

type SearchTeamsResponse = { teams?: Team[] | null };
type EventsResponse = { events?: Event[] | null; results?: Event[] | null };

const trackedTeams = ["Benfica", "Sporting CP", "Farense"];

async function fetchJson<T>(path: string) {
  const response = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store" });
  const payload = (await response.json()) as T;
  return { status: response.status, payload };
}

export async function fetchTheSportsDbDiagnostic() {
  const teamDiagnostics = [] as Array<Record<string, unknown>>;

  for (const query of trackedTeams) {
    const searchPath = `/searchteams.php?t=${encodeURIComponent(query)}`;
    const search = await fetchJson<SearchTeamsResponse>(searchPath);
    const candidates = search.payload.teams ?? [];
    const selected =
      candidates.find((team) => team.strCountry === "Portugal" && team.strSport === "Soccer") ??
      candidates.find((team) => team.strCountry === "Portugal") ??
      candidates[0];

    if (!selected) {
      teamDiagnostics.push({ query, searchPath, status: search.status, error: "Team not found" });
      continue;
    }

    const previousPath = `/eventslast.php?id=${encodeURIComponent(selected.idTeam)}`;
    const nextPath = `/eventsnext.php?id=${encodeURIComponent(selected.idTeam)}`;
    const [previous, next] = await Promise.all([
      fetchJson<EventsResponse>(previousPath),
      fetchJson<EventsResponse>(nextPath),
    ]);

    const previousEvents = previous.payload.results ?? previous.payload.events ?? [];
    const nextEvents = next.payload.events ?? next.payload.results ?? [];

    teamDiagnostics.push({
      query,
      team: {
        idTeam: selected.idTeam,
        name: selected.strTeam,
        country: selected.strCountry,
        sport: selected.strSport,
      },
      search: {
        path: searchPath,
        status: search.status,
        candidateCount: candidates.length,
      },
      previous: {
        path: previousPath,
        status: previous.status,
        count: previousEvents.length,
        events: previousEvents,
      },
      next: {
        path: nextPath,
        status: next.status,
        count: nextEvents.length,
        events: nextEvents,
      },
    });
  }

  return {
    provider: "TheSportsDB V1 Free",
    fetchedAt: new Date().toISOString(),
    note: "Free V1 schedule endpoints are limited to one event and may only return home events.",
    teams: teamDiagnostics,
  };
}

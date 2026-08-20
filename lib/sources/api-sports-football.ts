import type { Match, MatchStatus, Team } from "@/lib/types";

const API_BASE_URL = "https://v3.football.api-sports.io";
const PROVIDER = "api-sports-football";

type ApiTeam = {
  id: number;
  name: string;
  country?: string | null;
};

type TeamSearchResponse = {
  response?: Array<{ team: ApiTeam }>;
  errors?: unknown;
};

type FixtureResponseItem = {
  fixture: {
    id: number;
    date: string;
    venue?: { name?: string | null } | null;
    status: { short: string };
  };
  league: {
    id: number;
    name: string;
  };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
};

type FixturesResponse = {
  response?: FixtureResponseItem[];
  errors?: unknown;
};

type TrackedTeam = {
  query: string;
  localTeamId: string;
};

const trackedTeams: TrackedTeam[] = [
  { query: "Benfica", localTeamId: "benfica-senior" },
  { query: "Sporting CP", localTeamId: "sporting-senior" },
  { query: "Farense", localTeamId: "farense-senior" },
];

function apiKey() {
  const key = process.env.API_SPORTS_KEY;
  if (!key) throw new Error("API_SPORTS_KEY is not configured");
  return key;
}

async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "x-apisports-key": apiKey(),
      Accept: "application/json",
    },
    next: { revalidate: 900 },
  });

  if (!response.ok) {
    throw new Error(`API-SPORTS request failed (${response.status}) for ${path}`);
  }

  return response.json() as Promise<T>;
}

async function resolveTrackedTeam(tracked: TrackedTeam) {
  const payload = await apiFetch<TeamSearchResponse>(`/teams?search=${encodeURIComponent(tracked.query)}`);
  const candidates = payload.response ?? [];
  const portugal = candidates.find(({ team }) => team.country === "Portugal");
  const selected = portugal ?? candidates[0];

  if (!selected) {
    throw new Error(`API-SPORTS could not resolve team: ${tracked.query}`);
  }

  return { ...tracked, apiTeam: selected.team };
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function statusFromApi(short: string): MatchStatus {
  if (["FT", "AET", "PEN"].includes(short)) return "finished";
  if (short === "PST") return "postponed";
  if (["CANC", "ABD", "AWD", "WO"].includes(short)) return "cancelled";
  return "scheduled";
}

export async function fetchApiSportsFootballFeed() {
  const resolvedTeams = await Promise.all(trackedTeams.map(resolveTrackedTeam));
  const apiToLocal = new Map(resolvedTeams.map((team) => [team.apiTeam.id, team.localTeamId]));

  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 14);
  const to = new Date(today);
  to.setDate(to.getDate() + 7);

  const fixturePayloads = await Promise.all(
    resolvedTeams.map((team) =>
      apiFetch<FixturesResponse>(
        `/fixtures?team=${team.apiTeam.id}&from=${dateOnly(from)}&to=${dateOnly(to)}&timezone=Europe%2FLisbon`,
      ),
    ),
  );

  const fixtureById = new Map<number, FixtureResponseItem>();
  for (const payload of fixturePayloads) {
    for (const fixture of payload.response ?? []) fixtureById.set(fixture.fixture.id, fixture);
  }

  const liveTeams = new Map<string, Team>();

  function normalizeTeam(apiTeam: { id: number; name: string }) {
    const local = apiToLocal.get(apiTeam.id);
    if (local) return local;

    const id = `api-sports-team-${apiTeam.id}`;
    if (!liveTeams.has(id)) {
      liveTeams.set(id, {
        id,
        clubId: `api-sports-club-${apiTeam.id}`,
        name: apiTeam.name,
        category: "Senior Men",
        source: {
          provider: PROVIDER,
          externalId: String(apiTeam.id),
        },
      });
    }
    return id;
  }

  const matches: Match[] = Array.from(fixtureById.values()).map((item) => {
    const status = statusFromApi(item.fixture.status.short);
    const match: Match = {
      id: `api-sports-fixture-${item.fixture.id}`,
      sportId: "football",
      competitionId: `api-sports-league-${item.league.id}`,
      competition: item.league.name,
      homeTeamId: normalizeTeam(item.teams.home),
      awayTeamId: normalizeTeam(item.teams.away),
      date: item.fixture.date,
      venue: item.fixture.venue?.name ?? undefined,
      status,
      source: {
        provider: PROVIDER,
        externalId: String(item.fixture.id),
      },
    };

    if (typeof item.goals.home === "number") match.homeScore = item.goals.home;
    if (typeof item.goals.away === "number") match.awayScore = item.goals.away;
    return match;
  });

  return {
    provider: "API-SPORTS / API-FOOTBALL",
    fetchedAt: new Date().toISOString(),
    trackedTeams: resolvedTeams.map((team) => ({
      query: team.query,
      apiTeamId: team.apiTeam.id,
      apiTeamName: team.apiTeam.name,
      localTeamId: team.localTeamId,
    })),
    teams: Array.from(liveTeams.values()),
    matches,
  };
}

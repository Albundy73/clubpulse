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
  results?: number;
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
  results?: number;
};

type TrackedTeam = {
  query: string;
  localTeamId: string;
};

type ApiDiagnostics = {
  path: string;
  status: number;
  results?: number;
  errors?: unknown;
  quota?: {
    dailyRemaining?: string | null;
    dailyLimit?: string | null;
    minuteRemaining?: string | null;
    minuteLimit?: string | null;
  };
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

async function apiFetch<T extends { results?: number; errors?: unknown }>(path: string) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "x-apisports-key": apiKey(),
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const payload = (await response.json()) as T;

  const diagnostics: ApiDiagnostics = {
    path,
    status: response.status,
    results: payload.results,
    errors: payload.errors,
    quota: {
      dailyRemaining: response.headers.get("x-ratelimit-requests-remaining"),
      dailyLimit: response.headers.get("x-ratelimit-requests-limit"),
      minuteRemaining: response.headers.get("X-RateLimit-Remaining"),
      minuteLimit: response.headers.get("X-RateLimit-Limit"),
    },
  };

  if (!response.ok) {
    throw new Error(`API-SPORTS request failed (${response.status}) for ${path}`);
  }

  return { payload, diagnostics };
}

async function resolveTrackedTeam(tracked: TrackedTeam) {
  const { payload, diagnostics } = await apiFetch<TeamSearchResponse>(`/teams?search=${encodeURIComponent(tracked.query)}`);
  const candidates = payload.response ?? [];
  const portugal = candidates.find(({ team }) => team.country === "Portugal");
  const selected = portugal ?? candidates[0];

  if (!selected) {
    throw new Error(`API-SPORTS could not resolve team: ${tracked.query}`);
  }

  return { ...tracked, apiTeam: selected.team, diagnostics };
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

  const fixtureRequests = resolvedTeams.flatMap((team) => [
    { team, kind: "last" as const, path: `/fixtures?team=${team.apiTeam.id}&last=5&timezone=Europe%2FLisbon` },
    { team, kind: "next" as const, path: `/fixtures?team=${team.apiTeam.id}&next=10&timezone=Europe%2FLisbon` },
  ]);

  const fixtureResponses = await Promise.all(
    fixtureRequests.map(async (request) => {
      const result = await apiFetch<FixturesResponse>(request.path);
      return { ...request, ...result };
    }),
  );

  const fixtureById = new Map<number, FixtureResponseItem>();
  for (const response of fixtureResponses) {
    for (const fixture of response.payload.response ?? []) fixtureById.set(fixture.fixture.id, fixture);
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
    diagnostics: {
      teamResolution: resolvedTeams.map((team) => ({
        query: team.query,
        ...team.diagnostics,
      })),
      fixtures: fixtureResponses.map((response) => ({
        query: response.team.query,
        kind: response.kind,
        ...response.diagnostics,
        responseCount: response.payload.response?.length ?? 0,
      })),
    },
    teams: Array.from(liveTeams.values()),
    matches,
  };
}

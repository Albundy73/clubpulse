import type { Match, MatchStatus, Team } from "@/lib/types";

const API_BASE_URL = "https://www.thesportsdb.com/api/v1/json/123";
const PROVIDER = "thesportsdb";
const PRIMEIRA_LIGA_ID = "4344";

type SportsDbTeam = {
  idTeam: string;
  strTeam: string;
  strCountry?: string | null;
  strSport?: string | null;
};

type SportsDbEvent = {
  idEvent: string;
  idAPIfootball?: string | null;
  strTimestamp?: string | null;
  strEvent?: string | null;
  strSport?: string | null;
  idLeague?: string | null;
  strLeague?: string | null;
  strSeason?: string | null;
  strHomeTeam?: string | null;
  strAwayTeam?: string | null;
  idHomeTeam?: string | null;
  idAwayTeam?: string | null;
  intHomeScore?: string | null;
  intAwayScore?: string | null;
  strVenue?: string | null;
  strStatus?: string | null;
  strPostponed?: string | null;
};

type TeamSearchResponse = {
  teams?: SportsDbTeam[] | null;
};

type EventsResponse = {
  results?: SportsDbEvent[] | null;
  events?: SportsDbEvent[] | null;
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

async function sportsDbFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`TheSportsDB request failed (${response.status}) for ${path}`);
  }

  return response.json() as Promise<T>;
}

function eventList(payload: EventsResponse) {
  return payload.results ?? payload.events ?? [];
}

async function resolveTrackedTeam(tracked: TrackedTeam) {
  const payload = await sportsDbFetch<TeamSearchResponse>(
    `/searchteams.php?t=${encodeURIComponent(tracked.query)}`,
  );

  const candidates = payload.teams ?? [];
  const selected =
    candidates.find(
      (team) => team.strCountry === "Portugal" && team.strSport === "Soccer",
    ) ?? candidates[0];

  if (!selected) {
    throw new Error(`TheSportsDB could not resolve team: ${tracked.query}`);
  }

  return { ...tracked, sportsDbTeam: selected };
}

function statusFromSportsDb(event: SportsDbEvent): MatchStatus {
  if (event.strPostponed === "yes") return "postponed";

  switch (event.strStatus) {
    case "FT":
    case "AET":
    case "PEN":
      return "finished";
    case "PST":
      return "postponed";
    case "CANC":
    case "ABD":
      return "cancelled";
    default:
      return "scheduled";
  }
}

function eventDate(event: SportsDbEvent) {
  if (!event.strTimestamp) {
    throw new Error(`TheSportsDB event ${event.idEvent} has no timestamp`);
  }

  return event.strTimestamp.endsWith("Z")
    ? event.strTimestamp
    : `${event.strTimestamp}Z`;
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function fetchTheSportsDbFootballFeed() {
  const resolvedTeams = await Promise.all(trackedTeams.map(resolveTrackedTeam));

  const providerToLocalTeam = new Map(
    resolvedTeams.map((team) => [team.sportsDbTeam.idTeam, team.localTeamId]),
  );
  const trackedProviderTeamIds = new Set(providerToLocalTeam.keys());

  const responses = await Promise.all(
    resolvedTeams.flatMap((team) => [
      sportsDbFetch<EventsResponse>(
        `/eventslast.php?id=${team.sportsDbTeam.idTeam}`,
      ).then((payload) => ({ tracked: team, kind: "previous" as const, payload })),
      sportsDbFetch<EventsResponse>(
        `/eventsnext.php?id=${team.sportsDbTeam.idTeam}`,
      ).then((payload) => ({ tracked: team, kind: "next" as const, payload })),
    ]),
  );

  const eventsById = new Map<string, SportsDbEvent>();
  for (const response of responses) {
    for (const event of eventList(response.payload)) {
      eventsById.set(event.idEvent, event);
    }
  }

  // Free team previous/next endpoints only return one HOME event. Discover
  // active league/season pairs and augment with the free season endpoint.
  const leagueSeasons = new Map<string, { leagueId: string; season: string; leagueName?: string | null }>();
  for (const event of eventsById.values()) {
    if (!event.idLeague || !event.strSeason) continue;
    leagueSeasons.set(`${event.idLeague}:${event.strSeason}`, {
      leagueId: event.idLeague,
      season: event.strSeason,
      leagueName: event.strLeague,
    });
  }

  const seasonResponses = await Promise.all(
    Array.from(leagueSeasons.values()).map(async (leagueSeason) => {
      const path = `/eventsseason.php?id=${leagueSeason.leagueId}&s=${encodeURIComponent(leagueSeason.season)}`;
      const payload = await sportsDbFetch<EventsResponse>(path);
      return { ...leagueSeason, path, payload };
    }),
  );

  for (const response of seasonResponses) {
    for (const event of eventList(response.payload)) {
      if (
        (event.idHomeTeam && trackedProviderTeamIds.has(event.idHomeTeam)) ||
        (event.idAwayTeam && trackedProviderTeamIds.has(event.idAwayTeam))
      ) {
        eventsById.set(event.idEvent, event);
      }
    }
  }

  // The free season endpoint is capped and can omit later matches from its
  // response. Sweep the Primeira Liga day-by-day over ClubPulse's immediate
  // window (last 7 days through next 7 days) to recover away fixtures while
  // keeping this request under the free 30-requests/minute allowance.
  const today = new Date();
  const dayRequests = Array.from({ length: 15 }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() + index - 7);
    const day = dateOnly(date);
    const path = `/eventsday.php?d=${day}&l=${PRIMEIRA_LIGA_ID}`;
    return { day, path };
  });

  const dayResponses = await Promise.all(
    dayRequests.map(async ({ day, path }) => {
      const payload = await sportsDbFetch<EventsResponse>(path);
      return { day, path, payload };
    }),
  );

  for (const response of dayResponses) {
    for (const event of eventList(response.payload)) {
      if (
        (event.idHomeTeam && trackedProviderTeamIds.has(event.idHomeTeam)) ||
        (event.idAwayTeam && trackedProviderTeamIds.has(event.idAwayTeam))
      ) {
        eventsById.set(event.idEvent, event);
      }
    }
  }

  const dynamicTeams = new Map<string, Team>();

  function normalizeTeam(
    providerTeamId: string | null | undefined,
    name: string | null | undefined,
  ) {
    if (!providerTeamId) {
      throw new Error(`TheSportsDB returned a team without an id: ${name ?? "Unknown"}`);
    }

    const localTeamId = providerToLocalTeam.get(providerTeamId);
    if (localTeamId) return localTeamId;

    const id = `thesportsdb-team-${providerTeamId}`;
    if (!dynamicTeams.has(id)) {
      dynamicTeams.set(id, {
        id,
        clubId: `thesportsdb-club-${providerTeamId}`,
        name: name ?? "Unknown team",
        category: "Senior Men",
        source: { provider: PROVIDER, externalId: providerTeamId },
      });
    }
    return id;
  }

  const matches: Match[] = Array.from(eventsById.values()).map((event) => {
    const match: Match = {
      id: `thesportsdb-event-${event.idEvent}`,
      sportId: "football",
      competitionId: event.idLeague
        ? `thesportsdb-league-${event.idLeague}`
        : "thesportsdb-unknown-league",
      competition: event.strLeague ?? "Football",
      homeTeamId: normalizeTeam(event.idHomeTeam, event.strHomeTeam),
      awayTeamId: normalizeTeam(event.idAwayTeam, event.strAwayTeam),
      date: eventDate(event),
      venue: event.strVenue ?? undefined,
      status: statusFromSportsDb(event),
      source: { provider: PROVIDER, externalId: event.idEvent },
    };

    if (event.intHomeScore !== null && event.intHomeScore !== undefined) {
      const value = Number(event.intHomeScore);
      if (!Number.isNaN(value)) match.homeScore = value;
    }
    if (event.intAwayScore !== null && event.intAwayScore !== undefined) {
      const value = Number(event.intAwayScore);
      if (!Number.isNaN(value)) match.awayScore = value;
    }
    return match;
  });

  return {
    provider: "TheSportsDB V1 Free",
    fetchedAt: new Date().toISOString(),
    note:
      "ClubPulse combines free team, season, and a 15-day Primeira Liga daily sweep to improve current fixture coverage.",
    trackedTeams: resolvedTeams.map((team) => ({
      query: team.query,
      providerTeamId: team.sportsDbTeam.idTeam,
      providerTeamName: team.sportsDbTeam.strTeam,
      localTeamId: team.localTeamId,
    })),
    teams: Array.from(dynamicTeams.values()),
    matches,
    diagnostics: {
      teamSchedules: responses.map((response) => ({
        query: response.tracked.query,
        kind: response.kind,
        eventCount: eventList(response.payload).length,
      })),
      seasonSchedules: seasonResponses.map((response) => ({
        leagueId: response.leagueId,
        leagueName: response.leagueName,
        season: response.season,
        path: response.path,
        returnedCount: eventList(response.payload).length,
        trackedCount: eventList(response.payload).filter(
          (event) =>
            (event.idHomeTeam && trackedProviderTeamIds.has(event.idHomeTeam)) ||
            (event.idAwayTeam && trackedProviderTeamIds.has(event.idAwayTeam)),
        ).length,
      })),
      daySchedules: dayResponses.map((response) => ({
        day: response.day,
        path: response.path,
        returnedCount: eventList(response.payload).length,
        trackedCount: eventList(response.payload).filter(
          (event) =>
            (event.idHomeTeam && trackedProviderTeamIds.has(event.idHomeTeam)) ||
            (event.idAwayTeam && trackedProviderTeamIds.has(event.idAwayTeam)),
        ).length,
      })),
    },
  };
}

import type { Match, MatchStatus, Team } from "@/lib/types";

const API_BASE_URL = "https://www.thesportsdb.com/api/v1/json/123";
const PROVIDER = "thesportsdb";

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
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `TheSportsDB request failed (${response.status}) for ${path}`,
    );
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
      (team) =>
        team.strCountry === "Portugal" && team.strSport === "Soccer",
    ) ?? candidates[0];

  if (!selected) {
    throw new Error(
      `TheSportsDB could not resolve team: ${tracked.query}`,
    );
  }

  return {
    ...tracked,
    sportsDbTeam: selected,
  };
}

function statusFromSportsDb(event: SportsDbEvent): MatchStatus {
  if (event.strPostponed === "yes") {
    return "postponed";
  }

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
    throw new Error(
      `TheSportsDB event ${event.idEvent} has no timestamp`,
    );
  }

  // TheSportsDB strTimestamp is effectively UTC but is returned
  // without an explicit timezone marker.
  return event.strTimestamp.endsWith("Z")
    ? event.strTimestamp
    : `${event.strTimestamp}Z`;
}

export async function fetchTheSportsDbFootballFeed() {
  const resolvedTeams = await Promise.all(
    trackedTeams.map(resolveTrackedTeam),
  );

  const providerToLocalTeam = new Map(
    resolvedTeams.map((team) => [
      team.sportsDbTeam.idTeam,
      team.localTeamId,
    ]),
  );

  const responses = await Promise.all(
    resolvedTeams.flatMap((team) => [
      sportsDbFetch<EventsResponse>(
        `/eventslast.php?id=${team.sportsDbTeam.idTeam}`,
      ).then((payload) => ({
        tracked: team,
        kind: "previous" as const,
        payload,
      })),

      sportsDbFetch<EventsResponse>(
        `/eventsnext.php?id=${team.sportsDbTeam.idTeam}`,
      ).then((payload) => ({
        tracked: team,
        kind: "next" as const,
        payload,
      })),
    ]),
  );

  const eventsById = new Map<string, SportsDbEvent>();

  for (const response of responses) {
    for (const event of eventList(response.payload)) {
      eventsById.set(event.idEvent, event);
    }
  }

  const dynamicTeams = new Map<string, Team>();

  function normalizeTeam(
    providerTeamId: string | null | undefined,
    name: string | null | undefined,
  ) {
    if (!providerTeamId) {
      throw new Error(
        `TheSportsDB returned a team without an id: ${name ?? "Unknown"}`,
      );
    }

    const localTeamId = providerToLocalTeam.get(providerTeamId);

    if (localTeamId) {
      return localTeamId;
    }

    const id = `thesportsdb-team-${providerTeamId}`;

    if (!dynamicTeams.has(id)) {
      dynamicTeams.set(id, {
        id,
        clubId: `thesportsdb-club-${providerTeamId}`,
        name: name ?? "Unknown team",
        category: "Senior Men",
        source: {
          provider: PROVIDER,
          externalId: providerTeamId,
        },
      });
    }

    return id;
  }

  const matches: Match[] = Array.from(eventsById.values()).map(
    (event) => {
      const status = statusFromSportsDb(event);

      const match: Match = {
        id: `thesportsdb-event-${event.idEvent}`,
        sportId: "football",

        competitionId: event.idLeague
          ? `thesportsdb-league-${event.idLeague}`
          : "thesportsdb-unknown-league",

        competition: event.strLeague ?? "Football",

        homeTeamId: normalizeTeam(
          event.idHomeTeam,
          event.strHomeTeam,
        ),

        awayTeamId: normalizeTeam(
          event.idAwayTeam,
          event.strAwayTeam,
        ),

        date: eventDate(event),

        venue: event.strVenue ?? undefined,

        status,

        source: {
          provider: PROVIDER,
          externalId: event.idEvent,
        },
      };

      if (event.intHomeScore !== null && event.intHomeScore !== undefined) {
        const value = Number(event.intHomeScore);
        if (!Number.isNaN(value)) {
          match.homeScore = value;
        }
      }

      if (event.intAwayScore !== null && event.intAwayScore !== undefined) {
        const value = Number(event.intAwayScore);
        if (!Number.isNaN(value)) {
          match.awayScore = value;
        }
      }

      return match;
    },
  );

  return {
    provider: "TheSportsDB V1 Free",

    fetchedAt: new Date().toISOString(),

    note:
      "Free V1 returns a limited previous/next event set. The connector remains compatible with a future Premium/V2 implementation.",

    trackedTeams: resolvedTeams.map((team) => ({
      query: team.query,
      providerTeamId: team.sportsDbTeam.idTeam,
      providerTeamName: team.sportsDbTeam.strTeam,
      localTeamId: team.localTeamId,
    })),

    teams: Array.from(dynamicTeams.values()),

    matches,

    diagnostics: responses.map((response) => ({
      query: response.tracked.query,
      kind: response.kind,
      eventCount: eventList(response.payload).length,
    })),
  };
}
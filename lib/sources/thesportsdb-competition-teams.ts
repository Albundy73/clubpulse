const API_BASE_URL = "https://www.thesportsdb.com/api/v1/json/123";

export const SUPPORTED_FOOTBALL_COMPETITIONS = [
  { externalId: "4344", name: "Portuguese Primeira Liga", expectedTeamCount: 18 },
  { externalId: "4662", name: "Portuguese LigaPro", expectedTeamCount: 18 },
  { externalId: "4510", name: "Taca de Portugal" },
  { externalId: "4334", name: "French Ligue 1", expectedTeamCount: 18 },
  { externalId: "4401", name: "French Ligue 2", expectedTeamCount: 18 },
  { externalId: "4480", name: "UEFA Champions League", expectedTeamCount: 36 },
  { externalId: "4481", name: "UEFA Europa League", expectedTeamCount: 36 },
] as const;

type SportsDbTeam = {
  idTeam: string;
  strTeam: string;
  strTeamShort?: string | null;
  strSport?: string | null;
  strCountry?: string | null;
  strWebsite?: string | null;
};

type TeamsResponse = { teams?: SportsDbTeam[] | null };
type TableRow = { idTeam?: string | null; strTeam?: string | null };
type TableResponse = { table?: TableRow[] | null };
type SeasonEvent = {
  idHomeTeam?: string | null;
  strHomeTeam?: string | null;
  idAwayTeam?: string | null;
  strAwayTeam?: string | null;
};
type SeasonEventsResponse = { events?: SeasonEvent[] | null };

export type CompetitionTeamCatalog = {
  competitionExternalId: string;
  competitionName: string;
  season?: string;
  teams: SportsDbTeam[];
  expectedTeamCount?: number;
  complete: boolean;
  sources: string[];
};

async function fetchJson<T>(path: string): Promise<T | null> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

function addTeam(teamById: Map<string, SportsDbTeam>, team: SportsDbTeam | undefined) {
  if (!team?.idTeam || !team.strTeam) return;
  if ((team.strSport ?? "Soccer") !== "Soccer") return;
  const existing = teamById.get(team.idTeam);
  teamById.set(team.idTeam, existing ? { ...team, ...existing } : team);
}

async function fetchCompetitionTeams(
  competition: (typeof SUPPORTED_FOOTBALL_COMPETITIONS)[number],
  season?: string,
): Promise<CompetitionTeamCatalog> {
  const teamById = new Map<string, SportsDbTeam>();
  const sources: string[] = [];

  const listed = await fetchJson<TeamsResponse>(
    `/search_all_teams.php?l=${encodeURIComponent(competition.name)}`,
  );
  for (const team of listed?.teams ?? []) addTeam(teamById, team);
  if ((listed?.teams?.length ?? 0) > 0) sources.push("list-teams");

  if (season) {
    const scheduled = await fetchJson<SeasonEventsResponse>(
      `/eventsseason.php?id=${competition.externalId}&s=${encodeURIComponent(season)}`,
    );
    for (const event of scheduled?.events ?? []) {
      if (event.idHomeTeam && event.strHomeTeam) {
        addTeam(teamById, { idTeam: event.idHomeTeam, strTeam: event.strHomeTeam });
      }
      if (event.idAwayTeam && event.strAwayTeam) {
        addTeam(teamById, { idTeam: event.idAwayTeam, strTeam: event.strAwayTeam });
      }
    }
    if ((scheduled?.events?.length ?? 0) > 0) sources.push("season-events");

    const standings = await fetchJson<TableResponse>(
      `/lookuptable.php?l=${competition.externalId}&s=${encodeURIComponent(season)}`,
    );
    for (const row of standings?.table ?? []) {
      if (row.idTeam && row.strTeam) addTeam(teamById, { idTeam: row.idTeam, strTeam: row.strTeam });
    }
    if ((standings?.table?.length ?? 0) > 0) sources.push("league-table");
  }

  const teams = Array.from(teamById.values()).sort((a, b) => a.strTeam.localeCompare(b.strTeam));
  const expectedTeamCount = "expectedTeamCount" in competition ? competition.expectedTeamCount : undefined;

  return {
    competitionExternalId: competition.externalId,
    competitionName: competition.name,
    season,
    teams,
    expectedTeamCount,
    complete: expectedTeamCount ? teams.length >= expectedTeamCount : false,
    sources,
  };
}

export async function fetchTheSportsDbSupportedCompetitionTeams(
  seasonByExternalId: ReadonlyMap<string, string | undefined>,
) {
  // Competition metadata was fetched immediately before this call, so use the
  // provider-declared current season instead of inferring a season from today's date.
  // This matters when TheSportsDB has not rolled a league forward yet.
  const catalogs: CompetitionTeamCatalog[] = [];
  for (const competition of SUPPORTED_FOOTBALL_COMPETITIONS) {
    catalogs.push(await fetchCompetitionTeams(
      competition,
      seasonByExternalId.get(competition.externalId),
    ));
  }
  return catalogs;
}

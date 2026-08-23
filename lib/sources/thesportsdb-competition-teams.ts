const API_BASE_URL = "https://www.thesportsdb.com/api/v1/json/123";
const SITE_BASE_URL = "https://www.thesportsdb.com";

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

function currentFootballSeason(now = new Date()) {
  const year = now.getUTCFullYear();
  const startYear = now.getUTCMonth() >= 6 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .trim();
}

async function fetchJson<T>(path: string): Promise<T | null> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

async function fetchSeasonPageTeams(
  externalId: string,
  competitionName: string,
  season: string,
): Promise<SportsDbTeam[]> {
  const url = `${SITE_BASE_URL}/season/${externalId}-${slugify(competitionName)}/${encodeURIComponent(season)}`;
  const response = await fetch(url, {
    headers: { Accept: "text/html", "User-Agent": "ClubPulse/1.0 catalog refresh" },
    cache: "no-store",
  });
  if (!response.ok) return [];

  const html = await response.text();
  const teamById = new Map<string, SportsDbTeam>();
  const linkPattern = /t=(\d+)-[^"'&<>\s]+[^>]*>([^<]+)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const idTeam = match[1];
    const strTeam = decodeHtml(match[2].replace(/<[^>]+>/g, ""));
    if (idTeam && strTeam) {
      teamById.set(idTeam, { idTeam, strTeam, strSport: "Soccer" });
    }
  }

  return Array.from(teamById.values());
}

function addTeam(teamById: Map<string, SportsDbTeam>, team: SportsDbTeam | undefined) {
  if (!team?.idTeam || !team.strTeam) return;
  if ((team.strSport ?? "Soccer") !== "Soccer") return;
  const existing = teamById.get(team.idTeam);
  teamById.set(team.idTeam, existing ? { ...team, ...existing } : team);
}

async function fetchCompetitionTeams(
  competition: (typeof SUPPORTED_FOOTBALL_COMPETITIONS)[number],
  providerSeason?: string,
): Promise<CompetitionTeamCatalog> {
  const teamById = new Map<string, SportsDbTeam>();
  const sources: string[] = [];
  const expectedTeamCount = "expectedTeamCount" in competition ? competition.expectedTeamCount : undefined;

  // The provider's public season page exposes the complete competition roster
  // and embeds the canonical TheSportsDB team ID in each team link. The V1 free
  // API caps List Teams at 10 and league tables at 5 rows, so neither endpoint
  // can be authoritative by itself.
  const inferredSeason = currentFootballSeason();
  const seasonCandidates = Array.from(new Set([inferredSeason, providerSeason].filter(Boolean))) as string[];
  let selectedSeason: string | undefined;

  for (const season of seasonCandidates) {
    const pageTeams = await fetchSeasonPageTeams(competition.externalId, competition.name, season);
    if (pageTeams.length === 0) continue;
    for (const team of pageTeams) addTeam(teamById, team);
    sources.push(`season-page:${season}`);
    selectedSeason = season;

    if (!expectedTeamCount || teamById.size >= expectedTeamCount) break;
  }

  // Keep the supported free APIs as secondary signals. They enrich/fill gaps,
  // but their documented free-tier row limits mean they never define the full
  // membership set on their own.
  if (!expectedTeamCount || teamById.size < expectedTeamCount) {
    const listed = await fetchJson<TeamsResponse>(
      `/search_all_teams.php?l=${encodeURIComponent(competition.name)}`,
    );
    for (const team of listed?.teams ?? []) addTeam(teamById, team);
    if ((listed?.teams?.length ?? 0) > 0) sources.push("list-teams");

    const season = selectedSeason ?? inferredSeason;
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

  return {
    competitionExternalId: competition.externalId,
    competitionName: competition.name,
    season: selectedSeason ?? providerSeason ?? inferredSeason,
    teams,
    expectedTeamCount,
    complete: expectedTeamCount ? teams.length >= expectedTeamCount : teams.length > 0,
    sources,
  };
}

export async function fetchTheSportsDbSupportedCompetitionTeams(
  seasonByExternalId: ReadonlyMap<string, string | undefined>,
) {
  const catalogs: CompetitionTeamCatalog[] = [];
  for (const competition of SUPPORTED_FOOTBALL_COMPETITIONS) {
    catalogs.push(await fetchCompetitionTeams(
      competition,
      seasonByExternalId.get(competition.externalId),
    ));
  }
  return catalogs;
}

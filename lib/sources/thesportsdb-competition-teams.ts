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
    .replace(/&#039;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchSeasonPageTeams(
  externalId: string,
  competitionName: string,
  season: string,
): Promise<SportsDbTeam[]> {
  const url = `${SITE_BASE_URL}/season/${externalId}-${slugify(competitionName)}/${encodeURIComponent(season)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "text/html",
      "User-Agent": "ClubPulse/1.0 catalog refresh",
    },
    cache: "no-store",
  });
  if (!response.ok) return [];

  const html = await response.text();
  const teamById = new Map<string, SportsDbTeam>();

  // Team schedule links on TheSportsDB include &t=<teamId>-<slug>. The anchor
  // usually contains a badge image before the visible name, so capture the
  // complete anchor body and strip tags instead of expecting text immediately.
  const linkPattern = /<a\b[^>]*href=["'][^"']*(?:&amp;|&)t=(\d+)-[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(linkPattern)) {
    const idTeam = match[1];
    const anchorBody = match[2] ?? "";
    const strTeam = decodeHtml(anchorBody.replace(/<[^>]*>/g, " "));
    if (idTeam && strTeam) {
      teamById.set(idTeam, { idTeam, strTeam, strSport: "Soccer" });
    }
  }

  return Array.from(teamById.values());
}

function addTeam(teamById: Map<string, SportsDbTeam>, team: SportsDbTeam | undefined) {
  if (!team?.idTeam || !team.strTeam) return;
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
  const inferredSeason = currentFootballSeason();
  const seasonCandidates = Array.from(
    new Set([inferredSeason, providerSeason].filter(Boolean)),
  ) as string[];
  let selectedSeason: string | undefined;

  // The public season page is intentionally the catalog source. It exposes the
  // full roster plus canonical team IDs without consuming the V1 free API rate
  // limit. Do not fall back to capped JSON endpoints here: match ingestion is a
  // separate path and already contributes observed memberships from fixtures.
  for (const season of seasonCandidates) {
    const pageTeams = await fetchSeasonPageTeams(
      competition.externalId,
      competition.name,
      season,
    );
    if (pageTeams.length === 0) continue;

    for (const team of pageTeams) addTeam(teamById, team);
    sources.push(`season-page:${season}`);
    selectedSeason = season;

    if (!expectedTeamCount || teamById.size >= expectedTeamCount) break;
  }

  const teams = Array.from(teamById.values()).sort((a, b) =>
    a.strTeam.localeCompare(b.strTeam),
  );

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
    catalogs.push(
      await fetchCompetitionTeams(
        competition,
        seasonByExternalId.get(competition.externalId),
      ),
    );
  }
  return catalogs;
}

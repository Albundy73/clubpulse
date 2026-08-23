const SITE_BASE_URL = "https://www.thesportsdb.com";

export const SUPPORTED_FOOTBALL_COMPETITIONS = [
  { externalId: "4344", name: "Portuguese Primeira Liga", expectedTeamCount: 18 },
  { externalId: "4662", name: "Portuguese LigaPro", expectedTeamCount: 18 },
  { externalId: "4510", name: "Taca de Portugal" },
  { externalId: "4334", name: "French Ligue 1", expectedTeamCount: 18 },
  { externalId: "4401", name: "French Ligue 2", expectedTeamCount: 18 },
  { externalId: "4480", name: "UEFA Champions League", tournament: true },
  { externalId: "4481", name: "UEFA Europa League", tournament: true },
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

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html",
      "User-Agent": "ClubPulse/1.0 catalog refresh",
    },
    cache: "no-store",
  });
  return response.ok ? response.text() : null;
}

function teamNameFromAnchor(anchorBody: string, slug: string) {
  const alt = anchorBody.match(/\balt=["']([^"']+)["']/i)?.[1];
  const text = decodeHtml(anchorBody.replace(/<[^>]*>/g, " "));
  if (text && !/^image\b/i.test(text)) return text;
  if (alt) return decodeHtml(alt.replace(/\b(?:badge|logo|team)\b/gi, " "));
  return decodeHtml(slug.replace(/-/g, " "));
}

function extractCanonicalTeamLinks(html: string) {
  const teamById = new Map<string, SportsDbTeam>();

  // Domestic season pages expose team filters using &t=<id>-<slug>.
  const filterPattern = /<a\b[^>]*href=["'][^"']*(?:&amp;|&)t=(\d+)-([^"'&<>\s]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(filterPattern)) {
    const idTeam = match[1];
    const slug = match[2] ?? "";
    const strTeam = teamNameFromAnchor(match[3] ?? "", slug);
    if (idTeam && strTeam) teamById.set(idTeam, { idTeam, strTeam, strSport: "Soccer" });
  }

  // Event/detail pages use canonical /team/<id>-<slug> links.
  const teamPagePattern = /<a\b[^>]*href=["'][^"']*\/team\/(\d+)-([^"'/?#<>\s]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(teamPagePattern)) {
    const idTeam = match[1];
    const slug = match[2] ?? "";
    const strTeam = teamNameFromAnchor(match[3] ?? "", slug);
    if (idTeam && strTeam) teamById.set(idTeam, { idTeam, strTeam, strSport: "Soccer" });
  }

  return teamById;
}

type EventLink = { url: string; homeSlug: string; awaySlug: string };

function extractEventLinks(html: string): EventLink[] {
  const byUrl = new Map<string, EventLink>();
  const pattern = /href=["'](?:https?:\/\/www\.thesportsdb\.com)?\/event\/(\d+)-([^"'/?#<>\s]+)["']/gi;

  for (const match of html.matchAll(pattern)) {
    const eventId = match[1];
    const slug = match[2] ?? "";
    const separator = slug.indexOf("-vs-");
    if (!eventId || separator < 1) continue;
    const homeSlug = slug.slice(0, separator);
    const awaySlug = slug.slice(separator + 4);
    const url = `${SITE_BASE_URL}/event/${eventId}-${slug}`;
    byUrl.set(url, { url, homeSlug, awaySlug });
  }

  return Array.from(byUrl.values());
}

function chooseCoveringEvents(events: EventLink[]) {
  const selected: EventLink[] = [];
  const covered = new Set<string>();

  // One public event page normally resolves both canonical team IDs. Selecting
  // only events that introduce at least one new team keeps UEFA refreshes much
  // smaller than fetching every match in every qualifying round.
  for (const event of events) {
    if (covered.has(event.homeSlug) && covered.has(event.awaySlug)) continue;
    selected.push(event);
    covered.add(event.homeSlug);
    covered.add(event.awaySlug);
  }
  return selected;
}

async function resolveTournamentTeamsFromEvents(html: string) {
  const eventLinks = chooseCoveringEvents(extractEventLinks(html));
  const teamById = new Map<string, SportsDbTeam>();

  // Small batches keep public-page traffic controlled while avoiding the V1
  // API entirely. No API key/rate-limit budget is consumed by these requests.
  const batchSize = 6;
  for (let offset = 0; offset < eventLinks.length; offset += batchSize) {
    const batch = eventLinks.slice(offset, offset + batchSize);
    const pages = await Promise.all(batch.map((event) => fetchHtml(event.url)));
    for (const page of pages) {
      if (!page) continue;
      for (const [id, team] of extractCanonicalTeamLinks(page)) teamById.set(id, team);
    }
  }

  return teamById;
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
  const isTournament = "tournament" in competition && competition.tournament === true;
  const inferredSeason = currentFootballSeason();
  const seasonCandidates = Array.from(new Set([inferredSeason, providerSeason].filter(Boolean))) as string[];
  let selectedSeason: string | undefined;

  for (const season of seasonCandidates) {
    const url = `${SITE_BASE_URL}/season/${competition.externalId}-${slugify(competition.name)}/${encodeURIComponent(season)}`;
    const html = await fetchHtml(url);
    if (!html) continue;

    const directTeams = extractCanonicalTeamLinks(html);
    for (const team of directTeams.values()) addTeam(teamById, team);

    if (isTournament) {
      const eventTeams = await resolveTournamentTeamsFromEvents(html);
      for (const team of eventTeams.values()) addTeam(teamById, team);
      if (eventTeams.size > 0) sources.push(`public-events:${season}`);
    }

    if (directTeams.size > 0) sources.push(`season-page:${season}`);
    if (directTeams.size > 0 || teamById.size > 0) selectedSeason = season;

    // Fixed-size domestic leagues can stop as soon as their full roster is
    // present. UEFA tournaments have qualifying rounds, so their participant
    // count is intentionally not capped at the 36-team league phase size.
    if (!isTournament && (!expectedTeamCount || teamById.size >= expectedTeamCount)) break;
    if (isTournament && teamById.size > 0) break;
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
    catalogs.push(await fetchCompetitionTeams(competition, seasonByExternalId.get(competition.externalId)));
  }
  return catalogs;
}

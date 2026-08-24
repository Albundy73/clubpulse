const SITE_BASE_URL = "https://www.thesportsdb.com";

export const SUPPORTED_FOOTBALL_COMPETITIONS = [
  { externalId: "4344", name: "Primeira Liga", expectedTeamCount: 18 },
  { externalId: "4510", name: "Taca de Portugal" },
  { externalId: "4334", name: "Ligue 1", expectedTeamCount: 18 },
  { externalId: "4401", name: "Ligue 2", expectedTeamCount: 18 },
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
  strBadge?: string | null;
  pageSlug?: string;
};

export type CompetitionTeamCatalog = {
  competitionExternalId: string;
  competitionName: string;
  competitionBadgeUrl?: string;
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
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function decodeHtml(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&#039;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeDisplayName(value: string) {
  let decoded = decodeHtml(value);
  try { decoded = decodeURIComponent(decoded); } catch {}
  decoded = decoded.trim();
  return decoded ? decoded.charAt(0).toLocaleUpperCase() + decoded.slice(1) : decoded;
}

function absoluteArtworkUrl(value?: string | null) {
  if (!value) return undefined;
  const decoded = decodeHtml(value);
  const absolute = decoded.startsWith("//") ? `https:${decoded}` : decoded.startsWith("/") ? `${SITE_BASE_URL}${decoded}` : decoded.startsWith("http") ? decoded : undefined;
  return absolute?.replace(/\/(?:tiny|small|medium|large|original)\/?$/i, "");
}

function artworkMatches(html: string, kind: "team" | "league") {
  const folder = kind === "team" ? "team" : "league";
  const pattern = new RegExp(`(?:src|data-src)=["']([^"']*\\/images\\/media\\/${folder}\\/(?:badge|logo)\\/[^"']+)["']`, "gi");
  return Array.from(html.matchAll(pattern)).map((match) => ({ index: match.index ?? 0, url: absoluteArtworkUrl(match[1]) })).filter((item): item is { index: number; url: string } => Boolean(item.url));
}

function artworkFromHtml(html: string, kind: "team" | "league") {
  return artworkMatches(html, kind)[0]?.url;
}

async function fetchHtml(url: string) {
  const response = await fetch(url, { headers: { Accept: "text/html", "User-Agent": "ClubPulse/1.0 catalog refresh" }, cache: "no-store" });
  return response.ok ? response.text() : null;
}

function isGenericTeamLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  return !normalized || ["home", "away", "home icon", "away icon", "home team", "away team", "team", "team icon", "badge", "logo", "image"].includes(normalized);
}

function teamNameFromSlug(slug: string) {
  return normalizeDisplayName(slug.replace(/-/g, " ").replace(/\bfc\b/gi, "FC").replace(/\bsc\b/gi, "SC").replace(/\bafc\b/gi, "AFC").replace(/\bcf\b/gi, "CF"));
}

function teamNameFromAnchor(anchorBody: string, slug: string) {
  const text = normalizeDisplayName(anchorBody.replace(/<[^>]*>/g, " "));
  if (text && !isGenericTeamLabel(text)) return text;
  const alt = normalizeDisplayName(anchorBody.match(/\balt=["']([^"']+)["']/i)?.[1] ?? "");
  if (alt && !isGenericTeamLabel(alt)) {
    const cleanedAlt = normalizeDisplayName(alt.replace(/\b(?:badge|logo|team)\b/gi, " "));
    if (cleanedAlt && !isGenericTeamLabel(cleanedAlt)) return cleanedAlt;
  }
  return teamNameFromSlug(slug);
}

function extractCanonicalTeamLinks(html: string) {
  const teamById = new Map<string, SportsDbTeam>();
  const add = (idTeam: string, slug: string, body: string) => {
    const strTeam = teamNameFromAnchor(body, slug);
    // Only trust artwork that is inside the team's own anchor. The previous
    // nearest-image heuristic could assign one badge to neighboring teams.
    const strBadge = artworkFromHtml(body, "team");
    if (idTeam && strTeam) teamById.set(idTeam, { idTeam, strTeam, strSport: "Soccer", strBadge, pageSlug: slug });
  };
  const filterPattern = /<a\b[^>]*href=["'][^"']*(?:&amp;|&)t=(\d+)-([^"'&<>\s]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(filterPattern)) add(match[1], match[2] ?? "", match[3] ?? "");
  const teamPagePattern = /<a\b[^>]*href=["'][^"']*\/team\/(\d+)-([^"'/?#<>\s]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(teamPagePattern)) add(match[1], match[2] ?? "", match[3] ?? "");
  return teamById;
}

type EventLink = { url: string; homeSlug: string; awaySlug: string };
function extractEventLinks(html: string): EventLink[] {
  const byUrl = new Map<string, EventLink>();
  const pattern = /href=["'](?:https?:\/\/www\.thesportsdb\.com)?\/event\/(\d+)-([^"'/?#<>\s]+)["']/gi;
  for (const match of html.matchAll(pattern)) {
    const eventId = match[1]; const slug = match[2] ?? ""; const separator = slug.indexOf("-vs-"); if (!eventId || separator < 1) continue;
    const homeSlug = slug.slice(0, separator); const awaySlug = slug.slice(separator + 4); const url = `${SITE_BASE_URL}/event/${eventId}-${slug}`;
    byUrl.set(url, { url, homeSlug, awaySlug });
  }
  return Array.from(byUrl.values());
}

function chooseCoveringEvents(events: EventLink[]) {
  const selected: EventLink[] = [];
  const covered = new Set<string>();
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
  const batchSize = 6;
  for (let offset = 0; offset < eventLinks.length; offset += batchSize) {
    const pages = await Promise.all(eventLinks.slice(offset, offset + batchSize).map((event) => fetchHtml(event.url)));
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
  teamById.set(team.idTeam, existing ? {
    ...team,
    ...existing,
    strTeam: normalizeDisplayName(existing.strTeam || team.strTeam),
    strBadge: existing.strBadge ?? team.strBadge,
    pageSlug: existing.pageSlug ?? team.pageSlug,
  } : { ...team, strTeam: normalizeDisplayName(team.strTeam) });
}

async function enrichMissingTeamArtwork(teamById: Map<string, SportsDbTeam>) {
  const missing = Array.from(teamById.values()).filter((team) => !team.strBadge);
  let enriched = 0;
  const batchSize = 8;

  for (let offset = 0; offset < missing.length; offset += batchSize) {
    const batch = missing.slice(offset, offset + batchSize);
    const pages = await Promise.all(batch.map((team) => {
      const slug = team.pageSlug || slugify(team.strTeam);
      return fetchHtml(`${SITE_BASE_URL}/team/${team.idTeam}-${slug}`);
    }));

    pages.forEach((page, index) => {
      if (!page) return;
      const team = batch[index];
      const badge = artworkFromHtml(page, "team");
      if (!badge) return;
      teamById.set(team.idTeam, { ...team, strBadge: badge });
      enriched += 1;
    });
  }

  return enriched;
}

async function fetchCompetitionBadge(competition: (typeof SUPPORTED_FOOTBALL_COMPETITIONS)[number]) {
  const candidates = [
    `${SITE_BASE_URL}/league/${competition.externalId}`,
    `${SITE_BASE_URL}/league/${competition.externalId}-${slugify(competition.name)}`,
  ];
  for (const profileUrl of candidates) {
    const html = await fetchHtml(profileUrl);
    const badge = html ? artworkFromHtml(html, "league") : undefined;
    if (badge) return badge;
  }
  return undefined;
}

async function fetchCompetitionTeams(competition: (typeof SUPPORTED_FOOTBALL_COMPETITIONS)[number], providerSeason?: string): Promise<CompetitionTeamCatalog> {
  const teamById = new Map<string, SportsDbTeam>();
  const sources: string[] = [];
  const expectedTeamCount = "expectedTeamCount" in competition ? competition.expectedTeamCount : undefined;
  const isTournament = "tournament" in competition && competition.tournament === true;
  const inferredSeason = currentFootballSeason();
  const seasonCandidates = Array.from(new Set([inferredSeason, providerSeason].filter(Boolean))) as string[];
  let selectedSeason: string | undefined;
  let competitionBadgeUrl: string | undefined;

  for (const season of seasonCandidates) {
    const url = `${SITE_BASE_URL}/season/${competition.externalId}-${slugify(competition.name)}/${encodeURIComponent(season)}`;
    const html = await fetchHtml(url);
    if (!html) continue;

    competitionBadgeUrl ??= artworkFromHtml(html, "league");
    const directTeams = extractCanonicalTeamLinks(html);
    for (const team of directTeams.values()) addTeam(teamById, team);

    if (isTournament) {
      const eventTeams = await resolveTournamentTeamsFromEvents(html);
      for (const team of eventTeams.values()) addTeam(teamById, team);
      if (eventTeams.size > 0) sources.push(`public-events:${season}`);
    }

    if (directTeams.size > 0) sources.push(`season-page:${season}`);
    if (directTeams.size > 0 || teamById.size > 0) selectedSeason = season;
    if (!isTournament && (!expectedTeamCount || teamById.size >= expectedTeamCount)) break;
    if (isTournament && teamById.size > 0) break;
  }

  competitionBadgeUrl ??= await fetchCompetitionBadge(competition);
  if (competitionBadgeUrl) sources.push("league-profile-artwork");

  const teamArtworkEnriched = await enrichMissingTeamArtwork(teamById);
  if (teamArtworkEnriched > 0) sources.push(`team-profile-artwork:${teamArtworkEnriched}`);

  const teams = Array.from(teamById.values()).sort((a, b) => a.strTeam.localeCompare(b.strTeam));
  return {
    competitionExternalId: competition.externalId,
    competitionName: competition.name,
    competitionBadgeUrl,
    season: selectedSeason ?? providerSeason ?? inferredSeason,
    teams,
    expectedTeamCount,
    complete: expectedTeamCount ? teams.length >= expectedTeamCount : teams.length > 0,
    sources,
  };
}

export async function fetchTheSportsDbSupportedCompetitionTeams(seasonByExternalId: ReadonlyMap<string, string | undefined>) {
  const catalogs: CompetitionTeamCatalog[] = [];
  for (const competition of SUPPORTED_FOOTBALL_COMPETITIONS) {
    catalogs.push(await fetchCompetitionTeams(competition, seasonByExternalId.get(competition.externalId)));
  }
  return catalogs;
}

import type { Match, Team } from "@/lib/types";
import { SUPPORTED_FOOTBALL_COMPETITIONS } from "@/lib/sources/thesportsdb-competition-teams";

const SITE_BASE_URL = "https://www.thesportsdb.com";
const PROVIDER = "thesportsdb";

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};
const LONG_MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

type ScheduleCandidate = {
  eventId: string;
  slug: string;
  eventUrl: string;
  competitionExternalId: string;
  competitionName: string;
  season: string;
  date: Date;
  homeScore?: number;
  awayScore?: number;
};

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function decodeHtml(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&#039;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function textFromHtml(value: string) {
  return decodeHtml(value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " "));
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: { Accept: "text/html", "User-Agent": "ClubPulse/1.0 match ingestion" },
    cache: "no-store",
  });
  return response.ok ? response.text() : null;
}

function currentFootballSeason(now = new Date()) {
  const year = now.getUTCFullYear();
  const startYear = now.getUTCMonth() >= 6 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

function dateFromScheduleRow(rowHtml: string, season: string) {
  const text = textFromHtml(rowHtml);
  const match = text.match(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i);
  if (!match) return null;
  const [startYearText, endYearText] = season.split("-");
  const month = MONTHS[match[2].toLowerCase()];
  if (month === undefined) return null;
  const year = month >= 6 ? Number(startYearText) : Number(endYearText);
  return new Date(Date.UTC(year, month, Number(match[1]), 12, 0, 0));
}

function scoreFromScheduleRow(rowHtml: string) {
  const text = textFromHtml(rowHtml);
  const score = text.match(/\b(\d+)\s*-\s*(\d+)\b/);
  return score ? { homeScore: Number(score[1]), awayScore: Number(score[2]) } : {};
}

function scheduleCandidates(html: string, competitionExternalId: string, competitionName: string, season: string) {
  const rows = Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));
  const candidates: ScheduleCandidate[] = [];
  for (const rowMatch of rows) {
    const row = rowMatch[1] ?? "";
    const event = row.match(/href=["'](?:https?:\/\/www\.thesportsdb\.com)?\/event\/(\d+)-([^"'/?#<>\s]+)["']/i);
    if (!event) continue;
    const date = dateFromScheduleRow(row, season);
    if (!date) continue;
    const eventId = event[1];
    const slug = event[2];
    candidates.push({
      eventId,
      slug,
      eventUrl: `${SITE_BASE_URL}/event/${eventId}-${slug}`,
      competitionExternalId,
      competitionName,
      season,
      date,
      ...scoreFromScheduleRow(row),
    });
  }
  return candidates;
}

function exactUtcDate(html: string, fallback: Date) {
  const text = textFromHtml(html);
  const match = text.match(/\b\w{3}\s+(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\s+(\d{1,2}):(\d{2})(am|pm)\s+UTC\b/i);
  if (!match) return fallback;
  let hour = Number(match[4]);
  const meridiem = match[6].toLowerCase();
  if (meridiem === "pm" && hour !== 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return new Date(Date.UTC(Number(match[3]), LONG_MONTHS[match[2].toLowerCase()], Number(match[1]), hour, Number(match[5]), 0));
}

function canonicalTeams(html: string) {
  const byId = new Map<string, Team>();
  const pattern = /<a\b[^>]*href=["'][^"']*\/team\/(\d+)-([^"'/?#<>\s]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const providerId = match[1];
    const slug = match[2] ?? "";
    let name = textFromHtml(match[3] ?? "");
    if (!name || /^(home|away|home icon|away icon|badge|logo|image)$/i.test(name)) name = decodeHtml(slug.replace(/-/g, " "));
    byId.set(providerId, {
      id: `thesportsdb-team-${providerId}`,
      clubId: `thesportsdb-club-${providerId}`,
      name,
      category: "Senior Men",
      source: { provider: PROVIDER, externalId: providerId },
    });
  }
  return Array.from(byId.values());
}

function statusFromEventPage(html: string, candidate: ScheduleCandidate) {
  const text = textFromHtml(html);
  if (/\bStatus\s+(FT|AET|PEN)\b/i.test(text) || (candidate.homeScore !== undefined && candidate.awayScore !== undefined)) return "finished" as const;
  if (/\bStatus\s+(PST)\b/i.test(text)) return "postponed" as const;
  if (/\bStatus\s+(CANC|ABD)\b/i.test(text)) return "cancelled" as const;
  return "scheduled" as const;
}

async function fetchCompetitionCandidates(competition: (typeof SUPPORTED_FOOTBALL_COMPETITIONS)[number], season: string) {
  const url = `${SITE_BASE_URL}/season/${competition.externalId}-${slugify(competition.name)}/${season}`;
  const html = await fetchHtml(url);
  return html ? scheduleCandidates(html, competition.externalId, competition.name, season) : [];
}

export async function fetchTheSportsDbPublicMatchWindow(now = new Date()) {
  const season = currentFootballSeason(now);
  const start = new Date(now); start.setUTCDate(start.getUTCDate() - 7); start.setUTCHours(0, 0, 0, 0);
  const end = new Date(now); end.setUTCDate(end.getUTCDate() + 8); end.setUTCHours(0, 0, 0, 0);

  const competitionCandidates = await Promise.all(
    SUPPORTED_FOOTBALL_COMPETITIONS.map((competition) => fetchCompetitionCandidates(competition, season)),
  );
  const candidates = competitionCandidates.flat().filter((candidate) => candidate.date >= start && candidate.date < end);

  const teams = new Map<string, Team>();
  const matches = new Map<string, Match>();
  const batchSize = 12;
  for (let offset = 0; offset < candidates.length; offset += batchSize) {
    const batch = candidates.slice(offset, offset + batchSize);
    const pages = await Promise.all(batch.map((candidate) => fetchHtml(candidate.eventUrl)));
    pages.forEach((html, index) => {
      const candidate = batch[index];
      if (!html) return;
      const eventTeams = canonicalTeams(html);
      if (eventTeams.length < 2) return;
      for (const team of eventTeams) teams.set(team.id, team);
      const [homeTeam, awayTeam] = eventTeams;
      const match: Match = {
        id: `thesportsdb-event-${candidate.eventId}`,
        sportId: "football",
        competitionId: `thesportsdb-league-${candidate.competitionExternalId}`,
        competition: candidate.competitionName,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        date: exactUtcDate(html, candidate.date).toISOString(),
        status: statusFromEventPage(html, candidate),
        source: { provider: PROVIDER, externalId: candidate.eventId, url: candidate.eventUrl },
      };
      if (candidate.homeScore !== undefined) match.homeScore = candidate.homeScore;
      if (candidate.awayScore !== undefined) match.awayScore = candidate.awayScore;
      matches.set(candidate.eventId, match);
    });
  }

  return {
    teams: Array.from(teams.values()),
    matches: Array.from(matches.values()),
    diagnostics: { season, candidates: candidates.length, resolved: matches.size },
  };
}

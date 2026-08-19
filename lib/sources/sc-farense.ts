import type { Club, Competition, Match, Team } from "@/lib/types";

const SOURCE_URL = "https://scfarense.pt/calendario.php";
const PROVIDER = "scfarense-official";

export type LiveSourcePayload = {
  clubs: Club[];
  teams: Team[];
  competitions: Competition[];
  matches: Match[];
  fetchedAt: string;
  sourceUrl: string;
};

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&atilde;/gi, "ã")
    .replace(/&ccedil;/gi, "ç");
}

function htmlToLines(html: string) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "\n"),
  )
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function toLocalIso(dateText: string, timeText?: string) {
  const [day, month, year] = dateText.split(".");
  return `${year}-${month}-${day}T${timeText ?? "12:00"}:00`;
}

function parseCalendar(html: string) {
  const lines = htmlToLines(html);
  const parsed: { date: string; home: string; away: string; round: string; time?: string }[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(lines[i])) continue;

    const date = lines[i];
    const window = lines.slice(i + 1, i + 12);
    const roundIndex = window.findIndex((line) => /^Jornada\s+\d+/i.test(line));
    if (roundIndex < 2) continue;

    const teamCandidates = window.slice(0, roundIndex).filter((line) => {
      if (/^(Segunda|Terça|Quarta|Quinta|Sexta|Sábado|Domingo)/i.test(line)) return false;
      if (/Liga Portugal/i.test(line)) return false;
      return line.length > 1;
    });

    const home = teamCandidates[0];
    const away = teamCandidates[1];
    const roundLine = window[roundIndex];
    if (!home || !away) continue;

    const time = roundLine.match(/·\s*(\d{1,2}:\d{2})/)?.[1];
    parsed.push({ date, home, away, round: roundLine.split("·")[0].trim(), time });
  }

  return parsed;
}

export async function fetchScFarenseSchedule(): Promise<LiveSourcePayload> {
  const response = await fetch(SOURCE_URL, {
    headers: { "user-agent": "ClubPulse/0.1 (+https://github.com/Albundy73/clubpulse)" },
    next: { revalidate: 1800 },
  });

  if (!response.ok) throw new Error(`SC Farense source returned ${response.status}`);

  const html = await response.text();
  const fixtures = parseCalendar(html);
  if (!fixtures.length) throw new Error("SC Farense schedule could not be parsed");

  const farenseClub: Club = {
    id: "farense-football",
    name: "SC Farense",
    shortName: "Farense",
    cityId: "faro",
    sportId: "football",
    source: { provider: PROVIDER, externalId: "sc-farense", url: SOURCE_URL },
  };

  const competition: Competition = {
    id: "liga-portugal-2-2026-27",
    sportId: "football",
    name: "Liga Portugal 2",
    season: "2026/27",
    countryId: "pt",
    source: { provider: PROVIDER, externalId: "liga-portugal-2-2026-27", url: SOURCE_URL },
  };

  const clubMap = new Map<string, Club>([[farenseClub.id, farenseClub]]);
  const teamMap = new Map<string, Team>([
    [
      "farense-senior",
      {
        id: "farense-senior",
        clubId: farenseClub.id,
        name: "SC Farense",
        category: "Senior",
        source: { provider: PROVIDER, externalId: "sc-farense-senior", url: SOURCE_URL },
      },
    ],
  ]);

  function ensureTeam(name: string) {
    if (name === "SC Farense") return "farense-senior";
    const baseId = slugify(name);
    const clubId = `live-club-${baseId}`;
    const teamId = `live-team-${baseId}`;
    if (!clubMap.has(clubId)) {
      clubMap.set(clubId, {
        id: clubId,
        name,
        shortName: name,
        cityId: "external",
        sportId: "football",
        source: { provider: PROVIDER, externalId: clubId, url: SOURCE_URL },
      });
    }
    if (!teamMap.has(teamId)) {
      teamMap.set(teamId, {
        id: teamId,
        clubId,
        name,
        category: "Senior",
        source: { provider: PROVIDER, externalId: teamId, url: SOURCE_URL },
      });
    }
    return teamId;
  }

  const now = Date.now();
  const matches: Match[] = fixtures.map((fixture) => {
    const homeTeamId = ensureTeam(fixture.home);
    const awayTeamId = ensureTeam(fixture.away);
    const date = toLocalIso(fixture.date, fixture.time);
    const externalId = `${fixture.date}-${fixture.home}-${fixture.away}-${fixture.round}`;
    return {
      id: `live-${slugify(externalId)}`,
      sportId: "football",
      competitionId: competition.id,
      homeTeamId,
      awayTeamId,
      date,
      status: +new Date(date) < now ? "finished" : "scheduled",
      source: { provider: PROVIDER, externalId, url: SOURCE_URL },
    };
  });

  return {
    clubs: Array.from(clubMap.values()),
    teams: Array.from(teamMap.values()),
    competitions: [competition],
    matches,
    fetchedAt: new Date().toISOString(),
    sourceUrl: SOURCE_URL,
  };
}

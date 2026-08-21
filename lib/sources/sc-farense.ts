import type { Club, Competition, Match, Team } from "@/lib/types";

const SOURCE_URL = "https://www.scfarense.pt/calendario";
const PROVIDER = "sc-farense-official";

type Fixture = {
  date: string;
  time: string;
  home: string;
  away: string;
  round: string;
};

type FarenseFeed = {
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
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&atilde;/gi, "ã")
    .replace(/&otilde;/gi, "õ")
    .replace(/&ccedil;/gi, "ç");
}

function htmlToText(html: string) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function toLocalIso(date: string, time: string) {
  const [day, month, year] = date.split("/").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 1, minute)).toISOString();
}

function parseFixtures(text: string): Fixture[] {
  const fixturePattern = /(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})\s+(.+?)\s+-\s+(.+?)\s+(\d+ª Jornada)/g;
  const fixtures: Fixture[] = [];
  for (const match of text.matchAll(fixturePattern)) {
    fixtures.push({
      date: match[1],
      time: match[2],
      home: match[3].trim(),
      away: match[4].trim(),
      round: match[5],
    });
  }
  return fixtures;
}

export async function fetchScFarenseFeed(): Promise<FarenseFeed> {
  const response = await fetch(SOURCE_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ClubPulse/0.1; +https://github.com/Albundy73/clubpulse)",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
    },
    next: { revalidate: 900 },
  });

  if (!response.ok) {
    throw new Error(`SC Farense request failed (${response.status})`);
  }

  const text = htmlToText(await response.text());
  const fixtures = parseFixtures(text);

  if (fixtures.length === 0) {
    throw new Error("Could not parse SC Farense fixtures");
  }

  const competition: Competition = {
    id: "liga-portugal-2-2026-27",
    sportId: "football",
    name: "Liga Portugal 2 Meu Super",
    season: "2026/27",
    countryId: "pt",
    source: { provider: PROVIDER, externalId: "liga-portugal-2-2026-27", url: SOURCE_URL },
  };

  const clubMap = new Map<string, Club>();
  const teamMap = new Map<string, Team>();

  clubMap.set("farense-football", {
    id: "farense-football",
    name: "SC Farense",
    shortName: "Farense",
    cityId: "faro",
    sportId: "football",
    source: { provider: PROVIDER, externalId: "sc-farense", url: SOURCE_URL },
  });
  teamMap.set("farense-senior", {
    id: "farense-senior",
    clubId: "farense-football",
    name: "SC Farense",
    category: "Senior",
    source: { provider: PROVIDER, externalId: "sc-farense-senior", url: SOURCE_URL },
  });

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
      competition: competition.name,
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

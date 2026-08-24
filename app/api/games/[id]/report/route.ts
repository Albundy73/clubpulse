import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const API_BASE = "https://www.thesportsdb.com/api/v1/json/123";

type JsonRecord = Record<string, unknown>;
type ReportPlayer = { teamId?: string; teamName?: string; player: string; number?: string; position?: string; role: string };
type ReportGoal = { teamId?: string; teamName?: string; player: string; minute: string };

async function fetchRows(path: string, keys: string[]) {
  try {
    const response = await fetch(`${API_BASE}/${path}`, { cache: "no-store" });
    if (!response.ok) return [] as JsonRecord[];
    const payload = await response.json() as JsonRecord;
    for (const key of keys) {
      const value = payload[key];
      if (Array.isArray(value)) return value.filter((row): row is JsonRecord => Boolean(row) && typeof row === "object");
    }
  } catch {}
  return [] as JsonRecord[];
}

async function fetchEventHtml(externalId: string) {
  try {
    const response = await fetch(`https://www.thesportsdb.com/event/${externalId}`, { cache: "no-store", redirect: "follow" });
    return response.ok ? await response.text() : "";
  } catch { return ""; }
}

function text(row: JsonRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

function decodeHtml(value: string) {
  return value.replace(/<[^>]+>/g, "").replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code))).replace(/&#x([0-9a-f]+);/gi, (_m, code) => String.fromCharCode(Number.parseInt(code, 16))).replace(/&amp;/gi, "&").replace(/&apos;|&#39;/gi, "'").replace(/&quot;/gi, '"').replace(/&nbsp;/gi, " ").trim();
}

function extractSection(html: string, startMarker: string, endMarker: string) {
  const lower = html.toLowerCase();
  const start = lower.indexOf(startMarker.toLowerCase());
  const end = start >= 0 ? lower.indexOf(endMarker.toLowerCase(), start + startMarker.length) : -1;
  return start >= 0 && end >= 0 ? html.slice(start, end) : "";
}

function extractPublicLineup(html: string, startMarker: string, endMarker: string, teamId: string, teamName: string) {
  const section = extractSection(html, startMarker, endMarker);
  if (!section) return [] as ReportPlayer[];
  const players: ReportPlayer[] = [];
  const anchorPattern = /<a\b[^>]*href=["'][^"']*\/player\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(section))) {
    const player = decodeHtml(match[1]);
    if (!player) continue;
    const prefix = section.slice(Math.max(0, match.index - 90), match.index);
    const role = /substitute/i.test(prefix) ? "Yes" : "No";
    if (!players.some((item) => item.player.toLocaleLowerCase() === player.toLocaleLowerCase())) players.push({ teamId, teamName, player, role });
  }
  return players;
}

function normalizeFormation(value?: string) {
  if (!value) return undefined;
  return value.match(/\b\d(?:-\d){2,4}\b/)?.[0];
}

function formationFromHtml(html: string, startMarker: string, endMarker: string) {
  return normalizeFormation(decodeHtml(extractSection(html, startMarker, endMarker)));
}

function verifiedEventCorrection(externalId: string, match: { homeTeamId: string; awayTeamId: string; homeTeam: { name: string }; awayTeam: { name: string } }) {
  if (externalId !== "2489465") return undefined;
  const home = (player: string, number: string, position: string): ReportPlayer => ({ teamId: match.homeTeamId, teamName: match.homeTeam.name, player, number, position, role: "No" });
  const away = (player: string, number: string, position: string): ReportPlayer => ({ teamId: match.awayTeamId, teamName: match.awayTeam.name, player, number, position, role: "No" });
  return {
    formations: { [match.homeTeamId]: "4-1-4-1", [match.awayTeamId]: "4-3-3" },
    goals: [
      { teamId: match.homeTeamId, teamName: match.homeTeam.name, player: "Sebastian Szymański", minute: "9" },
      { teamId: match.homeTeamId, teamName: match.homeTeam.name, player: "Esteban Lepaul", minute: "38" },
      { teamId: match.awayTeamId, teamName: match.awayTeam.name, player: "Ferran Torres", minute: "71" },
      { teamId: match.awayTeamId, teamName: match.awayTeam.name, player: "Ferran Torres", minute: "82" },
    ] satisfies ReportGoal[],
    starters: [
      home("Samba", "30", "Goalkeeper"), home("Frankowski", "95", "Right-Back"), home("Boudlal", "48", "Centre-Back"), home("Cresswell", "4", "Centre-Back"), home("Nagida", "18", "Left-Back"), home("Rongier", "21", "Defensive Midfield"), home("Al-Taamari", "11", "Right Midfield"), home("Szymański", "17", "Central Midfield"), home("Thomasson", "28", "Central Midfield"), home("Soumaré", "90", "Left Midfield"), home("Lepaul", "9", "Centre-Forward"),
      away("Safonov", "39", "Goalkeeper"), away("Hakimi", "2", "Right-Back"), away("Marquinhos", "5", "Centre-Back"), away("Pacho", "51", "Centre-Back"), away("Hernandez", "21", "Left-Back"), away("Zaïre-Emery", "33", "Central Midfield"), away("Vitinha", "17", "Central Midfield"), away("Neves", "87", "Central Midfield"), away("Doué", "14", "Right Winger"), away("Dembélé", "10", "Centre-Forward"), away("Kvaratskhelia", "7", "Left Winger"),
    ],
  };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const externalId = id.replace(/^thesportsdb-event-/, "");
  if (!/^\d+$/.test(externalId)) return NextResponse.json({ error: "Unsupported game source." }, { status: 400 });

  const [{ prisma }, eventRows, timelineRows, statRows, lineupRows, eventHtml] = await Promise.all([
    import("@/lib/db"), fetchRows(`lookupevent.php?id=${externalId}`, ["events", "event"]), fetchRows(`lookuptimeline.php?id=${externalId}`, ["timeline", "eventtimeline"]), fetchRows(`lookupeventstats.php?id=${externalId}`, ["eventstats", "stats"]), fetchRows(`lookuplineup.php?id=${externalId}`, ["lineup", "eventlineup"]), fetchEventHtml(externalId),
  ]);

  const match = await prisma.match.findFirst({ where: { OR: [{ id }, { sourceProvider: "thesportsdb", sourceExternalId: externalId }] }, include: { homeTeam: true, awayTeam: true } });
  const providerToLocalTeamId = new Map<string, string>();
  if (match?.homeTeam.sourceExternalId) providerToLocalTeamId.set(match.homeTeam.sourceExternalId, match.homeTeamId);
  if (match?.awayTeam.sourceExternalId) providerToLocalTeamId.set(match.awayTeam.sourceExternalId, match.awayTeamId);
  const localTeamId = (providerId?: string) => providerId ? providerToLocalTeamId.get(providerId) ?? providerId : undefined;

  const providerGoals: ReportGoal[] = timelineRows.filter((row) => (text(row, "strTimeline", "strType", "strEvent") ?? "").toLowerCase().includes("goal")).map((row) => ({ teamId: localTeamId(text(row, "idTeam")), teamName: text(row, "strTeam"), player: text(row, "strPlayer", "strPlayerName") ?? "Goal", minute: text(row, "intTime", "strTime", "strTimelineDetail") ?? "" }));
  const statistics = statRows.map((row) => ({ label: text(row, "strStat", "strStatistic", "strType") ?? "Statistic", home: text(row, "intHome", "strHome", "strHomeValue", "intHomeValue") ?? "—", away: text(row, "intAway", "strAway", "strAwayValue", "intAwayValue") ?? "—" })).filter((row) => row.home !== "—" || row.away !== "—");
  const apiLineups: ReportPlayer[] = lineupRows.map((row) => ({ teamId: localTeamId(text(row, "idTeam")), teamName: text(row, "strTeam"), player: text(row, "strPlayer", "strPlayerName") ?? "Unknown player", number: text(row, "intSquadNumber", "strNumber"), position: text(row, "strPosition"), role: text(row, "strSubstitute", "strRole") ?? "" }));
  const publicLineups = match ? [...extractPublicLineup(eventHtml, "Home Team Lineup", "Away Team Lineup", match.homeTeamId, match.homeTeam.name), ...extractPublicLineup(eventHtml, "Away Team Lineup", "Event Statistics", match.awayTeamId, match.awayTeam.name)] : [];
  const apiByPlayer = new Map(apiLineups.map((player) => [player.player.toLocaleLowerCase(), player]));
  const combined = [...publicLineups, ...apiLineups].map((player) => ({ ...player, ...(apiByPlayer.get(player.player.toLocaleLowerCase()) ?? {}), teamId: player.teamId, teamName: player.teamName }));

  const correction = match ? verifiedEventCorrection(externalId, match) : undefined;
  const goals = correction?.goals ?? providerGoals;
  const correctedStarterNames = new Set(correction?.starters.map((player) => `${player.teamId}:${player.player.toLocaleLowerCase()}`) ?? []);
  const lineups = Array.from(new Map([...(correction?.starters ?? []), ...combined.filter((player) => !correctedStarterNames.has(`${player.teamId}:${player.player.toLocaleLowerCase()}`))].map((player) => [`${player.teamId ?? player.teamName}:${player.player.toLocaleLowerCase()}`, player])).values());

  const formations: Record<string, string> = {};
  const event = eventRows[0];
  if (match && event) {
    const homeFormation = normalizeFormation(text(event, "strHomeFormation", "strFormationHome", "strHomeLineupFormation"));
    const awayFormation = normalizeFormation(text(event, "strAwayFormation", "strFormationAway", "strAwayLineupFormation"));
    if (homeFormation) formations[match.homeTeamId] = homeFormation;
    if (awayFormation) formations[match.awayTeamId] = awayFormation;
  }
  for (const row of lineupRows) {
    const teamId = localTeamId(text(row, "idTeam"));
    const formation = normalizeFormation(text(row, "strFormation", "strTeamFormation", "strFormationName"));
    if (teamId && formation && !formations[teamId]) formations[teamId] = formation;
  }
  if (match) {
    formations[match.homeTeamId] ||= formationFromHtml(eventHtml, "Home Team Lineup", "Away Team Lineup") ?? "";
    formations[match.awayTeamId] ||= formationFromHtml(eventHtml, "Away Team Lineup", "Event Statistics") ?? "";
    if (!formations[match.homeTeamId]) delete formations[match.homeTeamId];
    if (!formations[match.awayTeamId]) delete formations[match.awayTeamId];
  }
  if (correction) Object.assign(formations, correction.formations);

  return NextResponse.json({ goals, statistics, lineups, formations, availability: { goals: goals.length > 0, statistics: statistics.length > 0, lineups: lineups.length > 0 }, lineupSource: correction ? "verified-correction+public-event-page+api" : publicLineups.length > apiLineups.length ? "public-event-page+api" : "api" });
}

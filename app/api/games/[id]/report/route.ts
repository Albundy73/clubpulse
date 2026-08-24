import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const API_BASE = "https://www.thesportsdb.com/api/v1/json/123";

type JsonRecord = Record<string, unknown>;

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

function text(row: JsonRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const externalId = id.replace(/^thesportsdb-event-/, "");
  if (!/^\d+$/.test(externalId)) return NextResponse.json({ error: "Unsupported game source." }, { status: 400 });

  const [{ prisma }, timelineRows, statRows, lineupRows] = await Promise.all([
    import("@/lib/db"),
    fetchRows(`lookuptimeline.php?id=${externalId}`, ["timeline", "eventtimeline"]),
    fetchRows(`lookupeventstats.php?id=${externalId}`, ["eventstats", "stats"]),
    fetchRows(`lookuplineup.php?id=${externalId}`, ["lineup", "eventlineup"]),
  ]);

  const match = await prisma.match.findFirst({
    where: {
      OR: [
        { id },
        { sourceProvider: "thesportsdb", sourceExternalId: externalId },
      ],
    },
    include: { homeTeam: true, awayTeam: true },
  });

  const providerToLocalTeamId = new Map<string, string>();
  if (match?.homeTeam.sourceExternalId) providerToLocalTeamId.set(match.homeTeam.sourceExternalId, match.homeTeamId);
  if (match?.awayTeam.sourceExternalId) providerToLocalTeamId.set(match.awayTeam.sourceExternalId, match.awayTeamId);
  const localTeamId = (providerId?: string) => providerId ? providerToLocalTeamId.get(providerId) ?? providerId : undefined;

  const goals = timelineRows.filter((row) => (text(row, "strTimeline", "strType", "strEvent") ?? "").toLowerCase().includes("goal")).map((row) => ({
    teamId: localTeamId(text(row, "idTeam")),
    teamName: text(row, "strTeam"),
    player: text(row, "strPlayer", "strPlayerName") ?? "Goal",
    minute: text(row, "intTime", "strTime", "strTimelineDetail") ?? "",
  }));

  const statistics = statRows.map((row) => ({
    label: text(row, "strStat", "strStatistic", "strType") ?? "Statistic",
    home: text(row, "intHome", "strHome", "strHomeValue", "intHomeValue") ?? "—",
    away: text(row, "intAway", "strAway", "strAwayValue", "intAwayValue") ?? "—",
  })).filter((row) => row.home !== "—" || row.away !== "—");

  const lineups = lineupRows.map((row) => ({
    teamId: localTeamId(text(row, "idTeam")),
    teamName: text(row, "strTeam"),
    player: text(row, "strPlayer", "strPlayerName") ?? "Unknown player",
    number: text(row, "intSquadNumber", "strNumber"),
    position: text(row, "strPosition"),
    role: text(row, "strSubstitute", "strRole", "strFormation") ?? "",
  }));

  return NextResponse.json({ goals, statistics, lineups, availability: { goals: goals.length > 0, statistics: statistics.length > 0, lineups: lineups.length > 0 } });
}

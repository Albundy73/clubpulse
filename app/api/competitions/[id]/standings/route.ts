import { NextResponse } from "next/server";
import { normalizeDisplayName } from "@/lib/display-names";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
type StandingRow = {
  rank: number;
  teamId: string;
  teamName: string;
  imageUrl?: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#039;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function key(value: string) {
  return normalizeDisplayName(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseOfficialTable(html: string, teams: { id: string; name: string; imageUrl?: string | null }[]) {
  const byName = new Map(teams.map((team) => [key(team.name), team]));
  const rows: StandingRow[] = [];

  for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const body = rowMatch[1];
    const teamAnchor = body.match(/<a\b[^>]*href=["'][^"']*(?:\/team\/|[?&]t=)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!teamAnchor) continue;
    const teamName = decodeHtml(teamAnchor[1]);
    const team = byName.get(key(teamName));
    if (!team) continue;

    const cells = Array.from(body.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)).map((match) => decodeHtml(match[1]));
    const numericTail = cells.slice(-8).map((value) => Number.parseInt(value.replace(/[^\d-]/g, ""), 10));
    if (numericTail.length !== 8 || numericTail.some((value) => Number.isNaN(value))) continue;
    const [played, wins, draws, losses, goalsFor, goalsAgainst, goalDifference, points] = numericTail;
    const rank = Number.parseInt(cells[0]?.replace(/\D/g, "") ?? "", 10) || rows.length + 1;
    rows.push({ rank, teamId: team.id, teamName: normalizeDisplayName(team.name), imageUrl: team.imageUrl ?? undefined, played, wins, draws, losses, goalsFor, goalsAgainst, goalDifference, points });
  }

  return rows;
}

function computeFromMatches(
  teams: { id: string; name: string; imageUrl?: string | null }[],
  matches: { homeTeamId: string; awayTeamId: string; homeScore: number | null; awayScore: number | null }[],
) {
  const stats = new Map<string, Omit<StandingRow, "rank">>();
  for (const team of teams) {
    stats.set(team.id, { teamId: team.id, teamName: normalizeDisplayName(team.name), imageUrl: team.imageUrl ?? undefined, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 });
  }

  for (const match of matches) {
    if (match.homeScore == null || match.awayScore == null) continue;
    const home = stats.get(match.homeTeamId);
    const away = stats.get(match.awayTeamId);
    if (!home || !away) continue;
    home.played += 1; away.played += 1;
    home.goalsFor += match.homeScore; home.goalsAgainst += match.awayScore;
    away.goalsFor += match.awayScore; away.goalsAgainst += match.homeScore;
    if (match.homeScore > match.awayScore) { home.wins += 1; home.points += 3; away.losses += 1; }
    else if (match.homeScore < match.awayScore) { away.wins += 1; away.points += 3; home.losses += 1; }
    else { home.draws += 1; away.draws += 1; home.points += 1; away.points += 1; }
  }

  return Array.from(stats.values())
    .map((row) => ({ ...row, goalDifference: row.goalsFor - row.goalsAgainst }))
    .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.teamName.localeCompare(b.teamName))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const { prisma } = await import("@/lib/db");
    const competition = await prisma.competition.findUnique({
      where: { id },
      include: { teams: { include: { team: true } } },
    });
    if (!competition) return NextResponse.json({ error: "Competition not found", standings: [] }, { status: 404 });

    const teams = competition.teams.map(({ team }) => team);
    let official: StandingRow[] = [];
    if (competition.sourceExternalId && competition.season) {
      try {
        const response = await fetch(`https://www.thesportsdb.com/table.php?l=${encodeURIComponent(competition.sourceExternalId)}&s=${encodeURIComponent(competition.season)}`, {
          headers: { Accept: "text/html", "User-Agent": "ClubPulse/1.0 standings" },
          next: { revalidate: 900 },
        });
        if (response.ok) official = parseOfficialTable(await response.text(), teams);
      } catch {}
    }

    if (official.length === teams.length && official.some((row) => row.played > 0)) {
      return NextResponse.json({ competitionId: id, season: competition.season, source: "TheSportsDB league table", standings: official });
    }

    const results = await prisma.match.findMany({
      where: { competitionId: id, homeScore: { not: null }, awayScore: { not: null } },
      select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
    });
    const standings = computeFromMatches(teams, results);
    const hasPlayed = standings.some((row) => row.played > 0);
    return NextResponse.json({
      competitionId: id,
      season: competition.season,
      source: hasPlayed ? "ClubPulse stored competition results" : "unavailable",
      standings: hasPlayed ? standings : [],
      note: hasPlayed ? "Calculated because the provider table is not current yet." : "Standings are not available for this competition yet.",
    });
  } catch (error) {
    return NextResponse.json({ standings: [], error: error instanceof Error ? error.message : "Standings unavailable" }, { status: 503 });
  }
}

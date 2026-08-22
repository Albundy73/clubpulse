import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type ParsedSelection = {
  competitionId: string;
  teamIds: string[];
};

function parseSelections(request: NextRequest): ParsedSelection[] {
  const grouped = new Map<string, Set<string>>();

  for (const raw of request.nextUrl.searchParams.getAll("selection")) {
    const separator = raw.indexOf(":");
    if (separator <= 0 || separator === raw.length - 1) continue;

    const competitionId = raw.slice(0, separator);
    const teamId = raw.slice(separator + 1);
    const teams = grouped.get(competitionId) ?? new Set<string>();
    teams.add(teamId);
    grouped.set(competitionId, teams);
  }

  return Array.from(grouped.entries()).map(([competitionId, teamIds]) => ({
    competitionId,
    teamIds: Array.from(teamIds),
  }));
}

export async function GET(request: NextRequest) {
  const selections = parseSelections(request);

  if (selections.length === 0) {
    return NextResponse.json(
      { matches: [], teams: [], followedTeamIds: [], error: "at least one competition/team selection is required" },
      { status: 400 },
    );
  }

  try {
    const { prisma } = await import("@/lib/db");

    const rows = await prisma.match.findMany({
      where: {
        OR: selections.map((selection) => ({
          competitionId: selection.competitionId,
          OR: [
            { homeTeamId: { in: selection.teamIds } },
            { awayTeamId: { in: selection.teamIds } },
          ],
        })),
      },
      include: {
        competition: true,
        homeTeam: true,
        awayTeam: true,
      },
      orderBy: { scheduledAt: "asc" },
    });

    const teamById = new Map<
      string,
      {
        id: string;
        clubId: string;
        name: string;
        category: string;
        source: { provider: string; externalId: string; url?: string };
      }
    >();

    for (const row of rows) {
      for (const team of [row.homeTeam, row.awayTeam]) {
        teamById.set(team.id, {
          id: team.id,
          clubId: team.clubId,
          name: team.name,
          category: team.category,
          source: {
            provider: team.sourceProvider ?? "clubpulse-db",
            externalId: team.sourceExternalId ?? team.id,
            url: team.sourceUrl ?? undefined,
          },
        });
      }
    }

    const matches = rows.map((row) => ({
      id: row.id,
      sportId: row.sportId,
      competitionId: row.competitionId,
      competition: row.competition.name,
      homeTeamId: row.homeTeamId,
      awayTeamId: row.awayTeamId,
      date: row.scheduledAt.toISOString(),
      venue: row.venue ?? undefined,
      status: row.status,
      homeScore: row.homeScore ?? undefined,
      awayScore: row.awayScore ?? undefined,
      source: {
        provider: row.sourceProvider,
        externalId: row.sourceExternalId,
        url: row.sourceUrl ?? undefined,
      },
    }));

    return NextResponse.json({
      source: "ClubPulse PostgreSQL",
      selections,
      followedTeamIds: Array.from(new Set(selections.flatMap((selection) => selection.teamIds))),
      teams: Array.from(teamById.values()),
      matches,
    });
  } catch (error) {
    return NextResponse.json(
      {
        source: "ClubPulse PostgreSQL",
        teams: [],
        followedTeamIds: [],
        matches: [],
        error: error instanceof Error ? error.message : "Database unavailable",
      },
      { status: 503 },
    );
  }
}

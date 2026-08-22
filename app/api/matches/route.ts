import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const competitionIds = request.nextUrl.searchParams.getAll("competitionId").filter(Boolean);
  const teamIds = request.nextUrl.searchParams.getAll("teamId").filter(Boolean);

  if (competitionIds.length === 0) {
    return NextResponse.json(
      { matches: [], teams: [], followedTeamIds: teamIds, error: "at least one competitionId is required" },
      { status: 400 },
    );
  }

  try {
    const { prisma } = await import("@/lib/db");

    const rows = await prisma.match.findMany({
      where: {
        competitionId: { in: competitionIds },
        ...(teamIds.length > 0
          ? {
              OR: [
                { homeTeamId: { in: teamIds } },
                { awayTeamId: { in: teamIds } },
              ],
            }
          : {}),
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
      competitionIds,
      followedTeamIds: teamIds,
      teams: Array.from(teamById.values()),
      matches,
    });
  } catch (error) {
    return NextResponse.json(
      {
        source: "ClubPulse PostgreSQL",
        teams: [],
        followedTeamIds: teamIds,
        matches: [],
        error: error instanceof Error ? error.message : "Database unavailable",
      },
      { status: 503 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cityId = request.nextUrl.searchParams.get("cityId");
  const sportId = request.nextUrl.searchParams.get("sportId");

  if (!cityId || !sportId) {
    return NextResponse.json(
      { matches: [], teams: [], error: "cityId and sportId are required" },
      { status: 400 },
    );
  }

  try {
    const { prisma } = await import("@/lib/db");

    const rows = await prisma.match.findMany({
      where: {
        sportId,
        OR: [
          { homeTeam: { club: { cityId } } },
          { awayTeam: { club: { cityId } } },
        ],
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
      teams: Array.from(teamById.values()),
      matches,
    });
  } catch (error) {
    return NextResponse.json(
      {
        source: "ClubPulse PostgreSQL",
        teams: [],
        matches: [],
        error: error instanceof Error ? error.message : "Database unavailable",
      },
      { status: 503 },
    );
  }
}

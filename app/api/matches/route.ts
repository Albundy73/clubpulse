import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cityId = request.nextUrl.searchParams.get("cityId");
  const sportId = request.nextUrl.searchParams.get("sportId");

  if (!cityId || !sportId) {
    return NextResponse.json(
      { matches: [], error: "cityId and sportId are required" },
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
      },
      orderBy: { scheduledAt: "asc" },
    });

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
      matches,
    });
  } catch (error) {
    return NextResponse.json(
      {
        source: "ClubPulse PostgreSQL",
        matches: [],
        error: error instanceof Error ? error.message : "Database unavailable",
      },
      { status: 503 },
    );
  }
}

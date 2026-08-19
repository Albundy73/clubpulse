import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { prisma } = await import("@/lib/db");

    const rows = await prisma.match.findMany({
      where: {
        sourceProvider: "fpf-results",
        OR: [
          { homeTeamId: "sporting-senior", awayTeamId: "benfica-senior" },
          { homeTeamId: "benfica-senior", awayTeamId: "sporting-senior" },
        ],
      },
      include: { competition: true },
      orderBy: { scheduledAt: "desc" },
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
      source: "Federação Portuguesa de Futebol - ingested into ClubPulse",
      fetchedAt: new Date().toISOString(),
      matches,
    });
  } catch (error) {
    return NextResponse.json(
      {
        source: "Federação Portuguesa de Futebol - ingested into ClubPulse",
        fetchedAt: new Date().toISOString(),
        matches: [],
        error: error instanceof Error ? error.message : "ClubPulse database unavailable",
      },
      { status: 503 },
    );
  }
}

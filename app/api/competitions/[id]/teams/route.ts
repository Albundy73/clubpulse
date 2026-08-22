import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    const { prisma } = await import("@/lib/db");

    const competition = await prisma.competition.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!competition) {
      return NextResponse.json({ error: "Competition not found", teams: [] }, { status: 404 });
    }

    const memberships = await prisma.competitionTeam.findMany({
      where: { competitionId: id },
      include: { team: { include: { club: true } } },
      orderBy: { team: { name: "asc" } },
    });

    return NextResponse.json({
      source: "ClubPulse PostgreSQL",
      competition,
      teams: memberships.map(({ team }) => ({
        id: team.id,
        clubId: team.clubId,
        name: team.name,
        category: team.category,
        clubName: team.club.name,
        source: {
          provider: team.sourceProvider ?? "clubpulse-db",
          externalId: team.sourceExternalId ?? team.id,
          url: team.sourceUrl ?? undefined,
        },
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        source: "ClubPulse PostgreSQL",
        teams: [],
        error: error instanceof Error ? error.message : "Database unavailable",
      },
      { status: 503 },
    );
  }
}

import { NextResponse } from "next/server";
import { competitionDisplayName, normalizeDisplayName } from "@/lib/display-names";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const { prisma } = await import("@/lib/db");
    const row = await prisma.match.findUnique({
      where: { id },
      include: {
        competition: true,
        homeTeam: true,
        awayTeam: true,
      },
    });

    if (!row) return NextResponse.json({ error: "Game not found" }, { status: 404 });

    const team = (value: typeof row.homeTeam) => ({
      id: value.id,
      clubId: value.clubId,
      name: normalizeDisplayName(value.name),
      category: value.category,
      imageUrl: value.imageUrl ?? undefined,
      source: {
        provider: value.sourceProvider ?? "clubpulse-db",
        externalId: value.sourceExternalId ?? value.id,
        url: value.sourceUrl ?? undefined,
      },
    });

    return NextResponse.json({
      match: {
        id: row.id,
        sportId: row.sportId,
        competitionId: row.competitionId,
        competition: competitionDisplayName(row.competition.sourceExternalId, row.competition.name),
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
      },
      teams: [team(row.homeTeam), team(row.awayTeam)],
      competition: {
        id: row.competition.id,
        name: competitionDisplayName(row.competition.sourceExternalId, row.competition.name),
        season: row.competition.season ?? undefined,
        imageUrl: row.competition.imageUrl ?? undefined,
        source: {
          provider: row.competition.sourceProvider ?? "clubpulse-db",
          externalId: row.competition.sourceExternalId ?? row.competition.id,
          url: row.competition.sourceUrl ?? undefined,
        },
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Game data unavailable" }, { status: 503 });
  }
}

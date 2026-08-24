import { NextRequest, NextResponse } from "next/server";
import { competitionDisplayName, normalizeDisplayName } from "@/lib/display-names";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const { prisma } = await import("@/lib/db");
    const competition = await prisma.competition.findUnique({ where: { id }, select: { id: true, name: true, imageUrl: true, sourceExternalId: true } });
    if (!competition) return NextResponse.json({ error: "Competition not found", teams: [] }, { status: 404 });
    const memberships = await prisma.competitionTeam.findMany({ where: { competitionId: id }, include: { team: { include: { club: true } } }, orderBy: { team: { name: "asc" } } });

    const artworkCounts = new Map<string, number>();
    for (const { team } of memberships) {
      if (team.imageUrl) artworkCounts.set(team.imageUrl, (artworkCounts.get(team.imageUrl) ?? 0) + 1);
    }

    return NextResponse.json({
      source: "ClubPulse PostgreSQL",
      competition: {
        id: competition.id,
        name: competitionDisplayName(competition.sourceExternalId, competition.name),
        imageUrl: competition.imageUrl ?? undefined,
      },
      teams: memberships.map(({ team }) => ({
        id: team.id,
        clubId: team.clubId,
        name: normalizeDisplayName(team.name),
        category: team.category,
        imageUrl: team.imageUrl && artworkCounts.get(team.imageUrl) === 1 ? team.imageUrl : undefined,
        clubName: normalizeDisplayName(team.club.name),
        source: { provider: team.sourceProvider ?? "clubpulse-db", externalId: team.sourceExternalId ?? team.id, url: team.sourceUrl ?? undefined },
      })),
    });
  } catch (error) {
    return NextResponse.json({ source: "ClubPulse PostgreSQL", teams: [], error: error instanceof Error ? error.message : "Database unavailable" }, { status: 503 });
  }
}

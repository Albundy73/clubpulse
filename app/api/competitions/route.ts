import { NextResponse } from "next/server";
import { SUPPORTED_FOOTBALL_COMPETITION_IDS } from "@/lib/sources/thesportsdb-competitions";

export const dynamic = "force-dynamic";

const DISPLAY_NAMES: Record<string, string> = {
  "thesportsdb-league-4344": "Primeira Liga",
};

export async function GET() {
  try {
    const { prisma } = await import("@/lib/db");
    const competitions = await prisma.competition.findMany({
      where: { id: { in: SUPPORTED_FOOTBALL_COMPETITION_IDS } },
      include: { sport: true, country: true, _count: { select: { teams: true, matches: true } } },
      orderBy: [{ countryId: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({
      source: "ClubPulse PostgreSQL",
      competitions: competitions.map((competition) => ({
        id: competition.id,
        name: DISPLAY_NAMES[competition.id] ?? competition.name,
        season: competition.season ?? undefined,
        imageUrl: competition.imageUrl ?? undefined,
        sportId: competition.sportId,
        sport: competition.sport.name,
        countryId: competition.countryId ?? undefined,
        country: competition.country?.name,
        teamCount: competition._count.teams,
        matchCount: competition._count.matches,
        source: { provider: competition.sourceProvider ?? "clubpulse-db", externalId: competition.sourceExternalId ?? competition.id, url: competition.sourceUrl ?? undefined },
      })),
    });
  } catch (error) {
    return NextResponse.json({ source: "ClubPulse PostgreSQL", competitions: [], error: error instanceof Error ? error.message : "Database unavailable" }, { status: 503 });
  }
}

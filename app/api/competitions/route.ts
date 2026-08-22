import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { prisma } = await import("@/lib/db");

    const competitions = await prisma.competition.findMany({
      include: {
        sport: true,
        matches: {
          select: {
            homeTeam: true,
            awayTeam: true,
          },
        },
      },
      orderBy: [{ sport: { name: "asc" } }, { name: "asc" }],
    });

    const result = competitions.map((competition) => {
      const teamById = new Map<string, {
        id: string;
        clubId: string;
        name: string;
        category: string;
        source: { provider: string; externalId: string; url?: string };
      }>();

      for (const match of competition.matches) {
        for (const team of [match.homeTeam, match.awayTeam]) {
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

      return {
        id: competition.id,
        sportId: competition.sportId,
        sportName: competition.sport.name,
        name: competition.name,
        season: competition.season ?? undefined,
        countryId: competition.countryId ?? undefined,
        source: competition.sourceProvider && competition.sourceExternalId
          ? {
              provider: competition.sourceProvider,
              externalId: competition.sourceExternalId,
              url: competition.sourceUrl ?? undefined,
            }
          : undefined,
        teams: Array.from(teamById.values()).sort((a, b) => a.name.localeCompare(b.name)),
      };
    });

    return NextResponse.json({ source: "ClubPulse PostgreSQL", competitions: result });
  } catch (error) {
    return NextResponse.json(
      {
        source: "ClubPulse PostgreSQL",
        competitions: [],
        error: error instanceof Error ? error.message : "Database unavailable",
      },
      { status: 503 },
    );
  }
}

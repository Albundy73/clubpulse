import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function csvParam(request: NextRequest, name: string) {
  return (request.nextUrl.searchParams.get(name) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  const competitionIds = csvParam(request, "competitionIds");
  const teamIds = csvParam(request, "teamIds");
  const cityId = request.nextUrl.searchParams.get("cityId");
  const sportId = request.nextUrl.searchParams.get("sportId");
  const competitionMode = competitionIds.length > 0;
  const legacyCityMode = Boolean(cityId && sportId);

  if (!competitionMode && !legacyCityMode) {
    return NextResponse.json(
      {
        matches: [],
        teams: [],
        localTeamIds: [],
        error: "competitionIds is required (legacy cityId + sportId is also temporarily supported)",
      },
      { status: 400 },
    );
  }

  try {
    const { prisma } = await import("@/lib/db");

    const rows = competitionMode
      ? await prisma.match.findMany({
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
            homeTeam: { include: { club: true } },
            awayTeam: { include: { club: true } },
          },
          orderBy: { scheduledAt: "asc" },
        })
      : await prisma.match.findMany({
          where: {
            sportId: sportId!,
            OR: [
              { homeTeam: { club: { cityId: cityId! } } },
              { awayTeam: { club: { cityId: cityId! } } },
            ],
          },
          include: {
            competition: true,
            homeTeam: { include: { club: true } },
            awayTeam: { include: { club: true } },
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
        imageUrl?: string;
        source: { provider: string; externalId: string; url?: string };
      }
    >();
    const localTeamIds = new Set<string>();

    for (const row of rows) {
      for (const team of [row.homeTeam, row.awayTeam]) {
        teamById.set(team.id, {
          id: team.id,
          clubId: team.clubId,
          name: team.name,
          category: team.category,
          imageUrl: team.imageUrl ?? undefined,
          source: {
            provider: team.sourceProvider ?? "clubpulse-db",
            externalId: team.sourceExternalId ?? team.id,
            url: team.sourceUrl ?? undefined,
          },
        });
        if (cityId && team.club.cityId === cityId) localTeamIds.add(team.id);
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
      mode: competitionMode ? "competition" : "legacy-city",
      competitionIds: competitionMode ? competitionIds : undefined,
      selectedTeamIds: competitionMode ? teamIds : undefined,
      cityId: legacyCityMode ? cityId : undefined,
      sportId: legacyCityMode ? sportId : undefined,
      localTeamIds: Array.from(localTeamIds),
      teams: Array.from(teamById.values()),
      matches,
    });
  } catch (error) {
    return NextResponse.json(
      {
        source: "ClubPulse PostgreSQL",
        teams: [],
        localTeamIds: [],
        matches: [],
        error: error instanceof Error ? error.message : "Database unavailable",
      },
      { status: 503 },
    );
  }
}

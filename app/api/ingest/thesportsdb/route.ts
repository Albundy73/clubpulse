import { NextRequest, NextResponse } from "next/server";
import { ingestTheSportsDbFootball } from "@/lib/ingestion/thesportsdb-football";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const acceptedSecrets = [process.env.INGEST_SECRET, process.env.CRON_SECRET].filter(
    (secret): secret is string => Boolean(secret),
  );

  return acceptedSecrets.some((secret) => authorization === `Bearer ${secret}`);
}

async function run(request: NextRequest) {
  if (!process.env.INGEST_SECRET && !process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "INGEST_SECRET or CRON_SECRET is not configured" },
      { status: 503 },
    );
  }

  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await ingestTheSportsDbFootball();

    if (process.env.VERCEL_ENV === "preview") {
      const { prisma } = await import("@/lib/db");
      const start = new Date();
      start.setUTCHours(0, 0, 0, 0);
      start.setUTCDate(start.getUTCDate() - 1);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 2);
      const recentMatches = await prisma.match.findMany({
        where: { scheduledAt: { gte: start, lt: end } },
        include: { competition: true, homeTeam: true, awayTeam: true },
        orderBy: { scheduledAt: "asc" },
      });
      console.info(
        "Preview recent ingested matches",
        recentMatches.map((match) => ({
          eventId: match.sourceExternalId,
          competition: match.competition.name,
          home: match.homeTeam.name,
          away: match.awayTeam.name,
          scheduledAt: match.scheduledAt.toISOString(),
          status: match.status,
          score: match.homeScore === null || match.awayScore === null ? null : `${match.homeScore}-${match.awayScore}`,
        })),
      );
    }

    return NextResponse.json({ ok: true, mode: "matches", ...result });
  } catch (error) {
    console.error("TheSportsDB match ingestion failed", error);
    return NextResponse.json(
      {
        ok: false,
        mode: "matches",
        error: error instanceof Error ? error.message : "TheSportsDB match ingestion failed",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return run(request);
}

export async function GET(request: NextRequest) {
  return run(request);
}

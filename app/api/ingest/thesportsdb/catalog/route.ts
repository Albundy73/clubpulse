import { NextRequest, NextResponse } from "next/server";
import { syncTheSportsDbCompetitionCatalog } from "@/lib/ingestion/thesportsdb-competition-catalog";
import { syncTheSportsDbCompetitionTeamCatalog } from "@/lib/ingestion/thesportsdb-team-catalog";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const acceptedSecrets = [process.env.INGEST_SECRET, process.env.CRON_SECRET].filter(
    (secret): secret is string => Boolean(secret),
  );

  return acceptedSecrets.some((secret) => authorization === `Bearer ${secret}`);
}

export async function POST(request: NextRequest) {
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
    const competitionCatalog = await syncTheSportsDbCompetitionCatalog();
    const teamCatalog = await syncTheSportsDbCompetitionTeamCatalog();

    return NextResponse.json({
      ok: true,
      mode: "catalog",
      ...competitionCatalog,
      ...teamCatalog,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        mode: "catalog",
        error: error instanceof Error ? error.message : "TheSportsDB catalog ingestion failed",
      },
      { status: 500 },
    );
  }
}

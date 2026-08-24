import { NextRequest, NextResponse } from "next/server";
import { syncTheSportsDbCompetitionCatalog } from "@/lib/ingestion/thesportsdb-competition-catalog";
import { syncTheSportsDbCompetitionTeamCatalog } from "@/lib/ingestion/thesportsdb-team-catalog";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  return Boolean(cronSecret) && request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }

  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const competitionCatalog = await syncTheSportsDbCompetitionCatalog();
    const teamCatalog = await syncTheSportsDbCompetitionTeamCatalog();

    return NextResponse.json({
      ok: true,
      mode: "catalog-cron",
      ...competitionCatalog,
      ...teamCatalog,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        mode: "catalog-cron",
        error: error instanceof Error ? error.message : "TheSportsDB catalog cron failed",
      },
      { status: 500 },
    );
  }
}

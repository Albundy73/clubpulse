import { NextResponse } from "next/server";
import { syncTheSportsDbCompetitionCatalog } from "@/lib/ingestion/thesportsdb-competition-catalog";
import { syncTheSportsDbCompetitionTeamCatalog } from "@/lib/ingestion/thesportsdb-team-catalog";

export const dynamic = "force-dynamic";

export async function POST() {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json(
      { error: "Manual catalog refresh is disabled in production" },
      { status: 403 },
    );
  }

  try {
    const competitionCatalog = await syncTheSportsDbCompetitionCatalog();
    const teamCatalog = await syncTheSportsDbCompetitionTeamCatalog();

    return NextResponse.json({
      ok: true,
      mode: "catalog-preview-manual",
      ...competitionCatalog,
      ...teamCatalog,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        mode: "catalog-preview-manual",
        error: error instanceof Error ? error.message : "TheSportsDB catalog refresh failed",
      },
      { status: 500 },
    );
  }
}

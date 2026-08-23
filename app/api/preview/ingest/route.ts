import { NextResponse } from "next/server";
import { ingestTheSportsDbFootball } from "@/lib/ingestion/thesportsdb-football";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ error: "Preview-only endpoint" }, { status: 404 });
  }

  try {
    const result = await ingestTheSportsDbFootball();
    return NextResponse.json({ ok: true, mode: "preview-match-ingest", ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Preview ingestion failed" },
      { status: 500 },
    );
  }
}

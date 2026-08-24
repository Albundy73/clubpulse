import { after, NextResponse } from "next/server";
import { ingestTheSportsDbFootball } from "@/lib/ingestion/thesportsdb-football";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ error: "Preview-only endpoint" }, { status: 404 });
  }

  after(async () => {
    try {
      await ingestTheSportsDbFootball();
    } catch (error) {
      console.error("Preview background ingestion failed", error);
    }
  });

  return NextResponse.json({ ok: true, mode: "preview-match-refresh-scheduled" }, { status: 202 });
}

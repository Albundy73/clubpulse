import { NextResponse } from "next/server";
import { fetchTheSportsDbDiagnostic } from "@/lib/sources/thesportsdb-football";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await fetchTheSportsDbDiagnostic();
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        provider: "TheSportsDB V1 Free",
        fetchedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown TheSportsDB error",
      },
      { status: 502 },
    );
  }
}

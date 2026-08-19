import { NextResponse } from "next/server";
import { fetchScFarenseSchedule } from "@/lib/sources/sc-farense";

export async function GET() {
  try {
    const payload = await fetchScFarenseSchedule();
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to fetch SC Farense schedule",
      },
      { status: 502 },
    );
  }
}

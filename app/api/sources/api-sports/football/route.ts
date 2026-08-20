import { NextResponse } from "next/server";
import { fetchApiSportsFootballFeed } from "@/lib/sources/api-sports-football";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await fetchApiSportsFootballFeed();
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        provider: "API-SPORTS / API-FOOTBALL",
        fetchedAt: new Date().toISOString(),
        teams: [],
        matches: [],
        error: error instanceof Error ? error.message : "Unable to fetch API-SPORTS football data",
      },
      { status: 502 },
    );
  }
}

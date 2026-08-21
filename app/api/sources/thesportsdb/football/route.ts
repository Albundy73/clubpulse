import { NextResponse } from "next/server";
import { fetchTheSportsDbFootballFeed } from "@/lib/sources/thesportsdb-football";

export async function GET() {
  try {
    const feed = await fetchTheSportsDbFootballFeed();

    return NextResponse.json(feed, {
      headers: {
        "Cache-Control":
          "public, s-maxage=900, stale-while-revalidate=1800",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        provider: "TheSportsDB",
        error:
          error instanceof Error
            ? error.message
            : "Unable to load TheSportsDB football feed",
      },
      { status: 502 },
    );
  }
}
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
    return NextResponse.json({ ok: true, mode: "matches", ...result });
  } catch (error) {
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

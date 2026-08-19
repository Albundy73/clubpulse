import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FPF_TEST_URL =
  "https://resultados.fpf.pt/Match/GetMatchInformation?matchId=2346635";

export async function GET() {
  const startedAt = Date.now();

  try {
    const response = await fetch(FPF_TEST_URL, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ClubPulse/0.1; +https://github.com/Albundy73/clubpulse)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
        Referer: "https://resultados.fpf.pt/",
      },
    });

    return NextResponse.json({
      reachable: response.ok,
      status: response.status,
      statusText: response.statusText,
      finalUrl: response.url,
      contentType: response.headers.get("content-type"),
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        reachable: false,
        status: null,
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}

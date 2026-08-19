import { NextResponse } from "next/server";
import { fetchSportingBenficaMatches } from "@/lib/sources/fpf";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const matches = await fetchSportingBenficaMatches();

    return NextResponse.json({
      source: "Federação Portuguesa de Futebol - Centro de Resultados",
      fetchedAt: new Date().toISOString(),
      matches,
    });
  } catch (error) {
    return NextResponse.json(
      {
        source: "Federação Portuguesa de Futebol - Centro de Resultados",
        fetchedAt: new Date().toISOString(),
        matches: [],
        error: error instanceof Error ? error.message : "Unknown FPF connector error",
      },
      { status: 502 },
    );
  }
}

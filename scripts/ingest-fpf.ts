import "dotenv/config";
import { fetchSportingBenficaMatches } from "@/lib/sources/fpf";
import { storeMatches } from "@/lib/ingestion/store";
import { prisma } from "@/lib/db";

async function main() {
  console.log("ClubPulse FPF ingestion");
  console.log("Fetching official FPF match data...");

  const matches = await fetchSportingBenficaMatches();

  if (matches.length === 0) {
    console.log("No matches returned by FPF.");
    return;
  }

  for (const match of matches) {
    console.log(
      `  ${match.source.externalId}: ${match.homeTeamId} ${match.homeScore ?? "-"}-${match.awayScore ?? "-"} ${match.awayTeamId}`,
    );
  }

  const result = await storeMatches(matches);
  console.log(`Stored ${result.stored} match${result.stored === 1 ? "" : "es"} in PostgreSQL.`);
}

main()
  .catch((error) => {
    console.error("FPF ingestion failed:");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

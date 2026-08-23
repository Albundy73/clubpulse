import { fetchTheSportsDbPublicMatchWindow } from "@/lib/sources/thesportsdb-public-matches";

type LegacyTrackedTeam = {
  query: string;
  providerTeamId: string;
  providerTeamName: string;
  localTeamId: string;
};

export async function fetchTheSportsDbFootballFeed() {
  const window = await fetchTheSportsDbPublicMatchWindow();

  return {
    provider: "TheSportsDB public schedules",
    fetchedAt: new Date().toISOString(),
    note:
      "ClubPulse reads the supported competition season schedules and resolves only the last-7/today/next-7 event window from public event pages. This avoids free API result caps and keeps match ingestion aligned with the competition catalog.",
    trackedTeams: [] as LegacyTrackedTeam[],
    teams: window.teams,
    matches: window.matches,
    diagnostics: {
      publicScheduleWindow: window.diagnostics,
    },
  };
}

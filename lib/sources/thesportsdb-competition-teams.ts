const API_BASE_URL = "https://www.thesportsdb.com/api/v1/json/123";

export const SUPPORTED_FOOTBALL_COMPETITIONS = [
  { externalId: "4344", name: "Portuguese Primeira Liga" },
  { externalId: "4662", name: "Portuguese LigaPro" },
  { externalId: "4510", name: "Taca de Portugal" },
  { externalId: "4334", name: "French Ligue 1" },
  { externalId: "4401", name: "French Ligue 2" },
  { externalId: "4480", name: "UEFA Champions League" },
  { externalId: "4481", name: "UEFA Europa League" },
] as const;

type SportsDbTeam = {
  idTeam: string;
  strTeam: string;
  strTeamShort?: string | null;
  strSport?: string | null;
  strCountry?: string | null;
  strWebsite?: string | null;
};

type TeamsResponse = {
  teams?: SportsDbTeam[] | null;
};

export type CompetitionTeamCatalog = {
  competitionExternalId: string;
  competitionName: string;
  teams: SportsDbTeam[];
  possiblyTruncated: boolean;
};

async function fetchCompetitionTeams(
  competition: (typeof SUPPORTED_FOOTBALL_COMPETITIONS)[number],
): Promise<CompetitionTeamCatalog> {
  const path = `/lookup_all_teams.php?id=${competition.externalId}`;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `TheSportsDB team catalog failed (${response.status}) for ${competition.name}`,
    );
  }

  const payload = (await response.json()) as TeamsResponse;
  const teams = (payload.teams ?? []).filter(
    (team) => team.idTeam && team.strTeam && (team.strSport ?? "Soccer") === "Soccer",
  );

  // TheSportsDB documents a 50-team limit for lookup_all_teams. Most of our
  // supported leagues are comfortably below it; flag a full page so ingestion
  // diagnostics make any potentially incomplete cup catalog visible.
  return {
    competitionExternalId: competition.externalId,
    competitionName: competition.name,
    teams,
    possiblyTruncated: teams.length >= 50,
  };
}

export async function fetchTheSportsDbSupportedCompetitionTeams() {
  return Promise.all(SUPPORTED_FOOTBALL_COMPETITIONS.map(fetchCompetitionTeams));
}

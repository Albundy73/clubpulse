export const FOOTBALL_SPORT = {
  id: "football",
  name: "Football",
} as const;

export const PORTUGAL = {
  id: "pt",
  name: "Portugal",
} as const;

export const PORTUGAL_FOOTBALL_CITIES = [
  { id: "lisbon", name: "Lisbon", countryId: PORTUGAL.id },
  { id: "faro", name: "Faro", countryId: PORTUGAL.id },
] as const;

export type CanonicalFootballTeam = {
  localTeamId: string;
  club: {
    id: string;
    name: string;
    cityId: string;
  };
};

/**
 * Canonical ClubPulse identities for teams we explicitly track.
 * Provider search terms and provider IDs deliberately live in connectors,
 * while city/club identity lives here.
 */
export const TRACKED_PORTUGAL_FOOTBALL_TEAMS: readonly CanonicalFootballTeam[] = [
  {
    localTeamId: "benfica-senior",
    club: { id: "benfica-football", name: "SL Benfica", cityId: "lisbon" },
  },
  {
    localTeamId: "sporting-senior",
    club: { id: "sporting-football", name: "Sporting CP", cityId: "lisbon" },
  },
  {
    localTeamId: "farense-senior",
    club: { id: "farense-football", name: "SC Farense", cityId: "faro" },
  },
] as const;

export const TRACKED_PORTUGAL_FOOTBALL_TEAM_BY_ID = new Map(
  TRACKED_PORTUGAL_FOOTBALL_TEAMS.map((team) => [team.localTeamId, team]),
);

/** League IDs whose geographic ownership is known in the current connector. */
export const PORTUGAL_COMPETITION_EXTERNAL_IDS = new Set(["4344"]);

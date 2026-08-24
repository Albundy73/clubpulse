const PROVIDER = "thesportsdb";

export type DiscoveredCompetition = {
  id: string;
  externalId: string;
  name: string;
  sport: string;
  country?: string;
  alternateName?: string;
  season?: string;
};

// ClubPulse deliberately supports this small competition catalog. Keep this
// metadata local so a catalog refresh does not spend free-tier API calls just
// rediscovering stable league names and countries.
const SUPPORTED_FOOTBALL_COMPETITIONS = [
  { externalId: "4344", name: "Primeira Liga", country: "Portugal" },
  { externalId: "4510", name: "Taca de Portugal", country: "Portugal" },
  { externalId: "4334", name: "French Ligue 1", country: "France" },
  { externalId: "4401", name: "French Ligue 2", country: "France" },
  { externalId: "4480", name: "UEFA Champions League" },
  { externalId: "4481", name: "UEFA Europa League" },
] as const;

export const SUPPORTED_FOOTBALL_COMPETITION_EXTERNAL_IDS = SUPPORTED_FOOTBALL_COMPETITIONS.map(
  ({ externalId }) => externalId,
);

export const SUPPORTED_FOOTBALL_COMPETITION_IDS = SUPPORTED_FOOTBALL_COMPETITION_EXTERNAL_IDS.map(
  (externalId) => `${PROVIDER}-league-${externalId}`,
);

export async function fetchTheSportsDbFootballCompetitions(): Promise<DiscoveredCompetition[]> {
  return SUPPORTED_FOOTBALL_COMPETITIONS.map((competition) => ({
    id: `${PROVIDER}-league-${competition.externalId}`,
    externalId: competition.externalId,
    name: competition.name,
    sport: "Soccer",
    country: "country" in competition ? competition.country : undefined,
  }));
}

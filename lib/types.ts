export type EntitySource = {
  provider: string;
  externalId: string;
  url?: string;
};

export type Sport = {
  id: string;
  name: string;
  icon: string;
};

export type Country = {
  id: string;
  name: string;
  flag: string;
};

export type City = {
  id: string;
  name: string;
  countryId: string;
};

export type Club = {
  id: string;
  name: string;
  cityId: string;
  sportId: string;
  shortName?: string;
  source?: EntitySource;
};

export type Team = {
  id: string;
  clubId: string;
  name: string;
  category: string;
  source?: EntitySource;
};

export type Competition = {
  id: string;
  sportId: string;
  name: string;
  season?: string;
  countryId?: string;
  source?: EntitySource;
};

export type MatchStatus = "scheduled" | "finished" | "postponed" | "cancelled";

export type Match = {
  id: string;
  sportId: string;
  competitionId: string;
  /** Temporary denormalized label for the current UI. competitionId is canonical. */
  competition: string;
  homeTeamId: string;
  awayTeamId: string;
  date: string;
  venue?: string;
  status: MatchStatus;
  homeScore?: number;
  awayScore?: number;
  source: EntitySource;
};

/** Legacy preference shape kept until the dashboard migration is complete. */
export type UserPreferences = {
  countryId: string;
  cityId: string;
  sportIds: string[];
};

/**
 * Competition-first preferences. An empty team list for a competition means
 * "all teams" in that competition. Non-empty lists are explicit team filters.
 */
export type CompetitionPreferences = {
  competitionIds: string[];
  teamIdsByCompetition: Record<string, string[]>;
};

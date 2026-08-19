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
};

export type Team = {
  id: string;
  clubId: string;
  name: string;
  category: string;
};

export type Match = {
  id: string;
  sportId: string;
  competition: string;
  homeTeamId: string;
  awayTeamId: string;
  date: string;
  venue?: string;
  status: "scheduled" | "finished";
  homeScore?: number;
  awayScore?: number;
};

export type UserPreferences = {
  countryId: string;
  cityId: string;
  sportIds: string[];
};

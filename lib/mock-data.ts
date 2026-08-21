import type { City, Club, Competition, Country, Match, Sport, Team } from "./types";

// Static product catalog used for preferences and labels only.
// Match/result data must come from PostgreSQL through /api/matches.
export const sports: Sport[] = [
  { id: "football", name: "Football", icon: "⚽" },
  { id: "basketball", name: "Basketball", icon: "🏀" },
  { id: "rugby", name: "Rugby", icon: "🏉" },
  { id: "volleyball", name: "Volleyball", icon: "🏐" },
];

export const countries: Country[] = [
  { id: "pt", name: "Portugal", flag: "🇵🇹" },
];

export const cities: City[] = [
  { id: "faro", name: "Faro", countryId: "pt" },
  { id: "lisbon", name: "Lisbon", countryId: "pt" },
];

export const clubs: Club[] = [
  {
    id: "farense-football",
    name: "SC Farense",
    shortName: "Farense",
    cityId: "faro",
    sportId: "football",
  },
  {
    id: "sporting-football",
    name: "Sporting CP",
    shortName: "Sporting",
    cityId: "lisbon",
    sportId: "football",
  },
  {
    id: "benfica-football",
    name: "SL Benfica",
    shortName: "Benfica",
    cityId: "lisbon",
    sportId: "football",
  },
];

// Canonical local teams are kept here only so the UI can mark a team as local.
// Team names/details displayed on match cards come from /api/matches.
export const teams: Team[] = [
  {
    id: "farense-senior",
    clubId: "farense-football",
    name: "SC Farense",
    category: "Senior Men",
  },
  {
    id: "sporting-senior",
    clubId: "sporting-football",
    name: "Sporting CP",
    category: "Senior Men",
  },
  {
    id: "benfica-senior",
    clubId: "benfica-football",
    name: "SL Benfica",
    category: "Senior Men",
  },
];

// Competitions and matches are intentionally not populated in the client
// catalog. PostgreSQL is the single source of truth for match data.
export const competitions: Competition[] = [];
export const matches: Match[] = [];

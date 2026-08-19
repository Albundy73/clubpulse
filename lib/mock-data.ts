import type { City, Club, Competition, Country, Match, Sport, Team } from "./types";

export const sports: Sport[] = [
  { id: "football", name: "Football", icon: "⚽" },
  { id: "basketball", name: "Basketball", icon: "🏀" },
  { id: "rugby", name: "Rugby", icon: "🏉" },
  { id: "volleyball", name: "Volleyball", icon: "🏐" },
];

export const countries: Country[] = [
  { id: "pt", name: "Portugal", flag: "🇵🇹" },
  { id: "fr", name: "France", flag: "🇫🇷" },
  { id: "es", name: "Spain", flag: "🇪🇸" },
];

export const cities: City[] = [
  { id: "faro", name: "Faro", countryId: "pt" },
  { id: "lisbon", name: "Lisbon", countryId: "pt" },
  { id: "porto", name: "Porto", countryId: "pt" },
  { id: "paris", name: "Paris", countryId: "fr" },
  { id: "madrid", name: "Madrid", countryId: "es" },
];

export const clubs: Club[] = [
  {
    id: "farense-football",
    name: "SC Farense",
    shortName: "Farense",
    cityId: "faro",
    sportId: "football",
    source: { provider: "mock-fpf", externalId: "club-farense-football" },
  },
  {
    id: "farense-basketball",
    name: "SC Farense",
    shortName: "Farense",
    cityId: "faro",
    sportId: "basketball",
    source: { provider: "mock-fpb", externalId: "club-farense-basketball" },
  },
  {
    id: "faro-football",
    name: "Faro FC",
    shortName: "Faro FC",
    cityId: "faro",
    sportId: "football",
    source: { provider: "mock-fpf", externalId: "club-faro-football" },
  },
  {
    id: "porto-basketball",
    name: "FC Porto",
    shortName: "Porto",
    cityId: "porto",
    sportId: "basketball",
    source: { provider: "mock-fpb", externalId: "club-porto-basketball" },
  },
];

export const teams: Team[] = [
  {
    id: "farense-senior",
    clubId: "farense-football",
    name: "SC Farense",
    category: "Senior",
    source: { provider: "mock-fpf", externalId: "team-farense-senior" },
  },
  {
    id: "farense-u19",
    clubId: "farense-football",
    name: "SC Farense U19",
    category: "U19",
    source: { provider: "mock-fpf", externalId: "team-farense-u19" },
  },
  {
    id: "farense-basket",
    clubId: "farense-basketball",
    name: "Farense Basket",
    category: "Senior",
    source: { provider: "mock-fpb", externalId: "team-farense-basket" },
  },
  {
    id: "faro-fc",
    clubId: "faro-football",
    name: "Faro FC",
    category: "Senior",
    source: { provider: "mock-fpf", externalId: "team-faro-fc" },
  },
  {
    id: "porto-basket",
    clubId: "porto-basketball",
    name: "FC Porto Basket",
    category: "Senior",
    source: { provider: "mock-fpb", externalId: "team-porto-basket" },
  },
];

export const competitions: Competition[] = [
  {
    id: "liga-portugal",
    sportId: "football",
    name: "Liga Portugal",
    season: "2026/27",
    countryId: "pt",
    source: { provider: "mock-fpf", externalId: "competition-liga-portugal" },
  },
  {
    id: "campeonato-u19",
    sportId: "football",
    name: "Campeonato Nacional U19",
    season: "2026/27",
    countryId: "pt",
    source: { provider: "mock-fpf", externalId: "competition-u19" },
  },
  {
    id: "liga-betclic",
    sportId: "basketball",
    name: "Liga Betclic",
    season: "2026/27",
    countryId: "pt",
    source: { provider: "mock-fpb", externalId: "competition-liga-betclic" },
  },
];

const dateFromToday = (days: number, hour: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

export const matches: Match[] = [
  {
    id: "result-1",
    sportId: "football",
    competitionId: "liga-portugal",
    competition: "Liga Portugal",
    homeTeamId: "farense-senior",
    awayTeamId: "faro-fc",
    date: dateFromToday(-1, 20),
    venue: "Estádio de São Luís",
    status: "finished",
    homeScore: 2,
    awayScore: 1,
    source: { provider: "mock-fpf", externalId: "match-result-1" },
  },
  {
    id: "result-2",
    sportId: "basketball",
    competitionId: "liga-betclic",
    competition: "Liga Betclic",
    homeTeamId: "farense-basket",
    awayTeamId: "porto-basket",
    date: dateFromToday(-2, 18),
    venue: "Pavilhão Municipal",
    status: "finished",
    homeScore: 78,
    awayScore: 72,
    source: { provider: "mock-fpb", externalId: "match-result-2" },
  },
  {
    id: "upcoming-1",
    sportId: "football",
    competitionId: "liga-portugal",
    competition: "Liga Portugal",
    homeTeamId: "farense-senior",
    awayTeamId: "faro-fc",
    date: dateFromToday(1, 20),
    venue: "Estádio de São Luís",
    status: "scheduled",
    source: { provider: "mock-fpf", externalId: "match-upcoming-1" },
  },
  {
    id: "upcoming-2",
    sportId: "football",
    competitionId: "campeonato-u19",
    competition: "Campeonato Nacional U19",
    homeTeamId: "farense-u19",
    awayTeamId: "faro-fc",
    date: dateFromToday(3, 15),
    venue: "Complexo Desportivo",
    status: "scheduled",
    source: { provider: "mock-fpf", externalId: "match-upcoming-2" },
  },
  {
    id: "upcoming-3",
    sportId: "basketball",
    competitionId: "liga-betclic",
    competition: "Liga Betclic",
    homeTeamId: "farense-basket",
    awayTeamId: "porto-basket",
    date: dateFromToday(5, 18),
    venue: "Pavilhão Municipal",
    status: "scheduled",
    source: { provider: "mock-fpb", externalId: "match-upcoming-3" },
  },
];

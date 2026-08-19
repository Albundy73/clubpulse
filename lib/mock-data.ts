import type { City, Club, Country, Match, Sport, Team } from "./types";

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
  { id: "farense-football", name: "SC Farense", shortName: "Farense", cityId: "faro", sportId: "football" },
  { id: "farense-basketball", name: "SC Farense", shortName: "Farense", cityId: "faro", sportId: "basketball" },
  { id: "faro-football", name: "Faro FC", shortName: "Faro FC", cityId: "faro", sportId: "football" },
];

export const teams: Team[] = [
  { id: "farense-senior", clubId: "farense-football", name: "SC Farense", category: "Senior" },
  { id: "farense-u19", clubId: "farense-football", name: "SC Farense U19", category: "U19" },
  { id: "farense-basket", clubId: "farense-basketball", name: "Farense Basket", category: "Senior" },
  { id: "faro-fc", clubId: "faro-football", name: "Faro FC", category: "Senior" },
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
    competition: "Liga Portugal",
    homeTeamId: "farense-senior",
    awayTeamId: "faro-fc",
    date: dateFromToday(-1, 20),
    venue: "Estádio de São Luís",
    status: "finished",
    homeScore: 2,
    awayScore: 1,
  },
  {
    id: "result-2",
    sportId: "basketball",
    competition: "Liga Betclic",
    homeTeamId: "farense-basket",
    awayTeamId: "farense-basket",
    date: dateFromToday(-2, 18),
    venue: "Pavilhão Municipal",
    status: "finished",
    homeScore: 78,
    awayScore: 72,
  },
  {
    id: "upcoming-1",
    sportId: "football",
    competition: "Liga Portugal",
    homeTeamId: "farense-senior",
    awayTeamId: "faro-fc",
    date: dateFromToday(1, 20),
    venue: "Estádio de São Luís",
    status: "scheduled",
  },
  {
    id: "upcoming-2",
    sportId: "football",
    competition: "Campeonato Nacional U19",
    homeTeamId: "farense-u19",
    awayTeamId: "faro-fc",
    date: dateFromToday(3, 15),
    venue: "Complexo Desportivo",
    status: "scheduled",
  },
  {
    id: "upcoming-3",
    sportId: "basketball",
    competition: "Liga Betclic",
    homeTeamId: "farense-basket",
    awayTeamId: "farense-basket",
    date: dateFromToday(5, 18),
    venue: "Pavilhão Municipal",
    status: "scheduled",
  },
];

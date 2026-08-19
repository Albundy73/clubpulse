"use client";

import { useEffect, useMemo, useState } from "react";
import { cities, clubs, countries, matches, sports, teams } from "@/lib/mock-data";
import type { UserPreferences } from "@/lib/types";

const STORAGE_KEY = "clubpulse-preferences";

const defaultPreferences: UserPreferences = {
  countryId: "pt",
  cityId: "faro",
  sportIds: ["football", "basketball"],
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function formatDay(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(date));
}

export default function ClubPulseDashboard() {
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setPreferences(JSON.parse(saved));
    } catch {
      // Keep defaults if stored preferences cannot be read.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences, hydrated]);

  const availableCities = cities.filter((city) => city.countryId === preferences.countryId);
  const selectedCity = cities.find((city) => city.id === preferences.cityId);
  const selectedSports = sports.filter((sport) => preferences.sportIds.includes(sport.id));
  const selectedClubs = clubs.filter(
    (club) => club.cityId === preferences.cityId && preferences.sportIds.includes(club.sportId),
  );
  const selectedClubIds = new Set(selectedClubs.map((club) => club.id));
  const selectedTeamIds = new Set(teams.filter((team) => selectedClubIds.has(team.clubId)).map((team) => team.id));

  const relevantMatches = matches.filter(
    (match) => preferences.sportIds.includes(match.sportId) &&
      (selectedTeamIds.has(match.homeTeamId) || selectedTeamIds.has(match.awayTeamId)),
  );

  const results = relevantMatches
    .filter((match) => match.status === "finished")
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));

  const upcoming = relevantMatches
    .filter((match) => {
      const diff = +new Date(match.date) - Date.now();
      return match.status === "scheduled" && diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
    })
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));

  const sportMap = useMemo(() => new Map(sports.map((sport) => [sport.id, sport])), []);
  const teamMap = useMemo(() => new Map(teams.map((team) => [team.id, team])), []);

  function updatePreference<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    setPreferences((current) => ({ ...current, [key]: value }));
  }

  function toggleSport(sportId: string) {
    setPreferences((current) => ({
      ...current,
      sportIds: current.sportIds.includes(sportId)
        ? current.sportIds.filter((id) => id !== sportId)
        : [...current.sportIds, sportId],
    }));
  }

  function handleCountryChange(countryId: string) {
    const firstCity = cities.find((city) => city.countryId === countryId);
    setPreferences((current) => ({
      ...current,
      countryId,
      cityId: firstCity?.id ?? "",
    }));
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <div>
            <div className="text-2xl font-black tracking-tight">ClubPulse</div>
            <div className="text-sm text-slate-500">Your city. Your clubs. One place.</div>
          </div>
          <div className="hidden rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 sm:block">
            {selectedCity?.name ?? "Select a city"}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-8 px-5 py-8">
        <section className="rounded-3xl bg-slate-900 p-6 text-white shadow-sm sm:p-8">
          <div className="mb-6">
            <p className="text-sm font-semibold uppercase tracking-widest text-slate-400">Your ClubPulse</p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Follow sport in {selectedCity?.name ?? "your city"}</h1>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-300">Country</span>
              <select
                value={preferences.countryId}
                onChange={(event) => handleCountryChange(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 outline-none focus:border-white"
              >
                {countries.map((country) => (
                  <option key={country.id} value={country.id}>
                    {country.flag} {country.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-300">City</span>
              <select
                value={preferences.cityId}
                onChange={(event) => updatePreference("cityId", event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 outline-none focus:border-white"
              >
                {availableCities.map((city) => (
                  <option key={city.id} value={city.id}>{city.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-5">
            <span className="text-sm font-medium text-slate-300">Sports</span>
            <div className="mt-3 flex flex-wrap gap-2">
              {sports.map((sport) => {
                const selected = preferences.sportIds.includes(sport.id);
                return (
                  <button
                    key={sport.id}
                    onClick={() => toggleSport(sport.id)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${selected ? "bg-white text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
                  >
                    {sport.icon} {sport.name}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-slate-400">Selected sports</p>
              <h2 className="text-2xl font-bold">Latest results</h2>
            </div>
            <span className="text-sm text-slate-500">{results.length} matches</span>
          </div>

          <div className="space-y-3">
            {results.length === 0 ? (
              <EmptyState text="No recent results for your selection." />
            ) : results.map((match) => (
              <MatchCard key={match.id} match={match} sport={sportMap.get(match.sportId)} teamMap={teamMap} result />
            ))}
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-slate-400">Next 7 days</p>
              <h2 className="text-2xl font-bold">Upcoming games</h2>
            </div>
            <span className="text-sm text-slate-500">{upcoming.length} matches</span>
          </div>

          <div className="space-y-3">
            {upcoming.length === 0 ? (
              <EmptyState text="No upcoming games in the next 7 days." />
            ) : upcoming.map((match) => (
              <MatchCard key={match.id} match={match} sport={sportMap.get(match.sportId)} teamMap={teamMap} />
            ))}
          </div>
        </section>

        <footer className="border-t py-6 text-center text-xs text-slate-400">
          Demo data · Federation integrations will be added in the next phase
        </footer>
      </div>
    </main>
  );
}

function MatchCard({ match, sport, teamMap, result = false }: {
  match: (typeof matches)[number];
  sport?: (typeof sports)[number];
  teamMap: Map<string, (typeof teams)[number]>;
  result?: boolean;
}) {
  const home = teamMap.get(match.homeTeamId);
  const away = teamMap.get(match.awayTeamId);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <span className="font-semibold">{sport?.icon} {sport?.name} · {match.competition}</span>
        <span>{result ? formatDate(match.date) : formatDay(match.date)}</span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1 text-right">
          <div className="font-semibold">{home?.name}</div>
          <div className="text-xs text-slate-400">{home?.category}</div>
        </div>
        <div className="min-w-20 text-center">
          {result ? (
            <div className="text-xl font-black">{match.homeScore} - {match.awayScore}</div>
          ) : (
            <>
              <div className="text-sm font-bold">{formatDate(match.date).split(", ").pop()}</div>
              <div className="text-xs text-slate-400">vs</div>
            </>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{away?.name}</div>
          <div className="text-xs text-slate-400">{away?.category}</div>
        </div>
      </div>
      {match.venue && <div className="mt-4 text-xs text-slate-400">📍 {match.venue}</div>}
    </article>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{text}</div>;
}

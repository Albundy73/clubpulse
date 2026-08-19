"use client";

import { useEffect, useMemo, useState } from "react";
import { cities, clubs, countries, matches, sports, teams } from "@/lib/mock-data";
import type { UserPreferences } from "@/lib/types";

const STORAGE_KEY = "clubpulse-preferences";
const ONBOARDING_KEY = "clubpulse-onboarding-complete";

const defaultPreferences: UserPreferences = { countryId: "pt", cityId: "faro", sportIds: ["football", "basketball"] };

function formatTime(date: string) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

function formatDayHeading(date: string) {
  const value = new Date(date);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(value, today)) return "Today";
  if (sameDay(value, yesterday)) return "Yesterday";
  if (sameDay(value, tomorrow)) return "Tomorrow";
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(value);
}

function dayKey(date: string) {
  const value = new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function groupMatchesByDay<T extends { date: string }>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(dayKey(item.date), [...(groups.get(dayKey(item.date)) ?? []), item]);
  return Array.from(groups.entries()).map(([key, groupedMatches]) => ({ key, label: formatDayHeading(groupedMatches[0].date), matches: groupedMatches }));
}

export default function ClubPulseDashboard() {
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);
  const [hydrated, setHydrated] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeSportId, setActiveSportId] = useState("all");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setPreferences(JSON.parse(saved));
      setOnboardingComplete(window.localStorage.getItem(ONBOARDING_KEY) === "true");
    } catch { /* use defaults */ } finally { setHydrated(true); }
  }, []);

  useEffect(() => { if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); }, [preferences, hydrated]);
  useEffect(() => { if (activeSportId !== "all" && !preferences.sportIds.includes(activeSportId)) setActiveSportId("all"); }, [preferences.sportIds, activeSportId]);

  const availableCities = cities.filter((city) => city.countryId === preferences.countryId);
  const selectedCity = cities.find((city) => city.id === preferences.cityId);
  const selectedSports = sports.filter((sport) => preferences.sportIds.includes(sport.id));
  const selectedClubs = clubs.filter((club) => club.cityId === preferences.cityId && preferences.sportIds.includes(club.sportId));
  const selectedClubIds = new Set(selectedClubs.map((club) => club.id));
  const selectedTeamIds = new Set(teams.filter((team) => selectedClubIds.has(team.clubId)).map((team) => team.id));
  const relevantMatches = matches.filter((match) => preferences.sportIds.includes(match.sportId) && (activeSportId === "all" || match.sportId === activeSportId) && (selectedTeamIds.has(match.homeTeamId) || selectedTeamIds.has(match.awayTeamId)));
  const results = relevantMatches.filter((match) => match.status === "finished").sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const upcoming = relevantMatches.filter((match) => { const diff = +new Date(match.date) - Date.now(); return match.status === "scheduled" && diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000; }).sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const sportMap = useMemo(() => new Map(sports.map((sport) => [sport.id, sport])), []);
  const teamMap = useMemo(() => new Map(teams.map((team) => [team.id, team])), []);

  function updatePreference<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) { setPreferences((current) => ({ ...current, [key]: value })); }
  function toggleSport(sportId: string) { setPreferences((current) => ({ ...current, sportIds: current.sportIds.includes(sportId) ? current.sportIds.filter((id) => id !== sportId) : [...current.sportIds, sportId] })); }
  function handleCountryChange(countryId: string) { const firstCity = cities.find((city) => city.countryId === countryId); setPreferences((current) => ({ ...current, countryId, cityId: firstCity?.id ?? "" })); }
  function completeOnboarding() { if (!preferences.countryId || !preferences.cityId || preferences.sportIds.length === 0) return; window.localStorage.setItem(ONBOARDING_KEY, "true"); setOnboardingComplete(true); }

  if (!hydrated) return <main className="min-h-screen bg-slate-50" />;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5"><div><div className="text-2xl font-black tracking-tight">ClubPulse</div><div className="text-sm text-slate-500">Your city. Your clubs. One place.</div></div>{onboardingComplete && <button onClick={() => setSettingsOpen((open) => !open)} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">⚙️ Preferences</button>}</div></header>

      {settingsOpen && onboardingComplete && <div className="border-b bg-white shadow-sm"><div className="mx-auto max-w-6xl px-5 py-6"><div className="mb-5 flex items-center justify-between"><div><p className="text-sm font-semibold uppercase tracking-widest text-slate-400">Preferences</p><h2 className="text-xl font-bold">Choose your city and sports</h2></div><button onClick={() => setSettingsOpen(false)} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-200">Close</button></div><PreferenceForm preferences={preferences} availableCities={availableCities} onCountryChange={handleCountryChange} onCityChange={(id) => updatePreference("cityId", id)} onToggleSport={toggleSport} /></div></div>}

      <div className="mx-auto max-w-6xl space-y-8 px-5 py-8">
        {!onboardingComplete ? (
          <Onboarding preferences={preferences} availableCities={availableCities} selectedCity={selectedCity} selectedSports={selectedSports} onCountryChange={handleCountryChange} onCityChange={(id) => updatePreference("cityId", id)} onToggleSport={toggleSport} onComplete={completeOnboarding} />
        ) : <>
          <section className="flex flex-col gap-4 rounded-3xl bg-slate-900 p-6 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-8"><div><p className="text-sm font-semibold uppercase tracking-widest text-slate-400">Your ClubPulse</p><h1 className="mt-2 text-3xl font-bold sm:text-4xl">Sport in {selectedCity?.name ?? "your city"}</h1></div><div className="flex flex-wrap gap-2">{selectedSports.map((sport) => <span key={sport.id} className="rounded-full bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200">{sport.icon} {sport.name}</span>)}</div></section>
          <SportFilter selectedSports={selectedSports} activeSportId={activeSportId} onChange={setActiveSportId} />
          <MatchSection eyebrow={activeSportId === "all" ? "Selected sports" : sportMap.get(activeSportId)?.name ?? "Selected sport"} title="Latest results" count={results.length} groups={groupMatchesByDay(results)} sportMap={sportMap} teamMap={teamMap} localTeamIds={selectedTeamIds} result emptyText="No recent results for this sport." />
          <MatchSection eyebrow="Next 7 days" title="Upcoming games" count={upcoming.length} groups={groupMatchesByDay(upcoming)} sportMap={sportMap} teamMap={teamMap} localTeamIds={selectedTeamIds} emptyText="No upcoming games in the next 7 days for this sport." />
        </>}
        <footer className="border-t py-6 text-center text-xs text-slate-400">Demo data · Federation integrations will be added in the next phase</footer>
      </div>
    </main>
  );
}

function Onboarding({ preferences, availableCities, selectedCity, selectedSports, onCountryChange, onCityChange, onToggleSport, onComplete }: { preferences: UserPreferences; availableCities: typeof cities; selectedCity?: (typeof cities)[number]; selectedSports: typeof sports; onCountryChange: (id: string) => void; onCityChange: (id: string) => void; onToggleSport: (id: string) => void; onComplete: () => void }) {
  const ready = Boolean(preferences.countryId && preferences.cityId && preferences.sportIds.length);
  return <section className="overflow-hidden rounded-3xl bg-slate-900 text-white shadow-lg">
    <div className="border-b border-slate-800 px-6 py-6 sm:px-8"><div className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400"><span className="rounded-full bg-white px-2.5 py-1 text-slate-900">1</span><span>Set up your ClubPulse</span><span className="text-slate-600">of 1</span></div><h1 className="max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">What local sport do you want to follow?</h1><p className="mt-3 max-w-2xl text-slate-300">Tell us where you are and pick at least one sport. We’ll build your dashboard and remember it for next time.</p></div>
    <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.4fr_0.8fr]">
      <div><PreferenceForm preferences={preferences} availableCities={availableCities} onCountryChange={onCountryChange} onCityChange={onCityChange} onToggleSport={onToggleSport} dark onboarding /></div>
      <aside className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Your dashboard</p><div className="mt-5 space-y-4"><div><div className="text-xs text-slate-400">Location</div><div className="mt-1 text-lg font-bold">📍 {selectedCity?.name ?? "Choose a city"}</div></div><div><div className="text-xs text-slate-400">Sports</div><div className="mt-2 flex flex-wrap gap-2">{selectedSports.length ? selectedSports.map((sport) => <span key={sport.id} className="rounded-full bg-slate-700 px-2.5 py-1 text-sm font-semibold">{sport.icon} {sport.name}</span>) : <span className="text-sm text-slate-500">Choose at least one sport</span>}</div></div><div className="border-t border-slate-700 pt-4 text-sm text-slate-300">You’ll see recent results and games scheduled for the next 7 days.</div></div></aside>
    </div>
    <div className="flex flex-col gap-3 border-t border-slate-800 bg-slate-950/40 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8"><p className="text-sm text-slate-400">You can change these choices later from <span className="font-semibold text-slate-200">Preferences</span>.</p><button onClick={onComplete} disabled={!ready} className="rounded-xl bg-white px-6 py-3 font-bold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">Create my dashboard →</button></div>
  </section>;
}

function SportFilter({ selectedSports, activeSportId, onChange }: { selectedSports: typeof sports; activeSportId: string; onChange: (id: string) => void }) {
  const options = [{ id: "all", name: "All sports", icon: "◉" }, ...selectedSports];
  return <section aria-label="Filter dashboard by sport"><div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Filter dashboard</div><div className="flex gap-2 overflow-x-auto pb-1">{options.map((sport) => { const active = activeSportId === sport.id; return <button key={sport.id} onClick={() => onChange(sport.id)} aria-pressed={active} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${active ? "border-slate-900 bg-slate-900 text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"}`}>{sport.icon} {sport.name}</button>; })}</div></section>;
}

function MatchSection({ eyebrow, title, count, groups, sportMap, teamMap, localTeamIds, result = false, emptyText }: { eyebrow: string; title: string; count: number; groups: { key: string; label: string; matches: typeof matches }[]; sportMap: Map<string, (typeof sports)[number]>; teamMap: Map<string, (typeof teams)[number]>; localTeamIds: Set<string>; result?: boolean; emptyText: string }) {
  return <section><div className="mb-5 flex items-end justify-between"><div><p className="text-sm font-semibold uppercase tracking-widest text-slate-400">{eyebrow}</p><h2 className="text-2xl font-bold">{title}</h2></div><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-500">{count} {count === 1 ? "match" : "matches"}</span></div>{groups.length === 0 ? <EmptyState text={emptyText} /> : <div className="space-y-7">{groups.map((group) => <div key={group.key}><div className="mb-3 flex items-center gap-3"><h3 className="text-sm font-black uppercase tracking-wider text-slate-600">{group.label}</h3><div className="h-px flex-1 bg-slate-200" /></div><div className="space-y-3">{group.matches.map((match) => <MatchCard key={match.id} match={match} sport={sportMap.get(match.sportId)} teamMap={teamMap} localTeamIds={localTeamIds} result={result} />)}</div></div>)}</div>}</section>;
}

function PreferenceForm({ preferences, availableCities, onCountryChange, onCityChange, onToggleSport, dark = false, onboarding = false }: { preferences: UserPreferences; availableCities: typeof cities; onCountryChange: (id: string) => void; onCityChange: (id: string) => void; onToggleSport: (id: string) => void; dark?: boolean; onboarding?: boolean }) {
  const labelClass = dark ? "text-slate-300" : "text-slate-600";
  const selectClass = dark ? "border-slate-700 bg-slate-800 text-white focus:border-white" : "border-slate-200 bg-white text-slate-900 focus:border-slate-500";
  return <><div className="grid gap-4 md:grid-cols-2"><label className="space-y-2"><span className={`text-sm font-semibold ${labelClass}`}>{onboarding && <span className="mr-2 text-slate-500">01</span>}Country</span><select value={preferences.countryId} onChange={(e) => onCountryChange(e.target.value)} className={`w-full rounded-xl border px-4 py-3 outline-none ${selectClass}`}>{countries.map((country) => <option key={country.id} value={country.id}>{country.flag} {country.name}</option>)}</select></label><label className="space-y-2"><span className={`text-sm font-semibold ${labelClass}`}>{onboarding && <span className="mr-2 text-slate-500">02</span>}City</span><select value={preferences.cityId} onChange={(e) => onCityChange(e.target.value)} className={`w-full rounded-xl border px-4 py-3 outline-none ${selectClass}`}>{availableCities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select></label></div><div className="mt-6"><span className={`text-sm font-semibold ${labelClass}`}>{onboarding && <span className="mr-2 text-slate-500">03</span>}Sports {onboarding && <span className="ml-2 font-normal text-slate-500">Select one or more</span>}</span><div className="mt-3 flex flex-wrap gap-2">{sports.map((sport) => { const selected = preferences.sportIds.includes(sport.id); return <button type="button" key={sport.id} onClick={() => onToggleSport(sport.id)} aria-pressed={selected} className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${selected ? dark ? "border-white bg-white text-slate-950" : "border-slate-900 bg-slate-900 text-white" : dark ? "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500" : "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{selected && onboarding ? "✓ " : ""}{sport.icon} {sport.name}</button>; })}</div>{onboarding && preferences.sportIds.length === 0 && <p className="mt-3 text-sm text-amber-300">Select at least one sport to continue.</p>}</div></>;
}

function MatchCard({ match, sport, teamMap, localTeamIds, result = false }: { match: (typeof matches)[number]; sport?: (typeof sports)[number]; teamMap: Map<string, (typeof teams)[number]>; localTeamIds: Set<string>; result?: boolean }) {
  const home = teamMap.get(match.homeTeamId); const away = teamMap.get(match.awayTeamId);
  return <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs sm:px-5"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700 shadow-sm">{sport?.icon} {sport?.name}</span><span className="font-medium text-slate-500">{match.competition}</span></div>{!result && <span className="rounded-full bg-slate-900 px-3 py-1 font-bold text-white">{formatTime(match.date)}</span>}</div><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-5 sm:gap-6 sm:px-5"><TeamDisplay team={home} local={localTeamIds.has(match.homeTeamId)} align="right" /><div className="min-w-20 text-center sm:min-w-24">{result ? <div className="rounded-xl bg-slate-900 px-3 py-2 text-xl font-black tracking-tight text-white sm:text-2xl">{match.homeScore} - {match.awayScore}</div> : <div><div className="text-xs font-bold uppercase tracking-wider text-slate-400">Kick-off</div><div className="mt-1 text-lg font-black text-slate-900">{formatTime(match.date)}</div></div>}</div><TeamDisplay team={away} local={localTeamIds.has(match.awayTeamId)} align="left" /></div>{match.venue && <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:px-5">📍 {match.venue}</div>}</article>;
}

function TeamDisplay({ team, local, align }: { team?: (typeof teams)[number]; local: boolean; align: "left" | "right" }) {
  return <div className={`min-w-0 ${align === "right" ? "text-right" : "text-left"}`}><div className={`font-semibold sm:text-lg ${local ? "text-slate-950" : "text-slate-600"}`}>{team?.name}</div><div className={`mt-1 flex flex-wrap items-center gap-1.5 ${align === "right" ? "justify-end" : "justify-start"}`}><span className="text-xs text-slate-400">{team?.category}</span>{local && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Local club</span>}</div></div>;
}

function EmptyState({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{text}</div>; }

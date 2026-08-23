"use client";

import { useEffect, useMemo, useState } from "react";
import CatalogRefreshControl from "@/components/catalog-refresh-control";
import TeamPreferenceAccordion from "@/components/team-preference-accordion";
import { sports } from "@/lib/mock-data";
import type { CompetitionPreferences, Match, Team } from "@/lib/types";

const STORAGE_KEY = "clubpulse-preferences";
const ONBOARDING_KEY = "clubpulse-onboarding-complete";
const defaultPreferences: CompetitionPreferences = { competitionIds: [], teamIds: [] };

type LiveStatus = "idle" | "loading" | "loaded" | "error";
type CatalogStatus = "loading" | "loaded" | "error";
type CompetitionOption = {
  id: string;
  name: string;
  season?: string;
  sportId: string;
  sport: string;
  countryId?: string;
  country?: string;
  teamCount: number;
  matchCount: number;
};
type MatchesPayload = {
  matches?: Match[];
  teams?: Team[];
  error?: string;
};
type CompetitionsPayload = {
  competitions?: CompetitionOption[];
  error?: string;
};
type TeamsPayload = {
  teams?: Team[];
  error?: string;
};

function formatTime(date: string) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

function formatDayHeading(date: string) {
  const value = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
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

function isCompetitionPreferences(value: unknown): value is CompetitionPreferences {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CompetitionPreferences>;
  return Array.isArray(candidate.competitionIds) && Array.isArray(candidate.teamIds);
}

export default function ClubPulseDashboard() {
  const [preferences, setPreferences] = useState<CompetitionPreferences>(defaultPreferences);
  const [hydrated, setHydrated] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeCompetitionId, setActiveCompetitionId] = useState("all");
  const [competitions, setCompetitions] = useState<CompetitionOption[]>([]);
  const [availableTeams, setAvailableTeams] = useState<Team[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>("loading");
  const [teamCatalogStatus, setTeamCatalogStatus] = useState<CatalogStatus>("loaded");
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [liveTeams, setLiveTeams] = useState<Team[]>([]);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("idle");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      const parsed: unknown = saved ? JSON.parse(saved) : null;
      if (isCompetitionPreferences(parsed)) {
        setPreferences(parsed);
        setOnboardingComplete(window.localStorage.getItem(ONBOARDING_KEY) === "true" && parsed.competitionIds.length > 0);
      } else {
        window.localStorage.removeItem(ONBOARDING_KEY);
      }
    } catch {
      window.localStorage.removeItem(ONBOARDING_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences, hydrated]);

  useEffect(() => {
    const controller = new AbortController();
    setCatalogStatus("loading");
    fetch("/api/competitions", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as CompetitionsPayload;
        if (!response.ok) throw new Error(payload.error ?? `Competition API returned ${response.status}`);
        setCompetitions(payload.competitions ?? []);
        setCatalogStatus("loaded");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCompetitions([]);
        setCatalogStatus("error");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (preferences.competitionIds.length === 0) {
      setAvailableTeams([]);
      setTeamCatalogStatus("loaded");
      return;
    }

    const controller = new AbortController();
    setTeamCatalogStatus("loading");
    Promise.all(preferences.competitionIds.map(async (competitionId) => {
      const response = await fetch(`/api/competitions/${encodeURIComponent(competitionId)}/teams`, { signal: controller.signal, cache: "no-store" });
      const payload = await response.json() as TeamsPayload;
      if (!response.ok) throw new Error(payload.error ?? `Competition teams API returned ${response.status}`);
      return payload.teams ?? [];
    }))
      .then((teamLists) => {
        const teamById = new Map<string, Team>();
        for (const teamsForCompetition of teamLists) for (const team of teamsForCompetition) teamById.set(team.id, team);
        const teams = Array.from(teamById.values()).sort((a, b) => a.name.localeCompare(b.name));
        const validTeamIds = new Set(teams.map((team) => team.id));
        setAvailableTeams(teams);
        setPreferences((current) => ({ ...current, teamIds: current.teamIds.filter((id) => validTeamIds.has(id)) }));
        setTeamCatalogStatus("loaded");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setAvailableTeams([]);
        setTeamCatalogStatus("error");
      });

    return () => controller.abort();
  }, [preferences.competitionIds]);

  useEffect(() => {
    if (activeCompetitionId !== "all" && !preferences.competitionIds.includes(activeCompetitionId)) setActiveCompetitionId("all");
  }, [preferences.competitionIds, activeCompetitionId]);

  useEffect(() => {
    if (!hydrated || preferences.competitionIds.length === 0) {
      setLiveMatches([]);
      setLiveTeams([]);
      setLiveStatus("idle");
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ competitionIds: preferences.competitionIds.join(",") });
    if (preferences.teamIds.length > 0) params.set("teamIds", preferences.teamIds.join(","));
    setLiveStatus("loading");

    fetch(`/api/matches?${params.toString()}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as MatchesPayload;
        if (!response.ok) throw new Error(payload.error ?? `ClubPulse match API returned ${response.status}`);
        setLiveMatches(payload.matches ?? []);
        setLiveTeams(payload.teams ?? []);
        setLiveStatus("loaded");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLiveMatches([]);
        setLiveTeams([]);
        setLiveStatus("error");
      });

    return () => controller.abort();
  }, [hydrated, preferences.competitionIds, preferences.teamIds]);

  const selectedCompetitions = competitions.filter((competition) => preferences.competitionIds.includes(competition.id));
  const selectedTeamNames = availableTeams.filter((team) => preferences.teamIds.includes(team.id));
  const relevantMatches = liveMatches.filter((match) => activeCompetitionId === "all" || match.competitionId === activeCompetitionId);
  const results = relevantMatches.filter((match) => match.status === "finished").sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const upcoming = relevantMatches.filter((match) => {
    const diff = +new Date(match.date) - Date.now();
    return match.status === "scheduled" && diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
  }).sort((a, b) => +new Date(a.date) - +new Date(b.date));

  const sportMap = useMemo(() => new Map(sports.map((sport) => [sport.id, sport])), []);
  const teamMap = useMemo(() => new Map(liveTeams.map((team) => [team.id, team])), [liveTeams]);
  const followedTeamIds = useMemo(() => preferences.teamIds.length > 0 ? new Set(preferences.teamIds) : new Set(liveTeams.map((team) => team.id)), [preferences.teamIds, liveTeams]);

  function toggleCompetition(competitionId: string) {
    setPreferences((current) => ({
      competitionIds: current.competitionIds.includes(competitionId)
        ? current.competitionIds.filter((id) => id !== competitionId)
        : [...current.competitionIds, competitionId],
      teamIds: current.teamIds,
    }));
  }

  function toggleTeam(teamId: string) {
    setPreferences((current) => ({
      ...current,
      teamIds: current.teamIds.includes(teamId)
        ? current.teamIds.filter((id) => id !== teamId)
        : [...current.teamIds, teamId],
    }));
  }

  function followAllTeams() {
    setPreferences((current) => ({ ...current, teamIds: [] }));
  }

  function completeOnboarding() {
    if (preferences.competitionIds.length === 0) return;
    window.localStorage.setItem(ONBOARDING_KEY, "true");
    setOnboardingComplete(true);
  }

  if (!hydrated) return <main className="min-h-screen bg-slate-50" />;

  const emptyResultsText = liveStatus === "loading" ? "Loading results…" : liveStatus === "error" ? "Results are unavailable because PostgreSQL could not be reached." : "No recent results are stored for your selected competitions and teams.";
  const emptyUpcomingText = liveStatus === "loading" ? "Loading upcoming games…" : liveStatus === "error" ? "Upcoming games are unavailable because PostgreSQL could not be reached." : "No upcoming games are stored in the next 7 days for your selected competitions and teams.";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5">
          <div><div className="text-2xl font-black tracking-tight">ClubPulse</div><div className="text-sm text-slate-500">Your competitions. Your clubs. One place.</div></div>
          {onboardingComplete && <button onClick={() => setSettingsOpen((open) => !open)} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">⚙️ Preferences</button>}
        </div>
      </header>

      {settingsOpen && onboardingComplete && <div className="border-b bg-white shadow-sm"><div className="mx-auto max-w-6xl px-5 py-6"><div className="mb-5 flex items-center justify-between"><div><p className="text-sm font-semibold uppercase tracking-widest text-slate-400">Preferences</p><h2 className="text-xl font-bold">Choose competitions and teams</h2></div><button onClick={() => setSettingsOpen(false)} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-200">Close</button></div><PreferenceForm preferences={preferences} competitions={competitions} teams={availableTeams} catalogStatus={catalogStatus} teamCatalogStatus={teamCatalogStatus} onToggleCompetition={toggleCompetition} onToggleTeam={toggleTeam} onFollowAllTeams={followAllTeams} /></div></div>}

      <div className="mx-auto max-w-6xl space-y-8 px-5 py-8">
        {!onboardingComplete ? <Onboarding preferences={preferences} competitions={competitions} teams={availableTeams} selectedCompetitions={selectedCompetitions} selectedTeams={selectedTeamNames} catalogStatus={catalogStatus} teamCatalogStatus={teamCatalogStatus} onToggleCompetition={toggleCompetition} onToggleTeam={toggleTeam} onFollowAllTeams={followAllTeams} onComplete={completeOnboarding} /> : <>
          <section className="flex flex-col gap-4 rounded-3xl bg-slate-900 p-6 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-8"><div><p className="text-sm font-semibold uppercase tracking-widest text-slate-400">Your ClubPulse</p><h1 className="mt-2 text-3xl font-bold sm:text-4xl">Your football competitions</h1><p className="mt-2 text-sm text-slate-400">{preferences.teamIds.length === 0 ? "Following every team in the selected competitions" : `Following ${preferences.teamIds.length} selected team${preferences.teamIds.length === 1 ? "" : "s"}`}</p></div><div className="flex max-w-xl flex-wrap gap-2">{selectedCompetitions.map((competition) => <span key={competition.id} className="rounded-full bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200">⚽ {competition.name}</span>)}</div></section>
          <LiveSourceStatus status={liveStatus} count={liveMatches.length} teamCount={liveTeams.length} />
          <CompetitionFilter selectedCompetitions={selectedCompetitions} activeCompetitionId={activeCompetitionId} onChange={setActiveCompetitionId} />
          <MatchSection eyebrow={activeCompetitionId === "all" ? "Selected competitions" : selectedCompetitions.find((competition) => competition.id === activeCompetitionId)?.name ?? "Selected competition"} title="Latest results" count={results.length} groups={groupMatchesByDay(results)} sportMap={sportMap} teamMap={teamMap} followedTeamIds={followedTeamIds} result emptyText={emptyResultsText} />
          <MatchSection eyebrow="Next 7 days" title="Upcoming games" count={upcoming.length} groups={groupMatchesByDay(upcoming)} sportMap={sportMap} teamMap={teamMap} followedTeamIds={followedTeamIds} emptyText={emptyUpcomingText} />
        </>}
        <footer className="border-t py-6 text-center text-xs text-slate-400">ClubPulse · PostgreSQL single source of truth · TheSportsDB ingestion active</footer>
      </div>
    </main>
  );
}

function LiveSourceStatus({ status, count, teamCount }: { status: LiveStatus; count: number; teamCount: number }) {
  const text = status === "idle" ? "Waiting for a competition selection" : status === "loading" ? "Loading ClubPulse PostgreSQL…" : status === "loaded" ? `ClubPulse PostgreSQL · ${count} match${count === 1 ? "" : "es"} loaded · ${teamCount} team${teamCount === 1 ? "" : "s"}` : "ClubPulse PostgreSQL unavailable — no fallback data is shown";
  return <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${status === "error" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{status === "loading" ? "↻" : status === "loaded" ? "✓" : status === "error" ? "!" : "·"} {text}</div>;
}

function Onboarding({ preferences, competitions, teams, selectedCompetitions, selectedTeams, catalogStatus, teamCatalogStatus, onToggleCompetition, onToggleTeam, onFollowAllTeams, onComplete }: { preferences: CompetitionPreferences; competitions: CompetitionOption[]; teams: Team[]; selectedCompetitions: CompetitionOption[]; selectedTeams: Team[]; catalogStatus: CatalogStatus; teamCatalogStatus: CatalogStatus; onToggleCompetition: (id: string) => void; onToggleTeam: (id: string) => void; onFollowAllTeams: () => void; onComplete: () => void }) {
  const ready = preferences.competitionIds.length > 0;
  return <section className="overflow-hidden rounded-3xl bg-slate-900 text-white shadow-lg"><div className="border-b border-slate-800 px-6 py-6 sm:px-8"><div className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400"><span className="rounded-full bg-white px-2.5 py-1 text-slate-900">1</span><span>Set up your ClubPulse</span><span className="text-slate-600">of 1</span></div><h1 className="max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">Which competitions and clubs do you want to follow?</h1><p className="mt-3 max-w-2xl text-slate-300">Pick at least one competition, then optionally choose favourite teams. If you leave every team unselected, ClubPulse follows the whole competition.</p></div><div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.4fr_0.8fr]"><div><PreferenceForm preferences={preferences} competitions={competitions} teams={teams} catalogStatus={catalogStatus} teamCatalogStatus={teamCatalogStatus} onToggleCompetition={onToggleCompetition} onToggleTeam={onToggleTeam} onFollowAllTeams={onFollowAllTeams} dark onboarding /></div><aside className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Your dashboard</p><div className="mt-5 space-y-4"><div><div className="text-xs text-slate-400">Competitions</div><div className="mt-2 flex flex-wrap gap-2">{selectedCompetitions.length ? selectedCompetitions.map((competition) => <span key={competition.id} className="rounded-full bg-slate-700 px-2.5 py-1 text-sm font-semibold">⚽ {competition.name}</span>) : <span className="text-sm text-slate-500">Choose at least one competition</span>}</div></div><div><div className="text-xs text-slate-400">Teams</div><div className="mt-2 text-sm font-semibold">{preferences.teamIds.length === 0 ? "All teams (no specific team selected)" : `${selectedTeams.length} selected team${selectedTeams.length === 1 ? "" : "s"}`}</div></div></div></aside></div><div className="flex flex-col gap-3 border-t border-slate-800 bg-slate-950/40 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8"><p className="text-sm text-slate-400">You can change these choices later from <span className="font-semibold text-slate-200">Preferences</span>.</p><button onClick={onComplete} disabled={!ready} className="rounded-xl bg-white px-6 py-3 font-bold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">Create my dashboard →</button></div></section>;
}

function CompetitionFilter({ selectedCompetitions, activeCompetitionId, onChange }: { selectedCompetitions: CompetitionOption[]; activeCompetitionId: string; onChange: (id: string) => void }) {
  const options = [{ id: "all", name: "All competitions" }, ...selectedCompetitions.map(({ id, name }) => ({ id, name }))];
  return <section aria-label="Filter dashboard by competition"><div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Filter dashboard</div><div className="flex gap-2 overflow-x-auto pb-1">{options.map((competition) => { const active = activeCompetitionId === competition.id; return <button key={competition.id} onClick={() => onChange(competition.id)} aria-pressed={active} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${active ? "border-slate-900 bg-slate-900 text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"}`}>{competition.id === "all" ? "◉" : "⚽"} {competition.name}</button>; })}</div></section>;
}

function MatchSection({ eyebrow, title, count, groups, sportMap, teamMap, followedTeamIds, result = false, emptyText }: { eyebrow: string; title: string; count: number; groups: { key: string; label: string; matches: Match[] }[]; sportMap: Map<string, (typeof sports)[number]>; teamMap: Map<string, Team>; followedTeamIds: Set<string>; result?: boolean; emptyText: string }) {
  return <section><div className="mb-5 flex items-end justify-between"><div><p className="text-sm font-semibold uppercase tracking-widest text-slate-400">{eyebrow}</p><h2 className="text-2xl font-bold">{title}</h2></div><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-500">{count} {count === 1 ? "match" : "matches"}</span></div>{groups.length === 0 ? <EmptyState text={emptyText} /> : <div className="space-y-7">{groups.map((group) => <div key={group.key}><div className="mb-3 flex items-center gap-3"><h3 className="text-sm font-black uppercase tracking-wider text-slate-600">{group.label}</h3><div className="h-px flex-1 bg-slate-200" /></div><div className="space-y-3">{group.matches.map((match) => <MatchCard key={match.id} match={match} sport={sportMap.get(match.sportId)} teamMap={teamMap} followedTeamIds={followedTeamIds} result={result} />)}</div></div>)}</div>}</section>;
}

function PreferenceForm({ preferences, competitions, teams, catalogStatus, teamCatalogStatus, onToggleCompetition, onToggleTeam, onFollowAllTeams, dark = false, onboarding = false }: { preferences: CompetitionPreferences; competitions: CompetitionOption[]; teams: Team[]; catalogStatus: CatalogStatus; teamCatalogStatus: CatalogStatus; onToggleCompetition: (id: string) => void; onToggleTeam: (id: string) => void; onFollowAllTeams: () => void; dark?: boolean; onboarding?: boolean }) {
  const labelClass = dark ? "text-slate-300" : "text-slate-600";
  const groupedCompetitions = Array.from(new Set(competitions.map((competition) => competition.country ?? "International"))).map((country) => ({ country, competitions: competitions.filter((competition) => (competition.country ?? "International") === country) }));
  const selectedCompetitions = competitions.filter((competition) => preferences.competitionIds.includes(competition.id));
  void teams;
  return <><div><span className={`text-sm font-semibold ${labelClass}`}>{onboarding && <span className="mr-2 text-slate-500">01</span>}Competitions</span><CatalogRefreshControl dark={dark} />{catalogStatus === "loading" ? <p className={`mt-3 text-sm ${dark ? "text-slate-400" : "text-slate-500"}`}>Loading competitions…</p> : catalogStatus === "error" ? <p className="mt-3 text-sm text-amber-500">Competition catalog is unavailable.</p> : <div className="mt-3 space-y-4">{groupedCompetitions.map((group) => <div key={group.country}><div className={`mb-2 text-xs font-bold uppercase tracking-wider ${dark ? "text-slate-500" : "text-slate-400"}`}>{group.country}</div><div className="flex flex-wrap gap-2">{group.competitions.map((competition) => { const selected = preferences.competitionIds.includes(competition.id); return <button key={competition.id} type="button" onClick={() => onToggleCompetition(competition.id)} aria-pressed={selected} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${selected ? dark ? "bg-white text-slate-950" : "bg-slate-900 text-white" : dark ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{selected && onboarding ? "✓ " : ""}⚽ {competition.name}<span className={`ml-2 text-xs ${selected ? "opacity-60" : "text-slate-400"}`}>{competition.teamCount}</span></button>; })}</div></div>)}</div>}</div>{preferences.competitionIds.length > 0 && <div className="mt-7"><div className="flex flex-wrap items-center justify-between gap-3"><span className={`text-sm font-semibold ${labelClass}`}>{onboarding && <span className="mr-2 text-slate-500">02</span>}Teams <span className="ml-1 font-normal opacity-60">optional</span></span></div>{teamCatalogStatus === "loading" ? <p className={`mt-3 text-sm ${dark ? "text-slate-400" : "text-slate-500"}`}>Loading teams…</p> : teamCatalogStatus === "error" ? <p className="mt-3 text-sm text-amber-500">Team catalog is unavailable.</p> : <TeamPreferenceAccordion competitions={selectedCompetitions} selectedTeamIds={preferences.teamIds} onToggleTeam={onToggleTeam} onFollowAllTeams={onFollowAllTeams} dark={dark} />}</div>}</>;
}

function MatchCard({ match, sport, teamMap, followedTeamIds, result = false }: { match: Match; sport?: (typeof sports)[number]; teamMap: Map<string, Team>; followedTeamIds: Set<string>; result?: boolean }) {
  const home = teamMap.get(match.homeTeamId);
  const away = teamMap.get(match.awayTeamId);
  return <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs sm:px-5"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700 shadow-sm">{sport?.icon} {sport?.name}</span><span className="font-medium text-slate-500">{match.competition}</span>{match.source.provider === "thesportsdb" && <span className="rounded-full bg-blue-100 px-2 py-1 font-bold text-blue-700">TheSportsDB</span>}</div>{!result && <span className="rounded-full bg-slate-900 px-3 py-1 font-bold text-white">{formatTime(match.date)}</span>}</div><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-5 sm:gap-6 sm:px-5"><TeamDisplay team={home} followed={followedTeamIds.has(match.homeTeamId)} align="right" /><div className="min-w-20 text-center sm:min-w-24">{result ? <div className="rounded-xl bg-slate-900 px-3 py-2 text-xl font-black tracking-tight text-white sm:text-2xl">{match.homeScore} - {match.awayScore}</div> : <div><div className="text-xs font-bold uppercase tracking-wider text-slate-400">Kick-off</div><div className="mt-1 text-lg font-black text-slate-900">{formatTime(match.date)}</div></div>}</div><TeamDisplay team={away} followed={followedTeamIds.has(match.awayTeamId)} align="left" /></div>{match.venue && <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:px-5">📍 {match.venue}</div>}</article>;
}

function TeamDisplay({ team, followed, align }: { team?: Team; followed: boolean; align: "left" | "right" }) {
  return <div className={`min-w-0 ${align === "right" ? "text-right" : "text-left"}`}><div className={`font-semibold sm:text-lg ${followed ? "text-slate-950" : "text-slate-600"}`}>{team?.name ?? "Unknown team"}</div><div className={`mt-1 flex flex-wrap items-center gap-1.5 ${align === "right" ? "justify-end" : "justify-start"}`}><span className="text-xs text-slate-400">{team?.category}</span>{followed && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Following</span>}</div></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{text}</div>;
}

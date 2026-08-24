"use client";

import { useEffect, useMemo, useState } from "react";
import CatalogRefreshControl from "@/components/catalog-refresh-control";
import PreferenceTeamSummary from "@/components/preference-team-summary";
import TeamPreferenceAccordion from "@/components/team-preference-accordion";
import type { CompetitionPreferences, Match, Team } from "@/lib/types";

const STORAGE_KEY = "clubpulse-preferences";
const ONBOARDING_KEY = "clubpulse-onboarding-complete";
const PREVIEW_REFRESH_KEY = "clubpulse-preview-match-refresh";
const PREVIEW_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const defaultPreferences: CompetitionPreferences = { competitionIds: [], teamIdsByCompetition: {} };

type LiveStatus = "idle" | "loading" | "loaded" | "error";
type CatalogStatus = "loading" | "loaded" | "error";
type MatchWindow = "previous" | "today" | "next";
type CompetitionOption = { id: string; name: string; season?: string; sportId: string; sport: string; countryId?: string; country?: string; teamCount: number; matchCount: number; imageUrl?: string };
type MatchesPayload = { matches?: Match[]; teams?: Team[]; error?: string };
type CompetitionsPayload = { competitions?: CompetitionOption[]; error?: string };
type LegacyCompetitionPreferences = { competitionIds: string[]; teamIds: string[] };

function formatTime(date: string) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

function formatDayHeading(date: string) {
  const value = new Date(date);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(value, today)) return "Today";
  if (sameDay(value, tomorrow)) return "Tomorrow";
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(value);
}

function dayKey(date: string) {
  const value = new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function groupMatchesByDay(items: Match[]) {
  const groups = new Map<string, Match[]>();
  for (const item of items) groups.set(dayKey(item.date), [...(groups.get(dayKey(item.date)) ?? []), item]);
  return Array.from(groups.entries()).map(([key, matches]) => ({ key, label: formatDayHeading(matches[0].date), matches }));
}

function startOfLocalDay(value = new Date()) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function endOfLocalDay(value = new Date()) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + 1).getTime();
}

function normalizeArtworkSrc(src?: string) {
  if (!src) return undefined;
  const base = src.replace(/\/(?:tiny|small|medium|large|original)\/?$/i, "");
  return `${base}/tiny`;
}

function parseCompetitionPreferences(value: unknown): CompetitionPreferences | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CompetitionPreferences> & Partial<LegacyCompetitionPreferences>;
  if (!Array.isArray(candidate.competitionIds)) return null;
  if (candidate.teamIdsByCompetition && typeof candidate.teamIdsByCompetition === "object") {
    const normalized: Record<string, string[]> = {};
    for (const competitionId of candidate.competitionIds) {
      const ids = candidate.teamIdsByCompetition[competitionId];
      normalized[competitionId] = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
    }
    return { competitionIds: candidate.competitionIds, teamIdsByCompetition: normalized };
  }
  if (Array.isArray(candidate.teamIds)) {
    const ids = candidate.teamIds.filter((id): id is string => typeof id === "string");
    return { competitionIds: candidate.competitionIds, teamIdsByCompetition: Object.fromEntries(candidate.competitionIds.map((competitionId) => [competitionId, ids])) };
  }
  return null;
}

export default function ClubPulseDashboard() {
  const [preferences, setPreferences] = useState<CompetitionPreferences>(defaultPreferences);
  const [hydrated, setHydrated] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeCompetitionId, setActiveCompetitionId] = useState("all");
  const [activeWindow, setActiveWindow] = useState<MatchWindow>("today");
  const [competitions, setCompetitions] = useState<CompetitionOption[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>("loading");
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [liveTeams, setLiveTeams] = useState<Team[]>([]);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("idle");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      const parsed = parseCompetitionPreferences(saved ? JSON.parse(saved) : null);
      if (parsed) {
        setPreferences(parsed);
        setOnboardingComplete(window.localStorage.getItem(ONBOARDING_KEY) === "true" && parsed.competitionIds.length > 0);
      } else window.localStorage.removeItem(ONBOARDING_KEY);
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
    setLiveStatus("loading");

    async function loadMatches() {
      const lastRefresh = Number(window.localStorage.getItem(PREVIEW_REFRESH_KEY) ?? 0);
      if (!lastRefresh || Date.now() - lastRefresh >= PREVIEW_REFRESH_INTERVAL_MS) {
        try {
          const refreshResponse = await fetch("/api/preview/ingest", { signal: controller.signal, cache: "no-store" });
          if (refreshResponse.ok || refreshResponse.status === 404) {
            window.localStorage.setItem(PREVIEW_REFRESH_KEY, String(Date.now()));
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") throw error;
        }
      }

      return Promise.all(preferences.competitionIds.map(async (competitionId) => {
        const params = new URLSearchParams({ competitionIds: competitionId });
        const selectedTeamIds = preferences.teamIdsByCompetition[competitionId] ?? [];
        if (selectedTeamIds.length > 0) params.set("teamIds", selectedTeamIds.join(","));
        const response = await fetch(`/api/matches?${params.toString()}`, { signal: controller.signal, cache: "no-store" });
        const payload = await response.json() as MatchesPayload;
        if (!response.ok) throw new Error(payload.error ?? `ClubPulse match API returned ${response.status}`);
        return payload;
      }));
    }

    void loadMatches()
      .then((payloads) => {
        const matches = new Map<string, Match>();
        const teams = new Map<string, Team>();
        for (const payload of payloads) {
          for (const match of payload.matches ?? []) matches.set(match.id, match);
          for (const team of payload.teams ?? []) teams.set(team.id, team);
        }
        setLiveMatches(Array.from(matches.values()));
        setLiveTeams(Array.from(teams.values()));
        setLiveStatus("loaded");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLiveMatches([]);
        setLiveTeams([]);
        setLiveStatus("error");
      });

    return () => controller.abort();
  }, [hydrated, preferences.competitionIds, preferences.teamIdsByCompetition]);

  const selectedCompetitions = competitions.filter((competition) => preferences.competitionIds.includes(competition.id));
  const relevantMatches = liveMatches.filter((match) => activeCompetitionId === "all" || match.competitionId === activeCompetitionId);
  const todayStart = startOfLocalDay();
  const tomorrowStart = endOfLocalDay();
  const previousStart = todayStart - 7 * 24 * 60 * 60 * 1000;
  const nextEnd = tomorrowStart + 7 * 24 * 60 * 60 * 1000;

  const windowMatches = relevantMatches.filter((match) => {
    const timestamp = +new Date(match.date);
    if (activeWindow === "previous") {
      const hasResult = match.status === "finished" || (match.homeScore !== undefined && match.awayScore !== undefined);
      return hasResult && timestamp >= previousStart && timestamp < todayStart;
    }
    if (activeWindow === "today") return timestamp >= todayStart && timestamp < tomorrowStart;
    return timestamp >= tomorrowStart && timestamp < nextEnd;
  }).sort((a, b) => activeWindow === "previous" ? +new Date(b.date) - +new Date(a.date) : +new Date(a.date) - +new Date(b.date));

  const teamMap = useMemo(() => new Map(liveTeams.map((team) => [team.id, team])), [liveTeams]);

  function toggleCompetition(competitionId: string) {
    setPreferences((current) => {
      const selected = current.competitionIds.includes(competitionId);
      const ids = selected ? current.competitionIds.filter((id) => id !== competitionId) : [...current.competitionIds, competitionId];
      const selections = { ...current.teamIdsByCompetition };
      if (selected) delete selections[competitionId]; else selections[competitionId] = [];
      return { competitionIds: ids, teamIdsByCompetition: selections };
    });
  }

  function toggleTeam(competitionId: string, teamId: string) {
    setPreferences((current) => {
      const selected = current.teamIdsByCompetition[competitionId] ?? [];
      const ids = selected.includes(teamId) ? selected.filter((id) => id !== teamId) : [...selected, teamId];
      return { ...current, teamIdsByCompetition: { ...current.teamIdsByCompetition, [competitionId]: ids } };
    });
  }

  function followAllTeams(competitionId: string) {
    setPreferences((current) => ({ ...current, teamIdsByCompetition: { ...current.teamIdsByCompetition, [competitionId]: [] } }));
  }

  function completeOnboarding() {
    if (!preferences.competitionIds.length) return;
    window.localStorage.setItem(ONBOARDING_KEY, "true");
    setOnboardingComplete(true);
  }

  if (!hydrated) return <main className="min-h-screen bg-slate-950" />;

  return <main className="min-h-screen bg-slate-950 text-white">
    <header className="border-b border-slate-800 bg-slate-950/95">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5">
        <div>
          <div className="text-2xl font-black tracking-tight">ClubPulse</div>
          <div className="text-sm text-slate-400">Your competitions. Your clubs. One place.</div>
        </div>
        {onboardingComplete && <button onClick={() => setSettingsOpen((open) => !open)} className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800">⚙️ Preferences</button>}
      </div>
    </header>

    <div className="mx-auto max-w-6xl px-5 py-8">
      {settingsOpen && onboardingComplete ? <Onboarding preferences={preferences} competitions={competitions} selectedCompetitions={selectedCompetitions} catalogStatus={catalogStatus} onToggleCompetition={toggleCompetition} onToggleTeam={toggleTeam} onFollowAllTeams={followAllTeams} onComplete={() => setSettingsOpen(false)} /> : !onboardingComplete ? <Onboarding preferences={preferences} competitions={competitions} selectedCompetitions={selectedCompetitions} catalogStatus={catalogStatus} onToggleCompetition={toggleCompetition} onToggleTeam={toggleTeam} onFollowAllTeams={followAllTeams} onComplete={completeOnboarding} /> : <div className="space-y-6">
        <MatchWindowSelector active={activeWindow} onChange={setActiveWindow} />
        <CompetitionFilter selectedCompetitions={selectedCompetitions} activeCompetitionId={activeCompetitionId} onChange={setActiveCompetitionId} />
        <DashboardMatchList status={liveStatus} groups={groupMatchesByDay(windowMatches)} teamMap={teamMap} teamSelectionsByCompetition={preferences.teamIdsByCompetition} />
      </div>}
    </div>
  </main>;
}

function PreferenceForm({ preferences, competitions, catalogStatus, onToggleCompetition, onToggleTeam, onFollowAllTeams, dark = false }: { preferences: CompetitionPreferences; competitions: CompetitionOption[]; catalogStatus: CatalogStatus; onToggleCompetition: (id: string) => void; onToggleTeam: (competitionId: string, teamId: string) => void; onFollowAllTeams: (competitionId: string) => void; dark?: boolean }) {
  return <div>{catalogStatus === "loading" ? <p className={`text-sm ${dark ? "text-slate-400" : "text-slate-500"}`}>Loading competitions…</p> : catalogStatus === "error" ? <p className="text-sm text-amber-500">Competition catalog is unavailable.</p> : <TeamPreferenceAccordion competitions={competitions} selectedCompetitionIds={preferences.competitionIds} selectedTeamIdsByCompetition={preferences.teamIdsByCompetition} onToggleCompetition={onToggleCompetition} onToggleTeam={onToggleTeam} onFollowAllTeams={onFollowAllTeams} dark={dark} />}<div className="mt-4 flex justify-end"><CatalogRefreshControl dark={dark} /></div></div>;
}

function Onboarding({ preferences, competitions, selectedCompetitions, catalogStatus, onToggleCompetition, onToggleTeam, onFollowAllTeams, onComplete }: { preferences: CompetitionPreferences; competitions: CompetitionOption[]; selectedCompetitions: CompetitionOption[]; catalogStatus: CatalogStatus; onToggleCompetition: (id: string) => void; onToggleTeam: (competitionId: string, teamId: string) => void; onFollowAllTeams: (competitionId: string) => void; onComplete: () => void }) {
  const ready = preferences.competitionIds.length > 0;
  return <section className="overflow-hidden rounded-3xl bg-slate-900 text-white shadow-lg"><div className="border-b border-slate-800 px-6 py-6 sm:px-8"><h1 className="max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">What do you want to follow?</h1></div><div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.4fr_0.8fr]"><div><PreferenceForm preferences={preferences} competitions={competitions} catalogStatus={catalogStatus} onToggleCompetition={onToggleCompetition} onToggleTeam={onToggleTeam} onFollowAllTeams={onFollowAllTeams} dark /></div><aside className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Your dashboard</p><div className="mt-5 space-y-4"><div><div className="text-xs text-slate-400">Favorites</div><div className="mt-2 flex flex-wrap gap-2">{selectedCompetitions.length ? selectedCompetitions.map((competition) => <span key={competition.id} className="rounded-full bg-slate-700 px-2.5 py-1 text-sm font-semibold">★ {competition.name}</span>) : <span className="text-sm text-slate-500">Star at least one competition</span>}</div></div><div><div className="text-xs text-slate-400">Teams</div><div className="mt-2"><PreferenceTeamSummary preferences={preferences} competitions={selectedCompetitions} /></div></div></div></aside></div><div className="flex justify-end border-t border-slate-800 bg-slate-950/40 px-6 py-5 sm:px-8"><button onClick={onComplete} disabled={!ready} className="rounded-xl bg-white px-6 py-3 font-bold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">Apply</button></div></section>;
}

function MatchWindowSelector({ active, onChange }: { active: MatchWindow; onChange: (window: MatchWindow) => void }) {
  const options: { id: MatchWindow; label: string; detail: string }[] = [
    { id: "previous", label: "Previous", detail: "Last 7 days" },
    { id: "today", label: "Today", detail: "Today's games" },
    { id: "next", label: "Next", detail: "Next 7 days" },
  ];
  return <nav aria-label="Match period" className="grid grid-cols-3 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 p-1.5">
    {options.map((option) => {
      const selected = active === option.id;
      return <button key={option.id} type="button" onClick={() => onChange(option.id)} aria-pressed={selected} className={`rounded-xl px-3 py-3 text-center transition sm:px-5 ${selected ? "bg-white text-slate-950 shadow-sm" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
        <span className="block text-sm font-black sm:text-base">{option.label}</span>
        <span className={`mt-0.5 hidden text-[11px] sm:block ${selected ? "text-slate-500" : "text-slate-500"}`}>{option.detail}</span>
      </button>;
    })}
  </nav>;
}

function CompetitionFilter({ selectedCompetitions, activeCompetitionId, onChange }: { selectedCompetitions: CompetitionOption[]; activeCompetitionId: string; onChange: (id: string) => void }) {
  const options = [{ id: "all", name: "All" }, ...selectedCompetitions.map(({ id, name }) => ({ id, name }))];
  return <section aria-label="Filter by competition"><div className="flex gap-2 overflow-x-auto pb-1">
    {options.map((competition) => {
      const active = activeCompetitionId === competition.id;
      return <button key={competition.id} onClick={() => onChange(competition.id)} aria-pressed={active} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${active ? "border-sky-400/70 bg-sky-400/15 text-sky-200" : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600 hover:text-white"}`}>{competition.name}</button>;
    })}
  </div></section>;
}

function DashboardMatchList({ status, groups, teamMap, teamSelectionsByCompetition }: { status: LiveStatus; groups: { key: string; label: string; matches: Match[] }[]; teamMap: Map<string, Team>; teamSelectionsByCompetition: Record<string, string[]> }) {
  const emptyText = status === "loading" ? "Loading games…" : status === "error" ? "Games are temporarily unavailable." : "No games in this period.";
  return <section>
    {groups.length === 0 ? <EmptyState text={emptyText} /> : <div className="space-y-7">{groups.map((group) => <div key={group.key}><div className="mb-3 flex items-center gap-3"><h2 className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{group.label}</h2><div className="h-px flex-1 bg-slate-800" /></div><div className="space-y-3">{group.matches.map((match) => <MatchCard key={match.id} match={match} teamMap={teamMap} selectedTeamIds={teamSelectionsByCompetition[match.competitionId] ?? []} />)}</div></div>)}</div>}
  </section>;
}

function MatchCard({ match, teamMap, selectedTeamIds }: { match: Match; teamMap: Map<string, Team>; selectedTeamIds: string[] }) {
  const home = teamMap.get(match.homeTeamId);
  const away = teamMap.get(match.awayTeamId);
  const followsAll = selectedTeamIds.length === 0;
  const hasScore = match.homeScore !== undefined && match.awayScore !== undefined;
  return <article className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-sm">
    <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 text-xs sm:px-5"><span className="min-w-0 truncate font-semibold text-slate-400">{match.competition}</span><span className="shrink-0 rounded-full bg-slate-800 px-3 py-1 font-bold text-slate-300">{hasScore ? "Final" : formatTime(match.date)}</span></div>
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-5 sm:gap-6 sm:px-5">
      <TeamDisplay team={home} followed={followsAll || selectedTeamIds.includes(match.homeTeamId)} align="right" />
      <div className="min-w-20 text-center sm:min-w-24">{hasScore ? <div className="rounded-xl bg-white px-3 py-2 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">{match.homeScore} - {match.awayScore}</div> : <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Kick-off</div><div className="mt-1 text-lg font-black text-white">{formatTime(match.date)}</div></div>}</div>
      <TeamDisplay team={away} followed={followsAll || selectedTeamIds.includes(match.awayTeamId)} align="left" />
    </div>
    {match.venue && <div className="border-t border-slate-800 px-4 py-3 text-xs text-slate-500 sm:px-5">📍 {match.venue}</div>}
  </article>;
}

function TeamDisplay({ team, followed, align }: { team?: Team; followed: boolean; align: "left" | "right" }) {
  const [imageFailed, setImageFailed] = useState(false);
  const src = normalizeArtworkSrc(team?.imageUrl);
  const logo = src && !imageFailed
    ? <img src={src} alt="" onError={() => setImageFailed(true)} className="h-10 w-10 shrink-0 object-contain sm:h-12 sm:w-12" />
    : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-lg sm:h-12 sm:w-12" aria-hidden="true">⚽</div>;
  return <div className={`flex min-w-0 items-center gap-3 ${align === "right" ? "justify-end" : "justify-start"}`}>
    {align === "left" && logo}
    <div className={`min-w-0 ${align === "right" ? "text-right" : "text-left"}`}><div className={`truncate font-bold sm:text-lg ${followed ? "text-white" : "text-slate-400"}`}>{team?.name ?? "Unknown team"}</div>{followed && <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-amber-400">★ Following</div>}</div>
    {align === "right" && logo}
  </div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-10 text-center text-sm text-slate-500">{text}</div>;
}

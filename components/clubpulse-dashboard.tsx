"use client";

import { useEffect, useMemo, useState } from "react";
import { sports } from "@/lib/mock-data";
import type { CompetitionOption, Match, Team, UserPreferences } from "@/lib/types";

const STORAGE_KEY = "clubpulse-preferences";
const ONBOARDING_KEY = "clubpulse-onboarding-complete";
const defaultPreferences: UserPreferences = { selections: [] };

type LoadStatus = "idle" | "loading" | "loaded" | "error";

type CompetitionsPayload = {
  competitions?: CompetitionOption[];
  error?: string;
};

type MatchesPayload = {
  matches?: Match[];
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
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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
  return Array.from(groups.entries()).map(([key, groupedMatches]) => ({
    key,
    label: formatDayHeading(groupedMatches[0].date),
    matches: groupedMatches,
  }));
}

function normalizePreferences(value: unknown): UserPreferences | null {
  if (!value || typeof value !== "object") return null;
  const selections = (value as { selections?: unknown }).selections;
  if (!Array.isArray(selections)) return null;

  const normalized = selections
    .filter((selection): selection is { competitionId: string; teamIds: string[] } =>
      Boolean(
        selection &&
          typeof selection === "object" &&
          typeof (selection as { competitionId?: unknown }).competitionId === "string" &&
          Array.isArray((selection as { teamIds?: unknown }).teamIds),
      ),
    )
    .map((selection) => ({
      competitionId: selection.competitionId,
      teamIds: Array.from(new Set(selection.teamIds.filter((id): id is string => typeof id === "string"))),
    }));

  return { selections: normalized };
}

export default function ClubPulseDashboard() {
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);
  const [hydrated, setHydrated] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeCompetitionId, setActiveCompetitionId] = useState("all");
  const [competitions, setCompetitions] = useState<CompetitionOption[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<LoadStatus>("idle");
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [liveTeams, setLiveTeams] = useState<Team[]>([]);
  const [liveStatus, setLiveStatus] = useState<LoadStatus>("idle");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      const parsed = saved ? normalizePreferences(JSON.parse(saved)) : null;
      if (parsed) {
        setPreferences(parsed);
        const complete = parsed.selections.length > 0 && parsed.selections.every((selection) => selection.teamIds.length > 0);
        setOnboardingComplete(complete && window.localStorage.getItem(ONBOARDING_KEY) === "true");
      } else {
        setOnboardingComplete(false);
      }
    } catch {
      setOnboardingComplete(false);
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
        const payload = (await response.json()) as CompetitionsPayload;
        if (!response.ok) throw new Error(payload.error ?? `Competition API returned ${response.status}`);
        return payload;
      })
      .then((payload) => {
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
    if (activeCompetitionId !== "all" && !preferences.selections.some((selection) => selection.competitionId === activeCompetitionId)) {
      setActiveCompetitionId("all");
    }
  }, [preferences.selections, activeCompetitionId]);

  useEffect(() => {
    const validSelections = preferences.selections.filter((selection) => selection.teamIds.length > 0);
    if (!hydrated || validSelections.length === 0) {
      setLiveMatches([]);
      setLiveTeams([]);
      setLiveStatus("idle");
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams();
    for (const selection of validSelections) {
      for (const teamId of selection.teamIds) params.append("selection", `${selection.competitionId}:${teamId}`);
    }

    setLiveStatus("loading");
    fetch(`/api/matches?${params.toString()}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as MatchesPayload;
        if (!response.ok) throw new Error(payload.error ?? `Match API returned ${response.status}`);
        return payload;
      })
      .then((payload) => {
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
  }, [hydrated, preferences.selections]);

  const selectedCompetitions = competitions.filter((competition) =>
    preferences.selections.some((selection) => selection.competitionId === competition.id),
  );
  const followedTeamIds = useMemo(
    () => new Set(preferences.selections.flatMap((selection) => selection.teamIds)),
    [preferences.selections],
  );
  const followedTeamCount = followedTeamIds.size;

  const relevantMatches = liveMatches.filter(
    (match) => activeCompetitionId === "all" || match.competitionId === activeCompetitionId,
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
  const teamMap = useMemo(() => new Map(liveTeams.map((team) => [team.id, team])), [liveTeams]);

  function toggleCompetition(competitionId: string) {
    setPreferences((current) => {
      const exists = current.selections.some((selection) => selection.competitionId === competitionId);
      return {
        selections: exists
          ? current.selections.filter((selection) => selection.competitionId !== competitionId)
          : [...current.selections, { competitionId, teamIds: [] }],
      };
    });
  }

  function toggleTeam(competitionId: string, teamId: string) {
    setPreferences((current) => ({
      selections: current.selections.map((selection) =>
        selection.competitionId !== competitionId
          ? selection
          : {
              ...selection,
              teamIds: selection.teamIds.includes(teamId)
                ? selection.teamIds.filter((id) => id !== teamId)
                : [...selection.teamIds, teamId],
            },
      ),
    }));
  }

  function completeOnboarding() {
    const ready = preferences.selections.length > 0 && preferences.selections.every((selection) => selection.teamIds.length > 0);
    if (!ready) return;
    window.localStorage.setItem(ONBOARDING_KEY, "true");
    setOnboardingComplete(true);
  }

  if (!hydrated) return <main className="min-h-screen bg-slate-50" />;

  const emptyResultsText =
    liveStatus === "loading"
      ? "Loading results…"
      : liveStatus === "error"
        ? "Results are unavailable because PostgreSQL could not be reached."
        : "No recent results are stored for the competitions and teams you follow.";
  const emptyUpcomingText =
    liveStatus === "loading"
      ? "Loading upcoming games…"
      : liveStatus === "error"
        ? "Upcoming games are unavailable because PostgreSQL could not be reached."
        : "No upcoming games are stored in the next 7 days for the competitions and teams you follow.";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5">
          <div>
            <div className="text-2xl font-black tracking-tight">ClubPulse</div>
            <div className="text-sm text-slate-500">Your competitions. Your teams. One place.</div>
          </div>
          {onboardingComplete && (
            <button
              onClick={() => setSettingsOpen((open) => !open)}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              ⚙️ Following
            </button>
          )}
        </div>
      </header>

      {settingsOpen && onboardingComplete && (
        <div className="border-b bg-white shadow-sm">
          <div className="mx-auto max-w-6xl px-5 py-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-widest text-slate-400">Following</p>
                <h2 className="text-xl font-bold">Choose competitions and teams</h2>
              </div>
              <button onClick={() => setSettingsOpen(false)} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-200">
                Close
              </button>
            </div>
            <PreferenceForm
              competitions={competitions}
              catalogStatus={catalogStatus}
              preferences={preferences}
              onToggleCompetition={toggleCompetition}
              onToggleTeam={toggleTeam}
            />
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl space-y-8 px-5 py-8">
        {!onboardingComplete ? (
          <Onboarding
            competitions={competitions}
            catalogStatus={catalogStatus}
            preferences={preferences}
            onToggleCompetition={toggleCompetition}
            onToggleTeam={toggleTeam}
            onComplete={completeOnboarding}
          />
        ) : (
          <>
            <section className="rounded-3xl bg-slate-900 p-6 text-white shadow-sm sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-widest text-slate-400">Your ClubPulse</p>
              <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Games that matter to you</h1>
              <p className="mt-2 text-slate-300">
                Following {selectedCompetitions.length} competition{selectedCompetitions.length === 1 ? "" : "s"} and {followedTeamCount} team{followedTeamCount === 1 ? "" : "s"}.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {selectedCompetitions.map((competition) => (
                  <span key={competition.id} className="rounded-full bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200">
                    {sportMap.get(competition.sportId)?.icon ?? "●"} {competition.name}{competition.season ? ` · ${competition.season}` : ""}
                  </span>
                ))}
              </div>
            </section>

            <SourceStatus status={liveStatus} count={liveMatches.length} />
            <CompetitionFilter
              competitions={selectedCompetitions}
              activeCompetitionId={activeCompetitionId}
              onChange={setActiveCompetitionId}
            />
            <MatchSection
              eyebrow={activeCompetitionId === "all" ? "Your competitions" : selectedCompetitions.find((competition) => competition.id === activeCompetitionId)?.name ?? "Selected competition"}
              title="Latest results"
              count={results.length}
              groups={groupMatchesByDay(results)}
              sportMap={sportMap}
              teamMap={teamMap}
              followedTeamIds={followedTeamIds}
              result
              emptyText={emptyResultsText}
            />
            <MatchSection
              eyebrow="Next 7 days"
              title="Upcoming games"
              count={upcoming.length}
              groups={groupMatchesByDay(upcoming)}
              sportMap={sportMap}
              teamMap={teamMap}
              followedTeamIds={followedTeamIds}
              emptyText={emptyUpcomingText}
            />
          </>
        )}
        <footer className="border-t py-6 text-center text-xs text-slate-400">
          ClubPulse · PostgreSQL single source of truth · competition/team following
        </footer>
      </div>
    </main>
  );
}

function SourceStatus({ status, count }: { status: LoadStatus; count: number }) {
  const text =
    status === "idle"
      ? "Choose competitions and teams to load ClubPulse PostgreSQL"
      : status === "loading"
        ? "Loading ClubPulse PostgreSQL…"
        : status === "loaded"
          ? `ClubPulse PostgreSQL · ${count} matching game${count === 1 ? "" : "s"} loaded`
          : "ClubPulse PostgreSQL unavailable — no fallback data is shown";
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${status === "error" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
      {status === "loading" ? "↻" : status === "loaded" ? "✓" : status === "error" ? "!" : "·"} {text}
    </div>
  );
}

function Onboarding({
  competitions,
  catalogStatus,
  preferences,
  onToggleCompetition,
  onToggleTeam,
  onComplete,
}: {
  competitions: CompetitionOption[];
  catalogStatus: LoadStatus;
  preferences: UserPreferences;
  onToggleCompetition: (id: string) => void;
  onToggleTeam: (competitionId: string, teamId: string) => void;
  onComplete: () => void;
}) {
  const ready = preferences.selections.length > 0 && preferences.selections.every((selection) => selection.teamIds.length > 0);
  const competitionMap = new Map(competitions.map((competition) => [competition.id, competition]));

  return (
    <section className="overflow-hidden rounded-3xl bg-slate-900 text-white shadow-lg">
      <div className="border-b border-slate-800 px-6 py-6 sm:px-8">
        <div className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
          <span className="rounded-full bg-white px-2.5 py-1 text-slate-900">1</span>
          <span>Set up your ClubPulse</span>
        </div>
        <h1 className="max-w-3xl text-3xl font-black tracking-tight sm:text-4xl">Which competitions and teams do you want to follow?</h1>
        <p className="mt-3 max-w-3xl text-slate-300">Choose one or more competitions, then select at least one team inside each competition. Your dashboard will only show games that match those choices.</p>
      </div>
      <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.45fr_0.75fr]">
        <PreferenceForm
          competitions={competitions}
          catalogStatus={catalogStatus}
          preferences={preferences}
          onToggleCompetition={onToggleCompetition}
          onToggleTeam={onToggleTeam}
          dark
          onboarding
        />
        <aside className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Your dashboard</p>
          <div className="mt-5 space-y-5">
            {preferences.selections.length === 0 ? (
              <p className="text-sm text-slate-500">Choose a competition to get started.</p>
            ) : (
              preferences.selections.map((selection) => {
                const competition = competitionMap.get(selection.competitionId);
                const teamMap = new Map((competition?.teams ?? []).map((team) => [team.id, team]));
                return (
                  <div key={selection.competitionId}>
                    <div className="font-bold">{competition?.name ?? selection.competitionId}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selection.teamIds.length ? selection.teamIds.map((teamId) => (
                        <span key={teamId} className="rounded-full bg-slate-700 px-2.5 py-1 text-xs font-semibold">{teamMap.get(teamId)?.name ?? teamId}</span>
                      )) : <span className="text-sm text-amber-300">Select at least one team</span>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>
      <div className="flex flex-col gap-3 border-t border-slate-800 bg-slate-950/40 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="text-sm text-slate-400">You can change these choices later from <span className="font-semibold text-slate-200">Following</span>.</p>
        <button onClick={onComplete} disabled={!ready} className="rounded-xl bg-white px-6 py-3 font-bold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">
          Create my dashboard →
        </button>
      </div>
    </section>
  );
}

function PreferenceForm({
  competitions,
  catalogStatus,
  preferences,
  onToggleCompetition,
  onToggleTeam,
  dark = false,
  onboarding = false,
}: {
  competitions: CompetitionOption[];
  catalogStatus: LoadStatus;
  preferences: UserPreferences;
  onToggleCompetition: (id: string) => void;
  onToggleTeam: (competitionId: string, teamId: string) => void;
  dark?: boolean;
  onboarding?: boolean;
}) {
  const selectedIds = new Set(preferences.selections.map((selection) => selection.competitionId));
  const labelClass = dark ? "text-slate-300" : "text-slate-600";

  if (catalogStatus === "loading" || catalogStatus === "idle") {
    return <div className={`rounded-2xl border p-6 text-sm ${dark ? "border-slate-700 bg-slate-800 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"}`}>↻ Loading competitions from PostgreSQL…</div>;
  }
  if (catalogStatus === "error") {
    return <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-800">Could not load competitions from PostgreSQL.</div>;
  }
  if (competitions.length === 0) {
    return <div className={`rounded-2xl border p-6 text-sm ${dark ? "border-slate-700 bg-slate-800 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"}`}>No competitions have been ingested yet.</div>;
  }

  return (
    <div>
      <div className={`text-sm font-semibold ${labelClass}`}>
        {onboarding && <span className="mr-2 text-slate-500">01</span>}Competitions
        <span className="ml-2 text-xs font-normal opacity-70">Choose one or more</span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {competitions.map((competition) => {
          const selected = selectedIds.has(competition.id);
          const sport = sports.find((item) => item.id === competition.sportId);
          return (
            <button
              key={competition.id}
              type="button"
              onClick={() => onToggleCompetition(competition.id)}
              aria-pressed={selected}
              className={`rounded-xl border p-4 text-left transition ${selected ? dark ? "border-white bg-white text-slate-950" : "border-slate-900 bg-slate-900 text-white" : dark ? "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"}`}
            >
              <div className="font-bold">{selected ? "✓ " : ""}{sport?.icon ?? "●"} {competition.name}</div>
              <div className={`mt-1 text-xs ${selected && !dark ? "text-slate-300" : selected && dark ? "text-slate-500" : "opacity-60"}`}>
                {competition.sportName ?? sport?.name ?? competition.sportId}{competition.season ? ` · ${competition.season}` : ""} · {competition.teams.length} teams
              </div>
            </button>
          );
        })}
      </div>

      {preferences.selections.length > 0 && (
        <div className="mt-7 space-y-6">
          <div className={`text-sm font-semibold ${labelClass}`}>
            {onboarding && <span className="mr-2 text-slate-500">02</span>}Teams
            <span className="ml-2 text-xs font-normal opacity-70">Select teams within each competition</span>
          </div>
          {preferences.selections.map((selection) => {
            const competition = competitions.find((item) => item.id === selection.competitionId);
            if (!competition) return null;
            return (
              <div key={selection.competitionId} className={`rounded-2xl border p-4 ${dark ? "border-slate-700 bg-slate-800/60" : "border-slate-200 bg-slate-50"}`}>
                <div className={`font-bold ${dark ? "text-white" : "text-slate-900"}`}>{competition.name}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {competition.teams.map((team) => {
                    const selected = selection.teamIds.includes(team.id);
                    return (
                      <button
                        key={team.id}
                        type="button"
                        onClick={() => onToggleTeam(competition.id, team.id)}
                        aria-pressed={selected}
                        className={`rounded-full px-3 py-2 text-sm font-semibold transition ${selected ? dark ? "bg-white text-slate-950" : "bg-slate-900 text-white" : dark ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-white text-slate-600 shadow-sm hover:bg-slate-100"}`}
                      >
                        {selected ? "✓ " : ""}{team.name}
                      </button>
                    );
                  })}
                </div>
                {selection.teamIds.length === 0 && <div className={`mt-3 text-xs ${dark ? "text-amber-300" : "text-amber-700"}`}>Select at least one team in this competition.</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CompetitionFilter({
  competitions,
  activeCompetitionId,
  onChange,
}: {
  competitions: CompetitionOption[];
  activeCompetitionId: string;
  onChange: (id: string) => void;
}) {
  const options = [{ id: "all", name: "All competitions", sportId: "", teams: [] } as CompetitionOption, ...competitions];
  return (
    <section aria-label="Filter dashboard by competition">
      <div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Filter dashboard</div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {options.map((competition) => {
          const active = activeCompetitionId === competition.id;
          return (
            <button
              key={competition.id}
              onClick={() => onChange(competition.id)}
              aria-pressed={active}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${active ? "border-slate-900 bg-slate-900 text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"}`}
            >
              {competition.id === "all" ? "◉" : sports.find((sport) => sport.id === competition.sportId)?.icon ?? "●"} {competition.name}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function MatchSection({
  eyebrow,
  title,
  count,
  groups,
  sportMap,
  teamMap,
  followedTeamIds,
  result = false,
  emptyText,
}: {
  eyebrow: string;
  title: string;
  count: number;
  groups: { key: string; label: string; matches: Match[] }[];
  sportMap: Map<string, (typeof sports)[number]>;
  teamMap: Map<string, Team>;
  followedTeamIds: Set<string>;
  result?: boolean;
  emptyText: string;
}) {
  return (
    <section>
      <div className="mb-5 flex items-end justify-between">
        <div><p className="text-sm font-semibold uppercase tracking-widest text-slate-400">{eyebrow}</p><h2 className="text-2xl font-bold">{title}</h2></div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-500">{count} {count === 1 ? "match" : "matches"}</span>
      </div>
      {groups.length === 0 ? <EmptyState text={emptyText} /> : (
        <div className="space-y-7">
          {groups.map((group) => (
            <div key={group.key}>
              <div className="mb-3 flex items-center gap-3"><h3 className="text-sm font-black uppercase tracking-wider text-slate-600">{group.label}</h3><div className="h-px flex-1 bg-slate-200" /></div>
              <div className="space-y-3">{group.matches.map((match) => <MatchCard key={match.id} match={match} sport={sportMap.get(match.sportId)} teamMap={teamMap} followedTeamIds={followedTeamIds} result={result} />)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MatchCard({
  match,
  sport,
  teamMap,
  followedTeamIds,
  result = false,
}: {
  match: Match;
  sport?: (typeof sports)[number];
  teamMap: Map<string, Team>;
  followedTeamIds: Set<string>;
  result?: boolean;
}) {
  const home = teamMap.get(match.homeTeamId);
  const away = teamMap.get(match.awayTeamId);
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700 shadow-sm">{sport?.icon} {sport?.name}</span>
          <span className="font-medium text-slate-500">{match.competition}</span>
          {match.source.provider === "thesportsdb" && <span className="rounded-full bg-blue-100 px-2 py-1 font-bold text-blue-700">TheSportsDB</span>}
        </div>
        {!result && <span className="rounded-full bg-slate-900 px-3 py-1 font-bold text-white">{formatTime(match.date)}</span>}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-5 sm:gap-6 sm:px-5">
        <TeamDisplay team={home} followed={followedTeamIds.has(match.homeTeamId)} align="right" />
        <div className="min-w-20 text-center sm:min-w-24">
          {result ? <div className="rounded-xl bg-slate-900 px-3 py-2 text-xl font-black tracking-tight text-white sm:text-2xl">{match.homeScore} - {match.awayScore}</div> : <div><div className="text-xs font-bold uppercase tracking-wider text-slate-400">Kick-off</div><div className="mt-1 text-lg font-black text-slate-900">{formatTime(match.date)}</div></div>}
        </div>
        <TeamDisplay team={away} followed={followedTeamIds.has(match.awayTeamId)} align="left" />
      </div>
      {match.venue && <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:px-5">📍 {match.venue}</div>}
    </article>
  );
}

function TeamDisplay({ team, followed, align }: { team?: Team; followed: boolean; align: "left" | "right" }) {
  return (
    <div className={`min-w-0 ${align === "right" ? "text-right" : "text-left"}`}>
      <div className={`font-semibold sm:text-lg ${followed ? "text-slate-950" : "text-slate-600"}`}>{team?.name ?? "Unknown team"}</div>
      <div className={`mt-1 flex flex-wrap items-center gap-1.5 ${align === "right" ? "justify-end" : "justify-start"}`}>
        <span className="text-xs text-slate-400">{team?.category}</span>
        {followed && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Following</span>}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{text}</div>;
}

"use client";

import { useEffect, useState } from "react";
import type { Team } from "@/lib/types";

type CompetitionSummary = { id: string; name: string; country?: string; teamCount: number; imageUrl?: string };
type TeamsPayload = { teams?: Team[]; error?: string };
type Props = { competitions: CompetitionSummary[]; selectedCompetitionIds: string[]; selectedTeamIdsByCompetition: Record<string, string[]>; onToggleCompetition: (competitionId: string) => void; onToggleTeam: (competitionId: string, teamId: string) => void; onFollowAllTeams: (competitionId: string) => void; dark?: boolean };

function normalizeArtworkSrc(src?: string) {
  if (!src) return undefined;
  const base = src.replace(/\/(?:tiny|small|medium|large|original)\/?$/i, "");
  return `${base}/tiny`;
}

function Artwork({ src, fallback, size = "h-8 w-8" }: { src?: string; fallback: string; size?: string }) {
  const [failed, setFailed] = useState(false);
  const displaySrc = normalizeArtworkSrc(src);
  return displaySrc && !failed
    ? <img src={displaySrc} alt="" onError={() => setFailed(true)} className={`${size} shrink-0 object-contain`} />
    : <span className={`flex ${size} shrink-0 items-center justify-center text-base`} aria-hidden="true">{fallback}</span>;
}

export default function TeamPreferenceAccordion({ competitions, selectedCompetitionIds, selectedTeamIdsByCompetition, onToggleCompetition, onToggleTeam, onFollowAllTeams, dark = false }: Props) {
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [teamsByCompetition, setTeamsByCompetition] = useState<Record<string, Team[]>>({});
  const [loadingIds, setLoadingIds] = useState<string[]>([]);
  const [errorIds, setErrorIds] = useState<string[]>([]);
  const [searchByCompetition, setSearchByCompetition] = useState<Record<string, string>>({});

  useEffect(() => {
    const validIds = new Set(competitions.map((competition) => competition.id));
    setExpandedIds((current) => current.filter((id) => validIds.has(id)));
  }, [competitions]);

  async function ensureTeamsLoaded(competitionId: string) {
    if (teamsByCompetition[competitionId] || loadingIds.includes(competitionId)) return;
    setLoadingIds((current) => [...current, competitionId]);
    setErrorIds((current) => current.filter((id) => id !== competitionId));
    try {
      const response = await fetch(`/api/competitions/${encodeURIComponent(competitionId)}/teams`, { cache: "no-store" });
      const payload = await response.json() as TeamsPayload;
      if (!response.ok) throw new Error(payload.error ?? `Team catalog returned ${response.status}`);
      setTeamsByCompetition((current) => ({
        ...current,
        [competitionId]: (payload.teams ?? []).sort((a, b) => a.name.localeCompare(b.name)),
      }));
    } catch {
      setErrorIds((current) => current.includes(competitionId) ? current : [...current, competitionId]);
    } finally {
      setLoadingIds((current) => current.filter((id) => id !== competitionId));
    }
  }

  function toggleExpanded(competitionId: string) {
    setExpandedIds((current) => {
      const expanding = !current.includes(competitionId);
      if (expanding) void ensureTeamsLoaded(competitionId);
      return expanding ? [...current, competitionId] : current.filter((id) => id !== competitionId);
    });
  }

  function toggleTeam(competitionId: string, teamId: string, followed: boolean) {
    // A user can favorite a team directly. The competition is activated in the
    // background so match filtering has the competition context it needs.
    if (!followed) onToggleCompetition(competitionId);
    onToggleTeam(competitionId, teamId);
  }

  const countries = Array.from(new Set(competitions.map((competition) => competition.country ?? "International")));

  return <div className="mt-4 space-y-6">{countries.map((country) => <section key={country}>
    <div className={`mb-2 text-xs font-bold uppercase tracking-wider ${dark ? "text-slate-500" : "text-slate-400"}`}>{country}</div>
    <div className="space-y-2">{competitions.filter((competition) => (competition.country ?? "International") === country).map((competition) => {
      const followed = selectedCompetitionIds.includes(competition.id);
      const expanded = expandedIds.includes(competition.id);
      const teams = teamsByCompetition[competition.id] ?? [];
      const selectedIds = selectedTeamIdsByCompetition[competition.id] ?? [];
      const selectedSet = new Set(selectedIds);
      const query = (searchByCompetition[competition.id] ?? "").trim().toLowerCase();
      const filteredTeams = query ? teams.filter((team) => team.name.toLowerCase().includes(query)) : teams;

      return <div key={competition.id} className={`overflow-hidden rounded-xl border transition ${followed ? dark ? "border-slate-600 bg-slate-800/70" : "border-slate-300 bg-white" : dark ? "border-slate-800 bg-slate-900/30" : "border-slate-200 bg-white"}`}>
        <div className="flex items-center gap-2 px-3 py-2.5">
          <button type="button" onClick={() => onToggleCompetition(competition.id)} aria-label={`${followed ? "Unfollow" : "Follow"} ${competition.name}`} aria-pressed={followed} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl transition ${followed ? "text-amber-400" : dark ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-600"}`}>{followed ? "★" : "☆"}</button>
          <button type="button" onClick={() => toggleExpanded(competition.id)} aria-expanded={expanded} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <Artwork src={competition.imageUrl} fallback="🏆" />
            <span className={`min-w-0 flex-1 truncate text-sm font-bold ${followed ? dark ? "text-white" : "text-slate-900" : dark ? "text-slate-400" : "text-slate-600"}`}>{competition.name}</span>
            {followed && <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${selectedIds.length > 0 ? dark ? "bg-white text-slate-950" : "bg-slate-900 text-white" : dark ? "bg-slate-700 text-slate-200" : "bg-slate-100 text-slate-600"}`}>{selectedIds.length > 0 ? `${selectedIds.length} selected` : "All teams"}</span>}
            {!followed && <span className={`shrink-0 text-xs ${dark ? "text-slate-600" : "text-slate-400"}`}>{competition.teamCount} teams</span>}
            <span className={`shrink-0 text-sm ${dark ? "text-slate-500" : "text-slate-400"}`}>{expanded ? "▾" : "▸"}</span>
          </button>
        </div>
        {expanded && <div className={`border-t px-4 pb-4 pt-3 ${dark ? "border-slate-700" : "border-slate-100"}`}>
          {followed && selectedIds.length > 0 && <div className="mb-3 flex justify-end"><button type="button" onClick={() => onFollowAllTeams(competition.id)} className={`text-xs font-bold underline ${dark ? "text-slate-300" : "text-slate-600"}`}>Follow all teams</button></div>}
          {loadingIds.includes(competition.id) ? <p className={`py-2 text-sm ${dark ? "text-slate-400" : "text-slate-500"}`}>Loading teams…</p> : errorIds.includes(competition.id) ? <div className="flex items-center justify-between gap-3 py-2"><p className="text-sm text-amber-500">Could not load teams.</p><button type="button" onClick={() => void ensureTeamsLoaded(competition.id)} className="text-xs font-bold underline">Retry</button></div> : <>
            {teams.length > 12 && <input type="search" value={searchByCompetition[competition.id] ?? ""} onChange={(event) => setSearchByCompetition((current) => ({ ...current, [competition.id]: event.target.value }))} placeholder={`Search ${competition.name} teams`} className={`mb-3 w-full rounded-xl border px-3 py-2 text-sm outline-none ${dark ? "border-slate-700 bg-slate-900 text-white placeholder:text-slate-500" : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"}`} />}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{filteredTeams.map((team) => {
              const selected = selectedSet.has(team.id);
              return <button key={team.id} type="button" onClick={() => toggleTeam(competition.id, team.id, followed)} aria-label={`${selected ? "Unfollow" : "Follow"} ${team.name}`} aria-pressed={selected} className={`flex min-h-12 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${dark ? "bg-slate-900/70 text-slate-300 hover:bg-slate-800" : "bg-slate-50 text-slate-700 hover:bg-slate-100"}`}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-lg ${selected ? "text-amber-400" : dark ? "text-slate-500" : "text-slate-400"}`}>{selected ? "★" : "☆"}</span>
                <Artwork src={team.imageUrl} fallback="⚽" size="h-7 w-7" />
                <span className="min-w-0 truncate">{team.name}</span>
              </button>;
            })}</div>
            {teams.length === 0 && <p className={`py-2 text-sm ${dark ? "text-slate-500" : "text-slate-400"}`}>No teams are currently stored for this competition.</p>}
            {teams.length > 0 && filteredTeams.length === 0 && <p className={`py-2 text-sm ${dark ? "text-slate-500" : "text-slate-400"}`}>No teams match your search.</p>}
          </>}
        </div>}
      </div>;
    })}</div>
  </section>)}</div>;
}

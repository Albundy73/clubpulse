"use client";

import { useEffect, useMemo, useState } from "react";
import type { Team } from "@/lib/types";

type CompetitionSummary = {
  id: string;
  name: string;
  teamCount: number;
};

type TeamsPayload = {
  teams?: Team[];
  error?: string;
};

type Props = {
  competitions: CompetitionSummary[];
  selectedTeamIds: string[];
  onToggleTeam: (id: string) => void;
  onFollowAllTeams: () => void;
  dark?: boolean;
};

export default function TeamPreferenceAccordion({
  competitions,
  selectedTeamIds,
  onToggleTeam,
  onFollowAllTeams,
  dark = false,
}: Props) {
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [teamsByCompetition, setTeamsByCompetition] = useState<Record<string, Team[]>>({});
  const [loadingIds, setLoadingIds] = useState<string[]>([]);
  const [errorIds, setErrorIds] = useState<string[]>([]);
  const [searchByCompetition, setSearchByCompetition] = useState<Record<string, string>>({});

  const selectedSet = useMemo(() => new Set(selectedTeamIds), [selectedTeamIds]);

  useEffect(() => {
    const validIds = new Set(competitions.map((competition) => competition.id));
    setExpandedIds((current) => current.filter((id) => validIds.has(id)));
  }, [competitions]);

  async function ensureTeamsLoaded(competitionId: string) {
    if (teamsByCompetition[competitionId] || loadingIds.includes(competitionId)) return;
    setLoadingIds((current) => [...current, competitionId]);
    setErrorIds((current) => current.filter((id) => id !== competitionId));

    try {
      const response = await fetch(`/api/competitions/${encodeURIComponent(competitionId)}/teams`, {
        cache: "no-store",
      });
      const payload = await response.json() as TeamsPayload;
      if (!response.ok) throw new Error(payload.error ?? `Team catalog returned ${response.status}`);
      setTeamsByCompetition((current) => ({ ...current, [competitionId]: payload.teams ?? [] }));
    } catch {
      setErrorIds((current) => current.includes(competitionId) ? current : [...current, competitionId]);
    } finally {
      setLoadingIds((current) => current.filter((id) => id !== competitionId));
    }
  }

  function toggleCompetition(competitionId: string) {
    setExpandedIds((current) => {
      const expanding = !current.includes(competitionId);
      if (expanding) void ensureTeamsLoaded(competitionId);
      return expanding ? [...current, competitionId] : current.filter((id) => id !== competitionId);
    });
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onFollowAllTeams}
          className={`rounded-full px-3 py-1.5 text-xs font-bold ${selectedTeamIds.length === 0
            ? dark ? "bg-white text-slate-950" : "bg-slate-900 text-white"
            : dark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-600"}`}
        >
          No team selected = all
        </button>
      </div>

      {competitions.map((competition) => {
        const expanded = expandedIds.includes(competition.id);
        const teams = teamsByCompetition[competition.id] ?? [];
        const selectedInCompetition = teams.filter((team) => selectedSet.has(team.id)).length;
        const status = selectedInCompetition > 0 ? `${selectedInCompetition} selected` : "All teams";
        const query = (searchByCompetition[competition.id] ?? "").trim().toLowerCase();
        const filteredTeams = query
          ? teams.filter((team) => team.name.toLowerCase().includes(query))
          : teams;

        return (
          <div key={competition.id} className={`overflow-hidden rounded-2xl border ${dark ? "border-slate-700 bg-slate-800/50" : "border-slate-200 bg-white"}`}>
            <button
              type="button"
              onClick={() => toggleCompetition(competition.id)}
              aria-expanded={expanded}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${dark ? "hover:bg-slate-800" : "hover:bg-slate-50"}`}
            >
              <span className={`text-sm ${dark ? "text-slate-400" : "text-slate-500"}`}>{expanded ? "▾" : "▸"}</span>
              <span className={`min-w-0 flex-1 truncate text-sm font-bold ${dark ? "text-slate-100" : "text-slate-800"}`}>⚽ {competition.name}</span>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${selectedInCompetition > 0
                ? dark ? "bg-white text-slate-950" : "bg-slate-900 text-white"
                : dark ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-500"}`}
              >
                {status}
              </span>
            </button>

            {expanded && (
              <div className={`border-t px-4 pb-4 pt-3 ${dark ? "border-slate-700" : "border-slate-100"}`}>
                {loadingIds.includes(competition.id) ? (
                  <p className={`py-2 text-sm ${dark ? "text-slate-400" : "text-slate-500"}`}>Loading teams…</p>
                ) : errorIds.includes(competition.id) ? (
                  <div className="flex items-center justify-between gap-3 py-2">
                    <p className="text-sm text-amber-500">Could not load this competition&apos;s teams.</p>
                    <button type="button" onClick={() => void ensureTeamsLoaded(competition.id)} className="text-xs font-bold underline">Retry</button>
                  </div>
                ) : (
                  <>
                    {teams.length > 12 && (
                      <input
                        type="search"
                        value={searchByCompetition[competition.id] ?? ""}
                        onChange={(event) => setSearchByCompetition((current) => ({ ...current, [competition.id]: event.target.value }))}
                        placeholder={`Search ${competition.name} teams`}
                        className={`mb-3 w-full rounded-xl border px-3 py-2 text-sm outline-none transition focus:ring-2 ${dark
                          ? "border-slate-700 bg-slate-900 text-white placeholder:text-slate-500 focus:ring-slate-500"
                          : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-slate-300"}`}
                      />
                    )}

                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {filteredTeams.map((team) => {
                        const selected = selectedSet.has(team.id);
                        return (
                          <button
                            key={team.id}
                            type="button"
                            onClick={() => onToggleTeam(team.id)}
                            aria-pressed={selected}
                            className={`flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${selected
                              ? dark ? "bg-white text-slate-950" : "bg-slate-900 text-white"
                              : dark ? "bg-slate-900/70 text-slate-300 hover:bg-slate-700" : "bg-slate-50 text-slate-700 hover:bg-slate-100"}`}
                          >
                            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${selected
                              ? dark ? "border-slate-950 bg-slate-950 text-white" : "border-white bg-white text-slate-900"
                              : dark ? "border-slate-600" : "border-slate-300"}`}>{selected ? "✓" : ""}</span>
                            <span className="min-w-0 truncate">{team.name}</span>
                          </button>
                        );
                      })}
                    </div>

                    {teams.length === 0 && <p className={`py-2 text-sm ${dark ? "text-slate-500" : "text-slate-400"}`}>No teams are currently stored for this competition.</p>}
                    {teams.length > 0 && filteredTeams.length === 0 && <p className={`py-2 text-sm ${dark ? "text-slate-500" : "text-slate-400"}`}>No teams match your search.</p>}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

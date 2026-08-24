"use client";

import { useEffect, useMemo, useState } from "react";
import type { CompetitionPreferences, Team } from "@/lib/types";

type TeamsPayload = { teams?: Team[] };
type CompetitionSummary = { id: string; name: string };

export default function PreferenceTeamSummary({ preferences, competitions }: { preferences: CompetitionPreferences; competitions: CompetitionSummary[] }) {
  const [teamsById, setTeamsById] = useState<Record<string, Team>>({});
  const selectedIds = useMemo(
    () => Array.from(new Set(preferences.competitionIds.flatMap((competitionId) => preferences.teamIdsByCompetition[competitionId] ?? []))),
    [preferences.competitionIds, preferences.teamIdsByCompetition],
  );
  const allTeamCompetitions = competitions.filter((competition) => preferences.competitionIds.includes(competition.id) && (preferences.teamIdsByCompetition[competition.id]?.length ?? 0) === 0);

  useEffect(() => {
    const controller = new AbortController();
    const competitionIds = preferences.competitionIds.filter((competitionId) => (preferences.teamIdsByCompetition[competitionId]?.length ?? 0) > 0);
    if (competitionIds.length === 0) {
      setTeamsById({});
      return () => controller.abort();
    }

    void Promise.all(competitionIds.map(async (competitionId) => {
      const response = await fetch(`/api/competitions/${encodeURIComponent(competitionId)}/teams`, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) return [] as Team[];
      const payload = await response.json() as TeamsPayload;
      return payload.teams ?? [];
    })).then((groups) => {
      const next: Record<string, Team> = {};
      for (const team of groups.flat()) next[team.id] = team;
      setTeamsById(next);
    }).catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setTeamsById({});
    });

    return () => controller.abort();
  }, [preferences.competitionIds, preferences.teamIdsByCompetition]);

  return <div className="space-y-3">
    {allTeamCompetitions.length > 0 && <div className="text-xs text-slate-400">All teams: {allTeamCompetitions.map((competition) => competition.name).join(", ")}</div>}
    {selectedIds.length > 0 ? <div className="flex flex-wrap gap-2">{selectedIds.map((teamId) => <span key={teamId} className="rounded-full bg-slate-700 px-2.5 py-1 text-sm font-semibold">★ {teamsById[teamId]?.name ?? "Loading…"}</span>)}</div> : allTeamCompetitions.length === 0 ? <span className="text-sm text-slate-500">No teams selected</span> : null}
  </div>;
}

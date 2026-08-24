"use client";

import { useEffect, useMemo, useState } from "react";
import type { CompetitionPreferences, Team } from "@/lib/types";

type TeamsPayload = { teams?: Team[] };
type CompetitionSummary = { id: string; name: string; imageUrl?: string };

function normalizeArtworkSrc(src?: string) {
  if (!src) return undefined;
  return `${src.replace(/\/(?:tiny|small|medium|large|original)\/?$/i, "")}/tiny`;
}

function SummaryLogo({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false);
  const image = normalizeArtworkSrc(src);
  return image && !failed
    ? <img src={image} alt="" onError={() => setFailed(true)} className="h-7 w-7 shrink-0 object-contain" />
    : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs" aria-hidden="true">⚽</span>;
}

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

  return <div className="space-y-2">
    {allTeamCompetitions.map((competition) => <div key={competition.id} className="flex items-center gap-3 rounded-xl bg-slate-900/55 px-3 py-2">
      <SummaryLogo src={competition.imageUrl} />
      <div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-200">{competition.name}</div><div className="text-[11px] text-slate-500">All teams</div></div>
    </div>)}
    {selectedIds.map((teamId) => {
      const team = teamsById[teamId];
      return <div key={teamId} className="flex items-center gap-3 rounded-xl bg-slate-900/55 px-3 py-2">
        <SummaryLogo src={team?.imageUrl} />
        <span className="min-w-0 truncate text-sm font-semibold text-slate-200">{team?.name ?? "Loading…"}</span>
      </div>;
    })}
    {selectedIds.length === 0 && allTeamCompetitions.length === 0 && <span className="text-sm text-slate-500">No teams selected</span>}
  </div>;
}

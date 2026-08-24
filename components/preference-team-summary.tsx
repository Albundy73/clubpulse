"use client";

import { useEffect, useState } from "react";
import type { CompetitionPreferences, Team } from "@/lib/types";

type TeamsPayload = { teams?: Team[] };
type CompetitionSummary = { id: string; name: string; imageUrl?: string };

function normalizeArtworkSrc(src?: string) {
  if (!src) return undefined;
  return `${src.replace(/\/(?:tiny|small|medium|large|original)\/?$/i, "")}/tiny`;
}

function SummaryLogo({ src, fallback = "⚽", size = "h-7 w-7" }: { src?: string; fallback?: string; size?: string }) {
  const [failed, setFailed] = useState(false);
  const image = normalizeArtworkSrc(src);
  return image && !failed
    ? <img src={image} alt="" onError={() => setFailed(true)} className={`${size} shrink-0 object-contain`} />
    : <span className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs`} aria-hidden="true">{fallback}</span>;
}

export default function PreferenceTeamSummary({ preferences, competitions }: { preferences: CompetitionPreferences; competitions: CompetitionSummary[] }) {
  const [teamsByCompetition, setTeamsByCompetition] = useState<Record<string, Team[]>>({});

  useEffect(() => {
    const controller = new AbortController();
    const competitionIds = competitions
      .map((competition) => competition.id)
      .filter((competitionId) => (preferences.teamIdsByCompetition[competitionId]?.length ?? 0) > 0);

    if (competitionIds.length === 0) {
      setTeamsByCompetition({});
      return () => controller.abort();
    }

    void Promise.all(competitionIds.map(async (competitionId) => {
      const response = await fetch(`/api/competitions/${encodeURIComponent(competitionId)}/teams`, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) return [competitionId, []] as const;
      const payload = await response.json() as TeamsPayload;
      const selected = new Set(preferences.teamIdsByCompetition[competitionId] ?? []);
      return [competitionId, (payload.teams ?? []).filter((team) => selected.has(team.id))] as const;
    })).then((groups) => {
      setTeamsByCompetition(Object.fromEntries(groups));
    }).catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setTeamsByCompetition({});
    });

    return () => controller.abort();
  }, [competitions, preferences.teamIdsByCompetition]);

  if (competitions.length === 0) return <span className="text-sm text-slate-500">Star at least one competition</span>;

  return <div className="space-y-3">
    {competitions.map((competition) => {
      const selectedIds = preferences.teamIdsByCompetition[competition.id] ?? [];
      const teams = teamsByCompetition[competition.id] ?? [];
      return <section key={competition.id} className="overflow-hidden rounded-xl bg-slate-900/55">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <SummaryLogo src={competition.imageUrl} fallback="🏆" size="h-8 w-8" />
          <span className="min-w-0 truncate text-sm font-bold text-slate-100">{competition.name}</span>
        </div>
        <div className="border-t border-slate-700/60 px-3 py-2">
          {selectedIds.length === 0 ? <div className="flex items-center gap-3 pl-2 text-sm text-slate-400">
            <span className="flex h-6 w-6 items-center justify-center text-xs" aria-hidden="true">★</span>
            <span>All teams</span>
          </div> : teams.length > 0 ? <div className="space-y-1.5">{teams.map((team) => <div key={team.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
            <SummaryLogo src={team.imageUrl} size="h-6 w-6" />
            <span className="min-w-0 truncate text-sm font-semibold text-slate-300">{team.name}</span>
          </div>)}</div> : <div className="pl-2 text-xs text-slate-500">Loading teams…</div>}
        </div>
      </section>;
    })}
  </div>;
}

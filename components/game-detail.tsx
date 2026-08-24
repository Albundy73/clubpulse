"use client";

import { useEffect, useMemo, useState } from "react";
import type { CompetitionPreferences, Match, Team } from "@/lib/types";

const STORAGE_KEY = "clubpulse-preferences";

type GamePayload = {
  match?: Match;
  teams?: Team[];
  competition?: { id: string; name: string; season?: string; imageUrl?: string };
  error?: string;
};

type StandingRow = {
  rank: number;
  teamId: string;
  teamName: string;
  imageUrl?: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

type StandingsPayload = { standings?: StandingRow[]; source?: string; note?: string; error?: string };

function normalizeArtworkSrc(src?: string) {
  if (!src) return undefined;
  const base = src.replace(/\/(?:tiny|small|medium|large|original)\/?$/i, "");
  return `${base}/tiny`;
}

function formatTime(date: string) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(date));
}

function readPreferences(): CompetitionPreferences | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as CompetitionPreferences;
    return Array.isArray(parsed.competitionIds) && parsed.teamIdsByCompetition ? parsed : null;
  } catch {
    return null;
  }
}

function TeamLogo({ team, size = "h-12 w-12" }: { team?: Team; size?: string }) {
  const [failed, setFailed] = useState(false);
  const src = normalizeArtworkSrc(team?.imageUrl);
  return src && !failed
    ? <img src={src} alt="" onError={() => setFailed(true)} className={`${size} shrink-0 object-contain`} />
    : <div className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-slate-800 text-lg`} aria-hidden="true">⚽</div>;
}

function StandingLogo({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false);
  const image = normalizeArtworkSrc(src);
  return image && !failed
    ? <img src={image} alt="" onError={() => setFailed(true)} className="h-7 w-7 shrink-0 object-contain" />
    : <span className="flex h-7 w-7 shrink-0 items-center justify-center text-sm" aria-hidden="true">⚽</span>;
}

export default function GameDetail({ gameId }: { gameId: string }) {
  const [game, setGame] = useState<GamePayload | null>(null);
  const [standings, setStandings] = useState<StandingsPayload | null>(null);
  const [preferences, setPreferences] = useState<CompetitionPreferences | null>(null);

  useEffect(() => setPreferences(readPreferences()), []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/games/${encodeURIComponent(gameId)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as GamePayload;
        if (!response.ok) throw new Error(payload.error ?? `Game API returned ${response.status}`);
        setGame(payload);
        if (payload.match?.competitionId) {
          return fetch(`/api/competitions/${encodeURIComponent(payload.match.competitionId)}/standings`, { signal: controller.signal, cache: "no-store" })
            .then(async (standingResponse) => {
              const standingPayload = await standingResponse.json() as StandingsPayload;
              setStandings(standingPayload);
            });
        }
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setGame({ error: error instanceof Error ? error.message : "Game unavailable" });
      });
    return () => controller.abort();
  }, [gameId]);

  const teamMap = useMemo(() => new Map((game?.teams ?? []).map((team) => [team.id, team])), [game?.teams]);
  const match = game?.match;
  const selectedIds = match ? preferences?.teamIdsByCompetition?.[match.competitionId] ?? [] : [];
  const followsAll = Boolean(match && preferences?.competitionIds?.includes(match.competitionId) && selectedIds.length === 0);

  if (!game) return <main className="min-h-screen bg-slate-950 text-white"><div className="mx-auto max-w-6xl px-5 py-10 text-slate-400">Loading game…</div></main>;
  if (!match) return <main className="min-h-screen bg-slate-950 text-white"><div className="mx-auto max-w-6xl px-5 py-10"><a href="/" className="text-sm font-bold text-sky-300">← Dashboard</a><div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-8 text-slate-400">{game.error ?? "Game not found."}</div></div></main>;

  const home = teamMap.get(match.homeTeamId);
  const away = teamMap.get(match.awayTeamId);
  const hasScore = match.homeScore !== undefined && match.awayScore !== undefined;
  const isFollowed = (teamId: string) => followsAll || selectedIds.includes(teamId);

  return <main className="min-h-screen bg-slate-950 text-white">
    <header className="border-b border-slate-800 bg-slate-950/95"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5"><a href="/" className="text-2xl font-black tracking-tight">ClubPulse</a><a href="/" className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800">← Dashboard</a></div></header>
    <div className="mx-auto max-w-6xl space-y-8 px-5 py-8">
      <section>
        <div className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-slate-500">{formatDate(match.date)}</div>
        <article className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-sm">
          <div className="border-b border-slate-800 px-4 py-3 text-xs font-semibold text-slate-400 sm:px-5">{match.competition}</div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-6 sm:gap-6 sm:px-5">
            <div className="flex min-w-0 items-center justify-end gap-3"><div className="min-w-0 text-right"><div className={`truncate font-bold sm:text-lg ${isFollowed(match.homeTeamId) ? "text-white" : "text-slate-400"}`}>{home?.name ?? "Unknown team"}{isFollowed(match.homeTeamId) && <span className="ml-1 text-amber-400">★</span>}</div></div><TeamLogo team={home} /></div>
            <div className="min-w-20 text-center sm:min-w-24">{hasScore ? <div className="rounded-xl bg-white px-3 py-2 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">{match.homeScore} - {match.awayScore}</div> : <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Kick-off</div><div className="mt-1 text-lg font-black text-white">{formatTime(match.date)}</div></div>}</div>
            <div className="flex min-w-0 items-center justify-start gap-3"><TeamLogo team={away} /><div className="min-w-0 text-left"><div className={`truncate font-bold sm:text-lg ${isFollowed(match.awayTeamId) ? "text-white" : "text-slate-400"}`}>{away?.name ?? "Unknown team"}{isFollowed(match.awayTeamId) && <span className="ml-1 text-amber-400">★</span>}</div></div></div>
          </div>
          {match.venue && <div className="border-t border-slate-800 px-4 py-3 text-xs text-slate-500 sm:px-5">📍 {match.venue}</div>}
        </article>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <div className="flex items-end justify-between gap-4 border-b border-slate-800 px-4 py-4 sm:px-5"><div><h1 className="text-lg font-black">{match.competition} table</h1>{game.competition?.season && <p className="mt-1 text-xs text-slate-500">Season {game.competition.season}</p>}</div></div>
        {!standings ? <div className="p-8 text-sm text-slate-500">Loading standings…</div> : standings.standings?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead className="bg-slate-950/50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3 text-center">Pos</th><th className="px-3 py-3 text-left">Team</th><th className="px-3 py-3 text-center">P</th><th className="px-3 py-3 text-center">W</th><th className="px-3 py-3 text-center">D</th><th className="px-3 py-3 text-center">L</th><th className="px-3 py-3 text-center">GD</th><th className="px-4 py-3 text-center font-black text-slate-300">Pts</th></tr></thead><tbody>{standings.standings.map((row) => {
          const involved = row.teamId === match.homeTeamId || row.teamId === match.awayTeamId;
          return <tr key={row.teamId} className={`border-t border-slate-800 ${involved ? "bg-slate-800/60" : ""}`}><td className="px-4 py-3 text-center font-bold text-slate-400">{row.rank}</td><td className="px-3 py-3"><div className="flex items-center gap-3"><StandingLogo src={row.imageUrl} /><span className="font-semibold text-slate-200">{row.teamName}</span></div></td><td className="px-3 py-3 text-center text-slate-400">{row.played}</td><td className="px-3 py-3 text-center text-slate-400">{row.wins}</td><td className="px-3 py-3 text-center text-slate-400">{row.draws}</td><td className="px-3 py-3 text-center text-slate-400">{row.losses}</td><td className="px-3 py-3 text-center text-slate-400">{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td><td className="px-4 py-3 text-center font-black text-white">{row.points}</td></tr>;
        })}</tbody></table></div> : <div className="p-8 text-sm text-slate-500">{standings.note ?? standings.error ?? "Standings are not available for this competition."}</div>}
      </section>
    </div>
  </main>;
}

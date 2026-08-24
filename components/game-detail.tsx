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

type StandingsPayload = { standings?: StandingRow[]; note?: string; error?: string };
type ReportPlayer = { teamId?: string; teamName?: string; player: string; number?: string; position?: string; role: string };
type ReportPayload = {
  goals?: { teamId?: string; teamName?: string; player: string; minute: string }[];
  statistics?: { label: string; home: string; away: string }[];
  lineups?: ReportPlayer[];
  formations?: Record<string, string>;
  availability?: { goals: boolean; statistics: boolean; lineups: boolean };
};

function normalizeArtworkSrc(src?: string) {
  if (!src) return undefined;
  return `${src.replace(/\/(?:tiny|small|medium|large|original)\/?$/i, "")}/tiny`;
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

function numericStat(value: string) {
  const parsed = Number.parseFloat(value.replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isSubstitute(role: string) {
  const value = role.trim().toLowerCase();
  return value === "yes" || value === "true" || value === "1" || value.includes("sub");
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
    : <span className="flex h-7 w-7 items-center justify-center" aria-hidden="true">⚽</span>;
}

function StatisticRow({ label, home, away }: { label: string; home: string; away: string }) {
  const homeValue = numericStat(home);
  const awayValue = numericStat(away);
  const homeComparable = homeValue === undefined ? 0 : Math.max(0, homeValue);
  const awayComparable = awayValue === undefined ? 0 : Math.max(0, awayValue);
  const total = homeComparable + awayComparable;
  const homePercent = total > 0 ? (homeComparable / total) * 100 : 50;

  return <div className="px-5 py-4">
    <div className="grid grid-cols-[1fr_1.4fr_1fr] items-center gap-3 text-sm">
      <strong className="text-right text-white">{home}</strong>
      <span className="text-center text-slate-400">{label}</span>
      <strong className="text-white">{away}</strong>
    </div>
    <div className="relative mt-3 h-2 rounded-full bg-slate-800" aria-hidden="true">
      <div className="absolute inset-y-0 left-0 rounded-l-full bg-sky-400" style={{ width: `${homePercent}%` }} />
      <div className="absolute inset-y-0 right-0 rounded-r-full bg-amber-400" style={{ width: `${100 - homePercent}%` }} />
      <div className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_2px_rgba(15,23,42,0.75)]" style={{ left: `${homePercent}%` }} />
    </div>
  </div>;
}

function isGoalkeeper(position?: string) {
  const value = (position ?? "").toLowerCase();
  return value.includes("goalkeeper") || value === "gk";
}

function displayPlayerName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(" ")}` : name;
}

function spreadPlayers(players: ReportPlayer[], y: number) {
  if (!players.length) return [] as { player: ReportPlayer; x: number; y: number }[];
  return players.map((player, index) => ({
    player,
    x: ((index + 1) / (players.length + 1)) * 100,
    y,
  }));
}

function parseFormation(formation?: string) {
  if (!formation) return undefined;
  const numbers = formation.split("-").map((value) => Number.parseInt(value, 10)).filter(Number.isFinite);
  return numbers.length >= 2 && numbers.reduce((sum, value) => sum + value, 0) === 10 ? numbers : undefined;
}

function fallbackFormation(players: ReportPlayer[]) {
  const outfield = players.filter((player) => !isGoalkeeper(player.position));
  const defenders = outfield.filter((player) => /back|defender|defence/i.test(player.position ?? "")).length;
  const attackers = outfield.filter((player) => /winger|forward|striker|attack/i.test(player.position ?? "")).length;
  const midfielders = Math.max(0, 10 - defenders - attackers);
  if (defenders + midfielders + attackers === 10 && defenders > 0 && attackers > 0) return [defenders, midfielders, attackers];
  return [4, 4, 2];
}

function PitchPlayer({ player, x, y, tone }: { player: ReportPlayer; x: number; y: number; tone: "home" | "away" }) {
  return <div className="absolute z-10 -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: `${x}%`, top: `${y}%` }}>
    <div className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/80 text-xs font-black text-white shadow-lg ${tone === "home" ? "bg-sky-700" : "bg-amber-600"}`}>
      {player.number ?? "•"}
    </div>
    <div className="mt-1 max-w-28 truncate rounded bg-slate-950/80 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm sm:text-xs">
      {displayPlayerName(player.player)}
    </div>
  </div>;
}

function TeamPitch({ title, players, tone, formation }: { title: string; players: ReportPlayer[]; tone: "home" | "away"; formation?: string }) {
  const starters = players.filter((player) => !isSubstitute(player.role)).slice(0, 11);
  const substitutes = players.filter((player) => isSubstitute(player.role));
  const goalkeeper = starters.find((player) => isGoalkeeper(player.position)) ?? starters[0];
  const outfield = starters.filter((player) => player !== goalkeeper);
  const shape = parseFormation(formation) ?? fallbackFormation(starters);

  let cursor = 0;
  const layers = shape.map((count) => {
    const playersInLayer = outfield.slice(cursor, cursor + count);
    cursor += count;
    return playersInLayer;
  });
  if (cursor < outfield.length && layers.length) layers[layers.length - 1].push(...outfield.slice(cursor));

  const bottomY = 70;
  const topY = 17;
  const step = layers.length > 1 ? (bottomY - topY) / (layers.length - 1) : 0;
  const positions = [
    ...(goalkeeper ? spreadPlayers([goalkeeper], 89) : []),
    ...layers.flatMap((layer, index) => spreadPlayers(layer, bottomY - step * index)),
  ];

  return <div className="mx-auto w-full max-w-3xl">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="font-black text-white">{title}</h3>
      <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-xs font-black text-slate-300">{formation ?? shape.join("-")}</span>
    </div>
    <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-emerald-400/30 bg-emerald-900/80 shadow-inner sm:aspect-[3/2]">
      <div className="absolute inset-3 rounded-lg border-2 border-white/25" />
      <div className="absolute left-3 right-3 top-1/2 border-t-2 border-white/20" />
      <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/20" />
      <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30" />
      <div className="absolute left-1/2 top-3 h-16 w-44 -translate-x-1/2 border-x-2 border-b-2 border-white/20" />
      <div className="absolute bottom-3 left-1/2 h-16 w-44 -translate-x-1/2 border-x-2 border-t-2 border-white/20" />
      {positions.map(({ player, x, y }, index) => <PitchPlayer key={`${player.player}-${index}`} player={player} x={x} y={y} tone={tone} />)}
    </div>
    {substitutes.length > 0 && <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-500">Substitutes</div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {substitutes.map((player, index) => <div key={`${player.player}-${index}`} className="flex min-w-0 items-center gap-2 text-xs text-slate-300">
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-bold text-white ${tone === "home" ? "bg-sky-700" : "bg-amber-600"}`}>{player.number ?? "•"}</span>
          <span className="truncate">{player.player}</span>
        </div>)}
      </div>
    </div>}
  </div>;
}

export default function GameDetail({ gameId }: { gameId: string }) {
  const [game, setGame] = useState<GamePayload | null>(null);
  const [standings, setStandings] = useState<StandingsPayload | null>(null);
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [preferences, setPreferences] = useState<CompetitionPreferences | null>(null);
  const [lineupTeamId, setLineupTeamId] = useState<string | null>(null);

  useEffect(() => setPreferences(readPreferences()), []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/games/${encodeURIComponent(gameId)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as GamePayload;
        if (!response.ok) throw new Error(payload.error ?? `Game API returned ${response.status}`);
        setGame(payload);
        if (payload.match?.competitionId) {
          void fetch(`/api/competitions/${encodeURIComponent(payload.match.competitionId)}/standings`, { signal: controller.signal, cache: "no-store" })
            .then(async (standingResponse) => setStandings(await standingResponse.json()));
        }
        if (payload.match?.status === "finished" || payload.match?.homeScore !== undefined) {
          void fetch(`/api/games/${encodeURIComponent(gameId)}/report`, { signal: controller.signal, cache: "no-store" })
            .then(async (reportResponse) => setReport(await reportResponse.json()));
        }
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setGame({ error: error instanceof Error ? error.message : "Game unavailable" });
        }
      });
    return () => controller.abort();
  }, [gameId]);

  const teamMap = useMemo(() => new Map((game?.teams ?? []).map((team) => [team.id, team])), [game?.teams]);
  const match = game?.match;

  const selected = match ? preferences?.teamIdsByCompetition?.[match.competitionId] ?? [] : [];
  const followsAll = Boolean(match && preferences?.competitionIds?.includes(match.competitionId) && selected.length === 0);
  const followed = (id: string) => followsAll || selected.includes(id);

  useEffect(() => {
    if (!match || lineupTeamId) return;
    const homeFollowed = followed(match.homeTeamId);
    const awayFollowed = followed(match.awayTeamId);
    setLineupTeamId(awayFollowed && !homeFollowed ? match.awayTeamId : match.homeTeamId);
  }, [match, preferences, lineupTeamId]);

  if (!game) return <main className="min-h-screen bg-slate-950 text-white"><div className="mx-auto max-w-6xl px-5 py-10 text-slate-400">Loading game…</div></main>;
  if (!match) return <main className="min-h-screen bg-slate-950 text-white"><div className="mx-auto max-w-6xl px-5 py-10"><a href="/" className="text-sky-300">← Dashboard</a><div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-8 text-slate-400">{game.error ?? "Game not found."}</div></div></main>;

  const home = teamMap.get(match.homeTeamId);
  const away = teamMap.get(match.awayTeamId);
  const hasScore = match.homeScore !== undefined && match.awayScore !== undefined;
  const isCompleted = match.status === "finished" || hasScore;
  const goalsFor = (id: string, name?: string) => report?.goals?.filter((goal) => goal.teamId === id || (!goal.teamId && goal.teamName === name)) ?? [];
  const lineupFor = (id: string, name?: string) => report?.lineups?.filter((player) => player.teamId === id || (!player.teamId && player.teamName === name)) ?? [];
  const homeGoals = goalsFor(match.homeTeamId, home?.name);
  const awayGoals = goalsFor(match.awayTeamId, away?.name);
  const activeLineupId = lineupTeamId ?? match.homeTeamId;
  const activeLineupTeam = activeLineupId === match.awayTeamId ? away : home;
  const activeLineupTone = activeLineupId === match.awayTeamId ? "away" as const : "home" as const;

  return <main className="min-h-screen bg-slate-950 text-white">
    <header className="border-b border-slate-800"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5"><a href="/" className="text-2xl font-black">ClubPulse</a><a href="/" className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-300">← Dashboard</a></div></header>
    <div className="mx-auto max-w-6xl space-y-8 px-5 py-8">
      <section>
        <div className="mb-3 text-xs font-black uppercase tracking-[.16em] text-slate-500">{formatDate(match.date)}</div>
        <article className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 px-5 py-3 text-xs font-semibold text-slate-400">{match.competition}</div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 px-4 py-6 sm:gap-6 sm:px-5">
            <div className="flex justify-end gap-3"><div className="text-right"><div className="font-bold sm:text-lg">{home?.name ?? "Unknown team"}{followed(match.homeTeamId) && <span className="ml-1 text-amber-400">★</span>}</div>{isCompleted && homeGoals.map((goal, index) => <div key={index} className="mt-1 text-xs text-slate-400">{goal.player} {goal.minute}{goal.minute && !goal.minute.includes("'") ? "'" : ""}</div>)}</div><TeamLogo team={home} /></div>
            <div className="min-w-20 text-center sm:min-w-24">{hasScore ? <div className="rounded-xl bg-white px-3 py-2 text-xl font-black text-slate-950 sm:text-2xl">{match.homeScore} - {match.awayScore}</div> : <div><div className="text-[10px] font-bold uppercase text-slate-500">Kick-off</div><div className="mt-1 text-lg font-black">{formatTime(match.date)}</div></div>}</div>
            <div className="flex gap-3"><TeamLogo team={away} /><div><div className="font-bold sm:text-lg">{away?.name ?? "Unknown team"}{followed(match.awayTeamId) && <span className="ml-1 text-amber-400">★</span>}</div>{isCompleted && awayGoals.map((goal, index) => <div key={index} className="mt-1 text-xs text-slate-400">{goal.player} {goal.minute}{goal.minute && !goal.minute.includes("'") ? "'" : ""}</div>)}</div></div>
          </div>
          {match.venue && <div className="border-t border-slate-800 px-5 py-3 text-xs text-slate-500">📍 {match.venue}</div>}
        </article>
      </section>

      {isCompleted && <>
        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <h2 className="border-b border-slate-800 px-5 py-4 text-lg font-black">Statistics</h2>
          {!report ? <div className="p-8 text-sm text-slate-500">Loading statistics…</div> : report.statistics?.length ? <div className="divide-y divide-slate-800">{report.statistics.map((stat, index) => <StatisticRow key={`${stat.label}-${index}`} {...stat} />)}</div> : <div className="p-8 text-sm text-slate-500">Match statistics are not available from the provider for this game.</div>}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <h2 className="border-b border-slate-800 px-5 py-4 text-lg font-black">Lineups</h2>
          {!report ? <div className="p-8 text-sm text-slate-500">Loading lineups…</div> : report.lineups?.length ? <div>
            <div className="grid grid-cols-2 border-b border-slate-800 bg-slate-950/30 p-2">
              {[{ id: match.homeTeamId, team: home }, { id: match.awayTeamId, team: away }].map(({ id, team }) => <button key={id} type="button" onClick={() => setLineupTeamId(id)} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition ${activeLineupId === id ? "bg-white text-slate-950" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
                <TeamLogo team={team} size="h-6 w-6" />
                <span className="truncate">{team?.name ?? "Team"}</span>
                {followed(id) && <span className="text-amber-400">★</span>}
              </button>)}
            </div>
            <div className="p-5">
              <TeamPitch title={activeLineupTeam?.name ?? "Team"} players={lineupFor(activeLineupId, activeLineupTeam?.name)} tone={activeLineupTone} formation={report.formations?.[activeLineupId]} />
            </div>
          </div> : <div className="p-8 text-sm text-slate-500">Lineups are not available from the provider for this game.</div>}
        </section>
      </>}

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <div className="border-b border-slate-800 px-5 py-4"><h1 className="text-lg font-black">{match.competition} table</h1>{game.competition?.season && <p className="mt-1 text-xs text-slate-500">Season {game.competition.season}</p>}</div>
        {!standings ? <div className="p-8 text-sm text-slate-500">Loading standings…</div> : standings.standings?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead className="bg-slate-950/50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Pos</th><th className="px-3 py-3 text-left">Team</th>{["P", "W", "D", "L", "GD", "Pts"].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead><tbody>{standings.standings.map((row) => <tr key={row.teamId} className={`border-t border-slate-800 ${row.teamId === match.homeTeamId || row.teamId === match.awayTeamId ? "bg-slate-800/60" : ""}`}><td className="px-4 py-3 text-center">{row.rank}</td><td className="px-3 py-3"><div className="flex items-center gap-3"><StandingLogo src={row.imageUrl} /><span className="font-semibold">{row.teamName}</span></div></td>{[row.played, row.wins, row.draws, row.losses, row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference, row.points].map((value, index) => <td key={index} className={`px-3 py-3 text-center ${index === 5 ? "font-black text-white" : "text-slate-400"}`}>{value}</td>)}</tr>)}</tbody></table></div> : <div className="p-8 text-sm text-slate-500">{standings.note ?? standings.error ?? "Standings are not available for this competition."}</div>}
      </section>
    </div>
  </main>;
}

"use client";

import { useState } from "react";

type RefreshState = "idle" | "running" | "success" | "error";
type Diagnostic = { competitionName: string; returnedTeams: number; expectedTeamCount?: number; complete: boolean; sources: string[]; matchObservedTeams: number };
type RefreshPayload = { ok?: boolean; error?: string; competitionTeamsUpserted?: number; competitionTeamCatalogDiagnostics?: Diagnostic[] };

export default function CatalogRefreshControl({ dark = false }: { dark?: boolean }) {
  const [state, setState] = useState<RefreshState>("idle"); const [message, setMessage] = useState("");
  async function refreshCatalog() { setState("running"); setMessage("Refreshing catalog…"); try { const response = await fetch("/api/catalog/refresh", { method: "POST", cache: "no-store" }); const body = await response.text(); let payload: RefreshPayload = {}; if (body.trim()) { try { payload = JSON.parse(body) as RefreshPayload; } catch { throw new Error(`Catalog refresh returned an invalid response (${response.status})`); } } if (!response.ok || !payload.ok) throw new Error(payload.error ?? (body.trim() ? `Catalog refresh failed (${response.status})` : `Catalog refresh returned an empty response (${response.status})`)); const diagnostics = payload.competitionTeamCatalogDiagnostics ?? []; const summary = diagnostics.length > 0 ? diagnostics.map((item) => `${item.expectedTeamCount ? (item.complete ? "✓" : "⚠") : "·"} ${item.competitionName}: ${item.returnedTeams}${item.expectedTeamCount ? `/${item.expectedTeamCount}` : ""}`).join(" · ") : `${payload.competitionTeamsUpserted ?? 0} teams upserted`; setState("success"); setMessage(`Catalog refreshed · ${summary}. Reloading…`); window.setTimeout(() => window.location.reload(), 2200); } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Catalog refresh failed"); } }
  const tone = state === "error" ? "text-red-500" : state === "success" ? "text-emerald-500" : dark ? "text-slate-500" : "text-slate-400";
  return <div className="flex items-center justify-end gap-2"><button type="button" onClick={refreshCatalog} disabled={state === "running"} title={state === "running" ? "Refreshing catalog" : "Refresh catalog"} aria-label={state === "running" ? "Refreshing catalog" : "Refresh catalog"} className={`flex h-8 w-8 items-center justify-center rounded-full text-base transition disabled:cursor-wait ${dark ? "text-slate-500 hover:bg-slate-800 hover:text-slate-300" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}>{state === "running" ? "↻" : "⟳"}</button>{message && state !== "idle" && <span className={`max-w-64 truncate text-[11px] ${tone}`} title={message}>{message}</span>}</div>;
}

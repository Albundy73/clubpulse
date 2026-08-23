"use client";

import { useState } from "react";

type RefreshState = "idle" | "running" | "success" | "error";
type Diagnostic = {
  competitionName: string;
  returnedTeams: number;
  expectedTeamCount?: number;
  complete: boolean;
  sources: string[];
  matchObservedTeams: number;
};

type RefreshPayload = {
  ok?: boolean;
  error?: string;
  competitionTeamsUpserted?: number;
  competitionTeamCatalogDiagnostics?: Diagnostic[];
};

export default function CatalogRefreshControl({ dark = false }: { dark?: boolean }) {
  const [state, setState] = useState<RefreshState>("idle");
  const [message, setMessage] = useState("Refresh the Preview competition and team catalog from TheSportsDB.");

  async function refreshCatalog() {
    setState("running");
    setMessage("Refreshing catalog…");

    try {
      const response = await fetch("/api/catalog/refresh", {
        method: "POST",
        cache: "no-store",
      });
      const body = await response.text();
      let payload: RefreshPayload = {};

      if (body.trim()) {
        try {
          payload = JSON.parse(body) as RefreshPayload;
        } catch {
          throw new Error(`Catalog refresh returned an invalid response (${response.status})`);
        }
      }

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.error ??
            (body.trim()
              ? `Catalog refresh failed (${response.status})`
              : `Catalog refresh returned an empty response (${response.status})`),
        );
      }

      const diagnostics = payload.competitionTeamCatalogDiagnostics ?? [];
      const summary = diagnostics.length > 0
        ? diagnostics.map((item) => {
            const expected = item.expectedTeamCount ? `/${item.expectedTeamCount}` : "";
            const marker = item.expectedTeamCount ? (item.complete ? "✓" : "⚠") : "·";
            return `${marker} ${item.competitionName}: ${item.returnedTeams}${expected}`;
          }).join(" · ")
        : `${payload.competitionTeamsUpserted ?? 0} teams upserted`;

      setState("success");
      setMessage(`Catalog refreshed · ${summary}. Reloading…`);
      window.setTimeout(() => window.location.reload(), 2200);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Catalog refresh failed");
    }
  }

  const textClass = state === "error"
    ? "text-red-600"
    : state === "success"
      ? "text-emerald-600"
      : dark
        ? "text-slate-400"
        : "text-slate-500";

  return (
    <div className={`mt-3 rounded-xl border p-3 ${dark ? "border-slate-700 bg-slate-800/70" : "border-slate-200 bg-slate-50"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={refreshCatalog}
          disabled={state === "running"}
          className={`rounded-lg px-3 py-2 text-xs font-bold transition disabled:cursor-wait disabled:opacity-60 ${dark ? "bg-slate-700 text-white hover:bg-slate-600" : "bg-white text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-100"}`}
        >
          {state === "running" ? "↻ Refreshing…" : "↻ Refresh catalog"}
        </button>
        <p className={`min-w-0 flex-1 text-xs ${textClass}`}>{message}</p>
      </div>
    </div>
  );
}

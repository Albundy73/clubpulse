"use client";

import { useState } from "react";

type IngestState = "idle" | "running" | "success" | "error";

export default function IngestButton() {
  const [state, setState] = useState<IngestState>("idle");
  const [message, setMessage] = useState("Run an on-demand TheSportsDB ingestion.");

  async function runIngestion() {
    const secret = window.prompt("Enter INGEST_SECRET or CRON_SECRET");
    if (!secret) return;

    setState("running");
    setMessage("Ingestion running…");

    try {
      const response = await fetch("/api/ingest/thesportsdb", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
        },
      });

      const payload = await response.json() as {
        ok?: boolean;
        error?: string;
        matchesUpserted?: number;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? `Ingestion failed (${response.status})`);
      }

      setState("success");
      setMessage(`Ingestion complete · ${payload.matchesUpserted ?? 0} matches upserted. Refresh the dashboard to load them.`);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Ingestion failed");
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-2xl border border-slate-200 bg-white p-3 shadow-lg">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={runIngestion}
          disabled={state === "running"}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-700 disabled:cursor-wait disabled:opacity-60"
        >
          {state === "running" ? "Ingesting…" : "↻ Ingest now"}
        </button>
        <p className={`text-xs ${state === "error" ? "text-red-600" : state === "success" ? "text-emerald-700" : "text-slate-500"}`}>
          {message}
        </p>
      </div>
    </div>
  );
}

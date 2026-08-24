"use client";

import { useEffect } from "react";

const STORAGE_KEY = "clubpulse-dashboard-window";
const WINDOWS = ["previous", "today", "next"] as const;

function selectedWindow() {
  const nav = document.querySelector<HTMLElement>('nav[aria-label="Match period"]');
  if (!nav) return null;
  const selected = nav.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
  const label = selected?.textContent?.trim().toLowerCase() ?? "";
  return WINDOWS.find((window) => label.startsWith(window)) ?? null;
}

function restoreWindow() {
  if (window.location.pathname !== "/") return;
  const saved = window.sessionStorage.getItem(STORAGE_KEY);
  if (!saved || !WINDOWS.includes(saved as (typeof WINDOWS)[number])) return;
  const nav = document.querySelector<HTMLElement>('nav[aria-label="Match period"]');
  if (!nav) return;
  const button = Array.from(nav.querySelectorAll<HTMLButtonElement>("button")).find((candidate) => candidate.textContent?.trim().toLowerCase().startsWith(saved));
  if (button && button.getAttribute("aria-pressed") !== "true") button.click();
}

export default function DashboardWindowMemory() {
  useEffect(() => {
    let restoreAttempts = 0;
    const restoreTimer = window.setInterval(() => {
      restoreWindow();
      restoreAttempts += 1;
      if (restoreAttempts >= 20 || document.querySelector('nav[aria-label="Match period"]')) window.clearInterval(restoreTimer);
    }, 50);

    const remember = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="/game/"]') : null;
      if (!target) return;
      const current = selectedWindow();
      if (current) window.sessionStorage.setItem(STORAGE_KEY, current);
    };

    document.addEventListener("click", remember, true);
    return () => {
      window.clearInterval(restoreTimer);
      document.removeEventListener("click", remember, true);
    };
  }, []);

  return null;
}

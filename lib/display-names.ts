const COMPETITION_NAMES_BY_EXTERNAL_ID: Record<string, string> = {
  "4344": "Primeira Liga",
  "4510": "Taça de Portugal",
  "4334": "Ligue 1",
  "4401": "Ligue 2",
  "4480": "UEFA Champions League",
  "4481": "UEFA Europa League",
};

export function normalizeDisplayName(value: string) {
  let normalized = value.trim();
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Keep provider text as-is when it is not valid URI encoding.
  }
  normalized = normalized.replace(/\s+/g, " ").trim();
  return normalized ? normalized.charAt(0).toLocaleUpperCase() + normalized.slice(1) : normalized;
}

export function competitionDisplayName(externalId: string | null | undefined, storedName: string) {
  return externalId && COMPETITION_NAMES_BY_EXTERNAL_ID[externalId]
    ? COMPETITION_NAMES_BY_EXTERNAL_ID[externalId]
    : normalizeDisplayName(storedName);
}

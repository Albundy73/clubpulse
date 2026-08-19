import type { Match } from "@/lib/types";

const FPF_BASE_URL = "https://resultados.fpf.pt/Match/GetMatchInformation";

type FpfMatchMapping = {
  matchId: string;
  competitionId: string;
  competitionName: string;
  homeTeamId: string;
  awayTeamId: string;
  homeAliases: string[];
  awayAliases: string[];
};

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&atilde;/gi, "ã")
    .replace(/&otilde;/gi, "õ")
    .replace(/&ccedil;/gi, "ç");
}

function htmlToText(html: string) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findAlias(text: string, aliases: string[]) {
  return aliases.find((alias) => new RegExp(escapeRegExp(alias), "i").test(text));
}

function parsePortugueseDate(date: string, time: string) {
  const [day, month, year] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  // Store the FPF local Portugal time with an explicit Lisbon summer offset.
  return new Date(Date.UTC(year, month - 1, day, hour - 1, minute)).toISOString();
}

export async function fetchFpfMatch(mapping: FpfMatchMapping): Promise<Match> {
  const url = `${FPF_BASE_URL}?matchId=${encodeURIComponent(mapping.matchId)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "ClubPulse/0.1 (+https://github.com/Albundy73/clubpulse)" },
    next: { revalidate: 900 },
  });

  if (!response.ok) {
    throw new Error(`FPF request failed (${response.status}) for match ${mapping.matchId}`);
  }

  const text = htmlToText(await response.text());
  const homeAlias = findAlias(text, mapping.homeAliases);
  const awayAlias = findAlias(text, mapping.awayAliases);

  if (!homeAlias || !awayAlias) {
    throw new Error(`Could not identify teams in FPF match ${mapping.matchId}`);
  }

  const scorePattern = new RegExp(
    `${escapeRegExp(homeAlias)}\\s+(\\d+)\\s*-\\s*(\\d+)\\s+${escapeRegExp(awayAlias)}`,
    "i",
  );
  const score = text.match(scorePattern);
  const metadata = text.match(/Data:\s*(\d{2}-\d{2}-\d{4})\s+Hora:\s*(\d{2}:\d{2})\s+Estádio:\s*(.+?)(?=\s+(?:Eventos de jogo|Equipas Iniciais|Treinadores|Equipa de arbitragem|Confrontos Anteriores))/i);

  if (!score || !metadata) {
    throw new Error(`Could not parse score/date metadata from FPF match ${mapping.matchId}`);
  }

  return {
    id: `fpf-${mapping.matchId}`,
    sportId: "football",
    competitionId: mapping.competitionId,
    competition: mapping.competitionName,
    homeTeamId: mapping.homeTeamId,
    awayTeamId: mapping.awayTeamId,
    date: parsePortugueseDate(metadata[1], metadata[2]),
    venue: metadata[3].trim(),
    status: "finished",
    homeScore: Number(score[1]),
    awayScore: Number(score[2]),
    source: {
      provider: "fpf-results",
      externalId: mapping.matchId,
      url,
    },
  };
}

export const sportingBenficaTrackedMatches: FpfMatchMapping[] = [
  {
    matchId: "2346482",
    competitionId: "liga-portugal",
    competitionName: "Liga Portugal Betclic",
    homeTeamId: "benfica-senior",
    awayTeamId: "sporting-senior",
    homeAliases: ["Sl Benfica", "SL Benfica"],
    awayAliases: ["Sporting Cp", "Sporting CP"],
  },
  {
    matchId: "2346635",
    competitionId: "liga-portugal",
    competitionName: "Liga Portugal Betclic",
    homeTeamId: "sporting-senior",
    awayTeamId: "benfica-senior",
    homeAliases: ["Sporting Cp", "Sporting CP"],
    awayAliases: ["Sl Benfica", "SL Benfica"],
  },
];

export async function fetchSportingBenficaMatches() {
  const settled = await Promise.allSettled(sportingBenficaTrackedMatches.map(fetchFpfMatch));
  return settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}

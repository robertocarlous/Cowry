/**
 * Fuzzy matching of a free-text bank / mobile-money name against Paycrest's
 * institution list for a currency. Handles common abbreviations
 * ("GTBank" -> "Guaranty Trust Bank"), acronyms ("UBA" -> "United Bank for
 * Africa"), and typos ("Gauranty Trust" -> "Guaranty Trust Bank").
 */
import type { Institution } from "./paycrestClient.js";

// Words safe to strip as raw substrings without corrupting other words
// (unlike e.g. "and", which is itself a substring of "Standard").
const SUBSTRING_FILLER = ["microfinance", "financial", "finance", "nigeria", "limited", "bank", "mfb", "plc", "nig", "ltd"];

// Whole-word stopwords ignored when building an institution's acronym.
const ACRONYM_STOPWORDS = new Set(["of", "for", "the", "and", "plc", "limited", "ltd", "nigeria", "nig", "microfinance", "mfb"]);

function normalizeForSubstring(name: string): string {
  let out = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const w of [...SUBSTRING_FILLER].sort((a, b) => b.length - a.length)) {
    out = out.split(w).join("");
  }
  return out;
}

function acronymFor(name: string): string {
  return name
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .filter((w) => w.toLowerCase() === "bank" || !ACRONYM_STOPWORDS.has(w.toLowerCase()))
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = a[i - 1] === b[j - 1] ? prev[j - 1]! : 1 + Math.min(prev[j - 1]!, prev[j]!, row[j - 1]!);
    }
    prev = row;
  }
  return prev[b.length]!;
}

/**
 * Find the best matches for `query` among `institutions`. Tries, in order:
 * substring (either direction), acronym/abbreviation, then typo-tolerant
 * fuzzy matching. Returns an empty array if nothing is close enough — the
 * caller should fall back to showing the full institution list.
 */
export function findInstitutionMatches(query: string, institutions: Institution[]): Institution[] {
  const qSub = normalizeForSubstring(query);
  if (!qSub) return [];

  if (qSub.length >= 3) {
    const substringMatches = institutions.filter((inst) => {
      const iSub = normalizeForSubstring(inst.name);
      return iSub.length >= 3 && (iSub.includes(qSub) || qSub.includes(iSub));
    });
    if (substringMatches.length > 0) return substringMatches;
  }

  if (qSub.length >= 2) {
    // Exact acronym matches win outright — e.g. "UBA" should resolve to
    // "United Bank for Africa" (UBA) rather than also matching "Union Bank"
    // and "Unity Bank" (both UB) via a weaker prefix match.
    const exactAcronym = institutions.filter((inst) => acronymFor(inst.name).toLowerCase() === qSub);
    if (exactAcronym.length > 0) return exactAcronym;

    const prefixAcronym = institutions.filter((inst) => {
      const iAcr = acronymFor(inst.name).toLowerCase();
      return iAcr.length >= 2 && (iAcr.startsWith(qSub) || qSub.startsWith(iAcr));
    });
    if (prefixAcronym.length > 0) return prefixAcronym;
  }

  if (qSub.length >= 4) {
    const scored = institutions
      .map((inst) => {
        const iSub = normalizeForSubstring(inst.name);
        const dist = levenshtein(qSub, iSub);
        const maxLen = Math.max(qSub.length, iSub.length);
        return { inst, dist, maxLen };
      })
      .filter(({ dist, maxLen }) => dist <= Math.max(1, Math.floor(maxLen * 0.3)));
    if (scored.length > 0) {
      const bestDist = Math.min(...scored.map((s) => s.dist));
      return scored.filter((s) => s.dist === bestDist).map((s) => s.inst);
    }
  }

  return [];
}

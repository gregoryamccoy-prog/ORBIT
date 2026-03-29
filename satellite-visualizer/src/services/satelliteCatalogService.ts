import type { TleRecord } from "../types/satellite";
import { saveCatalog, loadCatalog } from "./tleStore";

// CelesTrak removed legacy .txt files in Dec 2024.
// Correct API: https://celestrak.org/NORAD/elements/gp.php?GROUP=<name>&FORMAT=TLE
// Rate limit: one download per 2-hour update cycle per GROUP.
// We cache each group in localStorage with a 2-hour TTL to respect that limit.
//
// Primary source: "active" group (~5000 sats, all active objects, single request).
// Fallback groups used only when "active" is rate-limited or unavailable.

const BASE = "https://celestrak.org/NORAD/elements/gp.php";
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const FETCH_TIMEOUT_MS = 30_000; // 30s — active group is a large file

// Ordered by coverage: active alone should give 5000+ sats.
const CELESTRAK_GROUPS: { group: string; purpose: string }[] = [
  { group: "active",     purpose: "" },          // ~5000 active sats — primary
  { group: "starlink",   purpose: "Communications (Starlink)" },
  { group: "visual",     purpose: "" },
  { group: "stations",   purpose: "Space Station" },
  { group: "weather",    purpose: "Weather" },
  { group: "science",    purpose: "Science" },
  { group: "GPS-OPS",    purpose: "Navigation" },
];

function inferPurpose(name: string): string {
  const n = name.toUpperCase();
  if (/ISS|TIANHE|SHENZHOU|CYGNUS|DRAGON|PROGRESS/.test(n)) return "Crewed / Supply";
  if (/STARLINK/.test(n)) return "Communications (Starlink)";
  if (/ONEWEB/.test(n)) return "Communications (OneWeb)";
  if (/GPS|NAVSTAR|GLONASS|GALILEO|BEIDOU|COMPASS/.test(n)) return "Navigation";
  if (/NOAA|GOES|METEOSAT|HIMAWARI|MSG|FENGYUN/.test(n)) return "Weather";
  if (/HUBBLE|WEBB|CHANDRA|XMM|FERMI|SPITZER/.test(n)) return "Space Telescope";
  if (/SENTINEL|LANDSAT|TERRA|AQUA|SUOMI|SPOT|WORLDVIEW|PLEIADES/.test(n))
    return "Earth Observation";
  if (/IRIDIUM|INTELSAT|SES|ARABSAT|ASTRA|SKY/.test(n)) return "Communications";
  if (/GRACE|SWOT|SMAP|AURA|CLOUDSAT|CALIPSO/.test(n)) return "Science";
  return "Unknown";
}

function parseTleText(text: string, defaultPurpose: string): TleRecord[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const records: TleRecord[] = [];
  let i = 0;

  while (i < lines.length - 2) {
    const name = lines[i];
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];

    if (line1.startsWith("1 ") && line2.startsWith("2 ")) {
      const id = line1.substring(2, 7).trim();
      records.push({
        id,
        name: name.trim(),
        line1,
        line2,
        purpose: defaultPurpose || inferPurpose(name),
      });
      i += 3;
    } else {
      i += 1;
    }
  }

  return records;
}

async function fetchCelestrakGroup(group: string, purpose: string): Promise<TleRecord[]> {
  const url = `${BASE}?GROUP=${encodeURIComponent(group)}&FORMAT=TLE`;
  const cacheKey = `tle_cache_${group}`;
  const tsKey = `tle_cache_ts_${group}`;

  // Return cached data if fresher than 2 hours
  const cachedTs = Number(localStorage.getItem(tsKey) ?? "0");
  const cachedText = localStorage.getItem(cacheKey);
  if (cachedText && Date.now() - cachedTs < CACHE_TTL_MS) {
    return parseTleText(cachedText, purpose);
  }

  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`CelesTrak ${group} returned ${response.status}`);

  const text = await response.text();
  // Sanity check: a valid TLE response starts with a name line, not HTML
  if (text.trimStart().startsWith("<")) {
    throw new Error(`CelesTrak ${group} returned HTML (rate limited or error)`);
  }

  try {
    localStorage.setItem(cacheKey, text);
    localStorage.setItem(tsKey, String(Date.now()));
  } catch {
    // localStorage quota exceeded — continue without caching
  }

  return parseTleText(text, purpose);
}

async function loadLiveCatalog(): Promise<TleRecord[]> {
  const merged = new Map<string, TleRecord>();

  for (const { group, purpose } of CELESTRAK_GROUPS) {
    try {
      const records = await fetchCelestrakGroup(group, purpose);
      for (const rec of records) {
        merged.set(rec.id, rec);
      }
      // "active" alone covers all ~5000 active sats — no need to fetch more groups
      if (group === "active" && merged.size >= CATALOG_SIZE) break;
    } catch (err) {
      console.warn(`CelesTrak group "${group}" failed:`, err);
    }
    if (merged.size >= CATALOG_SIZE) break;
  }

  if (merged.size === 0) {
    throw new Error("All CelesTrak groups failed");
  }

  return Array.from(merged.values());
}

async function loadLocalCatalog(): Promise<TleRecord[]> {
  const response = await fetch("/data/satellites.sample.json");
  if (!response.ok) {
    throw new Error(`Failed to load local catalog: ${response.status}`);
  }
  return (await response.json()) as TleRecord[];
}

const CATALOG_SIZE = 2000;

/** Call this to force a fresh download on next loadSatelliteCatalog() call. */
export function clearCatalogCache(): void {
  for (const { group } of CELESTRAK_GROUPS) {
    localStorage.removeItem(`tle_cache_${group}`);
    localStorage.removeItem(`tle_cache_ts_${group}`);
  }
}

export async function loadSatelliteCatalog(): Promise<TleRecord[]> {
  try {
    const records = await loadLiveCatalog();
    const capped = records.slice(0, CATALOG_SIZE);
    console.info(`Loaded ${capped.length} satellites from CelesTrak (capped at ${CATALOG_SIZE})`);
    // Persist to IndexedDB so we survive future rate-limits or session resets
    saveCatalog(capped);
    return capped;
  } catch (liveErr) {
    console.warn("CelesTrak unavailable, trying IndexedDB catalog:", liveErr);

    const stored = await loadCatalog();
    if (stored && stored.records.length > 25) {
      const ageMin = Math.round((Date.now() - stored.timestamp) / 60_000);
      console.info(`Using IndexedDB catalog: ${stored.records.length} satellites (${ageMin}m old)`);
      return stored.records;
    }

    console.warn("No usable IndexedDB catalog, falling back to sample data");
    return loadLocalCatalog();
  }
}

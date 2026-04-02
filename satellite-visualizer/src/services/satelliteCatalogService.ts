import type { CategoryFilter } from "../state/appStore";
import type { TleRecord } from "../types/satellite";
import { saveCatalog, loadCatalog } from "./tleStore";

// CelesTrak removed legacy .txt files in Dec 2024.
// Correct API: https://celestrak.org/NORAD/elements/gp.php?GROUP=<name>&FORMAT=TLE
// Rate limit: one download per 2-hour update cycle per GROUP.
// We cache each group in localStorage with a 2-hour TTL to respect that limit.

const BASE = "https://celestrak.org/NORAD/elements/gp.php";
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const FETCH_TIMEOUT_MS = 30_000; // 30s — active group is a large file

// All known groups (used for cache-clearing).
const ALL_GROUPS = ["active", "starlink", "stations", "weather", "science", "GPS-OPS", "glo-ops", "galileo", "beidou-2"];

// Maps each UI category to the CelesTrak group(s) to fetch. Categories that have
// no dedicated group fall back to "active" and are post-filtered by name pattern.
const CATEGORY_SOURCE: Record<CategoryFilter, { groups: string[]; nameFilter?: RegExp }> = {
  all:        { groups: ["active"] },
  crewed:     { groups: ["stations"] },
  weather:    { groups: ["weather"] },
  navigation: { groups: ["GPS-OPS", "glo-ops", "galileo", "beidou-2"] },
  starlink:   { groups: ["starlink"] },
  earthobs:   { groups: ["active"], nameFilter: /SENTINEL|LANDSAT|TERRA|AQUA|SUOMI|SPOT|WORLDVIEW|PLEIADES/i },
  science:    { groups: ["science"] },
  comms:      { groups: ["active"], nameFilter: /IRIDIUM|INTELSAT|SES|ARABSAT|ASTRA|ONEWEB/i },
};

// Patterns used when falling back to IndexedDB for a category with no live data.
const CATEGORY_FALLBACK_PATTERN: Partial<Record<CategoryFilter, RegExp>> = {
  crewed:     /ISS|TIANHE|SHENZHOU|CYGNUS|DRAGON|PROGRESS/i,
  weather:    /NOAA|GOES|METEOSAT|HIMAWARI|MSG|FENGYUN/i,
  navigation: /GPS|NAVSTAR|GLONASS|GALILEO|BEIDOU|COMPASS/i,
  starlink:   /STARLINK/i,
  earthobs:   /SENTINEL|LANDSAT|TERRA|AQUA|SUOMI|SPOT|WORLDVIEW|PLEIADES/i,
  science:    /HUBBLE|WEBB|CHANDRA|XMM|FERMI|GRACE|SWOT|SMAP|AURA|CLOUDSAT|CALIPSO/i,
  comms:      /IRIDIUM|INTELSAT|SES|ARABSAT|ASTRA|ONEWEB/i,
};

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

async function loadLocalCatalog(): Promise<TleRecord[]> {
  const response = await fetch("/data/satellites.sample.json");
  if (!response.ok) {
    throw new Error(`Failed to load local catalog: ${response.status}`);
  }
  return (await response.json()) as TleRecord[];
}

/** Call this to force a fresh download on next loadCatalogForCategory() call. */
export function clearCatalogCache(): void {
  for (const group of ALL_GROUPS) {
    localStorage.removeItem(`tle_cache_${group}`);
    localStorage.removeItem(`tle_cache_ts_${group}`);
  }
}

/**
 * Load the satellite catalog for a given category.
 * Each category maps to dedicated CelesTrak group(s) so the result contains
 * ALL satellites in that category, not a filtered slice of a larger list.
 * Results are served from the 2-hour localStorage cache when available.
 * Falls back to the IndexedDB catalog (filtered by pattern) if CelesTrak fails.
 */
export async function loadCatalogForCategory(category: CategoryFilter): Promise<TleRecord[]> {
  const { groups, nameFilter } = CATEGORY_SOURCE[category];

  try {
    const merged = new Map<string, TleRecord>();
    for (const group of groups) {
      try {
        const records = await fetchCelestrakGroup(group, "");
        for (const rec of records) {
          merged.set(rec.id, rec);
        }
      } catch (err) {
        console.warn(`CelesTrak group "${group}" failed:`, err);
      }
    }

    if (merged.size === 0) {
      throw new Error(`All CelesTrak groups failed for category "${category}"`);
    }

    let records = Array.from(merged.values());
    if (nameFilter) {
      records = records.filter((r) => nameFilter.test(r.name));
    }

    console.info(`Loaded ${records.length} satellites for category "${category}"`);

    // Persist the full "all" catalog to IndexedDB for offline fallback.
    if (category === "all") {
      saveCatalog(records);
    }

    return records;
  } catch (liveErr) {
    console.warn(`CelesTrak unavailable for category "${category}", using IndexedDB fallback:`, liveErr);

    const stored = await loadCatalog();
    if (stored && stored.records.length > 25) {
      const ageMin = Math.round((Date.now() - stored.timestamp) / 60_000);
      const pattern = CATEGORY_FALLBACK_PATTERN[category];
      const records = pattern
        ? stored.records.filter((r) => pattern.test(r.name))
        : stored.records;
      console.info(`Using IndexedDB fallback: ${records.length} satellites for "${category}" (${ageMin}m old)`);
      return records;
    }

    console.warn("No usable IndexedDB catalog, falling back to sample data");
    return loadLocalCatalog();
  }
}

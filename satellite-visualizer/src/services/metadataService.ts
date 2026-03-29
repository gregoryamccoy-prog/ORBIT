import type { SatelliteMetadata } from "../types/metadata";
import type { SatellitePosition } from "../types/satellite";

// ── CelesTrak SATCAT ──────────────────────────────────────────────────────────
// Columns (0-indexed): INTLDES, NORAD_CAT_ID, SATNAME, COUNTRY, LAUNCH, SITE,
//   DECAY, PERIOD, INCLINATION, APOGEE, PERIGEE, COMMENT, COMMENTCODE, RCSVALUE,
//   RCS_SIZE, LAUNCH_YEAR, LAUNCH_NUM, LAUNCH_PIECE, CURRENT, OBJECT_TYPE
const SATCAT_URL = "https://celestrak.org/pub/satcat.csv";

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", RU: "Russia", PRC: "China", CN: "China",
  FR: "France", DE: "Germany", GB: "United Kingdom", JP: "Japan",
  JPN: "Japan", IND: "India", IN: "India", CA: "Canada", CAN: "Canada",
  ESA: "European Space Agency", IT: "Italy", ITA: "Italy",
  ISS: "ISS Partnership", NATO: "NATO", AB: "Arab Sat. Org.",
  AUS: "Australia", ORB: "Orbcomm", BRA: "Brazil", UAE: "UAE",
  KR: "South Korea", SKOR: "South Korea", IL: "Israel", ISRA: "Israel",
  SPN: "Spain", ESP: "Spain", ARGN: "Argentina", MX: "Mexico",
  NOR: "Norway", SWE: "Sweden", NL: "Netherlands", NET: "Netherlands",
  CIS: "Russia/CIS", UK: "United Kingdom", NZ: "New Zealand",
  SEAL: "Sea Launch", GLOB: "Globalstar", IRID: "Iridium",
  FRIT: "France/Italy", EUTE: "Eutelsat", SES: "SES",
};

interface SatcatEntry {
  noradId: string;
  intlDesignator: string;
  country: string;
  launchDate: string;
  periodMin: number | undefined;
  inclinationDeg: number | undefined;
  apogeeKm: number | undefined;
  perigeeKm: number | undefined;
}

let satcatCache: Map<string, SatcatEntry> | null = null;
let satcatLoadPromise: Promise<Map<string, SatcatEntry>> | null = null;

function parseSatcatCsv(csv: string): Map<string, SatcatEntry> {
  const map = new Map<string, SatcatEntry>();
  const lines = csv.split("\n");

  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(",");
    if (cols.length < 13) continue;

    // Columns: OBJECT_NAME, OBJECT_ID, NORAD_CAT_ID, OBJECT_TYPE, OPS_STATUS_CODE,
    //   OWNER, LAUNCH_DATE, LAUNCH_SITE, DECAY_DATE, PERIOD, INCLINATION, APOGEE, PERIGEE, ...
    const intlDes = cols[1]?.trim() ?? "";      // OBJECT_ID  (e.g. "1998-067A")
    const noradId = cols[2]?.trim() ?? "";      // NORAD_CAT_ID
    const country = cols[5]?.trim() ?? "";      // OWNER
    const launch = cols[6]?.trim() ?? "";       // LAUNCH_DATE
    const period = parseFloat(cols[9] ?? "");   // PERIOD
    const inclination = parseFloat(cols[10] ?? ""); // INCLINATION
    const apogee = parseFloat(cols[11] ?? "");  // APOGEE
    const perigee = parseFloat(cols[12] ?? ""); // PERIGEE

    if (!noradId) continue;

    map.set(noradId, {
      noradId,
      intlDesignator: intlDes,
      country: COUNTRY_NAMES[country] ?? country,
      launchDate: launch,
      periodMin: isNaN(period) ? undefined : period,
      inclinationDeg: isNaN(inclination) ? undefined : inclination,
      apogeeKm: isNaN(apogee) ? undefined : apogee,
      perigeeKm: isNaN(perigee) ? undefined : perigee,
    });
  }

  return map;
}

async function getSatcat(): Promise<Map<string, SatcatEntry>> {
  if (satcatCache) return satcatCache;
  if (satcatLoadPromise) return satcatLoadPromise;

  satcatLoadPromise = fetch(SATCAT_URL, { signal: AbortSignal.timeout(10_000) })
    .then((r) => {
      if (!r.ok) throw new Error(`SATCAT fetch failed: ${r.status}`);
      return r.text();
    })
    .then((csv) => {
      const parsed = parseSatcatCsv(csv);
      satcatCache = parsed;
      satcatLoadPromise = null;
      console.info(`SATCAT loaded: ${parsed.size} entries`);
      return parsed;
    })
    .catch((err) => {
      satcatLoadPromise = null;
      console.warn("SATCAT unavailable:", err);
      return new Map<string, SatcatEntry>();
    });

  return satcatLoadPromise;
}

// Eagerly kick off SATCAT load so it arrives before users start clicking
void getSatcat();

// ── Per-satellite metadata cache ──────────────────────────────────────────────
const metadataCache = new Map<string, SatelliteMetadata>();

// Wikimedia Commons thumbnails — keyed by NORAD catalog ID (string)
// URLs verified via Wikipedia REST API (en.wikipedia.org/api/rest_v1/page/summary)
const SATELLITE_IMAGES: Record<string, string> = {
  // ── Crewed stations ───────────────────────────────────────────────────
  "25544": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/The_station_pictured_from_the_SpaceX_Crew_Dragon_1.jpg/330px-The_station_pictured_from_the_SpaceX_Crew_Dragon_1.jpg",
  "48274": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Chinese_Tiangong_Space_Station.jpg/330px-Chinese_Tiangong_Space_Station.jpg",
  // ── Space telescopes ──────────────────────────────────────────────────
  "20580": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/HST-SM4.jpeg/330px-HST-SM4.jpeg",
  "50463": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/JWST_spacecraft_model_3.png/330px-JWST_spacecraft_model_3.png",
  "25867": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Chandra_artist_illustration.jpg/330px-Chandra_artist_illustration.jpg",
  "27386": "https://upload.wikimedia.org/wikipedia/en/thumb/2/2b/XMM-Newton_insignia.png/330px-XMM-Newton_insignia.png",
  "25919": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Fermi_Gamma-ray_Space_Telescope_spacecraft_model.png/330px-Fermi_Gamma-ray_Space_Telescope_spacecraft_model.png",
  // ── Earth observation ─────────────────────────────────────────────────
  "25994": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/Terra_spacecraft_model.png/330px-Terra_spacecraft_model.png",
  "27424": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Aqua_spacecraft_model.png/330px-Aqua_spacecraft_model.png",
  "39084": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Landsat_Data_Continuity_Mission_Observatory_testing.jpg/330px-Landsat_Data_Continuity_Mission_Observatory_testing.jpg",
  "49260": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/LANDSAT-9.jpg/330px-LANDSAT-9.jpg",
  "40697": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Sentinel_2-IMG_5873-white_%28crop%29.jpg/330px-Sentinel_2-IMG_5873-white_%28crop%29.jpg",
  // ── Weather ───────────────────────────────────────────────────────────
  "33591": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/GOES-R_SPACECRAFT.jpg/330px-GOES-R_SPACECRAFT.jpg",
  "41866": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/GOES-R_SPACECRAFT.jpg/330px-GOES-R_SPACECRAFT.jpg",
  "43226": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/GOES-R_SPACECRAFT.jpg/330px-GOES-R_SPACECRAFT.jpg",
  "43013": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/JPSS-1.jpg/330px-JPSS-1.jpg",
  // ── Navigation ────────────────────────────────────────────────────────
  "32711": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/GPS24goldenSMALL.gif/330px-GPS24goldenSMALL.gif",
};

/** Return a Wikimedia thumbnail URL for well-known satellites, or undefined. */
function lookupImage(noradId: string, name: string): string | undefined {
  // Primary: exact NORAD ID match
  if (SATELLITE_IMAGES[noradId]) return SATELLITE_IMAGES[noradId];
  // Fallback: name pattern, for when ID is not yet a numeric NORAD ID
  const n = name.toUpperCase();
  if (/\bISS\b|ZARYA/.test(n))     return SATELLITE_IMAGES["25544"];
  if (/TIANHE|CSS/.test(n))         return SATELLITE_IMAGES["48274"];
  if (/HUBBLE/.test(n))             return SATELLITE_IMAGES["20580"];
  if (/WEBB|JWST/.test(n))          return SATELLITE_IMAGES["50463"];
  if (/CHANDRA/.test(n))            return SATELLITE_IMAGES["25867"];
  if (/XMM/.test(n))                return SATELLITE_IMAGES["27386"];
  if (/FERMI/.test(n))              return SATELLITE_IMAGES["25919"];
  if (/\bTERRA\b/.test(n))          return SATELLITE_IMAGES["25994"];
  if (/\bAQUA\b/.test(n))           return SATELLITE_IMAGES["27424"];
  if (/LANDSAT.?8/.test(n))         return SATELLITE_IMAGES["39084"];
  if (/LANDSAT.?9/.test(n))         return SATELLITE_IMAGES["49260"];
  if (/SENTINEL-?2A/.test(n))       return SATELLITE_IMAGES["40697"];
  if (/GOES.?16|GOES-EAST/.test(n)) return SATELLITE_IMAGES["33591"];
  if (/GOES.?18|GOES-WEST/.test(n)) return SATELLITE_IMAGES["43226"];
  if (/NOAA.?20|JPSS-1/.test(n))    return SATELLITE_IMAGES["43013"];
  return undefined;
}

// Cache for Wikipedia image lookups: null means "tried, found nothing"
const wikiImageCache = new Map<string, string | null>();

/**
 * Convert a satellite name into candidate Wikipedia article titles and try each
 * one via the Wikipedia REST summary API. Returns a thumbnail URL or undefined.
 */
async function fetchWikipediaImage(name: string): Promise<string | undefined> {
  const cacheKey = name.toUpperCase();
  if (wikiImageCache.has(cacheKey)) {
    return wikiImageCache.get(cacheKey) ?? undefined;
  }

  // Skip constellation members — they have no individual Wikipedia articles
  if (/STARLINK|ONEWEB|IRIDIUM\s*\d|GPS\s+BII|GLONASS|GALILEO|BEIDOU/i.test(name)) {
    wikiImageCache.set(cacheKey, null);
    return undefined;
  }

  // Build candidate article titles from the satellite name:
  // e.g. "NOAA 19" → ["NOAA_19", "NOAA_19_(satellite)", "NOAA_19_(spacecraft)"]
  // Strip trailing parentheticals like "(JPSS-1)" for the base title.
  const base = name
    .replace(/\s*\(.*?\)\s*/g, " ")
    .trim()
    .replace(/\s+/g, "_");
  // Title-case: "TERRA" → "Terra", "LANDSAT 8" → "Landsat_8"
  const titleCased = base.replace(/([A-Z])([A-Z]+)/g, (_, first, rest) => first + rest.toLowerCase());

  const candidates = [
    titleCased,
    `${titleCased}_(satellite)`,
    `${titleCased}_(spacecraft)`,
    base,
    `${base}_(satellite)`,
  ];

  for (const title of candidates) {
    try {
      const resp = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
        { signal: AbortSignal.timeout(5_000) }
      );
      if (!resp.ok) continue;
      const data = await resp.json() as { thumbnail?: { source?: string }; type?: string };
      // Reject disambiguation pages
      if (data.type === "disambiguation") continue;
      if (data.thumbnail?.source) {
        wikiImageCache.set(cacheKey, data.thumbnail.source);
        return data.thumbnail.source;
      }
    } catch {
      // Try next candidate
    }
  }

  wikiImageCache.set(cacheKey, null);
  return undefined;
}

function inferPurpose(name: string): string {
  const n = name.toUpperCase();
  if (/ISS|TIANHE|SHENZHOU|CYGNUS|DRAGON|PROGRESS/.test(n)) return "Crewed / Supply";
  if (/STARLINK/.test(n)) return "Communications (Starlink)";
  if (/ONEWEB/.test(n)) return "Communications (OneWeb)";
  if (/GPS|NAVSTAR|GLONASS|GALILEO|BEIDOU|COMPASS/.test(n)) return "Navigation";
  if (/NOAA|GOES|METEOSAT|HIMAWARI|MSG|FENGYUN/.test(n)) return "Weather";
  if (/HUBBLE|WEBB|CHANDRA|XMM|FERMI|SPITZER/.test(n)) return "Space Telescope";
  if (/SENTINEL|LANDSAT|TERRA|AQUA|SUOMI|SPOT|WORLDVIEW|PLEIADES/.test(n)) return "Earth Observation";
  if (/IRIDIUM|INTELSAT|SES|ARABSAT|ASTRA/.test(n)) return "Communications";
  if (/GRACE|SWOT|SMAP|AURA|CLOUDSAT|CALIPSO/.test(n)) return "Science";
  return "Unknown";
}

export async function getSatelliteMetadata(
  position: SatellitePosition,
  noradId?: string
): Promise<SatelliteMetadata> {
  const cacheKey = noradId ?? position.id;
  const cached = metadataCache.get(cacheKey);
  if (cached) return cached;

  // Try to get enriched data from SATCAT
  const satcat = await getSatcat();
  const entry = satcat.get(cacheKey) ?? satcat.get(position.id);
  const resolvedNoradId = entry?.noradId ?? position.id;

  const imageUrl =
    lookupImage(resolvedNoradId, position.name) ??
    (await fetchWikipediaImage(position.name));

  const metadata: SatelliteMetadata = {
    id: position.id,
    name: position.name,
    altitudeKm: Number(position.altitudeKm.toFixed(1)),
    speedKps: Number(position.speedKps.toFixed(2)),
    purpose: inferPurpose(position.name),
    noradId: resolvedNoradId,
    intlDesignator: entry?.intlDesignator,
    country: entry?.country,
    launchDate: entry?.launchDate,
    periodMin: entry?.periodMin !== undefined ? Number(entry.periodMin.toFixed(1)) : undefined,
    inclinationDeg:
      entry?.inclinationDeg !== undefined ? Number(entry.inclinationDeg.toFixed(2)) : undefined,
    apogeeKm: entry?.apogeeKm !== undefined ? Math.round(entry.apogeeKm) : undefined,
    perigeeKm: entry?.perigeeKm !== undefined ? Math.round(entry.perigeeKm) : undefined,
    imageUrl,
  };

  metadataCache.set(cacheKey, metadata);
  return metadata;
}

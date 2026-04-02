# ORBIT — Satellite Visualizer

Real-time 3D satellite tracking on a CesiumJS globe.  
Loads the **full live satellite catalog** from CelesTrak (category-aware), propagates their orbits using SGP4, and renders them on an interactive Earth with category colors, click-to-inspect metadata, live Wikipedia images, and an orbit track.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [User Guide](#user-guide)
3. [Theory of Operation](#theory-of-operation)
4. [Data Pipeline](#data-pipeline)
5. [Code Map](#code-map)
6. [Configuration Reference](#configuration-reference)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Prerequisites

- **Node.js 22+** (managed via [nvm](https://github.com/nvm-sh/nvm))
- **npm** (bundled with Node)
- Internet access on first run (to fetch TLE data from CelesTrak)

### Install & run

```bash
# 1. Activate nvm (if not already in your shell profile)
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"

# 2. Install dependencies (first time only)
cd /home/gregory/CODE/ORBIT/satellite-visualizer
npm install

# 3. Start the development server
npm run dev

# or to expose on your local network (accessible from other devices):
npm run dev -- --host
```

The app will be available at **http://localhost:5173**

### Production build

```bash
npm run build       # output goes to satellite-visualizer/dist/
npm run preview     # serve the production build locally
```

---

## User Guide

### The Globe

The main view is a 3D Earth rendered by CesiumJS with:
- **Day/night lighting** based on real Sun position
- **Satellite dots** color-coded by category (see legend in the right panel)
- **Hover tooltip** — move the mouse over any dot to see its name
- **Click to select** — click a satellite dot to open its detail panel

### Control Panel (top bar)

| Control | Description |
|---|---|
| **Show `[n]`** | Number input — how many satellites to propagate and render (1–2,000) |
| **`n / N`** count | Currently rendered / total in catalog |
| **Search box** | Filter by name substring (case-insensitive, e.g. `ISS`, `GOES`, `STARLINK-123`) |
| **Orbital** | Fly camera to a high orbital overview (~20,000 km altitude) |
| **Crestwood** | Fly camera to a ground observer view over Crestwood, KY |
| **Labels** | Toggle satellite name labels on/off |

### Category Filter Buttons (second row)

Each button triggers a **fresh catalog load** from the dedicated CelesTrak group for that category, so you always see every satellite in that class — not just the subset that happened to appear in a larger mixed download.

| Button | CelesTrak source | Satellites shown |
|---|---|---|
| **All** | `active` group | All currently active tracked objects (~6,000+) |
| **Crewed** | `stations` group | ISS, Tianhe, Shenzhou, Dragon, Cygnus, Progress |
| **Weather** | `weather` group | NOAA, GOES, Meteosat, Himawari, Fengyun |
| **Nav** | `GPS-OPS` + `glo-ops` + `galileo` + `beidou-2` groups | Full GPS, GLONASS, Galileo, BeiDou constellations |
| **Starlink** | `starlink` group | All SpaceX Starlink satellites |
| **Earth Obs** | `active` (name-filtered) | Sentinel, Landsat, Terra, Aqua, Suomi NPP, Spot |
| **Science** | `science` group | Hubble, JWST, Chandra, XMM, Fermi, GRACE, SWOT |
| **Comms** | `active` (name-filtered) | Iridium, Intelsat, SES, OneWeb |

Filters combine: the name search applies **within** the active category's loaded set.

### Satellite Colors

| Color | Category |
|---|---|
| 🟠 Orange `#ff9900` | Crewed / supply ships |
| 🟡 Yellow `#ffee44` | Weather |
| 🟢 Green `#44ff88` | Navigation |
| 🔵 Blue `#7799ff` | Starlink |
| 🩵 Teal `#44eeff` | Earth observation |
| 🟣 Magenta `#ff44ff` | Space telescopes |
| 🔵 Cyan | Everything else |
| 🟧 Bright orange | Currently selected satellite |

### Info Panel (right side)

When no satellite is selected, shows the color legend.

When a satellite is selected, shows:
- **Name** and **NORAD ID**
- **International Designator** (launch year + sequence)
- **Purpose / category**
- **Country** of origin
- **Launch date**
- **Current altitude** and **speed**
- **Apogee / perigee / orbital period / inclination** (from SATCAT)
- **Wikipedia description** and **photo** (where available)
- Orbit track drawn on the globe (yellow line, ±50 min window)

Click the selected satellite again, or click empty space, to deselect.

### Position Updates

Satellite positions are recalculated every **60 seconds** using SGP4 propagation against the current system clock. The globe updates automatically — no manual refresh needed.

---

## Theory of Operation

### Two-Line Element (TLE) Sets

A TLE is a standardized format storing Keplerian orbital elements plus drag/decay coefficients for one satellite at one epoch:

```
ISS (ZARYA)
1 25544U 98067A   24082.50000000  .00005000  00000-0  10000-3 0  9991
2 25544  51.6400 120.0000 0001000  30.0000 330.0000 15.50000000 12345
```

- **Line 1** contains NORAD catalogue number, epoch, B* drag term, and mean motion derivatives
- **Line 2** contains inclination, RAAN, eccentricity, argument of perigee, mean anomaly, and mean motion

TLEs are valid for propagation for roughly **days to weeks** depending on orbit altitude — LEO satellites degrade faster due to atmospheric drag.

### SGP4 Propagation

ORBIT uses [satellite.js](https://github.com/shashwatak/satellite-js) which implements the **SGP4/SDP4** algorithm — the same model used by NORAD/Space-Track.

Given a TLE and a target `Date`, SGP4 computes:
1. **ECI position** (Earth-Centered Inertial, km) — inertial frame fixed to stars
2. **ECI velocity** (km/s)

Then:
3. **GMST** (Greenwich Mean Sidereal Time) rotates ECI → ECEF (Earth-fixed frame)
4. **ECEF → geodetic** gives latitude, longitude, altitude

This runs for every satellite in the render set once per 60-second tick.

### Orbit Track

When a satellite is selected, `computeOrbitTrack()` samples SGP4 at 2-minute intervals over a ±50 minute window (100 minutes total, ~1 full LEO orbit). The resulting lat/lon/alt points are drawn as a yellow polyline on the globe.

---

## Data Pipeline

```
User selects a category filter (or app loads with "all")
         │
         ▼
   loadCatalogForCategory(category)
    • Looks up the CelesTrak group(s) for that category
    • For each group: calls fetchCelestrakGroup()
         │
         ▼
   fetchCelestrakGroup(group)
    • Checks localStorage first (2-hour TTL per group)
    • Validates response is TLE text (not HTML rate-limit page)
    • Stores raw TLE text to localStorage on success
         │
         ▼
   parseTleText()
    • Splits into 3-line groups (name + line1 + line2)
    • Infers purpose from satellite name
    • Returns TleRecord[]
         │
         ▼
   Merges groups (dedup by NORAD ID)
    • Applies optional name-pattern filter for categories without
      a dedicated group (earthobs, comms)
    • Saves "all" result to IndexedDB (long-lived offline fallback)
    • Sets catalog in Zustand store
         │
         ▼
   useSatelliteUpdater (every 60s)
    • Applies name search filter
    • Slices to satelliteLimit
    • Runs SGP4 on each → SatellitePosition[]
    • Sets renderedIds + positions in store
         │
         ▼
   CesiumGlobe
    • Diffs entity map (add/update/remove)
    • Places Cesium point entity per satellite
    • Handles hover (tooltip) and click (metadata load)
```

### Fallback Chain

If CelesTrak is unavailable (rate-limited, network error, timeout):

```
1. IndexedDB  —  last successfully fetched "all" catalog, filtered by name
                 pattern to match the requested category (any age, size > 25)
2. /public/data/satellites.sample.json  —  25 hardcoded reference satellites
```

### Metadata Enrichment

When a satellite is clicked, `getSatelliteMetadata()` enriches the TLE record:

1. **CelesTrak SATCAT CSV** (`celestrak.org/pub/satcat.csv`) — fetched once per session, cached in memory. Provides country, launch date, apogee, perigee, period, inclination, international designator.
2. **Hardcoded image map** — 16 well-known satellites with verified Wikipedia thumbnail URLs (ISS, Hubble, JWST, Landsat 8, GOES-16, etc.)
3. **Name-pattern image fallback** — regex matches common names to known image URLs
4. **Wikipedia REST API** — live fallback (`en.wikipedia.org/api/rest_v1/page/summary/{name}`) for any satellite without a hardcoded image. Tries up to 5 article title candidates. Skips constellation members (Starlink, GPS, Galileo blocks). Results are cached in-memory.

---

## Code Map

```
satellite-visualizer/
├── public/
│   └── data/
│       └── satellites.sample.json    25-entry fallback catalog (real NORAD IDs)
│
├── src/
│   ├── app/
│   │   ├── App.tsx                   Root component — loads catalog, mounts layout
│   │   └── App.css                   Global styles, layout, control panel, info panel
│   │
│   ├── components/
│   │   ├── CesiumGlobe.tsx           CesiumJS viewer, entity diffing, click + hover handlers
│   │   ├── ControlPanel.tsx          Top bar — limit input, search, view buttons, category filters
│   │   ├── InfoPanel.tsx             Right sidebar — legend or selected satellite detail
│   │   └── LoadingOverlay.tsx        Full-screen spinner shown while catalog loads
│   │
│   ├── config/
│   │   └── constants.ts              CATALOG_SIZE=2000, MAX_SATELLITE_LIMIT=2000, refresh rate, home coords
│   │
│   ├── hooks/
│   │   └── useSatelliteUpdater.ts    60s interval — applies name search, slices to limit, SGP4 → positions
│   │
│   ├── services/
│   │   ├── satelliteCatalogService.ts  Per-category CelesTrak fetch, localStorage TLE cache, IndexedDB fallback
│   │   ├── tleStore.ts                 IndexedDB persistence — saveCatalog() / loadCatalog()
│   │   ├── metadataService.ts          SATCAT CSV enrichment, image lookup, Wikipedia fallback
│   │   ├── orbitService.ts             SGP4 wrappers — computeSatellitePosition, computeOrbitTrack
│   │   └── cameraService.ts            flyToOrbitalView, flyToEarthSideObserverView (Crestwood KY)
│   │
│   ├── state/
│   │   └── appStore.ts               Zustand store — catalog, renderedIds, positions, filters, selection
│   │
│   └── types/
│       ├── satellite.ts              TleRecord, SatellitePosition, SelectedSatellite
│       ├── metadata.ts               SatelliteMetadata (all enriched fields)
│       └── view.ts                   ViewMode = "orbital" | "earthside"
│
├── vite.config.ts                    Vite + React + vite-plugin-cesium, target: esnext
├── tsconfig.app.json
└── package.json
```

### Key Data Types

```ts
// A parsed TLE record — the atomic unit of the catalog
interface TleRecord {
  id: string;        // NORAD catalogue number (5-digit string)
  name: string;      // Satellite name from TLE header line
  line1: string;     // TLE line 1 (69 chars)
  line2: string;     // TLE line 2 (69 chars)
  purpose?: string;  // Inferred category string
}

// Computed position after SGP4 propagation
interface SatellitePosition {
  id: string;
  name: string;
  latitudeDeg: number;
  longitudeDeg: number;
  altitudeKm: number;
  speedKps: number;
}

// All metadata shown in the info panel after a click
interface SatelliteMetadata {
  id: string;  name: string;
  altitudeKm?: number;  speedKps?: number;
  purpose?: string;     imageUrl?: string;
  description?: string; country?: string;
  launchDate?: string;  periodMin?: number;
  inclinationDeg?: number; apogeeKm?: number;
  perigeeKm?: number;   noradId?: string;
  intlDesignator?: string;
}
```

### Zustand Store Fields

| Field | Type | Description |
|---|---|---|
| `catalog` | `TleRecord[]` | Catalog for the active category — reloaded on category change |
| `renderedIds` | `Set<string>` | NORAD IDs of satellites currently propagated and drawn |
| `positions` | `SatellitePosition[]` | Current propagated positions (updated every 60s) |
| `satelliteLimit` | `number` | How many to render (UI slider, 1–2,000) |
| `categoryFilter` | `CategoryFilter` | Active category button selection |
| `nameFilter` | `string` | Search box text |
| `showLabels` | `boolean` | Whether name labels are shown on globe |
| `viewMode` | `"orbital" \| "earthside"` | Which camera preset is active |
| `selectedSatellite` | `SelectedSatellite \| null` | Clicked satellite ID + name |
| `selectedMetadata` | `SatelliteMetadata \| null` | Enriched data for selected satellite |
| `isCatalogLoading` | `boolean` | True while initial catalog fetch is in progress |
| `isMetadataLoading` | `boolean` | True while SATCAT/Wikipedia lookup is in progress |

---

## Configuration Reference

### `src/config/constants.ts`

| Constant | Default | Description |
|---|---|---|
| `MAX_SATELLITE_LIMIT` | `2000` | Max value of the "Show" input |
| `MIN_SATELLITE_LIMIT` | `1` | Min value of the "Show" input |
| `DEFAULT_SATELLITE_LIMIT` | `100` | Initial value on first load |
| `POSITION_REFRESH_MS` | `60000` | SGP4 recalculation interval (ms) |
| `CRESTWOOD_LAT` | `38.3267` | Home observer latitude |
| `CRESTWOOD_LON` | `-85.4725` | Home observer longitude |

### CelesTrak Groups (in `satelliteCatalogService.ts`)

Each category maps to one or more dedicated groups. Groups are cached individually in localStorage for 2 hours, so switching categories after first load is instant.

| Category | Groups fetched | Post-filter |
|---|---|---|
| `all` | `active` | none |
| `crewed` | `stations` | none |
| `weather` | `weather` | none |
| `navigation` | `GPS-OPS`, `glo-ops`, `galileo`, `beidou-2` | none |
| `starlink` | `starlink` | none |
| `earthobs` | `active` | name regex |
| `science` | `science` | none |
| `comms` | `active` | name regex |

### Cache Strategy

| Layer | Storage | TTL | Purpose |
|---|---|---|---|
| TLE raw text | `localStorage` | 2 hours | Respects CelesTrak's one-download-per-update-cycle rate limit |
| Parsed catalog | `IndexedDB` | Indefinite | Survives session resets; used when live fetch fails |
| SATCAT CSV | In-memory | Session | Enrichment data (country, orbit params) |
| Wikipedia images | In-memory Map | Session | Prevents re-fetching per-satellite |

### Clearing the cache (browser console)

```js
// Force fresh CelesTrak download for all groups on next load:
clearCatalogCache();   // exported from satelliteCatalogService

// Or clear everything:
localStorage.clear();
```

---

## Troubleshooting

### Only 25 satellites showing

The catalog fell back to `satellites.sample.json`. Possible causes:
- CelesTrak is rate-limiting (you fetched within the last 2 hours from the same IP)
- The TLE download timed out (30s limit — slow connection)
- IndexedDB is empty (first run on a new browser profile)

**Fix:** Wait 2 hours and reload, or run `clearCatalogCache()` in the browser console then reload. On a slow connection, try a wired/faster network for the initial fetch.

### Satellites not moving

Positions update every 60 seconds. If TLEs are stale (days old), propagated positions may drift slightly from actual positions — this is expected with old TLE epochs. The app will fetch fresh TLEs on the next 2-hour cache expiry.

### Dev server won't start (port in use)

```bash
# Kill anything holding port 5173
fuser -k 5173/tcp

# Then restart
npm run dev
```

### Wikipedia images not loading

The Wikipedia REST API has occasional outages. The image section of the panel will simply be blank — all other metadata still shows. Results are cached per session so a failed lookup won't retry until the next page load.

### Build errors after pulling from git

```bash
cd satellite-visualizer
npm install   # re-sync node_modules if package.json changed
npm run build
```

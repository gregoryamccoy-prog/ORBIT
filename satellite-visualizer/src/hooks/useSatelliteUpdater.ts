import { useEffect } from "react";
import { POSITION_REFRESH_MS } from "../config/constants";
import { computeSatellitePositions } from "../services/orbitService";
import { useAppStore } from "../state/appStore";
import type { CategoryFilter } from "../state/appStore";
import type { TleRecord } from "../types/satellite";

const CATEGORY_PATTERNS: Record<Exclude<CategoryFilter, "all">, RegExp> = {
  crewed:     /ISS|TIANHE|SHENZHOU|CYGNUS|DRAGON|PROGRESS/i,
  weather:    /NOAA|GOES|METEOSAT|HIMAWARI|MSG|FENGYUN/i,
  navigation: /GPS|NAVSTAR|GLONASS|GALILEO|BEIDOU|COMPASS/i,
  starlink:   /STARLINK/i,
  earthobs:   /SENTINEL|LANDSAT|TERRA|AQUA|SUOMI|SPOT|WORLDVIEW|PLEIADES/i,
  science:    /HUBBLE|WEBB|CHANDRA|XMM|FERMI|GRACE|SWOT|SMAP|AURA|CLOUDSAT|CALIPSO/i,
  comms:      /IRIDIUM|INTELSAT|SES|ARABSAT|ASTRA|ONEWEB/i,
};

function filterByCategory(records: TleRecord[], filter: CategoryFilter): TleRecord[] {
  if (filter === "all") return records;
  const pattern = CATEGORY_PATTERNS[filter];
  return records.filter((r) => pattern.test(r.name));
}

function filterByName(records: TleRecord[], name: string): TleRecord[] {
  const trimmed = name.trim();
  if (!trimmed) return records;
  const upper = trimmed.toUpperCase();
  return records.filter((r) => r.name.toUpperCase().includes(upper));
}

export function useSatelliteUpdater(): void {
  const catalog = useAppStore((s) => s.catalog);
  const satelliteLimit = useAppStore((s) => s.satelliteLimit);
  const categoryFilter = useAppStore((s) => s.categoryFilter);
  const nameFilter = useAppStore((s) => s.nameFilter);
  const setRenderedIds = useAppStore((s) => s.setRenderedIds);
  const setPositions = useAppStore((s) => s.setPositions);

  useEffect(() => {
    function updateNow(): void {
      const byCat = filterByCategory(catalog, categoryFilter);
      const byName = filterByName(byCat, nameFilter);
      const activeRecords = byName.slice(0, satelliteLimit);
      setRenderedIds(new Set(activeRecords.map((r) => r.id)));
      const positions = computeSatellitePositions(activeRecords, new Date());
      setPositions(positions);
    }

    updateNow();
    const timer = window.setInterval(updateNow, POSITION_REFRESH_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [catalog, satelliteLimit, categoryFilter, nameFilter, setRenderedIds, setPositions]);
}

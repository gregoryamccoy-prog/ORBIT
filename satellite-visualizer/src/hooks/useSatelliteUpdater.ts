import { useEffect } from "react";
import { POSITION_REFRESH_MS } from "../config/constants";
import { computeSatellitePositions } from "../services/orbitService";
import { useAppStore } from "../state/appStore";
import type { TleRecord } from "../types/satellite";

function filterByName(records: TleRecord[], name: string): TleRecord[] {
  const trimmed = name.trim();
  if (!trimmed) return records;
  const upper = trimmed.toUpperCase();
  return records.filter((r) => r.name.toUpperCase().includes(upper));
}

export function useSatelliteUpdater(): void {
  const catalog = useAppStore((s) => s.catalog);
  const satelliteLimit = useAppStore((s) => s.satelliteLimit);
  const nameFilter = useAppStore((s) => s.nameFilter);
  const setRenderedIds = useAppStore((s) => s.setRenderedIds);
  const setPositions = useAppStore((s) => s.setPositions);

  useEffect(() => {
    function updateNow(): void {
      const byName = filterByName(catalog, nameFilter);
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
  }, [catalog, satelliteLimit, nameFilter, setRenderedIds, setPositions]);
}

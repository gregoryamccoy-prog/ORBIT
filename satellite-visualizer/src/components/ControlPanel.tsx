import type { ChangeEvent, ReactElement } from "react";
import { MAX_SATELLITE_LIMIT, MIN_SATELLITE_LIMIT } from "../config/constants";
import { useAppStore } from "../state/appStore";
import type { CategoryFilter } from "../state/appStore";

const FILTERS: { id: CategoryFilter; label: string }[] = [
  { id: "all",        label: "All" },
  { id: "crewed",     label: "Crewed" },
  { id: "weather",    label: "Weather" },
  { id: "navigation", label: "Nav" },
  { id: "starlink",   label: "Starlink" },
  { id: "earthobs",   label: "Earth Obs" },
  { id: "science",    label: "Science" },
  { id: "comms",      label: "Comms" },
];

export function ControlPanel(): ReactElement {
  const satelliteLimit = useAppStore((s) => s.satelliteLimit);
  const setSatelliteLimit = useAppStore((s) => s.setSatelliteLimit);
  const viewMode = useAppStore((s) => s.viewMode);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const categoryFilter = useAppStore((s) => s.categoryFilter);
  const setCategoryFilter = useAppStore((s) => s.setCategoryFilter);
  const showLabels = useAppStore((s) => s.showLabels);
  const setShowLabels = useAppStore((s) => s.setShowLabels);
  const nameFilter = useAppStore((s) => s.nameFilter);
  const setNameFilter = useAppStore((s) => s.setNameFilter);
  const totalInCatalog = useAppStore((s) => s.catalog.length);
  const rendered = useAppStore((s) => s.renderedIds.size);

  function handleLimitChange(event: ChangeEvent<HTMLInputElement>): void {
    const raw = Number(event.target.value);
    if (Number.isNaN(raw)) return;
    const clamped = Math.max(MIN_SATELLITE_LIMIT, Math.min(MAX_SATELLITE_LIMIT, Math.floor(raw)));
    setSatelliteLimit(clamped);
  }

  return (
    <div className="control-panel">
      <div className="panel-row">
        <span className="panel-title">ORBIT</span>

        <label className="count-label">
          Show:
          <input
            type="number"
            min={MIN_SATELLITE_LIMIT}
            max={MAX_SATELLITE_LIMIT}
            value={satelliteLimit}
            onChange={handleLimitChange}
          />
        </label>

        {totalInCatalog > 0 && (
          <span className="catalog-count">{rendered} / {totalInCatalog}</span>
        )}

        <div className="panel-divider" />

        <input
          type="search"
          className="name-search"
          placeholder="Search…"
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
          aria-label="Filter satellites by name"
        />

        <div className="panel-divider" />

        <button
          type="button"
          className={viewMode === "orbital" ? "active" : ""}
          onClick={() => setViewMode("orbital")}
        >
          Orbital
        </button>
        <button
          type="button"
          className={viewMode === "earthside" ? "active" : ""}
          onClick={() => setViewMode("earthside")}
        >
          Crestwood
        </button>

        <div className="panel-divider" />

        <button
          type="button"
          className={showLabels ? "active" : ""}
          onClick={() => setShowLabels(!showLabels)}
          title="Toggle satellite name labels"
        >
          Labels
        </button>
      </div>

      <div className="panel-row filter-row">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={categoryFilter === f.id ? "active" : ""}
            onClick={() => setCategoryFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}


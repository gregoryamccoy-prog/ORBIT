import type { ReactElement } from "react";
import { useAppStore } from "../state/appStore";
import type { SatelliteMetadata } from "../types/metadata";

const LEGEND: { color: string; label: string }[] = [
  { color: "#ff9900", label: "Crewed / Supply" },
  { color: "#ffee44", label: "Weather" },
  { color: "#44ff88", label: "Navigation" },
  { color: "#7799ff", label: "Starlink" },
  { color: "#44eeff", label: "Earth Observation" },
  { color: "#ff44ff", label: "Space Telescope" },
  { color: "#00ffff", label: "Other" },
];

function Row({ label, value }: { label: string; value: string | number | undefined }): ReactElement | null {
  if (value === undefined || value === null || value === "") return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function MetadataRows({ m }: { m: SatelliteMetadata }): ReactElement {
  return (
    <dl>
      <Row label="NORAD ID" value={m.noradId} />
      <Row label="Intl. Designator" value={m.intlDesignator} />
      <Row label="Purpose" value={m.purpose} />
      <Row label="Country" value={m.country} />
      <Row label="Launched" value={m.launchDate} />
      <Row label="Altitude" value={m.altitudeKm != null ? `${m.altitudeKm} km` : undefined} />
      <Row label="Speed" value={m.speedKps != null ? `${m.speedKps} km/s` : undefined} />
      <Row label="Apogee" value={m.apogeeKm != null ? `${m.apogeeKm} km` : undefined} />
      <Row label="Perigee" value={m.perigeeKm != null ? `${m.perigeeKm} km` : undefined} />
      <Row label="Period" value={m.periodMin != null ? `${m.periodMin} min` : undefined} />
      <Row label="Inclination" value={m.inclinationDeg != null ? `${m.inclinationDeg}°` : undefined} />
      {m.description && <Row label="Description" value={m.description} />}
    </dl>
  );
}

export function InfoPanel(): ReactElement | null {
  const selectedSatellite = useAppStore((s) => s.selectedSatellite);
  const metadata = useAppStore((s) => s.selectedMetadata);
  const isLoading = useAppStore((s) => s.isMetadataLoading);

  if (!selectedSatellite) {
    return (
      <aside className="info-panel legend-only">
        <p className="legend-title">Color key</p>
        <ul className="legend">
          {LEGEND.map((entry) => (
            <li key={entry.label}>
              <span className="legend-dot" style={{ background: entry.color }} />
              {entry.label}
            </li>
          ))}
        </ul>
        <p className="panel-hint">Click a satellite to inspect it.</p>
      </aside>
    );
  }

  return (
    <aside className="info-panel">
      <h2>{selectedSatellite.name}</h2>

      {isLoading && <p className="loading-text">Loading&hellip;</p>}
      {!isLoading && metadata && <MetadataRows m={metadata} />}
      {!isLoading && metadata?.imageUrl && (
        <img src={metadata.imageUrl} alt={metadata.name} className="sat-image" />
      )}

      <p className="panel-hint">Click again or click space to deselect.</p>
    </aside>
  );
}



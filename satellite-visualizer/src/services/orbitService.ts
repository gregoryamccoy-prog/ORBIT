import * as satellite from "satellite.js";
import type { TleRecord, SatellitePosition } from "../types/satellite";

function safeDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function computeSatellitePosition(record: TleRecord, now: Date): SatellitePosition | null {
  try {
    const satrec = satellite.twoline2satrec(record.line1, record.line2);
    const pv = satellite.propagate(satrec, now);

    if (!pv.position || !pv.velocity) {
      return null;
    }

    const gmst = satellite.gstime(now);
    const geodetic = satellite.eciToGeodetic(pv.position as satellite.EciVec3<number>, gmst);

    const latitudeDeg = safeDegrees(geodetic.latitude);
    const longitudeDeg = safeDegrees(geodetic.longitude);
    const altitudeKm = geodetic.height;

    const vel = pv.velocity as satellite.EciVec3<number>;
    const speedKps = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);

    return {
      id: record.id,
      name: record.name,
      latitudeDeg,
      longitudeDeg,
      altitudeKm,
      speedKps,
    };
  } catch (error) {
    console.warn(`Failed to compute position for satellite ${record.name}`, error);
    return null;
  }
}

export function computeSatellitePositions(records: TleRecord[], now: Date): SatellitePosition[] {
  return records
    .map((record) => computeSatellitePosition(record, now))
    .filter((item): item is SatellitePosition => item !== null);
}

/**
 * Build a propagated orbit track for one orbit period centred on `now`.
 * Samples every 2 minutes across a full ~90-minute LEO pass window.
 */
export function computeOrbitTrack(
  record: TleRecord,
  now: Date,
  stepMinutes = 2,
  windowMinutes = 100
): { latitudeDeg: number; longitudeDeg: number; altitudeKm: number }[] {
  const points: { latitudeDeg: number; longitudeDeg: number; altitudeKm: number }[] = [];
  const satrec = satellite.twoline2satrec(record.line1, record.line2);

  for (let offset = -windowMinutes / 2; offset <= windowMinutes / 2; offset += stepMinutes) {
    const t = new Date(now.getTime() + offset * 60_000);
    try {
      const pv = satellite.propagate(satrec, t);
      if (!pv.position) continue;
      const gmst = satellite.gstime(t);
      const geo = satellite.eciToGeodetic(pv.position as satellite.EciVec3<number>, gmst);
      points.push({
        latitudeDeg: safeDegrees(geo.latitude),
        longitudeDeg: safeDegrees(geo.longitude),
        altitudeKm: geo.height,
      });
    } catch {
      // skip bad propagation steps
    }
  }

  return points;
}

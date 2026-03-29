export interface SatelliteMetadata {
  id: string;
  name: string;
  altitudeKm?: number;
  speedKps?: number;
  purpose?: string;
  imageUrl?: string;
  description?: string;
  // enriched from CelesTrak SATCAT
  country?: string;
  launchDate?: string;
  periodMin?: number;
  inclinationDeg?: number;
  apogeeKm?: number;
  perigeeKm?: number;
  noradId?: string;
  intlDesignator?: string;
}

export interface TleRecord {
  id: string;
  name: string;
  line1: string;
  line2: string;
  purpose?: string;
}

export interface SatellitePosition {
  id: string;
  name: string;
  latitudeDeg: number;
  longitudeDeg: number;
  altitudeKm: number;
  speedKps: number;
}

export interface SelectedSatellite {
  id: string;
  name: string;
}

import { create } from "zustand";
import type { SatelliteMetadata } from "../types/metadata";
import type { SatellitePosition, SelectedSatellite, TleRecord } from "../types/satellite";
import type { ViewMode } from "../types/view";

export type CategoryFilter =
  | "all"
  | "crewed"
  | "weather"
  | "navigation"
  | "starlink"
  | "earthobs"
  | "science"
  | "comms";

interface AppState {
  viewMode: ViewMode;
  satelliteLimit: number;
  categoryFilter: CategoryFilter;
  showLabels: boolean;
  nameFilter: string;
  /** Full loaded catalog — up to CATALOG_SIZE TLE records, immutable after load. */
  catalog: TleRecord[];
  /** IDs of satellites currently being propagated and rendered. */
  renderedIds: Set<string>;
  positions: SatellitePosition[];
  selectedSatellite: SelectedSatellite | null;
  selectedMetadata: SatelliteMetadata | null;
  isMetadataLoading: boolean;
  isCatalogLoading: boolean;

  setViewMode: (mode: ViewMode) => void;
  setSatelliteLimit: (limit: number) => void;
  setCategoryFilter: (filter: CategoryFilter) => void;
  setShowLabels: (show: boolean) => void;
  setNameFilter: (filter: string) => void;
  setCatalog: (records: TleRecord[]) => void;
  setRenderedIds: (ids: Set<string>) => void;
  setPositions: (positions: SatellitePosition[]) => void;
  setSelectedSatellite: (satellite: SelectedSatellite | null) => void;
  setSelectedMetadata: (metadata: SatelliteMetadata | null) => void;
  setIsMetadataLoading: (loading: boolean) => void;
  setIsCatalogLoading: (loading: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  viewMode: "orbital",
  satelliteLimit: 100,
  categoryFilter: "all",
  showLabels: false,
  nameFilter: "",
  catalog: [],
  renderedIds: new Set(),
  positions: [],
  selectedSatellite: null,
  selectedMetadata: null,
  isMetadataLoading: false,
  isCatalogLoading: false,

  setViewMode: (viewMode) => set({ viewMode }),
  setSatelliteLimit: (satelliteLimit) => set({ satelliteLimit }),
  setCategoryFilter: (categoryFilter) => set({ categoryFilter }),
  setShowLabels: (showLabels) => set({ showLabels }),
  setNameFilter: (nameFilter) => set({ nameFilter }),
  setCatalog: (catalog) => set({ catalog }),
  setRenderedIds: (renderedIds) => set({ renderedIds }),
  setPositions: (positions) => set({ positions }),
  setSelectedSatellite: (selectedSatellite) => set({ selectedSatellite }),
  setSelectedMetadata: (selectedMetadata) => set({ selectedMetadata }),
  setIsMetadataLoading: (isMetadataLoading) => set({ isMetadataLoading }),
  setIsCatalogLoading: (isCatalogLoading) => set({ isCatalogLoading }),
}));

import { useEffect } from "react";
import type { ReactElement } from "react";
import { CesiumGlobe } from "../components/CesiumGlobe";
import { ControlPanel } from "../components/ControlPanel";
import { InfoPanel } from "../components/InfoPanel";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { loadCatalogForCategory } from "../services/satelliteCatalogService";
import { useAppStore } from "../state/appStore";
import { useSatelliteUpdater } from "../hooks/useSatelliteUpdater";
import "./App.css";

export default function App(): ReactElement {
  const setCatalog = useAppStore((s) => s.setCatalog);
  const setIsCatalogLoading = useAppStore((s) => s.setIsCatalogLoading);
  const categoryFilter = useAppStore((s) => s.categoryFilter);

  useSatelliteUpdater();

  useEffect(() => {
    setIsCatalogLoading(true);
    setCatalog([]);
    loadCatalogForCategory(categoryFilter)
      .then((records) => setCatalog(records))
      .catch((err) => console.error("Failed to load satellite catalog", err))
      .finally(() => setIsCatalogLoading(false));
  }, [categoryFilter, setCatalog, setIsCatalogLoading]);

  return (
    <div className="app-shell">
      <CesiumGlobe />
      <ControlPanel />
      <InfoPanel />
      <LoadingOverlay />
    </div>
  );
}

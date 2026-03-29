import type { ReactElement } from "react";
import { useAppStore } from "../state/appStore";

export function LoadingOverlay(): ReactElement | null {
  const isCatalogLoading = useAppStore((s) => s.isCatalogLoading);
  if (!isCatalogLoading) return null;

  return (
    <div className="loading-overlay">
      <div className="loading-spinner" />
      <p>Loading satellite catalog&hellip;</p>
    </div>
  );
}

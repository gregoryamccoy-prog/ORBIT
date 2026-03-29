import { useEffect, useRef } from "react";
import type { ReactElement } from "react";
import * as Cesium from "cesium";
import { flyToEarthSideObserverView, flyToOrbitalView } from "../services/cameraService";
import { getSatelliteMetadata } from "../services/metadataService";
import { computeOrbitTrack } from "../services/orbitService";
import { useAppStore } from "../state/appStore";
import type { SatellitePosition, TleRecord } from "../types/satellite";

// ── Colour by satellite category ─────────────────────────────────────────────
const CATEGORY_COLORS: [RegExp, string][] = [
  [/ISS|TIANHE|SHENZHOU|CYGNUS|DRAGON|PROGRESS/, "#ff9900"],   // orange  – crewed
  [/STARLINK/, "#7799ff"],                                       // blue    – Starlink
  [/ONEWEB/, "#aaddff"],                                        // lt-blue – OneWeb
  [/GPS|NAVSTAR|GLONASS|GALILEO|BEIDOU/, "#44ff88"],            // green   – nav
  [/NOAA|GOES|METEOSAT|HIMAWARI|MSG|FENGYUN/, "#ffee44"],       // yellow  – weather
  [/HUBBLE|WEBB|CHANDRA|XMM|FERMI/, "#ff44ff"],                 // magenta – telescope
  [/SENTINEL|LANDSAT|TERRA|AQUA|SUOMI|SPOT/, "#44eeff"],        // teal    – EO
];

function getSatelliteColor(name: string, isSelected: boolean): Cesium.Color {
  if (isSelected) return Cesium.Color.fromCssColorString("#ff6600");
  const upper = name.toUpperCase();
  for (const [re, hex] of CATEGORY_COLORS) {
    if (re.test(upper)) return Cesium.Color.fromCssColorString(hex);
  }
  return Cesium.Color.CYAN;
}

export function CesiumGlobe(): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const orbitEntityRef = useRef<Cesium.Entity | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  // id → Cesium entity for in-place diffing
  const entityMapRef = useRef<Map<string, Cesium.Entity>>(new Map());

  // Stable refs so the click handler never needs to be re-registered
  const positionsRef = useRef<SatellitePosition[]>([]);
  const tleRecordsRef = useRef<TleRecord[]>([]);

  const positions = useAppStore((s) => s.positions);
  const tleRecords = useAppStore((s) => s.catalog);
  const viewMode = useAppStore((s) => s.viewMode);
  const selectedSatellite = useAppStore((s) => s.selectedSatellite);
  const showLabels = useAppStore((s) => s.showLabels);
  const setSelectedSatellite = useAppStore((s) => s.setSelectedSatellite);
  const setSelectedMetadata = useAppStore((s) => s.setSelectedMetadata);
  const setIsMetadataLoading = useAppStore((s) => s.setIsMetadataLoading);

  // Keep refs current without triggering effect re-runs
  useEffect(() => { positionsRef.current = positions; }, [positions]);
  useEffect(() => { tleRecordsRef.current = tleRecords; }, [tleRecords]); // tleRecords = catalog

  // ── Initialise viewer + click handler (run once) ─────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const viewer = new Cesium.Viewer(containerRef.current, {
      timeline: false,
      animation: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      infoBox: false,
      selectionIndicator: false,
    });

    viewer.scene.globe.enableLighting = true;
    viewerRef.current = viewer;
    flyToOrbitalView(viewer);

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction(
      async (click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
        const picked = viewer.scene.pick(click.position);

        // Empty click → clear selection
        if (!Cesium.defined(picked) || !(picked as { id?: unknown }).id) {
          setSelectedSatellite(null);
          setSelectedMetadata(null);
          if (orbitEntityRef.current) {
            viewer.entities.remove(orbitEntityRef.current);
            orbitEntityRef.current = null;
          }
          return;
        }

        const entity = (picked as { id: Cesium.Entity }).id;
        const props = entity.properties?.getValue(Cesium.JulianDate.now()) as
          | { satelliteId?: string; satelliteName?: string }
          | undefined;

        const satId = props?.satelliteId;
        const satName = props?.satelliteName;
        if (!satId || !satName) return;

        // Toggle off if same satellite clicked again
        if (useAppStore.getState().selectedSatellite?.id === satId) {
          setSelectedSatellite(null);
          setSelectedMetadata(null);
          if (orbitEntityRef.current) {
            viewer.entities.remove(orbitEntityRef.current);
            orbitEntityRef.current = null;
          }
          return;
        }

        setSelectedSatellite({ id: satId, name: satName });

        // Draw propagated orbit track
        if (orbitEntityRef.current) {
          viewer.entities.remove(orbitEntityRef.current);
          orbitEntityRef.current = null;
        }

        const record = tleRecordsRef.current.find((r) => r.id === satId);
        if (record) {
          const trackPoints = computeOrbitTrack(record, new Date());
          const trackColor = getSatelliteColor(record.name, false);
          orbitEntityRef.current = viewer.entities.add({
            polyline: {
              positions: trackPoints.map((p) =>
                Cesium.Cartesian3.fromDegrees(
                  p.longitudeDeg,
                  p.latitudeDeg,
                  p.altitudeKm * 1000
                )
              ),
              width: 2,
              material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.3,
                color: trackColor,
              }),
            },
          });
        }

        // Fetch metadata from current positions
        const matched = positionsRef.current.find((p) => p.id === satId);
        if (matched) {
          setIsMetadataLoading(true);
          try {
            const metadata = await getSatelliteMetadata(matched);
            setSelectedMetadata(metadata);
          } finally {
            setIsMetadataLoading(false);
          }
        }
      },
      Cesium.ScreenSpaceEventType.LEFT_CLICK
    );

    // ── Hover tooltip ──────────────────────────────────────────────────
    handler.setInputAction(
      (move: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
        const tooltip = tooltipRef.current;
        if (!tooltip) return;

        const picked = viewer.scene.pick(move.endPosition);
        if (Cesium.defined(picked) && (picked as { id?: unknown }).id) {
          const entity = (picked as { id: Cesium.Entity }).id;
          const props = entity.properties?.getValue(
            Cesium.JulianDate.now()
          ) as { satelliteName?: string } | undefined;

          if (props?.satelliteName) {
            tooltip.textContent = props.satelliteName;
            tooltip.style.display = "block";
            tooltip.style.left = `${move.endPosition.x + 16}px`;
            tooltip.style.top = `${move.endPosition.y - 10}px`;
            return;
          }
        }

        tooltip.style.display = "none";
      },
      Cesium.ScreenSpaceEventType.MOUSE_MOVE
    );

    return () => {
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
    };
  // Zustand setters are stable — this truly runs only once
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Re-render satellite glyphs (entity diffing) ─────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const entityMap = entityMapRef.current;
    const isSelected = (id: string) => selectedSatellite?.id === id;
    const incomingIds = new Set(positions.map((p) => p.id));
    for (const [id, entity] of entityMap) {
      if (!incomingIds.has(id)) {
        viewer.entities.remove(entity);
        entityMap.delete(id);
      }
    }

    for (const sat of positions) {
      const cartesian = Cesium.Cartesian3.fromDegrees(
        sat.longitudeDeg,
        sat.latitudeDeg,
        sat.altitudeKm * 1000
      );
      const color = getSatelliteColor(sat.name, isSelected(sat.id));
      const size = isSelected(sat.id) ? 10 : 6;

      const existing = entityMap.get(sat.id);
      if (existing) {
        // Update position and appearance in-place
        (existing.position as Cesium.ConstantPositionProperty).setValue(cartesian);
        if (existing.point) {
          (existing.point.color as Cesium.ConstantProperty).setValue(color);
          (existing.point.pixelSize as Cesium.ConstantProperty).setValue(size);
        }
        if (existing.label) {
          (existing.label.show as Cesium.ConstantProperty).setValue(showLabels);
        }
      } else {
        // First time seeing this satellite — add it
        const entity = viewer.entities.add({
          position: cartesian,
          point: {
            pixelSize: size,
            color,
            outlineColor: Cesium.Color.WHITE.withAlpha(0.6),
            outlineWidth: 1,
          },
          label: {
            text: sat.name,
            show: showLabels,
            font: "11px Arial",
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(10, -8),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 8_000_000),
          },
          properties: {
            satelliteId: sat.id,
            satelliteName: sat.name,
          },
        });
        entityMap.set(sat.id, entity);
      }
    }
  }, [positions, selectedSatellite, showLabels]);

  // ── Camera view switch ───────────────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (viewMode === "earthside") {
      flyToEarthSideObserverView(viewer);
    } else {
      flyToOrbitalView(viewer);
    }
  }, [viewMode]);

  return (
    <>
      <div ref={containerRef} className="cesium-container" />
      <div ref={tooltipRef} className="sat-tooltip" aria-hidden="true" />
    </>
  );
}


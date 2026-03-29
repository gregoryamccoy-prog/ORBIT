import * as Cesium from "cesium";
import { CRESTWOOD_LAT, CRESTWOOD_LON } from "../config/constants";

export function flyToOrbitalView(viewer: Cesium.Viewer): void {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(-30, 20, 20_000_000),
    duration: 1.5,
  });
}

export function flyToEarthSideObserverView(viewer: Cesium.Viewer): void {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(CRESTWOOD_LON, CRESTWOOD_LAT, 1_500_000),
    orientation: {
      heading: Cesium.Math.toRadians(20),
      pitch: Cesium.Math.toRadians(-45),
      roll: 0,
    },
    duration: 1.5,
  });
}

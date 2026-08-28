import '../lib/maplibreSetup';
import '@maplibre/maplibre-gl-leaflet';
import L from 'leaflet';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

import { MAP_STYLE_URL } from '../lib/mapTiles';

interface MapBasemapLayerProps {
  attribution: string;
}

/** Renders the dark OpenFreeMap basemap inside the Leaflet map. */
export function MapBasemapLayer({ attribution }: MapBasemapLayerProps) {
  const map = useMap();

  useEffect(() => {
    map.attributionControl.addAttribution(attribution);
    return () => {
      map.attributionControl.removeAttribution(attribution);
    };
  }, [map, attribution]);

  useEffect(() => {
    const layer = L.maplibreGL({
      style: MAP_STYLE_URL,
      attributionControl: false,
    }).addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map]);

  return null;
}

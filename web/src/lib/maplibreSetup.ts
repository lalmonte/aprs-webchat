import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

/** Required once before any MapLibre map is created (Vite bundles the worker). */
setWorkerUrl(workerUrl);

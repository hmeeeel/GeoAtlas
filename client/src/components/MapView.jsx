import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress } from '@mui/material';
import { loadYandexMaps } from '../lib/yandexMaps.js';

/** Polygon - один полигон, MultiPolygon - набор отдельных полигонов. */
const polygonsOf = (geometry) => (geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : []);

function extentOf(points, geometries) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  const add = (lon, lat) => {
    minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  };
  points.forEach((p) => add(p.lon, p.lat));
  geometries.forEach((g) => polygonsOf(g).forEach((rings) => rings.forEach((ring) => ring.forEach(([lon, lat]) => add(lon, lat)))));
  return Number.isFinite(minLon) ? { minLon, minLat, maxLon, maxLat } : null;
}

function markerElement(point, selected) {
  const el = document.createElement('div');
  el.title = point.name ?? '';
  const size = selected ? 18 : 12;
  Object.assign(el.style, {
    width: `${size}px`, height: `${size}px`, borderRadius: '50%',
    background: selected ? '#B7791F' : '#0F5C66', border: '2px solid #fff',
    boxShadow: '0 0 0 1px rgba(0,0,0,.35)', transform: 'translate(-50%, -50%)', cursor: 'default',
  });
  return el;
}

/**
 * boundary - геометрия GeoJSON (Polygon/MultiPolygon) или массив таких геометрий;
 * points - [{id, lat, lon, name}]; selectedId - выделенная точка. Координаты передаются как [lon, lat].
 */
export default function MapView({ boundary, points = [], selectedId, height = 460 }) {
  const container = useRef(null);
  const mapRef = useRef(null);
  const drawn = useRef([]);
  const [state, setState] = useState({ status: 'loading', error: null });
  const [attempt, setAttempt] = useState(0);

  // Создание карты !!
  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', error: null });
    loadYandexMaps()
      .then((ymaps3) => {
        if (cancelled) return;
        const { YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer } = ymaps3;
        const map = new YMap(container.current, { location: { center: [27.56, 53.9], zoom: 4 } });
        map.addChild(new YMapDefaultSchemeLayer({}));
        map.addChild(new YMapDefaultFeaturesLayer({}));
        mapRef.current = { map, ymaps3 };
        setState({ status: 'ready', error: null });
      })
      .catch((error) => !cancelled && setState({ status: 'error', error }));
    return () => {
      cancelled = true;
      mapRef.current?.map.destroy();
      mapRef.current = null;
      drawn.current = [];
    };
  }, [attempt]);

  // Отрисовка объектов и приближение так, чтобы были видны все
  useEffect(() => {
    if (state.status !== 'ready') return;
    const { map, ymaps3 } = mapRef.current;
    const { YMapFeature, YMapMarker } = ymaps3;
    drawn.current.forEach((child) => map.removeChild(child));
    drawn.current = [];

    const geometries = [boundary].flat().filter(Boolean); // ОТРИСОВКА
    geometries.forEach((geometry, g) =>
      polygonsOf(geometry).forEach((coordinates, i) => {
        const feature = new YMapFeature({
          id: `boundary-${g}-${i}`,
          geometry: { type: 'Polygon', coordinates },
          style: { stroke: [{ color: '#0F5C66', width: 2 }], fill: 'rgba(15, 92, 102, 0.18)' },
        });
        map.addChild(feature);
        drawn.current.push(feature);
      }),
    );
    points.forEach((p) => {
      const marker = new YMapMarker({ coordinates: [p.lon, p.lat] }, markerElement(p, String(p.id) === String(selectedId)));
      map.addChild(marker);
      drawn.current.push(marker);
    });

    const box = extentOf(points, geometries);
    if (!box) return;
    if (box.minLon === box.maxLon && box.minLat === box.maxLat) map.setLocation({ center: [box.minLon, box.minLat], zoom: 10, duration: 300 });
    else map.setLocation({ bounds: [[box.minLon, box.minLat], [box.maxLon, box.maxLat]], duration: 300 });
  }, [state.status, boundary, points, selectedId]);

  return (
    <Box sx={{ position: 'relative', height, borderRadius: 1, overflow: 'hidden', border: '1px solid #D8E0E3' }}>
      <Box ref={container} sx={{ position: 'absolute', inset: 0 }} />
      {state.status === 'loading' && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(255,255,255,.6)' }}>
          <CircularProgress size={28} />
        </Box>
      )}
      {state.status === 'error' && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', bgcolor: 'background.paper', p: 2 }}>
          <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => setAttempt((n) => n + 1)}>Повторить</Button>}>
            Карта не загрузилась: {state.error?.message}
          </Alert>
        </Box>
      )}
    </Box>
  );
}

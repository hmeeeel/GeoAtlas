/** "Point(30.5 50.4)" (WKT из Wikidata) - {lon, lat} или null. */
export function parsePoint(wkt) {
  const match = /Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i.exec(wkt ?? '');
  if (!match) return null;
  const lon = Number(match[1]);
  const lat = Number(match[2]);
  return validLatLon(lat, lon) ? { lat, lon } : null;
}

export const validLatLon = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/** Население из тегов OSM: "1 234", "12,345", "1.5 million" не поддерживаем - берём только целые. */
export function parsePopulation(value) {
  if (value == null) return null;
  const digits = String(value).replace(/[\s,.]/g, '');
  if (!/^\d{1,9}$/.test(digits)) return null;
  return Number(digits);
}

const round = (n) => Math.round(n * 1e4) / 1e4;

/**
 * Приводит упрощённую геометрию к «чистому» Polygon / MultiPolygon:
 * отбрасывает вырожденные кольца, округляет координаты до 4 знаков. Возвращает null, если ничего не осталось.
 */
export function cleanGeometry(geometry) {
  if (!geometry) return null;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  const cleaned = polygons
    .map((rings) => rings.map((ring) => ring.map(([lon, lat]) => [round(lon), round(lat)])).filter((ring) => ring.length >= 4))
    .filter((rings) => rings.length > 0);
  if (cleaned.length === 0) return null;
  return cleaned.length === 1 ? { type: 'Polygon', coordinates: cleaned[0] } : { type: 'MultiPolygon', coordinates: cleaned };
}

export function* chunks(array, size) {
  for (let i = 0; i < array.length; i += size) yield array.slice(i, i + size);
}

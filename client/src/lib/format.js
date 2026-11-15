const numberFormat = new Intl.NumberFormat('ru-RU');

export const TYPE_LABELS = { CITY: 'Город', TOWN: 'Малый город', VILLAGE: 'Село' };

/** Отсутствующее значение показываем как «-». */
export const fmtNum = (v) => (v == null ? '-' : numberFormat.format(v));
export const fmtText = (v) => (v == null || v === '' ? '-' : v);
export const fmtCoord = (lat, lon) => (lat == null || lon == null ? '-' : `${lat.toFixed(4)}, ${lon.toFixed(4)}`);
export const fmtDate = (v) => (v ? new Date(v).toLocaleString('ru-RU') : '-');

/** Показываем nameRu, а если его нет - nameLocal. */
export const displayName = (o) => o?.nameRu || o?.nameLocal || '-';

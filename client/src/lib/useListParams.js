import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const SORT_FIELDS = { name: 'NAME', population: 'POPULATION', createdAt: 'CREATED_AT', placesCount: 'PLACES_COUNT', totalPopulation: 'TOTAL_POPULATION' };

/** Превращает параметры списка в переменные GraphQL. */
function derive(raw, defaultSort) {
  const page = Math.max(1, Number(raw.page) || 1);
  const size = Math.min(100, Math.max(1, Number(raw.size) || 20));
  const sort = raw.sort || defaultSort;
  const [field, dir] = sort.split(':');
  return {
    ...raw,
    page,
    size,
    sort,
    q: raw.q ?? '',
    popMin: raw.popMin ?? '',
    types: raw.types ? raw.types.split(',').filter(Boolean) : [],
    pagination: { limit: size, offset: (page - 1) * size },
    orderBy: { field: SORT_FIELDS[field] ?? 'NAME', direction: dir === 'desc' ? 'DESC' : 'ASC' },
    // поиск короче 2 символов на сервер не уходит
    search: raw.q && raw.q.length >= 2 ? raw.q : undefined,
  };
}

const toText = (v) => (Array.isArray(v) ? v.join(',') : v);

/** Состояние таблицы в адресе страницы: ?page=2&sort=population:desc&q=мин&types=CITY,TOWN */
export function useUrlListParams({ defaultSort = 'name:asc' } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const key = searchParams.toString();
  const params = useMemo(() => derive(Object.fromEntries(searchParams.entries()), defaultSort), [key, defaultSort]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback(
    (patch, { resetPage = true } = {}) =>
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          const value = toText(v);
          value === '' || value == null ? next.delete(k) : next.set(k, String(value));
        }
        if (resetPage) next.delete('page');
        return next;
      }),
    [setSearchParams],
  );
  const reset = useCallback(() => setSearchParams({}), [setSearchParams]);
  return { params, update, reset };
}

/** То же самое без адреса страницы (для страницы «Статистика»). */
export function useLocalListParams({ defaultSort = 'name:asc' } = {}) {
  const [raw, setRaw] = useState({});
  const params = useMemo(() => derive(raw, defaultSort), [raw, defaultSort]);
  const update = useCallback(
    (patch, { resetPage = true } = {}) =>
      setRaw((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(patch)) (v === '' || v == null ? delete next[k] : (next[k] = toText(v)));
        if (resetPage) delete next.page;
        return next;
      }),
    [],
  );
  const reset = useCallback(() => setRaw({}), []);
  return { params, update, reset };
}

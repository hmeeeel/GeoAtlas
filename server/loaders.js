import DataLoader from 'dataloader';

const byKeyOrder = (keys, map, fallback = null) => keys.map((k) => map.get(String(k)) ?? fallback);

/**
 * Загрузчик страниц потомков. Ключ: {parentId, filter, orderBy, pagination}.
 * Ключи с одинаковыми параметрами попадают в один SQL-запрос на всех родителей сразу.
 */
function pagedLoader(fetchPages) {
  return new DataLoader(
    async (keys) => {
      const groups = new Map();
      keys.forEach((key, index) => {
        const signature = JSON.stringify([key.filter, key.orderBy, key.pagination]);
        if (!groups.has(signature)) groups.set(signature, { args: key, parentIds: [], indexes: [] });
        const group = groups.get(signature);
        group.parentIds.push(key.parentId);
        group.indexes.push(index);
      });
      const results = new Array(keys.length);
      await Promise.all(
        [...groups.values()].map(async ({ args, parentIds, indexes }) => {
          const pages = await fetchPages([...new Set(parentIds)], args);
          indexes.forEach((i, j) => (results[i] = pages.get(String(parentIds[j]))));
        }),
      );
      return results;
    },
    { cacheKeyFn: (key) => JSON.stringify(key) },
  );
}

/** Набор загрузчиков создаётся заново на каждый HTTP-запрос (иначе кэш смешает данные разных запросов). */
export function createLoaders({ countries, regions, places, boundaries, sources }) {
  return {
    countryById: new DataLoader(async (ids) => byKeyOrder(ids, await countries.findByIds(ids))),
    regionById: new DataLoader(async (ids) => byKeyOrder(ids, await regions.findByIds(ids))),
    regionsByCountry: pagedLoader((ids, args) => regions.findPagesByParent('country_id', ids, args)),
    placesByRegion: pagedLoader((ids, args) => places.findPagesByParent('region_id', ids, args)),
    sourcesByPlace: new DataLoader(async (ids) => byKeyOrder(ids, await sources.findByPlaceIds(ids), [])),
    regionsCountByCountry: new DataLoader(async (ids) => byKeyOrder(ids, await regions.countByParent('country_id', ids), 0)),
    placesCountByCountry: new DataLoader(async (ids) => byKeyOrder(ids, await places.countByParent('country_id', ids), 0)),
    placesCountByRegion: new DataLoader(async (ids) => byKeyOrder(ids, await places.countByParent('region_id', ids), 0)),
    countryBoundary: new DataLoader(async (ids) => byKeyOrder(ids, await boundaries.findMany('country', ids))),
    regionBoundary: new DataLoader(async (ids) => byKeyOrder(ids, await boundaries.findMany('region', ids))),
  };
}

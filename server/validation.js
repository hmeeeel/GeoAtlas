import { badInput } from './errors.js';

const MAX_ID = 2147483647;

/** ID приходит строкой; допускаем только положительное целое. */
export function toId(value, field = 'id') {
  if (typeof value !== 'string' && typeof value !== 'number') throw badInput('Некорректный идентификатор', field);
  const text = String(value);
  if (!/^\d{1,10}$/.test(text) || Number(text) > MAX_ID || Number(text) < 1) {
    throw badInput(`Некорректный идентификатор: ${text}`, field);
  }
  return Number(text);
}

export function validatePagination(pagination) {
  const limit = pagination?.limit ?? 20;
  const offset = pagination?.offset ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw badInput('limit должен быть от 1 до 100', 'limit');
  if (!Number.isInteger(offset) || offset < 0) throw badInput('offset должен быть не меньше 0', 'offset');
  return { limit, offset };
}

export function validateSearch(search) {
  if (search == null) return undefined;
  const text = search.trim();
  if (text === '') return undefined;
  if (text.length < 2) throw badInput('Поисковая строка должна быть не короче 2 символов', 'search');
  return text;
}

function validatePopulation(value, field) {
  if (value == null) return undefined;
  if (!Number.isInteger(value) || value < 0) throw badInput('Население должно быть целым числом не меньше 0', field);
  return value;
}

/**
 * Единая проверка параметров списка (фильтр, поиск, сортировка, страница).
 * Вызывается ДО обращения к БД: при ошибке SQL-запрос не выполняется.
 */
export function normalizeListArgs({ filter, search, orderBy, pagination } = {}) {
  const f = filter ?? {};
  return {
    filter: {
      countryId: f.countryId != null ? toId(f.countryId, 'countryId') : undefined,
      regionId: f.regionId != null ? toId(f.regionId, 'regionId') : undefined,
      types: f.types?.length ? f.types : undefined,
      populationMin: validatePopulation(f.populationMin, 'populationMin'),
      populationMax: validatePopulation(f.populationMax, 'populationMax'),
      hasTimezone: f.hasTimezone ?? undefined,
      search: validateSearch(search ?? f.search),
    },
    orderBy,
    pagination: validatePagination(pagination),
  };
}

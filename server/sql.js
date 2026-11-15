import { badInput } from './errors.js';

/** snake_case - camelCase для ключей строки (только верхний уровень, JSONB не трогаем). */
export function toCamel(row) {
  if (!row) return row;
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase()), value]),
  );
}

/** Шаблон для ILIKE: символы %, _ и \ экранируются, поэтому «__» ищет именно два подчёркивания. */
export function likePattern(text) {
  return `%${text.replace(/[\\%_]/g, '\\$&')}%`;
}

/**
 * ORDER BY только из белого списка `columns` (поле - SQL-выражение).
 * Вторичный ключ id делает порядок стабильным, NULLS LAST - записи без значения идут в конце.
 */
export function orderSql(orderBy, columns, defaultField) {
  const field = orderBy?.field ?? defaultField;
  const expression = columns[field];
  if (!expression) throw badInput(`Недопустимое поле сортировки: ${field}`);
  const direction = orderBy?.direction === 'DESC' ? 'DESC' : 'ASC';
  return `${expression} ${direction} NULLS LAST, id ASC`;
}

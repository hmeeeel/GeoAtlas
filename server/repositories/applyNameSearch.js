import { likePattern } from '../sql.js';

/** Регистронезависимый поиск по трём названиям (ускоряется индексом pg_trgm). */
export function applyNameSearch(qb, search) {
  const pattern = likePattern(search);
  return qb.where((b) => b.whereILike('name_local', pattern).orWhereILike('name_ru', pattern).orWhereILike('name_en', pattern));
}

import { BaseRepository } from './BaseRepository.js';
import { applyNameSearch } from './applyNameSearch.js';
import { toCamel } from '../sql.js';

export class PlaceRepository extends BaseRepository {
  tableName = 'places';
  orderColumns = {
    NAME: 'COALESCE(name_ru, name_local)',
    POPULATION: 'population',
    CREATED_AT: 'created_at',
  };

  /** Все запросы скрывают мягко удалённые записи. */
  baseQuery() {
    return this.db(this.tableName).whereNull('deleted_at');
  }

  applyFilters(qb, f) {
    if (f.countryId != null) qb.where('country_id', f.countryId);
    if (f.regionId != null) qb.where('region_id', f.regionId);
    if (f.types?.length) qb.whereIn('type', f.types);
    if (f.populationMin != null) qb.where('population', '>=', f.populationMin);
    if (f.populationMax != null) qb.where('population', '<=', f.populationMax);
    if (f.hasTimezone === true) qb.whereNotNull('timezone');
    if (f.hasTimezone === false) qb.whereNull('timezone');
    if (f.search) applyNameSearch(qb, f.search);
    return qb;
  }

  async create(data) {
    const [row] = await this.db(this.tableName).insert({ ...data, origin: 'manual' }).returning('*');
    return toCamel(row);
  }

  /** Меняет только переданные поля и помечает запись как изменённую пользователем. */
  async update(id, data) {
    const [row] = await this.baseQuery()
      .where({ id })
      .update({ ...data, is_user_modified: true, updated_at: this.db.fn.now() })
      .returning('*');
    return toCamel(row);
  }

  /** Мягкое удаление: иначе сборщик вернул бы запись при следующем запуске. */
  async softDelete(id) {
    const count = await this.baseQuery().where({ id }).update({ deleted_at: this.db.fn.now(), updated_at: this.db.fn.now() });
    return count > 0;
  }
}

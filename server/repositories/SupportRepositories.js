import { toCamel } from '../sql.js';

/** Границы стран и регионов (тяжёлый JSONB лежит отдельно и читается только по запросу поля). */
export class BoundaryRepository {
  constructor(db) {
    this.db = db;
  }

  async findMany(entityType, ids) {
    const rows = await this.db('boundaries').where('entity_type', entityType).whereIn('entity_id', ids).select('entity_id', 'geojson');
    return new Map(rows.map((r) => [String(r.entity_id), r.geojson]));
  }
}

/** Происхождение данных (из каких источников получена запись). */
export class SourceRepository {
  constructor(db) {
    this.db = db;
  }

  async findByPlaceIds(ids) {
    const rows = await this.db('source_records').where('entity_type', 'place').whereIn('entity_id', ids).orderBy('fetched_at', 'desc');
    const result = new Map(ids.map((id) => [String(id), []]));
    for (const row of rows) result.get(String(row.entity_id)).push(toCamel(row));
    return result;
  }
}

/** Журнал сбора данных. */
export class CollectionRunRepository {
  constructor(db) {
    this.db = db;
  }

  async latest(limit) {
    const rows = await this.db('collection_runs').orderBy('started_at', 'desc').orderBy('id', 'desc').limit(limit);
    return rows.map(toCamel);
  }
}

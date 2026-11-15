import { orderSql, toCamel } from '../sql.js';

const COLUMNS = { NAME: 'name', PLACES_COUNT: 'places_count', TOTAL_POPULATION: 'total_population' };

/** Агрегаты: GROUP BY, COUNT, SUM - всё считает PostgreSQL. */
export class StatsRepository {
  constructor(db) {
    this.db = db;
  }

  countryStats({ orderBy, pagination }) {
    return this.#aggregate({ table: 'countries', joinColumn: 'country_id', orderBy, pagination });
  }

  regionStats({ countryId, orderBy, pagination }) {
    return this.#aggregate({ table: 'regions', joinColumn: 'region_id', where: 'x.country_id = ?', bindings: [countryId], orderBy, pagination });
  }

  async #aggregate({ table, joinColumn, where = 'TRUE', bindings = [], orderBy, pagination }) {
    const order = orderSql(orderBy, COLUMNS, 'NAME');
    const [{ rows }, { rows: [{ count }] }] = await Promise.all([
      this.db.raw(
        `SELECT x.id,
                COALESCE(x.name_ru, x.name_local) AS name,
                COUNT(p.id) AS places_count,
                COUNT(p.id) FILTER (WHERE p.type = 'CITY') AS cities_count,
                COUNT(p.id) FILTER (WHERE p.type = 'TOWN') AS towns_count,
                COUNT(p.id) FILTER (WHERE p.type = 'VILLAGE') AS villages_count,
                COALESCE(SUM(p.population), 0)::float8 AS total_population
           FROM ${table} x
           LEFT JOIN places p ON p.${joinColumn} = x.id AND p.deleted_at IS NULL
          WHERE ${where}
          GROUP BY x.id
          ORDER BY ${order}
          LIMIT ? OFFSET ?`,
        [...bindings, pagination.limit, pagination.offset],
      ),
      this.db.raw(`SELECT COUNT(*) AS count FROM ${table} x WHERE ${where}`, bindings),
    ]);
    return { nodes: rows.map(toCamel), totalCount: Number(count) };
  }
}

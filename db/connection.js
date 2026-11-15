import 'dotenv/config';
import knex from 'knex';
import pg from 'pg';

// bigint (count, osm id) и numeric приходят из pg строками - приводим к числам.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

/** Единая точка создания подключения к БД (используют и сервер, и сборщик). */
export function createDb(url = process.env.DATABASE_URL) {
  return knex({
    client: 'pg',
    connection: url ?? 'postgres://geoatlas:geoatlas@localhost:5432/geoatlas',
    pool: { min: 0, max: 10 },
  });
}

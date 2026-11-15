import { Stats } from './stats.js';
import { chunks } from './geo.js';

/**
 * Пакетная идемпотентная запись: INSERT ... ON CONFLICT DO UPDATE в транзакции.
 * Если пакет не записался, строки пробуются по одной - сбой одной строки не теряет остальные.
 */
export class Upserter {
  constructor(db, batchSize) {
    this.db = db;
    this.batchSize = batchSize;
  }

  /** merge: объект {колонка: значение|raw}; where: условие обновления (SQL). Возвращает {stats, saved}. */
  async upsert(table, rows, { conflict, merge, where, returning = ['id'] }) {
    const stats = new Stats();
    const saved = [];
    const collect = (result, size) => {
      for (const row of result) {
        const { _inserted, ...data } = row;
        _inserted ? stats.inserted++ : stats.updated++;
        saved.push(data);
      }
      stats.skipped += size - result.length; // строки, исключённые условием WHERE
    };

    for (const chunk of chunks(rows, this.batchSize)) {
      try {
        collect(await this.#run(table, chunk, { conflict, merge, where, returning }), chunk.length);
      } catch {
        for (const row of chunk) {
          try {
            collect(await this.#run(table, [row], { conflict, merge, where, returning }), 1);
          } catch (error) {
            stats.addError(`${table}`, error);
          }
        }
      }
    }
    return { stats, saved };
  }

  #run(table, rows, { conflict, merge, where, returning }) {
    return this.db.transaction(async (trx) => {
      let query = trx(table).insert(rows).onConflict(trx.raw(conflict)).merge(merge);
      if (where) query = query.whereRaw(where);
      return query.returning([...returning, trx.raw('(xmax = 0) AS _inserted')]);
    });
  }

  /** merge для «обновить значениями из источника, но не затирать существующее пустым». */
  coalesceMerge(table, columns) {
    return Object.fromEntries(columns.map((c) => [c, this.db.raw(`COALESCE(excluded.${c}, ${table}.${c})`)]));
  }

  /** Происхождение данных: какой источник дал запись. */
  async recordSources(source, entityType, items) {
    if (items.length === 0) return;
    const rows = items.map(({ externalId, entityId }) => ({ source, external_id: String(externalId), entity_type: entityType, entity_id: entityId }));
    await this.upsert('source_records', rows, {
      conflict: '(source, external_id, entity_type)',
      merge: { entity_id: this.db.raw('excluded.entity_id'), fetched_at: this.db.raw('now()') },
    });
  }
}

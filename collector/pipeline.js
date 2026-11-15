import { createDb } from '../db/connection.js';
import { config } from './config.js';
import { HttpClient } from './lib/http.js';
import { Logger } from './lib/log.js';
import { Stats } from './lib/stats.js';
import { Upserter } from './lib/writer.js';
import { WikidataSource } from './sources/WikidataSource.js';
import { OsmSource } from './sources/OsmSource.js';
import { OpenTripMapSource } from './sources/OpenTripMapSource.js';

/** Порядок сбора: страны - регионы - пункты - уточнение - границы (нужны только карте) - обогащение. */
export const PIPELINE_ORDER = [
  ['wikidata', 'countries'],
  ['wikidata', 'regions'],
  ['wikidata', 'places'],
  ['osm', 'places'],
  
  ['osm', 'boundaries'],
  ['opentripmap', 'places'],
];

/** Контекст запуска: ограничение по странам (--country=BY,RO). */
export class RunContext {
  constructor(countries) {
    this.countries = countries?.length ? countries.map((c) => c.toUpperCase()) : null;
  }
  wants(iso2) {
    return !this.countries || this.countries.includes(iso2);
  }
  filterCountries(query, column = 'iso2') {
    return this.countries ? query.whereIn(column, this.countries) : query;
  }
}

/** Журнал запусков (таблица collection_runs). */
class RunLog {
  constructor(db) {
    this.db = db;
  }
  async start(source, scope) {
    const [row] = await this.db('collection_runs').insert({ source, scope, status: 'running' }).returning('id');
    return row.id;
  }
  finish(id, status, stats) {
    const errorText = stats.errors.length ? stats.errors.slice(0, 20).join('\n').slice(0, 4000) : null;
    return this.db('collection_runs').where({ id }).update({
      finished_at: this.db.fn.now(),
      status,
      inserted: stats.inserted,
      updated: stats.updated,
      skipped: stats.skipped,
      failed: stats.failed,
      error_text: errorText,
    });
  }
}

export class Pipeline {
  constructor({ db, sources, log }) {
    this.sources = sources;
    this.log = log;
    this.runLog = new RunLog(db);
  }

  /**
   * Запускает этапы по порядку. Сбой этапа или источника не останавливает остальные.
   * Статусы: success - всё собрано; partial - часть не собрана из-за сбоя; failed - аварийное завершение сборщика.
   */
  async run({ only, countries } = {}) {
    const ctx = new RunContext(countries);
    const steps = PIPELINE_ORDER.filter(([source]) => !only || source === only).filter(([source]) => {
      const enabled = this.sources.get(source).isEnabled();
      if (!enabled) this.log.warn(`Источник ${source} отключён (не задан ключ API) - пропускаем`);
      return enabled;
    });
    const scope = ctx.countries?.join(',') ?? 'all';
    const runs = new Map();
    for (const [source] of steps) {
      if (!runs.has(source)) runs.set(source, { id: await this.runLog.start(source, scope), stats: new Stats() });
    }

    let fatal = null;
    try {
      for (const [source, stage] of steps) {
        const run = runs.get(source);
        this.log.info(`>>> ${source}.${stage}`);
        try {
          run.stats.add(await this.sources.get(source).runStage(stage, ctx));
        } catch (error) {
          run.stats.addError(`${source}.${stage}`, error);
          this.log.error(`${source}.${stage} завершился с ошибкой: ${error.message}`);
        }
      }
    } catch (error) {
      fatal = error;
      this.log.error(`Аварийное завершение сборщика: ${error.stack}`);
    } finally {
      for (const [source, run] of runs) {
        const status = fatal ? 'failed' : run.stats.failed > 0 ? 'partial' : 'success';
        await this.runLog.finish(run.id, status, run.stats);
        this.log.info(`${source}: ${status} (добавлено ${run.stats.inserted}, обновлено ${run.stats.updated}, пропущено ${run.stats.skipped}, ошибок ${run.stats.failed})`);
      }
    }
    if (fatal) throw fatal;
  }
}

/** Корень композиции сборщика. */
export function createPipeline(db = createDb()) {
  const log = new Logger();
  const http = new HttpClient({ userAgent: config.userAgent, ...config.http, log });
  const upserter = new Upserter(db, config.batchSize);
  const deps = { db, http, upserter, log, config };
  const sources = new Map([
    ['wikidata', new WikidataSource(deps)],
    ['osm', new OsmSource(deps)],
    ['opentripmap', new OpenTripMapSource(deps)],
  ]);
  return { pipeline: new Pipeline({ db, sources, log }), db, log };
}

import { setTimeout as sleep } from 'node:timers/promises';
import { BaseSource } from './BaseSource.js';
import { Stats } from '../lib/stats.js';

/** OpenTripMap (метод geoname): дообогащение - часовой пояс и население для мест, которых нет в других источниках. */
export class OpenTripMapSource extends BaseSource {
  get name() {
    return 'opentripmap';
  }

  isEnabled() {
    return Boolean(this.config.opentripmap.apiKey);
  }

  get stages() {
    return { places: (ctx) => this.enrich(ctx) };
  }

  async enrich(ctx) {
    const cfg = this.config.opentripmap;
    if (!cfg.apiKey) throw new Error('не задан OPENTRIPMAP_API_KEY');

    // Сначала места без timezone, по убыванию населения; не больше суточного бюджета запросов
    const places = await ctx
      .filterCountries(this.db('places as p').join('countries as c', 'c.id', 'p.country_id'), 'c.iso2')
      .whereNull('p.deleted_at')
      .where('p.is_user_modified', false)
      .whereNull('p.timezone')
      .where((b) => b.whereNull('p.otm_status').orWhere('p.otm_status', 'error'))
      .orderByRaw('p.population DESC NULLS LAST, p.id')
      .limit(cfg.dailyBudget)
      .select('p.id', 'p.name_local', 'p.name_en', 'c.iso2');

    const stats = new Stats();
    let failuresInRow = 0;
    for (const place of places) {
      const params = new URLSearchParams({ name: place.name_en ?? place.name_local, country: place.iso2, apikey: cfg.apiKey });
      try {
        const data = await this.http.json(`${cfg.url}?${params}`, { timeoutMs: cfg.timeoutMs });
        failuresInRow = 0;
        if (data.status && data.status !== 'OK') await this.#mark(place.id, 'not_found', stats);
        else await this.#saveFound(place, data, stats);
      } catch (error) {
        if (error.status === 404) {
          failuresInRow = 0;
          await this.#mark(place.id, 'not_found', stats);
        } else {
          failuresInRow++;
          stats.addError(`geoname ${place.id}`, error);
          await this.#mark(place.id, 'error', null);
          // «Предохранитель»: источник недоступен - не тратим время на тысячи повторов
          if (failuresInRow >= cfg.maxConsecutiveFailures) throw new Error(`OpenTripMap недоступен: ${failuresInRow} ошибок подряд (${error.message})`);
        }
      }
      await sleep(cfg.pauseMs);
    }
    this.log.info(`OpenTripMap: обработано ${places.length}, обогащено ${stats.updated}`);
    return stats;
  }

  async #saveFound(place, data, stats) {
    const population = Number.isInteger(data.population) && data.population > 0 ? data.population : null;
    await this.db('places').where({ id: place.id }).update({
      timezone: typeof data.timezone === 'string' ? data.timezone.slice(0, 64) : null,
      population: this.db.raw('COALESCE(population, ?::int)', [population]),
      population_source: this.db.raw(`CASE WHEN population IS NULL AND ?::int IS NOT NULL THEN 'opentripmap' ELSE population_source END`, [population]),
      otm_status: 'ok',
      enriched_at: this.db.fn.now(),
      updated_at: this.db.fn.now(),
    });
    await this.upserter.recordSources('opentripmap', 'place', [{ externalId: `geoname:${place.id}`, entityId: place.id }]);
    stats.updated++;
  }

  async #mark(placeId, status, stats) {
    await this.db('places').where({ id: placeId }).update({ otm_status: status, enriched_at: this.db.fn.now() });
    if (stats && status === 'not_found') stats.skipped++;
  }
}

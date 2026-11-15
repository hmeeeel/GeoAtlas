import { setTimeout as sleep } from 'node:timers/promises';
import osmtogeojson from 'osmtogeojson';
import simplify from '@turf/simplify';
import { BaseSource } from './BaseSource.js';
import { Stats } from '../lib/stats.js';
import { cleanGeometry, parsePopulation, validLatLon } from '../lib/geo.js';
import { regionLevelFor } from '../config.js';

/**
 * Клиент Overpass: публичные серверы часто перегружены (502/504/429), поэтому при отказе сразу переходим
 * к следующему серверу, помним последний рабочий, а когда заняты все - ждём и делаем новый круг.
 */
class OverpassClient {
  start = 0;

  constructor({ http, endpoints, log, attempts, rounds, roundPauseMs }) {
    Object.assign(this, { http, endpoints, log, attempts, rounds, roundPauseMs });
  }

  async query(ql, timeoutMs) {
    let lastError;
    for (let round = 1; round <= this.rounds; round++) {
      for (let i = 0; i < this.endpoints.length; i++) {
        const index = (this.start + i) % this.endpoints.length;
        const endpoint = this.endpoints[index];
        try {
          const data = await this.http.json(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ data: ql }),
            timeoutMs,
            maxAttempts: this.attempts,
            onRetry: (error) => this.#waitForSlot(endpoint, error),
          });
          // Overpass может ответить 200 с ошибкой выполнения в поле remark - повтор не поможет
          if (data.remark && /runtime error/i.test(data.remark)) throw Object.assign(new Error(`Overpass: ${data.remark}`), { fatal: true });
          this.start = index;
          return data;
        } catch (error) {
          if (error.fatal) throw error;
          lastError = error;
          this.log.warn(`Overpass ${new URL(endpoint).host} не справился: ${error.message}`);
        }
      }
      if (round < this.rounds) {
        this.log.warn(`Все серверы Overpass заняты, пауза ${Math.round(this.roundPauseMs / 1000)} с (круг ${round}/${this.rounds})`);
        await sleep(this.roundPauseMs);
      }
    }
    throw lastError;
  }

  async #waitForSlot(endpoint, error) {
    if (error.status !== 429) return;
    try {
      const response = await fetch(endpoint.replace(/interpreter$/, 'status'), { signal: AbortSignal.timeout(10_000) });
      const seconds = /in (\d+) seconds/.exec(await response.text())?.[1];
      if (seconds) await sleep(Math.min(Number(seconds), 60) * 1000);
    } catch {
      /* статус недоступен - повтор по расписанию клиента */
    }
  }
}

const PLACE_TYPES = new Set(['city', 'town', 'village']);

export class OsmSource extends BaseSource {
  constructor(deps) {
    super(deps);
    const { endpoints, attemptsPerEndpoint, rounds, roundPauseMs } = this.config.osm;
    this.overpass = new OverpassClient({ http: this.http, endpoints, log: this.log, attempts: attemptsPerEndpoint, rounds, roundPauseMs });
  }

  get name() {
    return 'osm';
  }

  get stages() {
    return {
      boundaries: (ctx) => this.collectBoundaries(ctx),
      places: (ctx) => this.collectPlaces(ctx),
    };
  }

  // ---------- границы ----------

  async collectBoundaries(ctx) {
    const stats = new Stats();
    for (const country of await this.countries(ctx)) {
      try {
        if (!country.osm_relation_id) {
          stats.skipped++;
          this.log.warn(`OSM: у страны ${country.iso2} нет osm_relation_id - граница пропущена`);
          continue;
        }
        await this.#linkRegions(country);
        const regions = await this.db('regions').where({ country_id: country.id }).whereNotNull('osm_relation_id');
        const targets = [
          { type: 'country', id: country.id, rel: country.osm_relation_id, tolerance: this.config.osm.simplify.country },
          ...regions.map((r) => ({ type: 'region', id: r.id, rel: r.osm_relation_id, tolerance: this.config.osm.simplify.region })),
        ];
        const have = new Set((await this.db('boundaries').select('entity_type', 'entity_id')).map((b) => `${b.entity_type}:${b.entity_id}`));
        for (const target of targets.filter((t) => !have.has(`${t.type}:${t.id}`))) {
          try {
            await this.#fetchBoundary(target, stats);
          } catch (error) {
            stats.addError(`граница ${target.type} relation/${target.rel}`, error);
            this.log.error(`OSM: граница relation/${target.rel}: ${error.message}`);
          }
          await sleep(this.config.osm.pauseMs);
        }
      } catch (error) {
        stats.addError(`границы ${country.iso2}`, error);
      }
    }
    return stats;
  }

  /** Сопоставление регионов с отношениями OSM по тегу wikidata или коду ISO 3166-2. */
  async #linkRegions(country) {
    const level = regionLevelFor(country.iso2);
    const unlinked = await this.db('regions').where({ country_id: country.id }).whereNull('osm_relation_id');
    if (level == null || unlinked.length === 0) return;

    const { boundaryTimeoutS } = this.config.osm;
    const ql = `[out:json][timeout:${boundaryTimeoutS}];area(${3600000000 + Number(country.osm_relation_id)})->.c;rel(area.c)["boundary"="administrative"]["admin_level"="${level}"];out tags;`;
    const { elements } = await this.overpass.query(ql, boundaryTimeoutS * 1000);
    for (const region of unlinked) {
      const match = elements.find((e) => (region.wikidata_id && e.tags?.wikidata === region.wikidata_id) || (region.iso_3166_2 && e.tags?.['ISO3166-2'] === region.iso_3166_2));
      if (match) await this.db('regions').where({ id: region.id }).update({ osm_relation_id: match.id }).catch(() => {});
    }
    await sleep(this.config.osm.pauseMs);
  }

  async #fetchBoundary({ type, id, rel, tolerance }, stats) {
    const { boundaryTimeoutS } = this.config.osm;
    const data = await this.overpass.query(`[out:json][timeout:${boundaryTimeoutS}][maxsize:1073741824];rel(${rel});out geom;`, (boundaryTimeoutS + 30) * 1000);
    const feature = osmtogeojson(data).features.find((f) => f.id === `relation/${rel}` && ['Polygon', 'MultiPolygon'].includes(f.geometry?.type));
    if (!feature) throw new Error('геометрия не собралась в полигон');

    const simplified = simplify(feature, { tolerance, highQuality: false, mutate: false });
    const geometry = cleanGeometry(simplified.geometry); // одна чистая геометрия, без Feature и лишних линий
    if (!geometry) throw new Error('после упрощения геометрия пуста');

    const { stats: s } = await this.upserter.upsert('boundaries', [{ entity_type: type, entity_id: id, geojson: geometry, is_simplified: true, source: 'osm' }], {
      conflict: '(entity_type, entity_id)',
      merge: { geojson: this.db.raw('excluded.geojson'), is_simplified: true, source: 'osm', updated_at: this.db.raw('now()') },
      returning: ['entity_id'],
    });
    await this.upserter.recordSources('osm', type, [{ externalId: `relation/${rel}`, entityId: id }]);
    stats.add(s);
  }

  // ---------- населённые пункты ----------

  async collectPlaces(ctx) {
    const stats = new Stats();
    for (const country of await this.countries(ctx)) {
      try {
        await this.#linkRegions(country);
      } catch (error) {
        this.log.warn(`OSM: связать регионы ${country.iso2} не удалось: ${error.message}`);
      }
      const regions = await this.db('regions').where({ country_id: country.id }).whereNotNull('osm_relation_id');
      // Страна без регионального уровня - один запрос на страну, region_id остаётся NULL
      const scopes = regions.length > 0
        ? regions.map((r) => ({ rel: r.osm_relation_id, regionId: r.id, label: r.name_local }))
        : country.osm_relation_id ? [{ rel: country.osm_relation_id, regionId: null, label: country.name_local }] : [];

      for (const scope of scopes) {
        try {
          await this.#collectScope(country, scope, stats);
        } catch (error) {
          stats.addError(`пункты ${country.iso2}/${scope.label}`, error); // сбой региона не останавливает остальные
          this.log.error(`OSM: пункты ${country.iso2}/${scope.label}: ${error.message}`);
        }
        await sleep(this.config.osm.pauseMs);
      }
      this.log.info(`OSM: ${country.iso2} готово (добавлено ${stats.inserted}, обновлено ${stats.updated}, ошибок ${stats.failed})`);
    }
    return stats;
  }

  async #collectScope(country, { rel, regionId }, stats) {
    const t = this.config.osm.placesTimeoutS;
    // Города и малые города - все; сёла - только с указанным населением (иначе их сотни тысяч)
    const village = this.config.osm.allVillages ? '' : '["population"]';
    const ql = `[out:json][timeout:${t}][maxsize:536870912];area(${3600000000 + Number(rel)})->.a;(node(area.a)["place"~"^(city|town)$"];node(area.a)["place"="village"]${village};);out;`;
    const { elements } = await this.overpass.query(ql, (t + 30) * 1000);

    const byOsmId = new Map();
    const seenQids = new Set();
    for (const el of elements) {
      const tags = el.tags ?? {};
      const name = tags.name ?? tags['name:en'] ?? tags['name:ru'];
      if (el.type !== 'node' || !name || !PLACE_TYPES.has(tags.place) || !validLatLon(el.lat, el.lon)) continue;
      let qid = /^Q\d+$/.test(tags.wikidata ?? '') ? tags.wikidata : null;
      if (qid && seenQids.has(qid)) qid = null; // дубль QID в пределах пакета нарушил бы уникальный индекс
      if (qid) seenQids.add(qid);
      const population = parsePopulation(tags.population);
      byOsmId.set(el.id, {
        country_id: country.id,
        region_id: regionId,
        type: tags.place.toUpperCase(),
        name_local: name,
        name_ru: tags['name:ru'] ?? null,
        name_en: tags['name:en'] ?? null,
        population,
        population_source: population == null ? null : 'osm',
        lat: el.lat,
        lon: el.lon,
        wikidata_id: qid,
        osm_id: el.id,
        origin: 'collected',
      });
    }

    const raw = (sql) => this.db.raw(sql);
    const keepWikidata = `places.population_source = 'wikidata' OR excluded.population IS NULL`;
    const { stats: s, saved } = await this.upserter.upsert('places', [...byOsmId.values()], {
      conflict: '(osm_id) WHERE osm_id IS NOT NULL',
      merge: {
        country_id: raw('excluded.country_id'),
        region_id: raw('excluded.region_id'),
        type: raw('excluded.type'),
        name_local: raw('excluded.name_local'),
        // приоритет названий: Wikidata, затем OSM - существующие не затираем
        name_ru: raw('COALESCE(places.name_ru, excluded.name_ru)'),
        name_en: raw('COALESCE(places.name_en, excluded.name_en)'),
        lat: raw('excluded.lat'),
        lon: raw('excluded.lon'),
        wikidata_id: raw('COALESCE(places.wikidata_id, excluded.wikidata_id)'),
        // приоритет населения: Wikidata, затем OSM
        population: raw(`CASE WHEN ${keepWikidata} THEN places.population ELSE excluded.population END`),
        population_source: raw(`CASE WHEN ${keepWikidata} THEN places.population_source ELSE 'osm' END`),
        updated_at: raw('now()'),
      },
      // не перезаписываем изменённые пользователем и удалённые записи
      where: 'places.is_user_modified = false AND places.deleted_at IS NULL',
      returning: ['id', 'osm_id'],
    });
    await this.upserter.recordSources('osm', 'place', saved.map((r) => ({ externalId: `node/${r.osm_id}`, entityId: r.id })));
    stats.add(s);
  }
}

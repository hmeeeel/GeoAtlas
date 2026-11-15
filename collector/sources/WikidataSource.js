import { setTimeout as sleep } from 'node:timers/promises';
import { BaseSource } from './BaseSource.js';
import { Stats } from '../lib/stats.js';
import { chunks, parsePoint } from '../lib/geo.js';
import { regionLevelFor } from '../config.js';

const first = (rows, key) => rows.find((r) => r[key] != null)?.[key];
const qidOf = (uri) => uri?.split('/').pop();
const groupBy = (rows, keyFn) => {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
};

/** Население: берём значение с самой поздней датой (P585). */
function latestPopulation(rows) {
  const withPop = rows.filter((r) => r.pop != null && Number(r.pop) >= 0);
  if (withPop.length === 0) return null;
  withPop.sort((a, b) => (b.popDate ?? '').localeCompare(a.popDate ?? ''));
  return Math.round(Number(withPop[0].pop));
}

const COUNTRIES_QUERY = `
SELECT ?country ?iso2 ?iso3 ?native ?nameRu ?nameEn ?capitalLabel ?pop ?popDate ?area ?coord ?osmRel WHERE {
  { ?country wdt:P31 wd:Q3624078 ; wdt:P30 wd:Q46 . }
  UNION { VALUES ?country { wd:Q159 wd:Q184 } }
  ?country wdt:P297 ?iso2 .
  FILTER NOT EXISTS { ?country wdt:P576 [] }
  OPTIONAL { ?country wdt:P298 ?iso3 }
  OPTIONAL { ?country wdt:P1705 ?native }
  OPTIONAL { ?country rdfs:label ?nameRu FILTER(LANG(?nameRu) = "ru") }
  OPTIONAL { ?country rdfs:label ?nameEn FILTER(LANG(?nameEn) = "en") }
  OPTIONAL { ?country wdt:P36 ?capital . ?capital rdfs:label ?capitalLabel FILTER(LANG(?capitalLabel) = "ru") }
  OPTIONAL { ?country p:P1082 ?ps . ?ps ps:P1082 ?pop . OPTIONAL { ?ps pq:P585 ?popDate } }
  OPTIONAL { ?country wdt:P2046 ?area }
  OPTIONAL { ?country wdt:P625 ?coord }
  OPTIONAL { ?country wdt:P402 ?osmRel }
}`;

const regionsQuery = (qid) => `
SELECT ?region ?iso ?native ?nameRu ?nameEn ?pop ?popDate ?coord ?osmRel WHERE {
  ?region wdt:P17 wd:${qid} ; wdt:P31/wdt:P279* wd:Q10864048 .
  FILTER NOT EXISTS { ?region wdt:P576 [] }
  OPTIONAL { ?region wdt:P300 ?iso }
  OPTIONAL { ?region wdt:P1705 ?native }
  OPTIONAL { ?region rdfs:label ?nameRu FILTER(LANG(?nameRu) = "ru") }
  OPTIONAL { ?region rdfs:label ?nameEn FILTER(LANG(?nameEn) = "en") }
  OPTIONAL { ?region p:P1082 ?ps . ?ps ps:P1082 ?pop . OPTIONAL { ?ps pq:P585 ?popDate } }
  OPTIONAL { ?region wdt:P625 ?coord }
  OPTIONAL { ?region wdt:P402 ?osmRel }
}`;

const placesQuery = (qids) => `
SELECT ?item ?nameRu ?nameEn ?pop ?popDate ?tzLabel WHERE {
  VALUES ?item { ${qids.map((q) => `wd:${q}`).join(' ')} }
  OPTIONAL { ?item rdfs:label ?nameRu FILTER(LANG(?nameRu) = "ru") }
  OPTIONAL { ?item rdfs:label ?nameEn FILTER(LANG(?nameEn) = "en") }
  OPTIONAL { ?item p:P1082 ?ps . ?ps ps:P1082 ?pop . OPTIONAL { ?ps pq:P585 ?popDate } }
  OPTIONAL { ?item wdt:P421 ?tz . ?tz rdfs:label ?tzLabel FILTER(LANG(?tzLabel) = "en") }
}`;

export class WikidataSource extends BaseSource {
  get name() {
    return 'wikidata';
  }

  get stages() {
    return {
      countries: (ctx) => this.collectCountries(ctx),
      regions: (ctx) => this.collectRegions(ctx),
      places: (ctx) => this.refinePlaces(ctx),
    };
  }

  /** Один SPARQL-запрос - массив плоских объектов {переменная: значение}. Пауза после запроса - вежливость к источнику. */
  async #select(sparql) {
    const { url, timeoutMs, pauseMs } = this.config.wikidata;
    const data = await this.http.json(url, {
      method: 'POST',
      headers: { Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ query: sparql }),
      timeoutMs,
    });
    await sleep(pauseMs);
    return data.results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
  }

  async collectCountries(ctx) {
    const rows = await this.#select(COUNTRIES_QUERY);
    const data = [];
    for (const [uri, list] of groupBy(rows, (r) => r.country)) {
      const iso2 = first(list, 'iso2');
      if (!iso2 || !ctx.wants(iso2)) continue;
      const point = parsePoint(first(list, 'coord'));
      const nameRu = first(list, 'nameRu');
      const nameEn = first(list, 'nameEn');
      data.push({
        iso2,
        iso3: first(list, 'iso3') ?? null,
        name_local: first(list, 'native') ?? nameEn ?? nameRu ?? iso2,
        name_ru: nameRu ?? null,
        name_en: nameEn ?? null,
        capital_name: first(list, 'capitalLabel') ?? null,
        population: latestPopulation(list),
        area_km2: first(list, 'area') ? Number(first(list, 'area')) : null,
        lat: point?.lat ?? null,
        lon: point?.lon ?? null,
        wikidata_id: qidOf(uri),
        osm_relation_id: Number(first(list, 'osmRel')) || null,
      });
    }

    const columns = Object.keys(data[0] ?? {}).filter((c) => c !== 'iso2');
    const { stats, saved } = await this.upserter.upsert('countries', data, {
      conflict: '(iso2)',
      merge: { ...this.upserter.coalesceMerge('countries', columns), updated_at: this.db.raw('now()') },
      returning: ['id', 'wikidata_id'],
    });
    await this.upserter.recordSources('wikidata', 'country', saved.map((r) => ({ externalId: r.wikidata_id, entityId: r.id })));
    this.log.info(`Wikidata: страны - добавлено ${stats.inserted}, обновлено ${stats.updated}`);
    return stats;
  }

  async collectRegions(ctx) {
    const stats = new Stats();
    for (const country of await this.countries(ctx)) {
      const level = regionLevelFor(country.iso2);
      if (level == null || !country.wikidata_id) continue;
      try {
        const rows = await this.#select(regionsQuery(country.wikidata_id));
        const data = [];
        for (const [uri, list] of groupBy(rows, (r) => r.region)) {
          const point = parsePoint(first(list, 'coord'));
          const nameRu = first(list, 'nameRu');
          const nameEn = first(list, 'nameEn');
          const name = first(list, 'native') ?? nameEn ?? nameRu;
          if (!name) continue;
          data.push({
            country_id: country.id,
            name_local: name,
            name_ru: nameRu ?? null,
            name_en: nameEn ?? null,
            iso_3166_2: first(list, 'iso') ?? null,
            admin_level: level,
            population: latestPopulation(list),
            lat: point?.lat ?? null,
            lon: point?.lon ?? null,
            wikidata_id: qidOf(uri),
            osm_relation_id: Number(first(list, 'osmRel')) || null,
          });
        }
        const columns = Object.keys(data[0] ?? {}).filter((c) => c !== 'country_id' && c !== 'wikidata_id');
        const result = await this.upserter.upsert('regions', data, {
          conflict: '(country_id, wikidata_id)',
          merge: { ...this.upserter.coalesceMerge('regions', columns), updated_at: this.db.raw('now()') },
          returning: ['id', 'wikidata_id'],
        });
        await this.upserter.recordSources('wikidata', 'region', result.saved.map((r) => ({ externalId: r.wikidata_id, entityId: r.id })));
        stats.add(result.stats);
        this.log.info(`Wikidata: регионы ${country.iso2} - ${data.length}`);
      } catch (error) {
        stats.addError(`регионы ${country.iso2}`, error); // сбой одной страны не останавливает остальные
        this.log.error(`Wikidata: регионы ${country.iso2}: ${error.message}`);
      }
    }
    return stats;
  }

  /** Уточнение населённых пунктов пакетами QID: названия, население, часовой пояс. */
  async refinePlaces(ctx) {
    const stats = new Stats();
    const places = await ctx
      .filterCountries(this.db('places as p').join('countries as c', 'c.id', 'p.country_id'), 'c.iso2')
      .whereNotNull('p.wikidata_id')
      .whereNull('p.deleted_at')
      .where('p.is_user_modified', false)
      .select('p.id', 'p.wikidata_id');

    for (const batch of chunks(places, this.config.wikidata.refineBatch)) {
      try {
        const byQid = groupBy(await this.#select(placesQuery(batch.map((p) => p.wikidata_id))), (r) => qidOf(r.item));
        await this.db.transaction(async (trx) => {
          for (const place of batch) {
            const list = byQid.get(place.wikidata_id);
            if (!list) { stats.skipped++; continue; }
            const pop = latestPopulation(list);
            await trx('places').where({ id: place.id }).update({
              name_ru: trx.raw('COALESCE(?::text, name_ru)', [first(list, 'nameRu') ?? null]),
              name_en: trx.raw('COALESCE(?::text, name_en)', [first(list, 'nameEn') ?? null]),
              population: trx.raw('COALESCE(?::int, population)', [pop]),
              population_source: trx.raw(`CASE WHEN ?::int IS NOT NULL THEN 'wikidata' ELSE population_source END`, [pop]),
              timezone: trx.raw('COALESCE(timezone, ?::text)', [first(list, 'tzLabel')?.slice(0, 64) ?? null]),
              updated_at: trx.fn.now(),
            });
            stats.updated++;
          }
        });
        await this.upserter.recordSources('wikidata', 'place', batch.filter((p) => byQid.has(p.wikidata_id)).map((p) => ({ externalId: p.wikidata_id, entityId: p.id })));
      } catch (error) {
        stats.addError('уточнение пакета', error);
        this.log.error(`Wikidata: пакет не обработан: ${error.message}`);
      }
    }
    this.log.info(`Wikidata: уточнено пунктов - ${stats.updated}`);
    return stats;
  }
}

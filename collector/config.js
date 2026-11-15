import 'dotenv/config';

const num = (value, fallback) => (value === undefined || value === '' ? fallback : Number(value));
const list = (value, fallback) => (value ? value.split(',').map((s) => s.trim()).filter(Boolean) : fallback);

export const config = {
  userAgent: process.env.COLLECTOR_USER_AGENT ?? 'GeoAtlas-student/1.0 (contact: set-COLLECTOR_USER_AGENT-in-env)',
  batchSize: 500,

  http: {
    timeoutMs: num(process.env.HTTP_TIMEOUT_MS, 60_000),
    maxAttempts: 4,
    baseDelayMs: num(process.env.RETRY_BASE_MS, 2_000),
  },

  wikidata: {
    url: process.env.WIKIDATA_URL ?? 'https://query.wikidata.org/sparql',
    timeoutMs: 70_000,
    pauseMs: num(process.env.WIKIDATA_PAUSE_MS, 1_500),
    refineBatch: 300,
  },

  osm: {
    endpoints: list(process.env.OVERPASS_URLS, [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.private.coffee/api/interpreter',
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
      'https://overpass.openstreetmap.ru/api/interpreter',
    ]),
    attemptsPerEndpoint: num(process.env.OSM_ATTEMPTS, 2), // попыток на один сервер, потом переход к следующему
    rounds: num(process.env.OSM_ROUNDS, 3), // сколько кругов по всем серверам
    roundPauseMs: num(process.env.OSM_ROUND_PAUSE_MS, 30_000), // пауза, когда заняты все серверы
    allVillages: process.env.OSM_ALL_VILLAGES === '1', // 1 - собирать все сёла, а не только с населением
    pauseMs: num(process.env.OSM_PAUSE_MS, 5_000),
    placesTimeoutS: 180,
    boundaryTimeoutS: 300,
    // Допуск упрощения границ в градусах
    simplify: { country: 0.02, region: 0.005 },
  },

  opentripmap: {
    url: process.env.OTM_URL ?? 'https://api.opentripmap.com/0.1/en/places/geoname',
    apiKey: process.env.OPENTRIPMAP_API_KEY,
    dailyBudget: num(process.env.OTM_DAILY_BUDGET, 4_500), // лимит бесплатного плана - 5000 в сутки
    timeoutMs: num(process.env.OTM_TIMEOUT_MS, 15_000),
    pauseMs: num(process.env.OTM_PAUSE_MS, 150), // лимит - 10 запросов в секунду
    maxConsecutiveFailures: 5, // «предохранитель»: источник недоступен - прекращаем этап
  },

  regionLevel: { default: 4, none: ['AD', 'LI', 'LU', 'MC', 'MT', 'SM', 'VA', 'XK'] },
};

export function regionLevelFor(iso2) {
  return config.regionLevel.none.includes(iso2) ? null : (config.regionLevel[iso2] ?? config.regionLevel.default);
}

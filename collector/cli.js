import { parseArgs } from 'node:util';
import { createPipeline, PIPELINE_ORDER } from './pipeline.js';

// npm run collect:all                                  - весь конвейер
// npm run collect -- --source=osm --country=BY,RO      - один источник и/или страны
const { values } = parseArgs({ options: { source: { type: 'string' }, country: { type: 'string' } } });
const known = [...new Set(PIPELINE_ORDER.map(([source]) => source))];

if (values.source && !known.includes(values.source)) {
  console.error(`Неизвестный источник "${values.source}". Доступны: ${known.join(', ')}`);
  process.exit(1);
}

const { pipeline, db } = createPipeline();
try {
  await pipeline.run({ only: values.source, countries: values.country?.split(',').map((c) => c.trim()) });
} catch {
  process.exitCode = 1;
} finally {
  await db.destroy();
}

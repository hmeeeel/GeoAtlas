import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createDb } from './connection.js';

const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const db = createDb();

try {
  if (process.argv[2] === 'rollback') {
    const [batch, files] = await db.migrate.rollback({ directory });
    console.log(`Откат партии ${batch}:`, files);
  } else {
    const [batch, files] = await db.migrate.latest({ directory });
    console.log(files.length ? `Применены миграции (партия ${batch}): ${files.join(', ')}` : 'Миграции уже применены');
  }
} catch (err) {
  console.error('Ошибка миграции:', err.message);
  process.exitCode = 1;
} finally {
  await db.destroy();
}

import cron from 'node-cron';
import { createPipeline } from './pipeline.js';

const { pipeline, log } = createPipeline();
let running = false;

cron.schedule('0 3 * * 0', async () => {
  if (running) return log.warn('Предыдущий запуск ещё не завершён - пропускаем');
  running = true;
  try {
    await pipeline.run({});
  } catch (error) {
    log.error(error.message);
  } finally {
    running = false;
  }
});

log.info('Планировщик запущен: сбор данных каждое воскресенье в 03:00');

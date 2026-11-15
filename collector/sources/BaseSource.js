/**
 * Общий интерфейс источника: у каждого источника есть имя и набор этапов (stages).
 * Конвейер вызывает runStage(имя, контекст) и получает Stats; детали источника ему неизвестны (LSP).
 */
export class BaseSource {
  constructor({ db, http, upserter, log, config }) {
    Object.assign(this, { db, http, upserter, log, config });
  }

  get name() {
    throw new Error('Не реализовано');
  }

  /** {имяЭтапа: async (ctx) => Stats} */
  get stages() {
    throw new Error('Не реализовано');
  }

  /** Источник можно отключить (например, нет ключа API): конвейер его пропустит. */
  isEnabled() {
    return true;
  }

  runStage(stage, ctx) {
    const run = this.stages[stage];
    if (!run) throw new Error(`У источника ${this.name} нет этапа ${stage}`);
    return run(ctx);
  }

  /** Страны из БД с учётом фильтра --country. */
  countries(ctx) {
    return ctx.filterCountries(this.db('countries').select('*'));
  }
}

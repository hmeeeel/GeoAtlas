import { orderSql, toCamel } from '../sql.js';

/**
 * Базовый репозиторий: динамически собирает SQL (WHERE / ORDER BY / LIMIT) из параметров GraphQL.
 * Потомки задают таблицу, белый список сортировки и свои условия фильтрации (принцип открытости/закрытости).
 */
export class BaseRepository {
  tableName = '';
  orderColumns = {};
  defaultOrderField = 'NAME';

  constructor(db) {
    this.db = db;
  }

  /** Базовый запрос; потомок может добавить обязательные условия (например, скрыть удалённые). */
  baseQuery() {
    return this.db(this.tableName);
  }

  /** Условия WHERE добавляются только для переданных параметров. */
  applyFilters(qb) {
    return qb;
  }

  async findById(id) {
    return toCamel(await this.baseQuery().where({ id }).first());
  }

  async findByIds(ids) {
    const rows = await this.baseQuery().whereIn('id', ids);
    return new Map(rows.map((row) => [String(row.id), toCamel(row)]));
  }

  /** Страница {nodes, totalCount}: данные и COUNT(*) считаются в БД. */
  async findPage({ filter = {}, orderBy, pagination }) {
    const { limit, offset } = pagination;
    const base = this.applyFilters(this.baseQuery(), filter);
    const order = orderSql(orderBy, this.orderColumns, this.defaultOrderField);
    const [rows, [{ count }]] = await Promise.all([
      base.clone().select('*').orderByRaw(order).limit(limit).offset(offset),
      base.clone().count('* as count'),
    ]);
    return { nodes: rows.map(toCamel), totalCount: Number(count) };
  }

  /**
   * Страницы потомков сразу для многих родителей (для DataLoader):
   * ROW_NUMBER() OVER (PARTITION BY parent) ограничивает выборку на каждого родителя.
   * Возвращает Map: id родителя - {nodes, totalCount}.
   */
  async findPagesByParent(parentColumn, parentIds, { filter = {}, orderBy, pagination }) {
    const { limit, offset } = pagination;
    const base = this.applyFilters(this.baseQuery().whereIn(parentColumn, parentIds), filter);
    const order = orderSql(orderBy, this.orderColumns, this.defaultOrderField);
    const ranked = base
      .clone()
      .select('*')
      .select(this.db.raw(`ROW_NUMBER() OVER (PARTITION BY ${parentColumn} ORDER BY ${order}) AS rn`));

    const [rows, counts] = await Promise.all([
      this.db
        .select('*')
        .from(ranked.as('t'))
        .where('rn', '>', offset)
        .andWhere('rn', '<=', offset + limit)
        .orderBy([{ column: parentColumn }, { column: 'rn' }]),
      base.clone().select(parentColumn).count('* as count').groupBy(parentColumn),
    ]);

    const result = new Map(parentIds.map((id) => [String(id), { nodes: [], totalCount: 0 }]));
    for (const c of counts) result.get(String(c[parentColumn])).totalCount = Number(c.count);
    for (const row of rows) {
      const { rn, ...data } = row;
      result.get(String(row[parentColumn])).nodes.push(toCamel(data));
    }
    return result;
  }

  /** Количество записей по родителям: Map id - число. */
  async countByParent(parentColumn, parentIds) {
    const rows = await this.baseQuery().whereIn(parentColumn, parentIds).select(parentColumn).count('* as count').groupBy(parentColumn);
    return new Map(rows.map((r) => [String(r[parentColumn]), Number(r.count)]));
  }
}

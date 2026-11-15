/**
 * по выбору пользователя формирует текст GraphQL-запроса и объект variables.
 * Значения фильтров никогда не вставляются в текст запроса - только в variables.*/
const PLACE_FIELDS = ['id', 'nameLocal', 'nameRu', 'nameEn', 'type', 'population', 'populationSource', 'lat', 'lon', 'timezone', 'origin'];
const COUNTRY_FIELDS = ['id', 'iso2', 'iso3', 'nameLocal', 'nameRu', 'nameEn', 'capitalName', 'population', 'areaKm2', 'lat', 'lon', 'regionsCount', 'placesCount'];
const COUNTRY_PLAIN = COUNTRY_FIELDS.filter((f) => !f.endsWith('Count'));
const REGION_FIELDS = ['id', 'nameLocal', 'nameRu', 'nameEn', 'iso31662', 'population', 'lat', 'lon', 'placesCount'];
const SOURCE_FIELDS = ['source', 'externalId', 'fetchedAt'];

/** Поля, без которых карта не покажет результат: всегда в запросе. */
export const REQUIRED_FIELDS = ['id', 'nameLocal', 'nameRu', 'lat', 'lon'];

/**
 * Дерево доступных данных. Глубина (1–4) - сколько уровней дерева попадёт в запрос.
 * `page: true` - вложенный список со страницей {totalCount, nodes}.*/
export const TREES = {
  places: {
    root: 'places',
    node: {
      fields: PLACE_FIELDS,
      defaults: ['type', 'population'],
      children: [
        {
          key: 'region',
          label: 'Регион',
          fields: REGION_FIELDS.filter((f) => f !== 'placesCount'),
          defaults: ['id', 'nameRu'],
          children: [{ key: 'country', label: 'Страна региона', fields: COUNTRY_PLAIN, defaults: ['id', 'nameRu', 'iso2'] }],
        },
        { key: 'country', label: 'Страна', fields: COUNTRY_PLAIN, defaults: ['id', 'nameRu', 'iso2'] },
        { key: 'sources', label: 'Источники данных', fields: SOURCE_FIELDS, defaults: ['source', 'fetchedAt'] },
      ],
    },
  },
  countries: {
    root: 'countries',
    node: {
      fields: COUNTRY_FIELDS,
      defaults: ['iso2', 'population', 'regionsCount'],
      children: [
        {
          key: 'regions',
          label: 'Регионы',
          page: true,
          fields: REGION_FIELDS,
          defaults: ['id', 'nameRu', 'iso31662'],
          children: [
            {
              key: 'places',
              label: 'Населённые пункты региона',
              page: true,
              fields: PLACE_FIELDS,
              defaults: ['id', 'nameRu', 'population'],
              children: [{ key: 'sources', label: 'Источники данных', fields: SOURCE_FIELDS, defaults: ['source', 'fetchedAt'] }],
            },
          ],
        },
      ],
    },
  },
};

export const maxDepth = (target) => {
  const depth = (node) => 1 + Math.max(0, ...(node.children ?? []).map(depth));
  return depth(TREES[target].node);
};

export const SORT_OPTIONS = {
  places: [['NAME', 'По названию'], ['POPULATION', 'По населению'], ['CREATED_AT', 'По дате добавления']],
  countries: [['NAME', 'По названию'], ['POPULATION', 'По населению']],
};

export const NESTED_LIMIT = 5;

export function defaultConfig(target = 'places') {
  return {
    target,
    depth: 1,
    fields: {}, // путь узла - выбранные поля; если пути нет - берутся поля по умолчанию
    filter: { countryId: '', type: '', search: '', populationMin: '' },
    sortField: 'NAME',
    sortDir: 'ASC',
    page: 1,
    limit: 20,
  };
}

/** Выбранные поля узла: обязательные (для корня) + отмеченные пользователем. */
export function selectedFields(config, path, node, isRoot) {
  const chosen = new Set(config.fields[path] ?? node.defaults);
  if (isRoot) REQUIRED_FIELDS.forEach((f) => chosen.add(f));
  return node.fields.filter((f) => chosen.has(f));
}

function render(node, path, level, config, indent) {
  const pad = '  '.repeat(indent);
  const lines = selectedFields(config, path, node, level === 1).map((f) => `${pad}${f}`);
  if (level < config.depth) {
    for (const child of node.children ?? []) {
      const childPath = path ? `${path}.${child.key}` : child.key;
      const inner = render(child, childPath, level + 1, config, child.page ? indent + 2 : indent + 1);
      if (inner.length === 0) continue;
      if (child.page) {
        lines.push(`${pad}${child.key}(pagination: $nested) {`, `${pad}  totalCount`, `${pad}  nodes {`, ...inner, `${pad}  }`, `${pad}}`);
      } else {
        lines.push(`${pad}${child.key} {`, ...inner, `${pad}}`);
      }
    }
  }
  return lines;
}

const usesNested = (node, level, depth) => level < depth && (node.children ?? []).some((c) => c.page || usesNested(c, level + 1, depth));

/** @returns {{ query: string, variables: object }} */
export function buildQuery(config) {
  const { target, filter } = config;
  const tree = TREES[target];
  const isPlaces = target === 'places';
  const search = filter.search?.trim();

  const f = {};
  if (isPlaces && filter.countryId) f.countryId = filter.countryId;
  if (isPlaces && filter.type) f.types = [filter.type];
  if (filter.populationMin !== '' && filter.populationMin != null) f.populationMin = Number(filter.populationMin);
  if (!isPlaces && search) f.search = search;

  const variables = {
    filter: Object.keys(f).length ? f : undefined,
    orderBy: { field: config.sortField, direction: config.sortDir },
    pagination: { limit: Number(config.limit), offset: (Number(config.page) - 1) * Number(config.limit) },
  };
  if (isPlaces && search) variables.search = search;

  const nested = usesNested(tree.node, 1, config.depth);
  if (nested) variables.nested = { limit: NESTED_LIMIT, offset: 0 };

  const declarations = [
    `$filter: ${isPlaces ? 'PlaceFilter' : 'CountryFilter'}`,
    ...(isPlaces ? ['$search: String'] : []),
    `$orderBy: ${isPlaces ? 'PlaceOrder' : 'CountryOrder'}`,
    '$pagination: PaginationInput',
    ...(nested ? ['$nested: PaginationInput'] : []),
  ];
  const args = ['filter: $filter', ...(isPlaces ? ['search: $search'] : []), 'orderBy: $orderBy', 'pagination: $pagination'];

  const body = render(tree.node, '', 1, config, 3);
  const query = [`query Builder(${declarations.join(', ')}) {`, `  ${tree.root}(${args.join(', ')}) {`, '    totalCount', '    nodes {', ...body, '    }', '  }', '}'].join('\n');

  return { query, variables: JSON.parse(JSON.stringify(variables)) }; // убираем undefined
}

/** Запрос контуров только для выбранных стран: country(id) { boundary }, по одному полю на страну. */
export function buildBoundaryQuery(ids) {
  const declarations = ids.map((_, i) => `$id${i}: ID!`).join(', ');
  const fields = ids.map((_, i) => `  c${i}: country(id: $id${i}) { id boundary }`).join('\n');
  return {
    query: `query Boundaries(${declarations}) {\n${fields}\n}`,
    variables: Object.fromEntries(ids.map((id, i) => [`id${i}`, id])),
  };
}

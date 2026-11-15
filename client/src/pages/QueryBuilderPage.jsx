import { useMemo, useState } from 'react';
import { gql, useApolloClient, useQuery } from '@apollo/client';
import { Alert, Box, Button, Checkbox, FormControlLabel, FormGroup, Grid, MenuItem, Paper, Slider, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { ruRU } from '@mui/x-data-grid/locales';
import ErrorBox from '../components/ErrorBox.jsx';
import MapView from '../components/MapView.jsx';
import { COUNTRY_OPTIONS } from '../lib/queries.js';
import { REQUIRED_FIELDS, SORT_OPTIONS, TREES, buildBoundaryQuery, buildQuery, defaultConfig, maxDepth, selectedFields } from '../lib/buildQuery.js';
import { TYPE_LABELS, displayName, fmtNum } from '../lib/format.js';

/** Не больше 5 контуров за раз: геометрии тяжёлые. Остальные страны показываются точкой. */
const MAX_BOUNDARIES = 5;

/** Узлы дерева, попавшие в запрос при выбранной глубине: для них показываются галочки полей. */
function visibleNodes(node, path, level, depth, label) {
  const own = [{ path, node, level, label }];
  if (level >= depth) return own;
  return own.concat(...(node.children ?? []).map((c) => visibleNodes(c, path ? `${path}.${c.key}` : c.key, level + 1, depth, c.label)));
}

function validateConfig(c) {
  const e = {};
  if (!Number.isInteger(Number(c.limit)) || c.limit < 1 || c.limit > 100) e.limit = 'От 1 до 100';
  if (!Number.isInteger(Number(c.page)) || c.page < 1) e.page = 'Не меньше 1';
  const s = c.filter.search.trim();
  if (s && s.length < 2) e.search = 'Не короче 2 символов';
  if (c.filter.populationMin !== '' && !/^\d+$/.test(String(c.filter.populationMin))) e.populationMin = 'Целое число ≥ 0';
  return e;
}

/** Краткое представление вложенного значения в ячейке таблицы. */
function summarize(v) {
  if (v == null) return '-';
  if (Array.isArray(v)) return v.map(summarize).join('; ') || '-';
  if (typeof v === 'object') {
    if (v.nodes) return `${v.totalCount}: ${v.nodes.map(summarize).join(', ')}`;
    if (v.source) return `${v.source}`;
    if (v.nameRu || v.nameLocal) return displayName(v);
    return Object.values(v).map(summarize).join(' ');
  }
  return String(v);
}

const toPoints = (rows) => rows.filter((r) => r.lat != null && r.lon != null).map((r) => ({ id: r.id, lat: r.lat, lon: r.lon, name: displayName(r) }));

export default function QueryBuilderPage() {
  const client = useApolloClient();
  const countries = useQuery(COUNTRY_OPTIONS);
  const [config, setConfig] = useState(defaultConfig('places'));
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [map, setMap] = useState(null); // {points, boundary, notices} | {error}
  const [mapBusy, setMapBusy] = useState(false);

  const { query, variables } = useMemo(() => buildQuery(config), [config]);
  const errors = validateConfig(config);
  const invalid = Object.keys(errors).length > 0;
  const isPlaces = config.target === 'places';
  const tree = TREES[config.target];
  const nodes = useMemo(() => visibleNodes(tree.node, '', 1, config.depth, 'Поля'), [tree, config.depth]);

  const patch = (p) => setConfig((c) => ({ ...c, ...p }));
  const patchFilter = (p) => setConfig((c) => ({ ...c, filter: { ...c.filter, ...p } }));
  const setTarget = (target) => target && setConfig(defaultConfig(target));
  const toggleField = (path, node, field, isRoot) => {
    const current = new Set(selectedFields(config, path, node, isRoot));
    current.has(field) ? current.delete(field) : current.add(field);
    patch({ fields: { ...config.fields, [path]: [...current] } });
  };

  async function execute(cfg = config) {
    const { query: text, variables: vars } = buildQuery(cfg);
    setStatus('loading');
    setMap(null); // новый запрос: кнопка скрывается, карта очищается
    setError(null);
    try {
      const { data } = await client.query({ query: gql(text), variables: vars, fetchPolicy: 'network-only' });
      const page = data[cfg.target];
      setResult({ target: cfg.target, rows: page.nodes, total: page.totalCount, cfg });
      setStatus('done');
    } catch (e) {
      setError(e);
      setStatus('error');
    }
  }

  async function showOnMap() {
    setMapBusy(true);
    const { rows, target } = result;
    try {
      if (target === 'places') {
        setMap({ points: toPoints(rows), boundary: [], notices: [] });
      } else {
        // Контуры запрашиваются отдельным запросом country(id) { boundary } только по нажатию кнопки
        const ids = rows.slice(0, MAX_BOUNDARIES).map((r) => r.id);
        const { query: text, variables: vars } = buildBoundaryQuery(ids);
        const { data } = await client.query({ query: gql(text), variables: vars, fetchPolicy: 'network-only' });
        const boundary = [];
        const points = [];
        const notices = [];
        rows.forEach((row, i) => {
          const geometry = i < MAX_BOUNDARIES ? data[`c${i}`]?.boundary : null;
          if (geometry) return boundary.push(geometry);
          if (i < MAX_BOUNDARIES) notices.push(`Контур недоступен: ${displayName(row)}`);
          points.push(...toPoints([row]));
        });
        if (rows.length > MAX_BOUNDARIES) notices.push(`Контуры показаны для первых ${MAX_BOUNDARIES} стран, остальные страны показаны точками.`);
        setMap({ points, boundary, notices });
      }
    } catch (e) {
      setMap({ error: e });
    } finally {
      setMapBusy(false);
    }
  }

  const gridColumns = useMemo(() => {
    const row = result?.rows[0];
    if (!row) return [];
    return Object.keys(row).map((key) => ({
      field: key,
      headerName: key,
      minWidth: key === 'id' ? 70 : 130,
      flex: typeof row[key] === 'object' && row[key] !== null ? 2 : 1,
      sortable: false,
      valueGetter: (v) => (key === 'type' ? TYPE_LABELS[v] ?? v : typeof v === 'object' ? summarize(v) : v),
      valueFormatter: (v) => (typeof v === 'number' && key === 'population' ? fmtNum(v) : v ?? '-'),
    }));
  }, [result]);

  return (
    <>
      <Typography variant="h5" sx={{ mb: 2 }}>Конструктор запроса</Typography>
      <Grid container spacing={3}>
        {/* ---- настройки ---- */}
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 2.5 }}>
            <Stack spacing={2}>
              <ToggleButtonGroup exclusive size="small" color="primary" value={config.target} onChange={(_, v) => setTarget(v)}>
                <ToggleButton value="places">Населённые пункты</ToggleButton>
                <ToggleButton value="countries">Страны</ToggleButton>
              </ToggleButtonGroup>

              {isPlaces && (
                <Stack direction="row" spacing={2}>
                  <TextField select size="small" fullWidth label="Страна" value={config.filter.countryId} onChange={(e) => patchFilter({ countryId: e.target.value })}>
                    <MenuItem value="">Любая</MenuItem>
                    {(countries.data?.countries.nodes ?? []).map((c) => <MenuItem key={c.id} value={c.id}>{displayName(c)}</MenuItem>)}
                  </TextField>
                  <TextField select size="small" fullWidth label="Тип" value={config.filter.type} onChange={(e) => patchFilter({ type: e.target.value })}>
                    <MenuItem value="">Любой</MenuItem>
                    {Object.entries(TYPE_LABELS).map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
                  </TextField>
                </Stack>
              )}
              <Stack direction="row" spacing={2}>
                <TextField size="small" fullWidth label="Название содержит" value={config.filter.search} onChange={(e) => patchFilter({ search: e.target.value })} error={Boolean(errors.search)} helperText={errors.search} />
                <TextField size="small" fullWidth label="Население от" value={config.filter.populationMin} onChange={(e) => patchFilter({ populationMin: e.target.value })} error={Boolean(errors.populationMin)} helperText={errors.populationMin} />
              </Stack>
              <Stack direction="row" spacing={2}>
                <TextField select size="small" fullWidth label="Сортировка" value={config.sortField} onChange={(e) => patch({ sortField: e.target.value })}>
                  {SORT_OPTIONS[config.target].map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
                </TextField>
                <TextField select size="small" label="Порядок" sx={{ minWidth: 140 }} value={config.sortDir} onChange={(e) => patch({ sortDir: e.target.value })}>
                  <MenuItem value="ASC">По возрастанию</MenuItem>
                  <MenuItem value="DESC">По убыванию</MenuItem>
                </TextField>
              </Stack>
              <Stack direction="row" spacing={2}>
                <TextField size="small" fullWidth label="Страница" type="number" value={config.page} onChange={(e) => patch({ page: e.target.value })} error={Boolean(errors.page)} helperText={errors.page} />
                <TextField size="small" fullWidth label="Количество" type="number" value={config.limit} onChange={(e) => patch({ limit: e.target.value })} error={Boolean(errors.limit)} helperText={errors.limit} />
              </Stack>

              <Box>
                <Typography variant="body2" color="text.secondary">Глубина запроса: {config.depth}</Typography>
                <Slider size="small" min={1} max={maxDepth(config.target)} step={1} marks value={config.depth} onChange={(_, v) => patch({ depth: v })} sx={{ maxWidth: 260, ml: 1 }} />
              </Box>

              {nodes.map(({ path, node, level, label }) => (
                <Box key={path || 'root'}>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{level === 1 ? tree.node === node && (isPlaces ? 'Населённый пункт' : 'Страна') : `${'↳ '.repeat(level - 1)}${label}`}</Typography>
                  <FormGroup row>
                    {node.fields.map((f) => {
                      const required = level === 1 && REQUIRED_FIELDS.includes(f);
                      return (
                        <FormControlLabel
                          key={f}
                          sx={{ mr: 1.5 }}
                          label={<Typography variant="body2">{f}</Typography>}
                          control={<Checkbox size="small" checked={selectedFields(config, path, node, level === 1).includes(f)} disabled={required} onChange={() => toggleField(path, node, f, level === 1)} />}
                        />
                      );
                    })}
                  </FormGroup>
                </Box>
              ))}

              <Stack direction="row" spacing={2}>
                <Button variant="contained" disabled={invalid || status === 'loading'} onClick={() => execute()}>Выполнить</Button>
                {status === 'done' && result.rows.length > 0 && (
                  <Button variant="outlined" disabled={mapBusy} onClick={showOnMap}>Показать на карте</Button>
                )}
              </Stack>
            </Stack>
          </Paper>
        </Grid>

        {/* ---- сгенерированный запрос ---- */}
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 2.5, height: '100%' }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Запрос</Typography>
            <Box component="pre" sx={{ m: 0, fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 12.5, overflow: 'auto', maxHeight: 420 }}>{query}</Box>
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Переменные</Typography>
            <Box component="pre" sx={{ m: 0, fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 12.5, overflow: 'auto' }}>{JSON.stringify(variables, null, 2)}</Box>
          </Paper>
        </Grid>
      </Grid>

      {/* ---- результат ---- */}
      <Paper sx={{ p: 2.5, mt: 3 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Результаты</Typography>
        {status === 'idle' && <Typography color="text.secondary">Задайте параметры и нажмите «Выполнить».</Typography>}
        {status === 'loading' && <Typography color="text.secondary">Загрузка…</Typography>}
        {status === 'error' && <ErrorBox error={error} onRetry={() => execute()} />}
        {status === 'done' && result.rows.length === 0 && <Typography color="text.secondary">Ничего не найдено</Typography>}
        {status === 'done' && result.rows.length > 0 && (
          <Box sx={{ overflowX: 'auto' }}>
            <DataGrid
              autoHeight
              sx={{ minWidth: 720 }}
              rows={result.rows}
              columns={gridColumns}
              rowCount={result.total}
              paginationMode="server"
              paginationModel={{ page: result.cfg.page - 1, pageSize: Number(result.cfg.limit) }}
              onPaginationModelChange={(m) => {
                const next = { ...config, page: m.page + 1, limit: m.pageSize };
                setConfig(next);
                execute(next);
              }}
              pageSizeOptions={[...new Set([10, 20, 50, 100, Number(result.cfg.limit)])].sort((a, b) => a - b)}
              disableColumnFilter
              disableColumnMenu
              disableRowSelectionOnClick
              localeText={ruRU.components.MuiDataGrid.localeText}
              getRowHeight={() => 'auto'}
            />
          </Box>
        )}
      </Paper>

      {/* ---- карта ---- */}
      {map && (
        <Paper sx={{ p: 2.5, mt: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Карта</Typography>
          {map.error ? (
            <ErrorBox message="Не удалось загрузить контуры стран." onRetry={showOnMap} />
          ) : (
            <Stack spacing={1.5}>
              {map.notices.map((n) => <Alert key={n} severity="info">{n}</Alert>)}
              <MapView boundary={map.boundary} points={map.points} />
            </Stack>
          )}
        </Paper>
      )}
    </>
  );
}

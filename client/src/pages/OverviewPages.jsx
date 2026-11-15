import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import { Breadcrumbs, Link, Paper, Stack, Typography } from '@mui/material';
import DataTable from '../components/DataTable.jsx';
import DebouncedInput, { acceptNumber, acceptSearch } from '../components/DebouncedInput.jsx';
import ErrorBox from '../components/ErrorBox.jsx';
import PlacesTable from '../components/PlacesTable.jsx';
import { usePlaceEditor } from '../components/PlaceEditor.jsx';
import { COUNTRIES, COUNTRY_REGIONS, PLACES, REGION_PLACES } from '../lib/queries.js';
import { displayName, fmtNum, fmtText } from '../lib/format.js';
import { useUrlListParams } from '../lib/useListParams.js';

const popFilter = (params) => (params.popMin !== '' ? { populationMin: Number(params.popMin) } : {});

function Crumbs({ items }) {
  return (
    <Breadcrumbs sx={{ mb: 2 }}>
      {items.map((item) =>
        item.to ? <Link key={item.label} component={RouterLink} to={item.to} underline="hover">{item.label}</Link> : <Typography key={item.label} color="text.primary">{item.label}</Typography>,
      )}
    </Breadcrumbs>
  );
}

/** Панель «поиск + население от» для списков стран и регионов. */
function SimpleFilters({ params, update }) {
  return (
    <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
      <DebouncedInput label="Поиск" placeholder="от 2 символов" value={params.q} accept={acceptSearch} onCommit={(q) => update({ q })} sx={{ minWidth: 220 }} />
      <DebouncedInput label="Население от" value={params.popMin} accept={acceptNumber} onCommit={(popMin) => update({ popMin })} sx={{ width: 160 }} />
    </Stack>
  );
}

const nameColumn = { field: 'name', headerName: 'Название', flex: 1.2, minWidth: 180, valueGetter: (_, row) => displayName(row) };
const populationColumn = { field: 'population', headerName: 'Население', width: 130, align: 'right', headerAlign: 'right', valueFormatter: (v) => fmtNum(v) };

/** Уровень 1: /countries */
export function CountriesPage() {
  const navigate = useNavigate();
  const { params, update, reset } = useUrlListParams();
  const { data, previousData, loading, error, refetch } = useQuery(COUNTRIES, {
    variables: { filter: { search: params.search, ...popFilter(params) }, orderBy: params.orderBy, pagination: params.pagination },
  });
  const page = (data ?? previousData)?.countries;
  const columns = [
    nameColumn,
    { field: 'iso2', headerName: 'Код ISO', width: 100, sortable: false },
    { field: 'capitalName', headerName: 'Столица', width: 160, sortable: false, valueFormatter: (v) => fmtText(v) },
    populationColumn,
    { field: 'regionsCount', headerName: 'Регионов', width: 110, align: 'right', headerAlign: 'right', sortable: false },
    { field: 'placesCount', headerName: 'Пунктов', width: 110, align: 'right', headerAlign: 'right', sortable: false, valueFormatter: (v) => fmtNum(v) },
  ];
  return (
    <>
      <Crumbs items={[{ label: 'Страны' }]} />
      <Paper sx={{ p: 2 }}>
        <SimpleFilters params={params} update={update} />
        <DataTable columns={columns} rows={page?.nodes} rowCount={page?.totalCount} loading={loading} error={error} onRetry={refetch} params={params} onChange={update} onReset={reset} onRowClick={(row) => navigate(`/countries/${row.id}`)} />
      </Paper>
    </>
  );
}

/** Уровень 2: /countries/:id - регионы страны (или сразу пункты, если регионального уровня нет). */
export function CountryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { params, update, reset } = useUrlListParams();
  const editor = usePlaceEditor();

  const regionsQuery = useQuery(COUNTRY_REGIONS, {
    variables: { id, filter: { search: params.search, ...popFilter(params) }, orderBy: params.orderBy, pagination: params.pagination },
  });
  const country = (regionsQuery.data ?? regionsQuery.previousData)?.country;
  const noRegions = country != null && country.regionsCount === 0;

  const placesQuery = useQuery(PLACES, {
    skip: !noRegions,
    variables: {
      filter: { countryId: id, ...(params.types.length ? { types: params.types } : {}), ...popFilter(params) },
      search: params.search,
      orderBy: params.orderBy,
      pagination: params.pagination,
    },
  });

  if (regionsQuery.error && !country) return <ErrorBox error={regionsQuery.error} onRetry={regionsQuery.refetch} />;
  if (regionsQuery.data && !country) return <Typography>Страна не найдена</Typography>;

  const crumbs = [{ label: 'Страны', to: '/countries' }, { label: country ? displayName(country) : '…' }];

  if (noRegions) {
    const page = (placesQuery.data ?? placesQuery.previousData)?.places;
    return (
      <>
        <Crumbs items={crumbs} />
        <Paper sx={{ p: 2 }}>
          <PlacesTable rows={page?.nodes} total={page?.totalCount} loading={placesQuery.loading} error={placesQuery.error} onRetry={placesQuery.refetch} params={params} update={update} reset={reset} editor={{ ...editor, create: () => editor.create({ countryId: id }) }} />
        </Paper>
        {editor.element}
      </>
    );
  }

  const page = country ? (regionsQuery.data ?? regionsQuery.previousData).country.regions : undefined;
  const columns = [
    nameColumn,
    { field: 'iso31662', headerName: 'Код ISO 3166-2', width: 150, sortable: false, valueFormatter: (v) => fmtText(v) },
    populationColumn,
    { field: 'placesCount', headerName: 'Пунктов', width: 110, align: 'right', headerAlign: 'right', sortable: false, valueFormatter: (v) => fmtNum(v) },
  ];
  return (
    <>
      <Crumbs items={crumbs} />
      <Paper sx={{ p: 2 }}>
        <SimpleFilters params={params} update={update} />
        <DataTable columns={columns} rows={page?.nodes} rowCount={page?.totalCount} loading={regionsQuery.loading} error={regionsQuery.error} onRetry={regionsQuery.refetch} params={params} onChange={update} onReset={reset} onRowClick={(row) => navigate(`/regions/${row.id}`)} />
      </Paper>
    </>
  );
}

/** Уровень 3: /regions/:id - населённые пункты региона. */
export function RegionPage() {
  const { id } = useParams();
  const { params, update, reset } = useUrlListParams();
  const editor = usePlaceEditor();
  const { data, previousData, loading, error, refetch } = useQuery(REGION_PLACES, {
    variables: {
      id,
      filter: { ...(params.types.length ? { types: params.types } : {}), ...popFilter(params) },
      orderBy: params.orderBy,
      pagination: params.pagination,
    },
  });
  const region = (data ?? previousData)?.region;
  if (error && !region) return <ErrorBox error={error} onRetry={refetch} />;
  if (data && !region) return <Typography>Регион не найден</Typography>;

  return (
    <>
      <Crumbs items={[{ label: 'Страны', to: '/countries' }, { label: region ? displayName(region.country) : '…', to: region && `/countries/${region.country.id}` }, { label: region ? displayName(region) : '…' }]} />
      <Paper sx={{ p: 2 }}>
        <PlacesTable
          rows={region?.places.nodes}
          total={region?.places.totalCount}
          loading={loading}
          error={error}
          onRetry={refetch}
          params={params}
          update={update}
          reset={reset}
          editor={{ ...editor, create: () => editor.create({ countryId: region?.country.id, regionId: id }) }}
        />
      </Paper>
      {editor.element}
    </>
  );
}

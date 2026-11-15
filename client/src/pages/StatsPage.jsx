import { useState } from 'react';
import { useQuery } from '@apollo/client';
import { Paper, Typography } from '@mui/material';
import DataTable from '../components/DataTable.jsx';
import { COUNTRY_STATS, REGION_STATS } from '../lib/queries.js';
import { fmtNum } from '../lib/format.js';
import { useLocalListParams } from '../lib/useListParams.js';

const num = (field, headerName, extra = {}) => ({ field, headerName, width: 130, align: 'right', headerAlign: 'right', sortable: false, valueFormatter: (v) => fmtNum(v), ...extra });
const columns = (title) => [
  { field: 'name', headerName: title, flex: 1.2, minWidth: 180 },
  num('citiesCount', 'Города'),
  num('townsCount', 'Малые города'),
  num('villagesCount', 'Сёла'),
  num('placesCount', 'Всего', { sortable: true }),
  num('totalPopulation', 'Суммарное население', { width: 200, sortable: true }),
];

/** Статистика: таблица по странам; клик по стране показывает регионы этой страны ниже. */
export default function StatsPage() {
  const [country, setCountry] = useState(null);
  const countries = useLocalListParams();
  const regions = useLocalListParams();

  const countryQuery = useQuery(COUNTRY_STATS, { variables: { orderBy: countries.params.orderBy, pagination: countries.params.pagination } });
  const regionQuery = useQuery(REGION_STATS, { skip: !country, variables: { countryId: country?.id, orderBy: regions.params.orderBy, pagination: regions.params.pagination } });
  const countryPage = (countryQuery.data ?? countryQuery.previousData)?.countryStats;
  const regionPage = (regionQuery.data ?? regionQuery.previousData)?.regionStats;

  return (
    <>
      <Typography variant="h5" sx={{ mb: 2 }}>Статистика по странам</Typography>
      <Paper sx={{ p: 2, mb: 3 }}>
        <DataTable columns={columns('Страна')} rows={countryPage?.nodes} rowCount={countryPage?.totalCount} loading={countryQuery.loading} error={countryQuery.error} onRetry={countryQuery.refetch} params={countries.params} onChange={countries.update} onReset={countries.reset}
          onRowClick={(row) => { setCountry(row); regions.reset(); }} />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Нажмите на страну, чтобы увидеть статистику по её регионам.</Typography>
      </Paper>

      {country && (
        <>
          <Typography variant="h5" sx={{ mb: 2 }}>Регионы: {country.name}</Typography>
          <Paper sx={{ p: 2 }}>
            <DataTable columns={columns('Регион')} rows={regionPage?.nodes} rowCount={regionPage?.totalCount} loading={regionQuery.loading} error={regionQuery.error} onRetry={regionQuery.refetch} params={regions.params} onChange={regions.update} onReset={regions.reset} />
          </Paper>
        </>
      )}
    </>
  );
}

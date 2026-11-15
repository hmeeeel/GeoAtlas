import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, MenuItem, Stack, TextField } from '@mui/material';
import DataTable from './DataTable.jsx';
import DebouncedInput, { acceptNumber, acceptSearch } from './DebouncedInput.jsx';
import { TYPE_LABELS, displayName, fmtCoord, fmtNum, fmtText } from '../lib/format.js';

/** Таблица населённых пунктов + панель фильтров (поиск, тип, население). Состояние - в параметрах адреса. */
export default function PlacesTable({ rows, total, loading, error, onRetry, params, update, reset, editor }) {
  const columns = [
    {
      field: 'name',
      headerName: 'Название',
      flex: 1.4,
      minWidth: 180,
      renderCell: ({ row }) => (
        <Box component={RouterLink} to={`/places/${row.id}`} title={row.nameEn ?? ''} sx={{ color: 'primary.main', textDecoration: 'none', py: 1 }}>
          {displayName(row)}
        </Box>
      ),
    },
    { field: 'type', headerName: 'Тип', width: 130, sortable: false, valueGetter: (_, row) => TYPE_LABELS[row.type] },
    { field: 'population', headerName: 'Население', width: 130, align: 'right', headerAlign: 'right', valueGetter: (_, row) => row.population, valueFormatter: (v) => fmtNum(v) },
    { field: 'coords', headerName: 'Координаты', width: 170, sortable: false, valueGetter: (_, row) => fmtCoord(row.lat, row.lon) },
    { field: 'timezone', headerName: 'Часовой пояс', width: 150, sortable: false, valueGetter: (_, row) => fmtText(row.timezone) },
    {
      field: 'actions',
      headerName: 'Действия',
      width: 170,
      sortable: false,
      renderCell: ({ row }) => (
        <Stack direction="row" spacing={0.5}>
          <Button size="small" onClick={() => editor.edit(row)}>Изм.</Button>
          <Button size="small" color="error" onClick={() => editor.remove(row)}>Удал.</Button>
        </Stack>
      ),
    },
  ];

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" alignItems="center">
        <DebouncedInput label="Поиск" placeholder="от 2 символов" value={params.q} accept={acceptSearch} onCommit={(q) => update({ q })} sx={{ minWidth: 220 }} />
        <TextField
          select
          size="small"
          label="Тип"
          sx={{ minWidth: 190 }}
          SelectProps={{ multiple: true, renderValue: (v) => (v.length ? v.map((t) => TYPE_LABELS[t]).join(', ') : 'все') }}
          value={params.types}
          onChange={(e) => update({ types: e.target.value })}
        >
          {Object.entries(TYPE_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </TextField>
        <DebouncedInput label="Население от" value={params.popMin} accept={acceptNumber} onCommit={(popMin) => update({ popMin })} sx={{ width: 160 }} />
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" onClick={() => editor.create()}>Добавить пункт</Button>
      </Stack>
      <DataTable columns={columns} rows={rows} rowCount={total} loading={loading} error={error} onRetry={onRetry} params={params} onChange={update} onReset={reset} />
    </Stack>
  );
}

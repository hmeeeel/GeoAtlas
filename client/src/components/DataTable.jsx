import { Box, Button, Typography } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { ruRU } from '@mui/x-data-grid/locales';
import ErrorBox from './ErrorBox.jsx';

function EmptyOverlay({ onReset }) {
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5, py: 4 }}>
      <Typography color="text.secondary">Ничего не найдено</Typography>
      {onReset && <Button size="small" variant="outlined" onClick={onReset}>Сбросить фильтры</Button>}
    </Box>
  );
}

/**
 * Таблица с серверной пагинацией и сортировкой. Три состояния: загрузка, ошибка (с кнопкой «Повторить»), пусто.
 * `params` и `onChange` - из useUrlListParams / useLocalListParams.
 */
export default function DataTable({ columns, rows, rowCount, loading, error, onRetry, params, onChange, onReset, onRowClick }) {
  if (error) return <ErrorBox error={error} onRetry={onRetry} />;
  const [sortField, sortDir] = params.sort.split(':');
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <DataGrid
        autoHeight
        sx={{ minWidth: 720 }}
        columns={columns}
        rows={rows ?? []}
        rowCount={rowCount ?? 0}
        loading={loading}
        paginationMode="server"
        sortingMode="server"
        paginationModel={{ page: params.page - 1, pageSize: params.size }}
        onPaginationModelChange={(m) => onChange({ page: m.page + 1, size: m.pageSize }, { resetPage: false })}
        sortModel={[{ field: sortField, sort: sortDir === 'desc' ? 'desc' : 'asc' }]}
        onSortModelChange={(model) => onChange({ sort: model[0] ? `${model[0].field}:${model[0].sort}` : '' })}
        pageSizeOptions={[10, 20, 50, 100]}
        disableColumnFilter
        disableColumnMenu
        disableRowSelectionOnClick
        onRowClick={onRowClick ? (p) => onRowClick(p.row) : undefined}
        localeText={ruRU.components.MuiDataGrid.localeText}
        slots={{ noRowsOverlay: EmptyOverlay }}
        slotProps={{ noRowsOverlay: { onReset } }}
        getRowHeight={() => 'auto'}
      />
    </Box>
  );
}

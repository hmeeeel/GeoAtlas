import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import { Box, Breadcrumbs, Button, Link, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import ErrorBox from '../components/ErrorBox.jsx';
import { usePlaceEditor } from '../components/PlaceEditor.jsx';
import { PLACE } from '../lib/queries.js';
import { TYPE_LABELS, displayName, fmtCoord, fmtDate, fmtNum, fmtText } from '../lib/format.js';

const ORIGIN = { collected: 'собран автоматически', manual: 'добавлен вручную' };

export default function PlacePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useQuery(PLACE, { variables: { id } });
  const place = data?.place;
  const editor = usePlaceEditor({ onDeleted: () => navigate(place?.region ? `/regions/${place.region.id}` : `/countries/${place?.country.id}`) });

  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!place) return <Typography color="text.secondary">{loading ? 'Загрузка…' : 'Населённый пункт не найден'}</Typography>;

  const rows = [
    ['Тип', TYPE_LABELS[place.type]],
    ['Название на местном языке', place.nameLocal],
    ['По-русски', fmtText(place.nameRu)],
    ['По-английски', fmtText(place.nameEn)],
    ['Население', `${fmtNum(place.population)}${place.populationSource ? ` (источник: ${place.populationSource})` : ''}`],
    ['Координаты', fmtCoord(place.lat, place.lon)],
    ['Часовой пояс', fmtText(place.timezone)],
    ['Происхождение записи', `${ORIGIN[place.origin] ?? place.origin}${place.isUserModified ? ', изменён пользователем' : ''}`],
    ['Создан', fmtDate(place.createdAt)],
    ['Обновлён', fmtDate(place.updatedAt)],
  ];

  return (
    <>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link component={RouterLink} to="/countries" underline="hover">Страны</Link>
        <Link component={RouterLink} to={`/countries/${place.country.id}`} underline="hover">{displayName(place.country)}</Link>
        {place.region && <Link component={RouterLink} to={`/regions/${place.region.id}`} underline="hover">{displayName(place.region)}</Link>}
        <Typography color="text.primary">{displayName(place)}</Typography>
      </Breadcrumbs>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems="flex-start">
        <Paper sx={{ p: 3, flex: 1, width: '100%' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h5">{displayName(place)}</Typography>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" onClick={() => editor.edit(place)}>Изменить</Button>
              <Button color="error" variant="outlined" onClick={() => editor.remove(place)}>Удалить</Button>
            </Stack>
          </Stack>
          <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'minmax(160px, 240px) 1fr', rowGap: 1.2, columnGap: 2 }}>
            {rows.map(([label, value]) => (
              <Box key={label} sx={{ display: 'contents' }}>
                <Typography component="dt" color="text.secondary">{label}</Typography>
                <Typography component="dd" sx={{ m: 0 }}>{value}</Typography>
              </Box>
            ))}
          </Box>
        </Paper>

        <Paper sx={{ p: 3, minWidth: { md: 360 }, width: { xs: '100%', md: 'auto' } }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Источники данных</Typography>
          {place.sources.length === 0 ? (
            <Typography color="text.secondary">Запись добавлена вручную, внешних источников нет.</Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow><TableCell>Источник</TableCell><TableCell>Идентификатор</TableCell><TableCell>Получено</TableCell></TableRow>
              </TableHead>
              <TableBody>
                {place.sources.map((s) => (
                  <TableRow key={`${s.source}-${s.externalId}`}>
                    <TableCell>{s.source}</TableCell>
                    <TableCell>{s.externalId}</TableCell>
                    <TableCell>{fmtDate(s.fetchedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>
      </Stack>
      {editor.element}
    </>
  );
}

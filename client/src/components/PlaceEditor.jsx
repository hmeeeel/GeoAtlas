import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { COUNTRY_OPTIONS, CREATE_PLACE, DELETE_PLACE, REGION_OPTIONS, UPDATE_PLACE } from '../lib/queries.js';
import { TYPE_LABELS, displayName } from '../lib/format.js';

const EMPTY = { countryId: '', regionId: '', type: 'VILLAGE', nameLocal: '', nameRu: '', nameEn: '', population: '', lat: '', lon: '', timezone: '' };

const fromPlace = (p) => ({
  countryId: p.country?.id ?? '',
  regionId: p.region?.id ?? '',
  type: p.type,
  nameLocal: p.nameLocal ?? '',
  nameRu: p.nameRu ?? '',
  nameEn: p.nameEn ?? '',
  population: p.population ?? '',
  lat: p.lat ?? '',
  lon: p.lon ?? '',
  timezone: p.timezone ?? '',
});

/** Проверка на клиенте (диапазоны); сервер проверяет те же правила ещё раз. */
function validate(f, isEdit) {
  const e = {};
  if (!isEdit && !f.countryId) e.countryId = 'Выберите страну';
  if (!f.nameLocal.trim()) e.nameLocal = 'Введите название';
  else if (f.nameLocal.length > 200) e.nameLocal = 'Не длиннее 200 символов';
  const lat = Number(f.lat);
  if (f.lat === '' || Number.isNaN(lat) || lat < -90 || lat > 90) e.lat = 'Широта: число от -90 до 90';
  const lon = Number(f.lon);
  if (f.lon === '' || Number.isNaN(lon) || lon < -180 || lon > 180) e.lon = 'Долгота: число от -180 до 180';
  if (f.population !== '' && (!Number.isInteger(Number(f.population)) || Number(f.population) < 0)) e.population = 'Целое число не меньше 0';
  return e;
}

function PlaceFormDialog({ place, defaults, onClose }) {
  const isEdit = Boolean(place);
  const [form, setForm] = useState(isEdit ? fromPlace(place) : { ...EMPTY, ...defaults });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const countries = useQuery(COUNTRY_OPTIONS);
  const regions = useQuery(REGION_OPTIONS, { variables: { countryId: form.countryId }, skip: !form.countryId });
  const [createPlace] = useMutation(CREATE_PLACE, { refetchQueries: 'active', awaitRefetchQueries: true });
  const [updatePlace] = useMutation(UPDATE_PLACE, { refetchQueries: 'active', awaitRefetchQueries: true });

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value, ...(key === 'countryId' ? { regionId: '' } : {}) }));
    setErrors((prev) => ({ ...prev, [key]: undefined, form: undefined }));
  };

  async function submit() {
    const found = validate(form, isEdit);
    setErrors(found);
    if (Object.keys(found).length) return;

    const text = (v) => (v.trim() === '' ? null : v.trim());
    const input = {
      type: form.type,
      nameLocal: form.nameLocal.trim(),
      nameRu: text(form.nameRu),
      nameEn: text(form.nameEn),
      population: form.population === '' ? null : Number(form.population),
      lat: Number(form.lat),
      lon: Number(form.lon),
      timezone: text(form.timezone),
      regionId: form.regionId || null,
    };
    setSaving(true);
    try {
      if (isEdit) await updatePlace({ variables: { id: place.id, input } });
      else await createPlace({ variables: { input: { ...input, countryId: form.countryId } } });
      onClose();
    } catch (err) {
      // Ошибки сервера BAD_USER_INPUT показываем рядом с полем
      const gql = err.graphQLErrors?.find((x) => x.extensions?.code === 'BAD_USER_INPUT');
      setErrors(gql ? { [gql.extensions.field ?? 'form']: gql.message } : { form: 'Не удалось сохранить. Попробуйте ещё раз.' });
      setSaving(false);
    }
  }

  const field = (key, label, props = {}) => (
    <TextField size="small" label={label} value={form[key]} onChange={set(key)} error={Boolean(errors[key])} helperText={errors[key]} {...props} />
  );

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isEdit ? 'Изменить населённый пункт' : 'Новый населённый пункт'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {errors.form && <Alert severity="error">{errors.form}</Alert>}
          {field('countryId', 'Страна', { select: true, disabled: isEdit, children: (countries.data?.countries.nodes ?? []).map((c) => <MenuItem key={c.id} value={c.id}>{displayName(c)}</MenuItem>) })}
          {field('regionId', 'Регион', {
            select: true,
            disabled: !form.countryId,
            children: [<MenuItem key="" value="">Без региона</MenuItem>, ...(regions.data?.regions.nodes ?? []).map((r) => <MenuItem key={r.id} value={r.id}>{displayName(r)}</MenuItem>)],
          })}
          {field('type', 'Тип', { select: true, children: Object.entries(TYPE_LABELS).map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>) })}
          {field('nameLocal', 'Название (на местном языке)', { required: true })}
          <Stack direction="row" spacing={2}>
            {field('nameRu', 'Название по-русски', { fullWidth: true })}
            {field('nameEn', 'Название по-английски', { fullWidth: true })}
          </Stack>
          <Stack direction="row" spacing={2}>
            {field('lat', 'Широта', { required: true, fullWidth: true })}
            {field('lon', 'Долгота', { required: true, fullWidth: true })}
          </Stack>
          <Stack direction="row" spacing={2}>
            {field('population', 'Население', { fullWidth: true })}
            {field('timezone', 'Часовой пояс', { fullWidth: true })}
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Отмена</Button>
        <Button variant="contained" onClick={submit} disabled={saving}>Сохранить</Button>
      </DialogActions>
    </Dialog>
  );
}

function ConfirmDelete({ place, onClose, onDeleted }) {
  const [deletePlace, { loading, error }] = useMutation(DELETE_PLACE, { refetchQueries: 'active', awaitRefetchQueries: true });
  async function confirm() {
    try {
      await deletePlace({ variables: { id: place.id } });
      onClose();
      onDeleted?.();
    } catch {
      /* ошибка выводится ниже */
    }
  }
  return (
    <Dialog open onClose={onClose}>
      <DialogTitle>Удалить населённый пункт?</DialogTitle>
      <DialogContent>
        <Typography>«{displayName(place)}» будет скрыт из списков.</Typography>
        {error && <Alert severity="error" sx={{ mt: 2 }}>Не удалось удалить. Попробуйте ещё раз.</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Отмена</Button>
        <Button color="error" variant="contained" onClick={confirm} disabled={loading}>Удалить</Button>
      </DialogActions>
    </Dialog>
  );
}

/** Хук: возвращает действия create/edit/remove и элемент с диалогами, который нужно вставить в страницу. */
export function usePlaceEditor({ onDeleted } = {}) {
  const [state, setState] = useState(null);
  const close = () => setState(null);
  let element = null;
  if (state?.mode === 'delete') element = <ConfirmDelete place={state.place} onClose={close} onDeleted={onDeleted} />;
  else if (state) element = <PlaceFormDialog place={state.place} defaults={state.defaults} onClose={close} />;
  return {
    element,
    create: (defaults) => setState({ mode: 'create', defaults }),
    edit: (place) => setState({ mode: 'edit', place }),
    remove: (place) => setState({ mode: 'delete', place }),
  };
}

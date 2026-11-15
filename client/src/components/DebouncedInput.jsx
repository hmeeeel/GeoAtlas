import { useEffect, useState } from 'react';
import { TextField } from '@mui/material';
import { useDebounce } from '../lib/useDebounce.js';

/**
 * Поле с задержкой 300 мс: значение уходит наружу (в адрес страницы - запрос) только после паузы
 * и только если оно допустимо (`accept`), например поиск - от 2 символов.
 */
export default function DebouncedInput({ value, onCommit, accept = () => true, ...props }) {
  const [text, setText] = useState(value);
  const debounced = useDebounce(text, 300);

  useEffect(() => setText(value), [value]); // внешний сброс фильтров
  useEffect(() => {
    if (debounced !== value && accept(debounced)) onCommit(debounced);
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  return <TextField size="small" value={text} onChange={(e) => setText(e.target.value)} {...props} />;
}

export const acceptSearch = (t) => t === '' || t.length >= 2;
export const acceptNumber = (t) => t === '' || /^\d{1,9}$/.test(t);

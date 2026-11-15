import { Alert, Button } from '@mui/material';

export default function ErrorBox({ error, onRetry, message }) {
  const text = message ?? (error?.networkError ? 'Не удалось получить данные. Проверьте соединение с сервером.' : (error?.message ?? 'Произошла ошибка'));
  return (
    <Alert severity="error" action={onRetry && <Button color="inherit" size="small" onClick={onRetry}>Повторить</Button>}>
      {text}
    </Alert>
  );
}

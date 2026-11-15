import { setTimeout as sleep } from 'node:timers/promises';

/** URL без параметров запроса: в логи и журнал не должны попадать ключи API. */
const safeUrl = (url) => {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return String(url);
  }
};

export class HttpError extends Error {
  constructor(status, url, retryAfterMs) {
    super(`HTTP ${status} ${safeUrl(url)}`);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
  get retryable() {
    return this.status === 429 || this.status === 408 || this.status >= 500;
  }
}

const parseRetryAfter = (value) => {
  if (!value) return undefined;
  const seconds = Number(value);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(ms) && ms > 0 ? Math.min(ms, 120_000) : undefined;
};

/**
 * HTTP-клиент с таймаутом и повторами: до maxAttempts попыток,
 * экспоненциальная задержка с jitter при 429, 5xx, сетевых ошибках и таймаутах; учитывается Retry-After.
 */
export class HttpClient {
  constructor({ userAgent, timeoutMs, maxAttempts = 4, baseDelayMs = 2000, log }) {
    Object.assign(this, { userAgent, timeoutMs, maxAttempts, baseDelayMs, log });
  }

  async json(url, { method = 'GET', headers = {}, body, timeoutMs = this.timeoutMs, maxAttempts = this.maxAttempts, onRetry } = {}) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          body,
          headers: { 'User-Agent': this.userAgent, Accept: 'application/json', ...headers },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) throw new HttpError(response.status, url, parseRetryAfter(response.headers.get('retry-after')));
        return await response.json(); // чтение тела тоже под таймаутом и внутри цикла повторов
      } catch (error) {
        lastError = error;
        if (error instanceof HttpError && !error.retryable) throw error;
        if (attempt === maxAttempts) break;
        const delay = error.retryAfterMs ?? this.baseDelayMs * 2 ** (attempt - 1) * (0.5 + Math.random());
        this.log.warn(`${safeUrl(url)}: попытка ${attempt}/${maxAttempts} не удалась (${error.cause?.code ?? error.name}: ${error.message}); повтор через ${Math.round(delay)} мс`);
        await onRetry?.(error, attempt);
        await sleep(delay);
      }
    }
    throw lastError;
  }
}

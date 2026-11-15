export class Logger {
  #write(level, text) {
    console.log(`[${new Date().toISOString()}] ${level} ${text}`);
  }
  info(text) { this.#write('INFO ', text); }
  warn(text) { this.#write('WARN ', text); }
  error(text) { this.#write('ERROR', text); }
}

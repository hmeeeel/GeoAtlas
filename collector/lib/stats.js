export class Stats {
  inserted = 0;
  updated = 0;
  skipped = 0;
  failed = 0;
  errors = [];

  add(other) {
    this.inserted += other.inserted;
    this.updated += other.updated;
    this.skipped += other.skipped;
    this.failed += other.failed;
    this.errors.push(...other.errors);
    return this;
  }

  addError(scope, error) {
    this.failed += 1;
    this.errors.push(`${scope}: ${error?.message ?? error}`);
  }
}

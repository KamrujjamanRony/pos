import { signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';

/**
 * The loading/rows/error triple every list screen needs, with a guard so a slow
 * response from an earlier filter cannot overwrite a newer one.
 */
export class ListStore<T, F = Record<string, unknown>> {
  readonly rows = signal<T[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private token = 0;

  constructor(private readonly loader: (filter: F) => Observable<T[]>) {}

  async load(filter: F = {} as F): Promise<T[]> {
    const current = ++this.token;
    this.loading.set(true);
    this.error.set(null);
    try {
      const rows = await firstValueFrom(this.loader(filter));
      if (current !== this.token) return this.rows();
      this.rows.set(rows ?? []);
      return rows ?? [];
    } catch (error) {
      if (current === this.token) {
        this.error.set(error instanceof Error ? error.message : 'Could not load the list.');
        this.rows.set([]);
      }
      return [];
    } finally {
      if (current === this.token) this.loading.set(false);
    }
  }

  /** Optimistically drop a row after a successful delete. */
  removeWhere(predicate: (row: T) => boolean): void {
    this.rows.update((rows) => rows.filter((row) => !predicate(row)));
  }
}

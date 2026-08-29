import { Component, input, model, output } from '@angular/core';
import { UiIcon } from './icon';

/** Search box + optional date range + a slot for screen-specific filters. */
@Component({
  selector: 'ui-filter-bar',
  imports: [UiIcon],
  template: `
    <div class="surface-card flex flex-wrap items-end gap-3 p-3.5">
      <div class="min-w-52 flex-1">
        <label class="mb-1.5 block text-[12px] font-medium text-muted" [attr.for]="searchId">
          {{ searchLabel() }}
        </label>
        <div class="relative">
          <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint">
            <ui-icon name="search" [size]="15" />
          </span>
          <input
            [id]="searchId"
            type="search"
            class="ctl pl-9"
            [placeholder]="placeholder()"
            [value]="search()"
            (input)="onSearch($event)"
          />
        </div>
      </div>

      @if (dates()) {
        <div class="w-36">
          <label class="mb-1.5 block text-[12px] font-medium text-muted" [attr.for]="fromId">
            From
          </label>
          <input
            [id]="fromId"
            type="date"
            class="ctl"
            [value]="from()"
            (change)="from.set($any($event.target).value)"
          />
        </div>
        <div class="w-36">
          <label class="mb-1.5 block text-[12px] font-medium text-muted" [attr.for]="toId"
            >To</label
          >
          <input
            [id]="toId"
            type="date"
            class="ctl"
            [value]="to()"
            (change)="to.set($any($event.target).value)"
          />
        </div>
      }

      <ng-content />

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="grid size-10 place-items-center rounded-xl border border-line bg-surface text-muted transition hover:border-brand/50 hover:text-brand-text"
          aria-label="Refresh"
          title="Refresh"
          (click)="refresh.emit()"
        >
          <ui-icon name="refresh" [size]="16" />
        </button>
        @if (exportable()) {
          <button
            type="button"
            class="grid size-10 place-items-center rounded-xl border border-line bg-surface text-muted transition hover:border-brand/50 hover:text-brand-text"
            aria-label="Export to CSV"
            title="Export to CSV"
            (click)="exported.emit()"
          >
            <ui-icon name="download" [size]="16" />
          </button>
        }
        @if (printable()) {
          <button
            type="button"
            class="grid size-10 place-items-center rounded-xl border border-line bg-surface text-muted transition hover:border-brand/50 hover:text-brand-text"
            aria-label="Print or save as PDF"
            title="Print / save as PDF"
            (click)="printed.emit()"
          >
            <ui-icon name="printer" [size]="16" />
          </button>
        }
        <ng-content select="[filter-actions]" />
      </div>
    </div>
  `,
  host: { class: 'block' },
})
export class UiFilterBar {
  readonly search = model('');
  readonly from = model('');
  readonly to = model('');
  readonly dates = input(false);
  readonly exportable = input(true);
  readonly printable = input(true);
  readonly searchLabel = input('Search');
  readonly placeholder = input('Search records…');

  readonly refresh = output<void>();
  readonly exported = output<void>();
  readonly printed = output<void>();

  private readonly uid = Math.random().toString(36).slice(2, 8);
  protected readonly searchId = `filter-search-${this.uid}`;
  protected readonly fromId = `filter-from-${this.uid}`;
  protected readonly toId = `filter-to-${this.uid}`;

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }
}

import { NgTemplateOutlet } from '@angular/common';
import { Component, TemplateRef, computed, input, output, signal } from '@angular/core';
import { money, prettyDate, qty } from '../../core/util/format';
import { UiIcon } from './icon';
import { UiEmpty, UiSkeleton, type Tone } from './primitives';

export type ColumnKind = 'text' | 'money' | 'number' | 'date' | 'badge' | 'strong' | 'mono';

export interface Column<T> {
  key: string;
  header: string;
  /** Raw value, used for sorting and as the default display value. */
  value: (row: T) => string | number | null | undefined;
  kind?: ColumnKind;
  align?: 'left' | 'right' | 'center';
  width?: string;
  sortable?: boolean;
  /** Secondary line rendered under the main value. */
  sub?: (row: T) => string | null | undefined;
  tone?: (row: T) => Tone;
  /** Hide below the `md` breakpoint to keep phone layouts readable. */
  hideOnMobile?: boolean;
}

type SortDirection = 'asc' | 'desc';

/**
 * The grid used by every list screen: sortable headers, client-side paging,
 * loading and empty states, staggered row entrance, and an optional actions
 * column driven by a projected `<ng-template>`.
 */
@Component({
  selector: 'ui-table',
  imports: [NgTemplateOutlet, UiIcon, UiEmpty, UiSkeleton],
  template: `
    <div class="surface-card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-line bg-surface-2/70">
              @for (column of columns(); track column.key) {
                <th
                  scope="col"
                  [style.width]="column.width"
                  [class]="headerClass(column)"
                  [attr.aria-sort]="ariaSort(column)"
                >
                  @if (column.sortable !== false) {
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 rounded transition hover:text-ink"
                      [class.text-brand-text]="sortKey() === column.key"
                      (click)="toggleSort(column.key)"
                    >
                      {{ column.header }}
                      <span
                        class="transition-transform duration-200"
                        [class.rotate-180]="sortKey() === column.key && sortDir() === 'asc'"
                        [class.opacity-0]="sortKey() !== column.key"
                      >
                        <ui-icon name="chevronDown" [size]="13" />
                      </span>
                    </button>
                  } @else {
                    {{ column.header }}
                  }
                </th>
              }
              @if (actions()) {
                <th scope="col" class="w-px px-4 py-3 text-right text-[11px] font-semibold tracking-wider text-faint uppercase">
                  <span class="sr-only">Actions</span>
                </th>
              }
            </tr>
          </thead>

          @if (!loading() && paged().length) {
            <tbody>
              @for (row of paged(); track trackRow($index, row); let i = $index) {
                <tr
                  class="stagger border-b border-line/70 transition-colors last:border-0 hover:bg-surface-2/60"
                  [style]="'--i:' + i"
                  [class.cursor-pointer]="clickable()"
                  [attr.tabindex]="clickable() ? 0 : null"
                  (click)="clickable() && rowClick.emit(row)"
                  (keydown.enter)="clickable() && rowClick.emit(row)"
                >
                  @for (column of columns(); track column.key) {
                    <td [class]="cellClass(column)">
                      @switch (column.kind ?? 'text') {
                        @case ('badge') {
                          <span [class]="badgeClass(column.tone?.(row) ?? 'neutral')">
                            {{ column.value(row) }}
                          </span>
                        }
                        @case ('money') {
                          <span class="num font-medium">{{ money(num(column.value(row))) }}</span>
                        }
                        @case ('number') {
                          <span class="num">{{ qty(num(column.value(row))) }}</span>
                        }
                        @case ('date') {
                          <span class="whitespace-nowrap text-muted">{{ date(text(column.value(row))) }}</span>
                        }
                        @case ('mono') {
                          <span class="font-mono text-[12.5px] tracking-tight text-brand-text">
                            {{ column.value(row) }}
                          </span>
                        }
                        @case ('strong') {
                          <span class="font-medium text-ink">{{ column.value(row) }}</span>
                        }
                        @default {
                          {{ column.value(row) }}
                        }
                      }
                      @if (column.sub?.(row); as subtitle) {
                        <div class="mt-0.5 truncate text-[12px] text-faint">{{ subtitle }}</div>
                      }
                    </td>
                  }
                  @if (actions(); as actionTemplate) {
                    <td class="px-4 py-2.5 text-right whitespace-nowrap" (click)="$event.stopPropagation()">
                      <ng-container
                        [ngTemplateOutlet]="actionTemplate"
                        [ngTemplateOutletContext]="{ $implicit: row }"
                      />
                    </td>
                  }
                </tr>
              }
            </tbody>
          }
        </table>
      </div>

      @if (loading()) {
        <div class="p-4">
          <ui-skeleton [count]="6" [height]="44" />
        </div>
      } @else if (!rows().length) {
        <ui-empty [title]="emptyTitle()" [message]="emptyMessage()" [icon]="'inbox'">
          <ng-content select="[empty-action]" />
        </ui-empty>
      }

      @if (!loading() && totalPages() > 1) {
        <div
          class="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px]"
        >
          <p class="text-muted">
            Showing <span class="font-medium text-ink">{{ rangeStart() }}–{{ rangeEnd() }}</span>
            of <span class="font-medium text-ink">{{ sorted().length }}</span>
          </p>
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink disabled:opacity-35"
              [disabled]="page() === 1"
              aria-label="Previous page"
              (click)="page.set(page() - 1)"
            >
              <ui-icon name="chevronLeft" [size]="16" />
            </button>
            @for (p of pageWindow(); track p) {
              <button
                type="button"
                class="h-8 min-w-8 rounded-lg px-2 text-[13px] font-medium transition"
                [class]="
                  p === page()
                    ? 'bg-brand text-white shadow-soft'
                    : 'text-muted hover:bg-surface-2 hover:text-ink'
                "
                [attr.aria-current]="p === page() ? 'page' : null"
                (click)="page.set(p)"
              >
                {{ p }}
              </button>
            }
            <button
              type="button"
              class="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink disabled:opacity-35"
              [disabled]="page() === totalPages()"
              aria-label="Next page"
              (click)="page.set(page() + 1)"
            >
              <ui-icon name="chevronRight" [size]="16" />
            </button>
          </div>
        </div>
      }
    </div>
  `,
  host: { class: 'block' },
})
export class UiTable<T> {
  readonly rows = input.required<readonly T[]>();
  readonly columns = input.required<readonly Column<T>[]>();
  readonly loading = input(false);
  readonly clickable = input(false);
  readonly pageSize = input(12);
  readonly emptyTitle = input('No records found');
  readonly emptyMessage = input('Adjust the filters, or add the first record to get started.');
  readonly actions = input<TemplateRef<{ $implicit: T }> | null>(null);
  readonly trackBy = input<(row: T) => string | number>();
  readonly initialSort = input<{ key: string; direction: SortDirection } | null>(null);

  readonly rowClick = output<T>();

  protected readonly sortKey = signal<string | null>(null);
  protected readonly sortDir = signal<SortDirection>('asc');
  protected readonly page = signal(1);

  protected readonly money = money;
  protected readonly qty = qty;
  protected readonly date = prettyDate;

  /** Cell values are loosely typed; these narrow them for the formatters. */
  protected num(value: string | number | null | undefined): number {
    return Number(value ?? 0);
  }

  protected text(value: string | number | null | undefined): string {
    return value == null ? '' : String(value);
  }

  protected readonly sorted = computed(() => {
    const rows = [...this.rows()];
    const key = this.sortKey() ?? this.initialSort()?.key ?? null;
    const direction = this.sortKey() ? this.sortDir() : (this.initialSort()?.direction ?? 'asc');
    if (!key) return rows;

    const column = this.columns().find((c) => c.key === key);
    if (!column) return rows;

    const factor = direction === 'asc' ? 1 : -1;
    return rows.sort((a, b) => {
      const left = column.value(a);
      const right = column.value(b);
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * factor;
      return String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true }) * factor;
    });
  });

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.sorted().length / this.pageSize())),
  );

  protected readonly paged = computed(() => {
    const current = Math.min(this.page(), this.totalPages());
    const start = (current - 1) * this.pageSize();
    return this.sorted().slice(start, start + this.pageSize());
  });

  protected readonly rangeStart = computed(() =>
    this.sorted().length ? (Math.min(this.page(), this.totalPages()) - 1) * this.pageSize() + 1 : 0,
  );
  protected readonly rangeEnd = computed(() =>
    Math.min(this.rangeStart() + this.pageSize() - 1, this.sorted().length),
  );

  /** A sliding window of at most five page buttons around the current page. */
  protected readonly pageWindow = computed(() => {
    const total = this.totalPages();
    const current = Math.min(this.page(), total);
    const start = Math.max(1, Math.min(current - 2, total - 4));
    return Array.from({ length: Math.min(5, total) }, (_, i) => start + i);
  });

  protected toggleSort(key: string): void {
    if (this.sortKey() === key) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortKey.set(key);
      this.sortDir.set('asc');
    }
    this.page.set(1);
  }

  protected ariaSort(column: Column<T>): string | null {
    if (this.sortKey() !== column.key) return null;
    return this.sortDir() === 'asc' ? 'ascending' : 'descending';
  }

  protected trackRow(index: number, row: T): string | number {
    const key = this.trackBy();
    if (key) return key(row);
    const candidate = (row as { id?: string | number }).id;
    return candidate ?? index;
  }

  protected headerClass(column: Column<T>): string {
    const align =
      column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left';
    const hide = column.hideOnMobile ? 'hidden md:table-cell' : '';
    return `px-4 py-3 text-[11px] font-semibold tracking-wider text-faint uppercase ${align} ${hide}`;
  }

  protected cellClass(column: Column<T>): string {
    const align =
      column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left';
    const hide = column.hideOnMobile ? 'hidden md:table-cell' : '';
    return `px-4 py-2.5 align-middle text-ink/90 ${align} ${hide}`;
  }

  protected badgeClass(tone: Tone): string {
    const tones: Record<Tone, string> = {
      brand: 'bg-brand-soft text-brand-text',
      pos: 'bg-pos-soft text-pos',
      neg: 'bg-neg-soft text-neg',
      warn: 'bg-warn-soft text-warn',
      info: 'bg-info-soft text-info',
      neutral: 'bg-surface-3 text-muted',
    };
    return `inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${tones[tone]}`;
  }
}

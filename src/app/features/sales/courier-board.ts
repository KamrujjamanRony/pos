import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { COURIER_CONDITIONS, type SalesEntry } from '../../core/models';
import { ListStore } from '../../core/services/list-store';
import { PosApi } from '../../core/services/pos-api';
import { ToastService } from '../../core/services/toast';
import { addDays, currency, hueOf, initials, shortDate, sum, today } from '../../core/util/format';
import { UiButton } from '../../shared/ui/button';
import { UiFilterBar } from '../../shared/ui/filter-bar';
import { UiIcon } from '../../shared/ui/icon';
import { UiBadge, UiEmpty, UiPageHeader, UiSkeleton, type Tone } from '../../shared/ui/primitives';

@Component({
  selector: 'app-courier-board',
  imports: [UiPageHeader, UiFilterBar, UiButton, UiBadge, UiIcon, UiEmpty, UiSkeleton],
  template: `
    <div class="space-y-4">
      <ui-page-header
        icon="truck"
        title="Courier board"
        subtitle="Every parcel out with a courier, and where it has got to."
      />

      <ui-filter-bar
        [(search)]="search"
        [(from)]="from"
        [(to)]="to"
        [dates]="true"
        [exportable]="false"
        searchLabel="Find a parcel"
        placeholder="Invoice number or customer…"
        (refresh)="reload()"
      />

      <div class="grid gap-4 lg:grid-cols-4">
        @for (column of board(); track column.value) {
          <section class="surface-card flex flex-col overflow-hidden" [attr.aria-label]="column.label">
            <header class="flex items-center gap-2.5 border-b border-line px-3.5 py-3">
              <span class="size-2 rounded-full" [class]="dotClass(column.tone)" aria-hidden="true"></span>
              <h2 class="flex-1 text-[13px] font-semibold text-ink">{{ column.label }}</h2>
              <ui-badge [tone]="column.tone">{{ column.rows.length }}</ui-badge>
            </header>

            <div class="min-h-32 flex-1 space-y-2.5 p-3">
              @if (store.loading()) {
                <ui-skeleton [count]="3" [height]="76" />
              } @else {
                @for (row of column.rows; track row.id; let i = $index) {
                  <article
                    class="stagger rounded-xl border border-line bg-surface-2/50 p-3 transition-shadow hover:shadow-card"
                    [style]="'--i:' + i"
                  >
                    <div class="flex items-start gap-2.5">
                      <span
                        class="grid size-8 shrink-0 place-items-center rounded-lg text-[11px] font-semibold text-white"
                        [style.background]="swatch(row.customerName ?? '')"
                      >
                        {{ short(row.customerName ?? 'W') }}
                      </span>
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-[13px] font-medium text-ink">
                          {{ row.customerName || 'Walk-in' }}
                        </p>
                        <p class="font-mono text-[11.5px] text-brand-text">{{ row.invoiceNo }}</p>
                      </div>
                    </div>

                    <dl class="mt-2 flex items-center justify-between text-[11.5px]">
                      <div>
                        <dt class="sr-only">Dispatched</dt>
                        <dd class="text-faint">{{ date(row.invoiceDate) }}</dd>
                      </div>
                      <div class="text-right">
                        <dt class="sr-only">Net amount</dt>
                        <dd class="num font-semibold text-ink">{{ currency(row.netAmount) }}</dd>
                      </div>
                    </dl>

                    <div class="mt-2.5 flex gap-1.5">
                      @if (column.value > 1) {
                        <ui-button
                          variant="ghost"
                          size="sm"
                          icon="chevronLeft"
                          [ariaLabel]="'Move ' + row.invoiceNo + ' back'"
                          (pressed)="move(row, column.value - 1)"
                        >
                          Back
                        </ui-button>
                      }
                      @if (column.value < 4) {
                        <ui-button
                          variant="soft"
                          size="sm"
                          trailingIcon="chevronRight"
                          [ariaLabel]="'Advance ' + row.invoiceNo"
                          (pressed)="move(row, column.value + 1)"
                        >
                          {{ nextLabel(column.value) }}
                        </ui-button>
                      }
                    </div>
                  </article>
                } @empty {
                  <p class="px-2 py-8 text-center text-[12.5px] text-faint">Nothing here.</p>
                }
              }
            </div>
          </section>
        }
      </div>

      @if (!store.loading() && !parcels().length) {
        <ui-empty
          title="No courier parcels in this window"
          message="Invoices with a courier partner and a delivery status show up on this board."
          icon="truck"
        />
      }

      <div class="surface-card flex flex-wrap items-center gap-6 p-4 text-[13px]">
        <p class="text-muted">
          In transit value
          <span class="num ml-1 font-semibold text-ink">{{ currency(inTransitValue()) }}</span>
        </p>
        <p class="text-muted">
          Delivered
          <span class="num ml-1 font-semibold text-pos">{{ deliveredCount() }}</span>
        </p>
        <p class="text-muted">
          Returned
          <span class="num ml-1 font-semibold text-neg">{{ returnedCount() }}</span>
        </p>
        <span class="ml-auto inline-flex items-center gap-1.5 text-faint">
          <ui-icon name="info" [size]="14" />
          Moving a card writes straight to the invoice’s courier status.
        </span>
      </div>
    </div>
  `,
  host: { class: 'block' },
})
export class CourierBoardPage {
  private readonly api = inject(PosApi);
  private readonly toast = inject(ToastService);

  protected readonly currency = currency;
  protected readonly date = shortDate;
  protected readonly short = initials;

  protected readonly search = signal('');
  protected readonly from = signal(addDays(today(), -30));
  protected readonly to = signal(today());

  protected readonly store = new ListStore<SalesEntry>((filter) => this.api.sales.search(filter));

  protected readonly parcels = computed(() => {
    const needle = this.search().toLowerCase();
    return this.store
      .rows()
      .filter((row) => (row.courierCondition ?? 0) > 0)
      .filter((row) =>
        needle ? `${row.invoiceNo} ${row.customerName}`.toLowerCase().includes(needle) : true,
      );
  });

  protected readonly board = computed(() =>
    COURIER_CONDITIONS.map((condition) => ({
      ...condition,
      tone: condition.tone as Tone,
      rows: this.parcels().filter((row) => row.courierCondition === condition.value),
    })),
  );

  protected readonly inTransitValue = computed(() =>
    sum(
      this.parcels().filter((row) => row.courierCondition === 1 || row.courierCondition === 2),
      (row) => row.netAmount ?? 0,
    ),
  );

  protected readonly deliveredCount = computed(
    () => this.parcels().filter((row) => row.courierCondition === 3).length,
  );

  protected readonly returnedCount = computed(
    () => this.parcels().filter((row) => row.courierCondition === 4).length,
  );

  constructor() {
    void this.reload();
  }

  protected reload(): void {
    void this.store.load({ fromDate: this.from(), toDate: this.to() });
  }

  protected dotClass(tone: Tone): string {
    const map: Record<Tone, string> = {
      brand: 'bg-brand',
      pos: 'bg-pos',
      neg: 'bg-neg',
      warn: 'bg-warn',
      info: 'bg-info',
      neutral: 'bg-faint',
    };
    return map[tone];
  }

  protected nextLabel(current: number): string {
    return COURIER_CONDITIONS.find((c) => c.value === current + 1)?.label ?? 'Next';
  }

  protected swatch(name: string): string {
    return `linear-gradient(135deg, oklch(0.62 0.16 ${hueOf(name)}), oklch(0.52 0.19 ${(hueOf(name) + 40) % 360}))`;
  }

  protected async move(row: SalesEntry, condition: number): Promise<void> {
    // Optimistic: the card animates across immediately, then we persist.
    const previous = row.courierCondition;
    this.store.rows.update((rows) =>
      rows.map((candidate) =>
        candidate.id === row.id ? { ...candidate, courierCondition: condition } : candidate,
      ),
    );
    try {
      await firstValueFrom(this.api.updateCourierCondition(row.id, condition));
      this.toast.success(
        'Status updated',
        `${row.invoiceNo} is now ${this.nextLabel(condition - 1).toLowerCase()}.`,
      );
    } catch {
      this.store.rows.update((rows) =>
        rows.map((candidate) =>
          candidate.id === row.id ? { ...candidate, courierCondition: previous } : candidate,
        ),
      );
    }
  }
}

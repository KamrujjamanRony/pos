import { Component, computed, inject, signal } from '@angular/core';
import type { GrossProfitRow } from '../../core/models';
import { ListStore } from '../../core/services/list-store';
import { PosApi } from '../../core/services/pos-api';
import { PrintService } from '../../core/services/print';
import {
  addDays,
  currency,
  dateRange,
  downloadCsv,
  percent,
  shortDate,
  sum,
  today,
} from '../../core/util/format';
import { UiColumns, UiMeter, type Point } from '../../shared/ui/charts';
import { UiFilterBar } from '../../shared/ui/filter-bar';
import { UiCard, UiEmpty, UiPageHeader, UiSkeleton } from '../../shared/ui/primitives';
import { UiStat } from '../../shared/ui/stat';
import { UiTable, type Column } from '../../shared/ui/table';

@Component({
  selector: 'app-gross-profit-report',
  imports: [
    UiPageHeader,
    UiFilterBar,
    UiTable,
    UiCard,
    UiStat,
    UiColumns,
    UiMeter,
    UiEmpty,
    UiSkeleton,
  ],
  template: `
    <div class="space-y-4">
      <ui-page-header
        icon="trendUp"
        title="Gross profit"
        subtitle="Sale value against the cost of what went out of the door."
      />

      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ui-stat
          label="Sales"
          [value]="sales()"
          format="money"
          prefix="৳"
          icon="receipt"
          [series]="1"
        />
        <ui-stat
          label="Cost of goods"
          [value]="cost()"
          format="money"
          prefix="৳"
          icon="truck"
          [series]="2"
          [upIsGood]="false"
        />
        <ui-stat
          label="Gross profit"
          [value]="profit()"
          format="money"
          prefix="৳"
          icon="trendUp"
          [series]="3"
          [trend]="trend()"
        />
        <ui-stat
          label="Average margin"
          [value]="margin()"
          format="percent"
          icon="percent"
          [series]="6"
        />
      </div>

      <ui-filter-bar
        [(search)]="search"
        [(from)]="from"
        [(to)]="to"
        [dates]="true"
        searchLabel="Filter days"
        placeholder="Search by date…"
        (refresh)="reload()"
        (exported)="exportCsv()"
        (printed)="printPdf()"
      />

      <ui-card
        heading="Profit by day"
        subheading="Sales less cost, per trading day"
        icon="chart"
        [padded]="false"
      >
        <div card-actions class="hidden text-right sm:block">
          <p class="text-[11px] tracking-wide text-faint uppercase">Best day</p>
          <p class="text-[13px] font-semibold text-ink">{{ bestDay() }}</p>
        </div>
        <div class="p-4">
          @if (store.loading()) {
            <ui-skeleton [count]="1" [height]="240" />
          } @else if (series().length) {
            <ui-columns
              [data]="series()"
              [height]="250"
              color="var(--viz-3)"
              ariaLabel="Gross profit by day"
            />
          } @else {
            <ui-empty title="No sales in this window" icon="chart" />
          }
        </div>
      </ui-card>

      <ui-card
        heading="Margin band"
        subheading="How each day's margin compares with the period average"
        icon="target"
      >
        @if (store.loading()) {
          <ui-skeleton [count]="5" [height]="28" />
        } @else {
          <ul class="space-y-3">
            @for (row of topMargins(); track row.date; let i = $index) {
              <li class="stagger flex items-center gap-3" [style]="'--i:' + i">
                <span class="w-20 shrink-0 text-[12.5px] text-muted">{{ date(row.date) }}</span>
                <ui-meter
                  [value]="row.marginPercent"
                  [max]="maxMargin()"
                  [color]="row.marginPercent >= margin() ? 'var(--viz-3)' : 'var(--viz-4)'"
                  [ariaLabel]="'Margin on ' + row.date"
                />
                <span class="num w-16 shrink-0 text-right text-[12.5px] font-medium text-ink">
                  {{ pct(row.marginPercent) }}
                </span>
              </li>
            }
          </ul>
        }
      </ui-card>

      <ui-table
        [rows]="rows()"
        [columns]="columns"
        [loading]="store.loading()"
        [pageSize]="15"
        [trackBy]="trackRow"
        emptyTitle="No trading days"
        emptyMessage="Widen the date range to include days with sales."
      />
    </div>
  `,
  host: { class: 'block' },
})
export class GrossProfitReportPage {
  private readonly api = inject(PosApi);
  private readonly print = inject(PrintService);

  protected readonly date = shortDate;
  protected readonly pct = (value: number) => percent(value);

  protected readonly search = signal('');
  protected readonly from = signal(addDays(today(), -29));
  protected readonly to = signal(today());

  protected readonly trackRow = (row: GrossProfitRow) => row.date;

  protected readonly store = new ListStore<GrossProfitRow>((filter) =>
    this.api.grossProfit(filter),
  );

  protected readonly columns: Column<GrossProfitRow>[] = [
    { key: 'date', header: 'Date', value: (row) => row.date, kind: 'date' },
    {
      key: 'salesAmount',
      header: 'Sales',
      value: (row) => row.salesAmount,
      kind: 'money',
      align: 'right',
    },
    {
      key: 'costAmount',
      header: 'Cost',
      value: (row) => row.costAmount,
      kind: 'money',
      align: 'right',
      hideOnMobile: true,
    },
    { key: 'profit', header: 'Profit', value: (row) => row.profit, kind: 'money', align: 'right' },
    {
      key: 'marginPercent',
      header: 'Margin',
      value: (row) => `${row.marginPercent.toFixed(1)}%`,
      kind: 'badge',
      align: 'right',
      tone: (row) => (row.marginPercent >= 15 ? 'pos' : row.marginPercent >= 8 ? 'warn' : 'neg'),
    },
  ];

  protected readonly rows = computed(() => {
    const needle = this.search().toLowerCase();
    return this.store.rows().filter((row) => (needle ? row.date.includes(needle) : true));
  });

  protected readonly sales = computed(() => sum(this.rows(), (row) => row.salesAmount));
  protected readonly cost = computed(() => sum(this.rows(), (row) => row.costAmount));
  protected readonly profit = computed(() => sum(this.rows(), (row) => row.profit));
  protected readonly margin = computed(() =>
    this.sales() ? (this.profit() / this.sales()) * 100 : 0,
  );
  protected readonly trend = computed(() =>
    this.rows()
      .slice(-12)
      .map((row) => row.profit),
  );

  protected readonly series = computed<Point[]>(() =>
    this.rows().map((row) => ({ label: shortDate(row.date), value: row.profit })),
  );

  protected readonly topMargins = computed(() =>
    [...this.rows()].sort((a, b) => b.marginPercent - a.marginPercent).slice(0, 8),
  );
  protected readonly maxMargin = computed(() =>
    Math.max(1, ...this.rows().map((row) => row.marginPercent)),
  );

  protected readonly bestDay = computed(() => {
    const best = [...this.rows()].sort((a, b) => b.profit - a.profit)[0];
    return best ? `${shortDate(best.date)} · ${percent(best.marginPercent)}` : '—';
  });

  constructor() {
    void this.reload();
  }

  protected reload(): void {
    void this.store.load({ fromDate: this.from(), toDate: this.to() });
  }

  /** One row shape, shared by the CSV export and the printed report. */
  private reportRows(): Record<string, unknown>[] {
    return this.rows().map((row) => ({
      Date: row.date,
      Sales: row.salesAmount,
      Cost: row.costAmount,
      Profit: row.profit,
      'Margin %': row.marginPercent,
    }));
  }

  protected exportCsv(): void {
    downloadCsv('gross-profit', this.reportRows());
  }

  protected printPdf(): void {
    this.print.report({
      title: 'Gross profit',
      subtitle: dateRange(this.from(), this.to()),
      filename: 'gross-profit',
      filters: [{ label: 'Search', value: this.search() || 'All days' }],
      summary: [
        { label: 'Sales', value: currency(this.sales()) },
        { label: 'Cost of goods', value: currency(this.cost()) },
        { label: 'Gross profit', value: currency(this.profit()) },
        { label: 'Average margin', value: percent(this.margin()) },
      ],
      sections: [
        {
          rows: this.reportRows(),
          totals: {
            Sales: this.sales(),
            Cost: this.cost(),
            Profit: this.profit(),
          },
          emptyMessage: 'No trading days in this window.',
        },
      ],
    });
  }
}

import { Component, computed, effect, inject, signal } from '@angular/core';
import type { TopItemRow } from '../../core/models';
import { ListStore } from '../../core/services/list-store';
import { Lookups } from '../../core/services/lookups';
import { PosApi } from '../../core/services/pos-api';
import { PrintService } from '../../core/services/print';
import {
  addDays,
  currency,
  dateRange,
  downloadCsv,
  money,
  sum,
  today,
} from '../../core/util/format';
import { UiColumns, UiDonut, type Point } from '../../shared/ui/charts';
import { UiFilterBar } from '../../shared/ui/filter-bar';
import { UiSegmented } from '../../shared/ui/overlays';
import { UiCard, UiEmpty, UiPageHeader, UiSkeleton } from '../../shared/ui/primitives';
import { UiStat } from '../../shared/ui/stat';
import { UiTable, type Column } from '../../shared/ui/table';

type RankBy = 'Value' | 'Quantity';

@Component({
  selector: 'app-top-items-report',
  imports: [
    UiPageHeader,
    UiFilterBar,
    UiTable,
    UiCard,
    UiStat,
    UiColumns,
    UiDonut,
    UiSegmented,
    UiEmpty,
    UiSkeleton,
  ],
  template: `
    <div class="space-y-4">
      <ui-page-header
        icon="sparkles"
        title="Top items"
        subtitle="What actually sells, ranked by value or by units moved."
      >
        <ui-segmented [options]="rankOptions" [(value)]="rankBy" ariaLabel="Rank by" />
      </ui-page-header>

      <div class="grid gap-4 sm:grid-cols-3">
        <ui-stat
          label="Items sold"
          [value]="rows().length"
          format="integer"
          icon="tag"
          [series]="1"
        />
        <ui-stat label="Units moved" [value]="units()" format="integer" icon="box" [series]="3" />
        <ui-stat
          label="Revenue"
          [value]="revenue()"
          format="money"
          prefix="৳"
          icon="money"
          [series]="6"
        />
      </div>

      <ui-filter-bar
        [(search)]="search"
        [(from)]="from"
        [(to)]="to"
        [dates]="true"
        searchLabel="Find an item"
        placeholder="Item name or code…"
        (refresh)="reload()"
        (exported)="exportCsv()"
        (printed)="printPdf()"
      >
        <div class="w-32">
          <label class="mb-1.5 block text-[12px] font-medium text-muted" for="ti-top"
            >Show top</label
          >
          <select
            id="ti-top"
            class="ctl"
            [value]="top()"
            (change)="onTop($any($event.target).value)"
          >
            <option [value]="10">10</option>
            <option [value]="20">20</option>
            <option [value]="50">50</option>
          </select>
        </div>
      </ui-filter-bar>

      <div class="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <ui-card
          [heading]="rankBy() === 'Value' ? 'Revenue by item' : 'Units by item'"
          subheading="Highest first"
          icon="chart"
          [padded]="false"
        >
          <div class="p-4">
            @if (store.loading()) {
              <ui-skeleton [count]="1" [height]="260" />
            } @else if (series().length) {
              <ui-columns
                [data]="series()"
                [height]="270"
                color="var(--viz-1)"
                [format]="chartFormat()"
                [ariaLabel]="rankBy() === 'Value' ? 'Revenue by item' : 'Units by item'"
              />
            } @else {
              <ui-empty title="Nothing sold in this window" icon="box" />
            }
          </div>
        </ui-card>

        <ui-card heading="Share of the top ten" icon="pie">
          @if (store.loading()) {
            <ui-skeleton [count]="5" [height]="24" />
          } @else if (rows().length) {
            <ui-donut [data]="shareSeries()" caption="Revenue" />
          } @else {
            <ui-empty title="No data" icon="pie" />
          }
        </ui-card>
      </div>

      <ui-table
        [rows]="filtered()"
        [columns]="columns"
        [loading]="store.loading()"
        [pageSize]="15"
        [trackBy]="trackRow"
        emptyTitle="No item sales"
        emptyMessage="Widen the date range to include days with sales."
      />
    </div>
  `,
  host: { class: 'block' },
})
export class TopItemsReportPage {
  private readonly api = inject(PosApi);
  private readonly lookups = inject(Lookups);
  private readonly print = inject(PrintService);

  protected readonly search = signal('');
  protected readonly from = signal(addDays(today(), -29));
  protected readonly to = signal(today());
  protected readonly rankBy = signal<RankBy>('Value');
  protected readonly top = signal(10);

  protected readonly rankOptions = [
    { value: 'Value' as RankBy, label: 'By value' },
    { value: 'Quantity' as RankBy, label: 'By quantity' },
  ];

  protected readonly trackRow = (row: TopItemRow) => row.itemId;

  protected readonly store = new ListStore<TopItemRow>((filter) => this.api.topItems(filter));

  protected readonly columns: Column<TopItemRow>[] = [
    { key: 'itemCode', header: 'Code', value: (row) => row.itemCode, kind: 'mono', width: '110px' },
    {
      key: 'itemName',
      header: 'Item',
      value: (row) => row.itemName,
      kind: 'strong',
      sub: (row) => this.categoryOf(row.itemId),
    },
    {
      key: 'quantity',
      header: 'Units',
      value: (row) => row.quantity,
      kind: 'number',
      align: 'right',
    },
    { key: 'amount', header: 'Revenue', value: (row) => row.amount, kind: 'money', align: 'right' },
    {
      key: 'share',
      header: 'Share',
      value: (row) => `${((row.amount / (this.revenue() || 1)) * 100).toFixed(1)}%`,
      align: 'right',
      hideOnMobile: true,
    },
  ];

  protected readonly rows = computed(() => this.store.rows());

  protected readonly filtered = computed(() => {
    const needle = this.search().toLowerCase();
    return this.rows().filter((row) =>
      needle ? `${row.itemName} ${row.itemCode}`.toLowerCase().includes(needle) : true,
    );
  });

  protected readonly units = computed(() => sum(this.rows(), (row) => row.quantity));
  protected readonly revenue = computed(() => sum(this.rows(), (row) => row.amount));

  protected readonly series = computed<Point[]>(() =>
    this.rows()
      .slice(0, 12)
      .map((row) => ({
        label: row.itemName.slice(0, 10),
        value: this.rankBy() === 'Value' ? row.amount : row.quantity,
      })),
  );

  protected readonly shareSeries = computed<Point[]>(() =>
    this.rows()
      .slice(0, 10)
      .map((row) => ({ label: row.itemName, value: row.amount })),
  );

  protected readonly chartFormat = computed<(value: number) => string>(() =>
    this.rankBy() === 'Value'
      ? (value: number) => money(value)
      : (value: number) => `${value} units`,
  );

  constructor() {
    void this.lookups.ensure();
    // Re-query whenever the ranking or the "top N" changes.
    effect(() => {
      this.rankBy();
      this.top();
      void this.reload();
    });
  }

  protected categoryOf(itemId: number): string {
    return this.lookups.items().find((item) => item.id === itemId)?.categoryName ?? '';
  }

  protected onTop(value: string): void {
    this.top.set(Number(value) || 10);
  }

  protected reload(): void {
    void this.store.load({
      fromDate: this.from(),
      toDate: this.to(),
      top: this.top(),
      rankBy: this.rankBy(),
    });
  }

  /** One row shape, shared by the CSV export and the printed report. */
  private reportRows(): Record<string, unknown>[] {
    return this.filtered().map((row) => ({
      Code: row.itemCode,
      Item: row.itemName,
      Category: this.categoryOf(row.itemId),
      Units: row.quantity,
      Revenue: row.amount,
    }));
  }

  protected exportCsv(): void {
    downloadCsv('top-items', this.reportRows());
  }

  protected printPdf(): void {
    const rows = this.filtered();
    this.print.report({
      title: 'Top items',
      subtitle: dateRange(this.from(), this.to()),
      filename: 'top-items',
      filters: [
        { label: 'Showing', value: `Top ${this.top()}` },
        { label: 'Search', value: this.search() || 'All items' },
      ],
      summary: [
        { label: 'Items sold', value: String(this.rows().length) },
        { label: 'Units moved', value: String(this.units()) },
        { label: 'Revenue', value: currency(this.revenue()) },
      ],
      sections: [
        {
          rows: this.reportRows(),
          totals: {
            Units: sum(rows, (row) => row.quantity),
            Revenue: sum(rows, (row) => row.amount),
          },
          emptyMessage: 'Nothing sold in this window.',
        },
      ],
    });
  }
}

import { Component, computed, inject, signal } from '@angular/core';
import type { DailySalesRow } from '../../core/models';
import { ListStore } from '../../core/services/list-store';
import { PosApi } from '../../core/services/pos-api';
import { addDays, currency, downloadCsv, shortDate, sum, today } from '../../core/util/format';
import { UiColumns, type Point } from '../../shared/ui/charts';
import { UiFilterBar } from '../../shared/ui/filter-bar';
import { UiSegmented } from '../../shared/ui/overlays';
import { UiCard, UiEmpty, UiPageHeader, UiSkeleton } from '../../shared/ui/primitives';
import { UiStat } from '../../shared/ui/stat';
import { UiTable, type Column } from '../../shared/ui/table';

type Measure = 'netAmount' | 'received' | 'due';

@Component({
  selector: 'app-daily-sales-report',
  imports: [
    UiPageHeader,
    UiFilterBar,
    UiTable,
    UiCard,
    UiStat,
    UiColumns,
    UiSegmented,
    UiEmpty,
    UiSkeleton,
  ],
  template: `
    <div class="space-y-4">
      <ui-page-header
        icon="chart"
        title="Daily sales"
        subtitle="Invoice count and value for each trading day in the window."
      >
        <ui-segmented [options]="measures" [(value)]="measure" ariaLabel="Chart measure" />
      </ui-page-header>

      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ui-stat label="Invoices" [value]="invoiceCount()" format="integer" icon="receipt" [series]="1" />
        <ui-stat label="Net sales" [value]="net()" format="money" prefix="৳" icon="money" [series]="3" [trend]="trend()" />
        <ui-stat label="Received" [value]="received()" format="money" prefix="৳" icon="wallet" [series]="6" />
        <ui-stat label="Still due" [value]="due()" format="money" prefix="৳" icon="alert" [series]="2" [upIsGood]="false" />
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
      />

      <ui-card [heading]="chartTitle()" subheading="One column per trading day" icon="chart" [padded]="false">
        <div class="p-4">
          @if (store.loading()) {
            <ui-skeleton [count]="1" [height]="240" />
          } @else if (series().length) {
            <ui-columns [data]="series()" [height]="250" color="var(--viz-1)" [ariaLabel]="chartTitle()" />
          } @else {
            <ui-empty title="No sales in this window" icon="receipt" />
          }
        </div>
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
export class DailySalesReportPage {
  private readonly api = inject(PosApi);

  protected readonly search = signal('');
  protected readonly from = signal(addDays(today(), -29));
  protected readonly to = signal(today());
  protected readonly measure = signal<Measure>('netAmount');
  protected readonly measures = [
    { value: 'netAmount' as Measure, label: 'Net' },
    { value: 'received' as Measure, label: 'Received' },
    { value: 'due' as Measure, label: 'Due' },
  ];

  protected readonly trackRow = (row: DailySalesRow) => row.date;

  protected readonly store = new ListStore<DailySalesRow>((filter) => this.api.dailySales(filter));

  protected readonly columns: Column<DailySalesRow>[] = [
    { key: 'date', header: 'Date', value: (row) => row.date, kind: 'date' },
    { key: 'invoiceCount', header: 'Invoices', value: (row) => row.invoiceCount, kind: 'number', align: 'right' },
    { key: 'grossAmount', header: 'Gross', value: (row) => row.grossAmount, kind: 'money', align: 'right', hideOnMobile: true },
    { key: 'discount', header: 'Discount', value: (row) => row.discount, kind: 'money', align: 'right', hideOnMobile: true },
    { key: 'netAmount', header: 'Net', value: (row) => row.netAmount, kind: 'money', align: 'right' },
    { key: 'received', header: 'Received', value: (row) => row.received, kind: 'money', align: 'right', hideOnMobile: true },
    { key: 'due', header: 'Due', value: (row) => row.due, kind: 'money', align: 'right' },
  ];

  protected readonly rows = computed(() => {
    const needle = this.search().toLowerCase();
    return this.store
      .rows()
      .filter((row) => (needle ? row.date.includes(needle) : true));
  });

  protected readonly invoiceCount = computed(() => sum(this.rows(), (row) => row.invoiceCount));
  protected readonly net = computed(() => sum(this.rows(), (row) => row.netAmount));
  protected readonly received = computed(() => sum(this.rows(), (row) => row.received));
  protected readonly due = computed(() => sum(this.rows(), (row) => row.due));

  protected readonly trend = computed(() => this.rows().slice(-12).map((row) => row.netAmount));

  protected readonly series = computed<Point[]>(() =>
    this.rows().map((row) => ({ label: shortDate(row.date), value: row[this.measure()] })),
  );

  protected readonly chartTitle = computed(() =>
    this.measure() === 'netAmount'
      ? 'Net sales by day'
      : this.measure() === 'received'
        ? 'Cash received by day'
        : 'Outstanding raised by day',
  );

  constructor() {
    void this.reload();
  }

  protected reload(): void {
    void this.store.load({ fromDate: this.from(), toDate: this.to() });
  }

  protected exportCsv(): void {
    downloadCsv(
      'daily-sales',
      this.rows().map((row) => ({
        Date: row.date,
        Invoices: row.invoiceCount,
        Gross: row.grossAmount,
        Discount: row.discount,
        Net: row.netAmount,
        Received: row.received,
        Due: row.due,
      })),
    );
  }

  protected readonly currency = currency;
}

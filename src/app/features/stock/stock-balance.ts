import { Component, computed, inject, signal } from '@angular/core';
import type { StockRow } from '../../core/models';
import { ListStore } from '../../core/services/list-store';
import { Lookups } from '../../core/services/lookups';
import { PosApi } from '../../core/services/pos-api';
import { currency, downloadCsv, sum, today } from '../../core/util/format';
import { UiColumns, type Point } from '../../shared/ui/charts';
import { UiFilterBar } from '../../shared/ui/filter-bar';
import { UiSegmented } from '../../shared/ui/overlays';
import { UiCard, UiPageHeader } from '../../shared/ui/primitives';
import { UiStat } from '../../shared/ui/stat';
import { UiTable, type Column } from '../../shared/ui/table';

@Component({
  selector: 'app-stock-balance',
  imports: [UiPageHeader, UiFilterBar, UiTable, UiStat, UiCard, UiColumns, UiSegmented],
  template: `
    <div class="space-y-4">
      <ui-page-header
        icon="box"
        title="Stock balance"
        subtitle="Opening, movement and closing quantity for every item, per branch."
      >
        <ui-segmented [options]="viewOptions" [(value)]="view" ariaLabel="Stock view" />
      </ui-page-header>

      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ui-stat label="Distinct items" [value]="itemCount()" format="integer" icon="tag" [series]="1" />
        <ui-stat label="Units on hand" [value]="unitsOnHand()" format="integer" icon="box" [series]="3" />
        <ui-stat
          label="Stock value at cost"
          [value]="stockValue()"
          format="money"
          prefix="৳"
          icon="money"
          [series]="6"
        />
        <ui-stat
          label="Below reorder level"
          [value]="lowCount()"
          format="integer"
          icon="alert"
          [series]="2"
          [upIsGood]="false"
        />
      </div>

      <ui-filter-bar
        [(search)]="search"
        searchLabel="Find stock"
        placeholder="Item name, code or category…"
        (refresh)="reload()"
        (exported)="exportCsv()"
      >
        <div class="w-44">
          <label class="mb-1.5 block text-[12px] font-medium text-muted" for="sb-branch">Branch</label>
          <select id="sb-branch" class="ctl" [value]="branchId()" (change)="onBranch($any($event.target).value)">
            <option value="">All branches</option>
            @for (branch of lookups.branches(); track branch.id) {
              <option [value]="branch.id">{{ branch.name }}</option>
            }
          </select>
        </div>
        <div class="w-40">
          <label class="mb-1.5 block text-[12px] font-medium text-muted" for="sb-date">As on</label>
          <input id="sb-date" type="date" class="ctl" [value]="asOnDate()" (change)="onDate($any($event.target).value)" />
        </div>
      </ui-filter-bar>

      @if (view() === 'chart') {
        <ui-card heading="Top items by stock value" subheading="At cost price" icon="chart" [padded]="false">
          <div class="p-4">
            <ui-columns
              [data]="valueSeries()"
              [height]="260"
              color="var(--viz-3)"
              ariaLabel="Stock value by item"
            />
          </div>
        </ui-card>
      }

      <ui-table
        [rows]="filtered()"
        [columns]="columns"
        [loading]="store.loading()"
        [pageSize]="15"
        [trackBy]="trackRow"
        emptyTitle="No stock rows"
        emptyMessage="Record opening stock or a purchase to see balances here."
      />
    </div>
  `,
  host: { class: 'block' },
})
export class StockBalancePage {
  private readonly api = inject(PosApi);
  protected readonly lookups = inject(Lookups);

  protected readonly search = signal('');
  protected readonly branchId = signal('');
  protected readonly asOnDate = signal(today());
  protected readonly view = signal<'table' | 'chart'>('table');
  protected readonly viewOptions = [
    { value: 'table' as const, label: 'Table', icon: 'list' as const },
    { value: 'chart' as const, label: 'Chart', icon: 'chart' as const },
  ];

  protected readonly trackRow = (row: StockRow) => `${row.itemId}-${row.branchId}`;

  protected readonly store = new ListStore<StockRow>((filter) => this.api.stock(filter));

  protected readonly columns: Column<StockRow>[] = [
    { key: 'itemCode', header: 'Code', value: (row) => row.itemCode, kind: 'mono', width: '110px' },
    {
      key: 'itemName',
      header: 'Item',
      value: (row) => row.itemName,
      kind: 'strong',
      sub: (row) => `${row.categoryName} · ${row.branchName}`,
    },
    { key: 'opening', header: 'Opening', value: (row) => row.opening, kind: 'number', align: 'right', hideOnMobile: true },
    { key: 'purchase', header: 'In', value: (row) => row.purchase + row.salesReturn + row.transferIn, kind: 'number', align: 'right', hideOnMobile: true },
    { key: 'sales', header: 'Out', value: (row) => row.sales + row.purchaseReturn + row.transferOut, kind: 'number', align: 'right', hideOnMobile: true },
    {
      key: 'balance',
      header: 'Balance',
      value: (row) => row.balance,
      kind: 'badge',
      align: 'right',
      tone: (row) => (row.balance <= 0 ? 'neg' : row.balance <= row.reorderQuantity ? 'warn' : 'pos'),
    },
    { key: 'value', header: 'Value at cost', value: (row) => row.value, kind: 'money', align: 'right' },
  ];

  protected readonly filtered = computed(() => {
    const needle = this.search().toLowerCase();
    return this.store
      .rows()
      .filter((row) =>
        needle
          ? `${row.itemName} ${row.itemCode} ${row.categoryName}`.toLowerCase().includes(needle)
          : true,
      );
  });

  protected readonly itemCount = computed(
    () => new Set(this.filtered().map((row) => row.itemId)).size,
  );
  protected readonly unitsOnHand = computed(() => sum(this.filtered(), (row) => row.balance));
  protected readonly stockValue = computed(() => sum(this.filtered(), (row) => row.value));
  protected readonly lowCount = computed(
    () => this.filtered().filter((row) => row.balance <= row.reorderQuantity).length,
  );

  protected readonly valueSeries = computed<Point[]>(() =>
    [...this.filtered()]
      .sort((a, b) => b.value - a.value)
      .slice(0, 12)
      .map((row) => ({ label: row.itemName.slice(0, 10), value: row.value })),
  );

  constructor() {
    void this.lookups.ensure();
    void this.reload();
  }

  protected reload(): void {
    void this.store.load({
      branchId: this.branchId() ? Number(this.branchId()) : null,
      asOnDate: this.asOnDate(),
    });
  }

  protected onBranch(value: string): void {
    this.branchId.set(value);
    this.reload();
  }

  protected onDate(value: string): void {
    this.asOnDate.set(value);
    this.reload();
  }

  protected exportCsv(): void {
    downloadCsv(
      'stock-balance',
      this.filtered().map((row) => ({
        Code: row.itemCode,
        Item: row.itemName,
        Category: row.categoryName,
        Branch: row.branchName,
        Opening: row.opening,
        Purchase: row.purchase,
        'Sales return': row.salesReturn,
        'Transfer in': row.transferIn,
        Sales: row.sales,
        'Purchase return': row.purchaseReturn,
        'Transfer out': row.transferOut,
        Balance: row.balance,
        Rate: row.rate,
        Value: row.value,
      })),
    );
  }

  protected readonly currency = currency;
}

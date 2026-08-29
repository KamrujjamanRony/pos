import { Component, computed, inject, signal } from '@angular/core';
import type { Item, StockLedgerRow } from '../../core/models';
import { ListStore } from '../../core/services/list-store';
import { Lookups } from '../../core/services/lookups';
import { PosApi } from '../../core/services/pos-api';
import { PrintService } from '../../core/services/print';
import { addDays, dateRange, downloadCsv, sum, today } from '../../core/util/format';
import { UiCombobox } from '../../shared/ui/combobox';
import { UiFilterBar } from '../../shared/ui/filter-bar';
import { UiPageHeader, type Tone } from '../../shared/ui/primitives';
import { UiTable, type Column } from '../../shared/ui/table';

const TONE_BY_TYPE: Record<string, Tone> = {
  Opening: 'neutral',
  Purchase: 'pos',
  'Purchase return': 'neg',
  Sale: 'info',
  'Sales return': 'warn',
  'Transfer in': 'brand',
  'Transfer out': 'brand',
};

@Component({
  selector: 'app-stock-ledger',
  imports: [UiPageHeader, UiFilterBar, UiTable, UiCombobox],
  template: `
    <div class="space-y-4">
      <ui-page-header
        icon="list"
        title="Stock ledger"
        subtitle="Every movement that touched an item, in document order."
      />

      <ui-filter-bar
        [(search)]="search"
        [(from)]="from"
        [(to)]="to"
        [dates]="true"
        searchLabel="Find a movement"
        placeholder="Item or document number…"
        (refresh)="reload()"
        (exported)="exportCsv()"
        (printed)="printPdf()"
      >
        <div class="w-60">
          <label class="mb-1.5 block text-[12px] font-medium text-muted">Item</label>
          <ui-combobox
            [options]="lookups.items()"
            [labelOf]="itemLabel"
            [keyOf]="idOf"
            [subOf]="itemSub"
            [(value)]="itemId"
            placeholder="All items"
            (selected)="reload()"
          />
        </div>
      </ui-filter-bar>

      <div class="grid gap-3 sm:grid-cols-3">
        @for (tile of tiles(); track tile.label) {
          <div class="surface-card stagger p-3.5" [style]="'--i:' + $index">
            <p class="text-[12px] text-muted">{{ tile.label }}</p>
            <p class="num mt-1 text-[19px] font-semibold text-ink">{{ tile.value }}</p>
          </div>
        }
      </div>

      <ui-table
        [rows]="filtered()"
        [columns]="columns"
        [loading]="store.loading()"
        [pageSize]="20"
        [trackBy]="trackRow"
        emptyTitle="No movements in this window"
        emptyMessage="Pick a wider date range, or a different item."
      />
    </div>
  `,
  host: { class: 'block' },
})
export class StockLedgerPage {
  private readonly api = inject(PosApi);
  protected readonly lookups = inject(Lookups);
  private readonly print = inject(PrintService);

  protected readonly idOf = (row: { id: number }) => row.id;
  protected readonly itemLabel = (row: Item) => row.name;
  protected readonly itemSub = (row: Item) => row.code;

  protected readonly search = signal('');
  protected readonly from = signal(addDays(today(), -30));
  protected readonly to = signal(today());
  protected readonly itemId = signal<number | string | null>(null);

  private counter = 0;
  protected readonly trackRow = (row: StockLedgerRow) =>
    `${row.documentNo}-${row.itemId}-${row.date}-${this.counter++}`;

  protected readonly store = new ListStore<StockLedgerRow>((filter) =>
    this.api.stockLedger(filter),
  );

  protected readonly columns: Column<StockLedgerRow>[] = [
    { key: 'date', header: 'Date', value: (row) => row.date, kind: 'date', width: '120px' },
    {
      key: 'documentNo',
      header: 'Document',
      value: (row) => row.documentNo,
      kind: 'mono',
      width: '130px',
    },
    {
      key: 'documentType',
      header: 'Type',
      value: (row) => row.documentType,
      kind: 'badge',
      tone: (row) => TONE_BY_TYPE[row.documentType] ?? 'neutral',
    },
    {
      key: 'itemName',
      header: 'Item',
      value: (row) => row.itemName,
      kind: 'strong',
      sub: (row) => `${row.branchName}${row.remarks ? ' · ' + row.remarks : ''}`,
    },
    { key: 'inQty', header: 'In', value: (row) => row.inQty || '', kind: 'number', align: 'right' },
    {
      key: 'outQty',
      header: 'Out',
      value: (row) => row.outQty || '',
      kind: 'number',
      align: 'right',
    },
    {
      key: 'balance',
      header: 'Running',
      value: (row) => row.balance,
      kind: 'number',
      align: 'right',
      hideOnMobile: true,
    },
  ];

  protected readonly filtered = computed(() => {
    const needle = this.search().toLowerCase();
    return this.store
      .rows()
      .filter((row) =>
        needle ? `${row.itemName} ${row.documentNo}`.toLowerCase().includes(needle) : true,
      );
  });

  protected readonly tiles = computed(() => {
    const rows = this.filtered();
    return [
      { label: 'Movements', value: String(rows.length) },
      { label: 'Units in', value: String(sum(rows, (row) => row.inQty)) },
      { label: 'Units out', value: String(sum(rows, (row) => row.outQty)) },
    ];
  });

  constructor() {
    void this.lookups.ensure();
    void this.reload();
  }

  protected reload(): void {
    void this.store.load({
      fromDate: this.from(),
      toDate: this.to(),
      itemId: this.itemId() === null ? null : Number(this.itemId()),
    });
  }

  /** One row shape, shared by the CSV export and the printed report. */
  private reportRows(): Record<string, unknown>[] {
    return this.filtered().map((row) => ({
      Date: row.date,
      Document: row.documentNo,
      Type: row.documentType,
      Item: row.itemName,
      Branch: row.branchName,
      In: row.inQty,
      Out: row.outQty,
      Balance: row.balance,
      Remarks: row.remarks,
    }));
  }

  protected exportCsv(): void {
    downloadCsv('stock-ledger', this.reportRows());
  }

  protected printPdf(): void {
    const rows = this.filtered();
    this.print.report({
      title: 'Stock ledger',
      subtitle: dateRange(this.from(), this.to()),
      filename: 'stock-ledger',
      landscape: true,
      filters: [{ label: 'Search', value: this.search() || 'All movements' }],
      summary: this.tiles(),
      sections: [
        {
          rows: this.reportRows(),
          totals: {
            In: sum(rows, (row) => row.inQty),
            Out: sum(rows, (row) => row.outQty),
          },
          emptyMessage: 'No movements in this window.',
        },
      ],
    });
  }
}

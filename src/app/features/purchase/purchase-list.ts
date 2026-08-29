import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { PurchaseEntry } from '../../core/models';
import { ConfirmService } from '../../core/services/confirm';
import { ListStore } from '../../core/services/list-store';
import { PosApi } from '../../core/services/pos-api';
import { PrintService } from '../../core/services/print';
import { ToastService } from '../../core/services/toast';
import {
  addDays,
  amountInWords,
  currency,
  dateRange,
  downloadCsv,
  money,
  prettyDate,
  sum,
  today,
} from '../../core/util/format';
import { buttonClass, UiButton } from '../../shared/ui/button';
import { UiFilterBar } from '../../shared/ui/filter-bar';
import { UiIcon } from '../../shared/ui/icon';
import { UiModal } from '../../shared/ui/modal';
import { UiPageHeader } from '../../shared/ui/primitives';
import { UiTable, type Column } from '../../shared/ui/table';

@Component({
  selector: 'app-purchase-list',
  imports: [RouterLink, UiPageHeader, UiFilterBar, UiTable, UiButton, UiModal, UiIcon],
  template: `
    <div class="space-y-4">
      <ui-page-header
        icon="truck"
        title="Purchase entries"
        subtitle="Goods received from suppliers, and what has been paid against them."
      >
        <a [class]="primaryButton" routerLink="/purchase/entries/new">
          <ui-icon name="plus" [size]="16" />
          New purchase
        </a>
      </ui-page-header>

      <div class="grid gap-3 sm:grid-cols-4">
        @for (tile of tiles(); track tile.label) {
          <div class="surface-card stagger p-3.5" [style]="'--i:' + $index">
            <p class="text-[12px] text-muted">{{ tile.label }}</p>
            <p class="num mt-1 text-[19px] font-semibold text-ink">{{ tile.value }}</p>
          </div>
        }
      </div>

      <ui-filter-bar
        [(search)]="search"
        [(from)]="from"
        [(to)]="to"
        [dates]="true"
        searchLabel="Find a purchase"
        placeholder="Invoice number, supplier, receipt…"
        (refresh)="reload()"
        (exported)="exportCsv()"
        (printed)="printPdf()"
      >
        <div class="w-40">
          <label class="mb-1.5 block text-[12px] font-medium text-muted" for="pl-status"
            >Settlement</label
          >
          <select
            id="pl-status"
            class="ctl"
            [value]="status()"
            (change)="status.set($any($event.target).value)"
          >
            <option value="all">All entries</option>
            <option value="due">Unpaid balance</option>
            <option value="settled">Fully paid</option>
          </select>
        </div>
      </ui-filter-bar>

      <ui-table
        [rows]="filtered()"
        [columns]="columns"
        [loading]="store.loading()"
        [actions]="rowActions"
        [clickable]="true"
        (rowClick)="openDetail($event)"
        emptyTitle="No purchases in this window"
        emptyMessage="Widen the date range, or record a new goods receipt."
      />
    </div>

    <ng-template #rowActions let-row>
      <div class="flex justify-end gap-1">
        <ui-button
          variant="ghost"
          size="icon"
          icon="eye"
          ariaLabel="View purchase"
          (pressed)="openDetail(row)"
        />
        <ui-button
          variant="ghost"
          size="icon"
          icon="printer"
          ariaLabel="Print purchase entry"
          (pressed)="printEntry(row)"
        />
        <a
          [class]="iconButton"
          [routerLink]="['/purchase/entries', row.id]"
          aria-label="Edit purchase"
        >
          <ui-icon name="edit" [size]="16" />
        </a>
        <ui-button
          variant="ghost"
          size="icon"
          icon="trash"
          ariaLabel="Delete purchase"
          (pressed)="remove(row)"
        />
      </div>
    </ng-template>

    <ui-modal
      [(open)]="detailOpen"
      variant="drawer"
      size="md"
      [heading]="selected()?.invoiceNo ?? 'Purchase'"
      [subheading]="selected()?.supplierName ?? ''"
    >
      @if (selected(); as entry) {
        <div class="space-y-5">
          <dl class="grid grid-cols-2 gap-3 text-[13px]">
            <div class="rounded-xl border border-line bg-surface-2/60 px-3 py-2.5">
              <dt class="text-[11.5px] text-muted">Received</dt>
              <dd class="mt-0.5 font-medium text-ink">{{ date(entry.receiptDate) }}</dd>
            </div>
            <div class="rounded-xl border border-line bg-surface-2/60 px-3 py-2.5">
              <dt class="text-[11.5px] text-muted">Supplier reference</dt>
              <dd class="mt-0.5 font-medium text-ink">{{ entry.receiptNo || '—' }}</dd>
            </div>
            <div class="rounded-xl border border-line bg-surface-2/60 px-3 py-2.5">
              <dt class="text-[11.5px] text-muted">Branch</dt>
              <dd class="mt-0.5 font-medium text-ink">{{ entry.branchName }}</dd>
            </div>
            <div class="rounded-xl border border-line bg-surface-2/60 px-3 py-2.5">
              <dt class="text-[11.5px] text-muted">Remarks</dt>
              <dd class="mt-0.5 font-medium text-ink">{{ entry.remarks || '—' }}</dd>
            </div>
          </dl>

          <div class="overflow-hidden rounded-xl border border-line">
            <table class="w-full text-left text-[13px]">
              <thead class="bg-surface-2">
                <tr>
                  <th
                    class="px-3 py-2 text-[11px] font-semibold tracking-wider text-faint uppercase"
                  >
                    Item
                  </th>
                  <th
                    class="px-3 py-2 text-right text-[11px] font-semibold tracking-wider text-faint uppercase"
                  >
                    Qty
                  </th>
                  <th
                    class="px-3 py-2 text-right text-[11px] font-semibold tracking-wider text-faint uppercase"
                  >
                    Cost
                  </th>
                  <th
                    class="px-3 py-2 text-right text-[11px] font-semibold tracking-wider text-faint uppercase"
                  >
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (line of entry.details; track $index) {
                  <tr class="border-t border-line">
                    <td class="px-3 py-2 font-medium text-ink">{{ line.itemName }}</td>
                    <td class="num px-3 py-2 text-right">{{ line.quantity }}</td>
                    <td class="num px-3 py-2 text-right">{{ money(line.purchasePrice) }}</td>
                    <td class="num px-3 py-2 text-right font-medium">
                      {{ money(line.purchasePrice * line.quantity) }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <dl class="space-y-1.5 rounded-xl bg-surface-2/60 p-3.5 text-[13px]">
            <div class="flex justify-between">
              <dt class="text-muted">Gross</dt>
              <dd class="num font-medium">{{ money(entry.grossAmount) }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted">Discount</dt>
              <dd class="num font-medium text-neg">− {{ money(entry.discount) }}</dd>
            </div>
            <div class="flex justify-between border-t border-line pt-2">
              <dt class="font-semibold text-ink">Net</dt>
              <dd class="num font-semibold text-ink">{{ currency(entry.netAmount) }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted">Paid ({{ entry.paymentMode }})</dt>
              <dd class="num font-medium text-pos">{{ money(entry.cashPayment) }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted">Payable</dt>
              <dd
                class="num font-semibold"
                [class]="(entry.dueAmount ?? 0) > 0.5 ? 'text-warn' : 'text-pos'"
              >
                {{ money(entry.dueAmount) }}
              </dd>
            </div>
          </dl>
        </div>
      }

      <div modal-footer class="flex gap-2">
        <ui-button variant="ghost" (pressed)="detailOpen.set(false)">Close</ui-button>
        @if (selected(); as entry) {
          <ui-button variant="outline" icon="printer" (pressed)="printEntry(entry)">
            Print / PDF
          </ui-button>
        }
        <a [class]="primaryButton" [routerLink]="['/purchase/entries', selected()?.id]">
          <ui-icon name="edit" [size]="16" />
          Edit entry
        </a>
      </div>
    </ui-modal>
  `,
  host: { class: 'block' },
})
export class PurchaseListPage {
  private readonly api = inject(PosApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly print = inject(PrintService);

  protected readonly money = money;
  protected readonly currency = currency;
  protected readonly date = prettyDate;
  protected readonly primaryButton = buttonClass('primary', 'md');
  protected readonly iconButton = buttonClass('ghost', 'icon');

  protected readonly search = signal('');
  protected readonly from = signal(addDays(today(), -60));
  protected readonly to = signal(today());
  protected readonly status = signal<'all' | 'due' | 'settled'>('all');
  protected readonly detailOpen = signal(false);
  protected readonly selected = signal<PurchaseEntry | null>(null);

  protected readonly store = new ListStore<PurchaseEntry>((filter) =>
    this.api.purchases.search(filter),
  );

  protected readonly columns: Column<PurchaseEntry>[] = [
    {
      key: 'invoiceNo',
      header: 'Entry',
      value: (row) => row.invoiceNo,
      kind: 'mono',
      width: '130px',
    },
    {
      key: 'receiptDate',
      header: 'Date',
      value: (row) => row.receiptDate,
      kind: 'date',
      width: '120px',
    },
    {
      key: 'supplierName',
      header: 'Supplier',
      value: (row) => row.supplierName ?? '—',
      kind: 'strong',
      sub: (row) => `${row.details.length} lines · ${row.receiptNo}`,
    },
    {
      key: 'netAmount',
      header: 'Net',
      value: (row) => row.netAmount ?? 0,
      kind: 'money',
      align: 'right',
    },
    {
      key: 'cashPayment',
      header: 'Paid',
      value: (row) => row.cashPayment,
      kind: 'money',
      align: 'right',
      hideOnMobile: true,
    },
    {
      key: 'dueAmount',
      header: 'Payable',
      value: (row) => row.dueAmount ?? 0,
      kind: 'money',
      align: 'right',
    },
  ];

  protected readonly filtered = computed(() => {
    const needle = this.search().toLowerCase();
    return this.store.rows().filter((row) => {
      const hit =
        !needle ||
        `${row.invoiceNo} ${row.receiptNo} ${row.supplierName} ${row.remarks}`
          .toLowerCase()
          .includes(needle);
      const due = (row.dueAmount ?? 0) > 0.5;
      const statusOk = this.status() === 'all' || (this.status() === 'due' ? due : !due);
      return hit && statusOk;
    });
  });

  protected readonly tiles = computed(() => {
    const rows = this.filtered();
    return [
      { label: 'Entries', value: String(rows.length) },
      { label: 'Purchase value', value: currency(sum(rows, (row) => row.netAmount ?? 0)) },
      { label: 'Paid', value: currency(sum(rows, (row) => row.cashPayment)) },
      { label: 'Payable', value: currency(sum(rows, (row) => row.dueAmount ?? 0)) },
    ];
  });

  constructor() {
    void this.reload();
  }

  protected reload(): void {
    void this.store.load({ fromDate: this.from(), toDate: this.to() });
  }

  protected openDetail(row: PurchaseEntry): void {
    this.selected.set(row);
    this.detailOpen.set(true);
  }

  protected async remove(row: PurchaseEntry): Promise<void> {
    if (!(await this.confirm.askDelete(`purchase ${row.invoiceNo}`))) return;
    await firstValueFrom(this.api.purchases.remove(row.id));
    this.store.removeWhere((candidate) => candidate.id === row.id);
    this.toast.success('Purchase deleted', `${row.invoiceNo} was removed and stock was reversed.`);
  }

  /** One row shape, shared by the CSV export and the printed report. */
  private reportRows(): Record<string, unknown>[] {
    return this.filtered().map((row) => ({
      Entry: row.invoiceNo,
      Date: row.receiptDate,
      Supplier: row.supplierName,
      Reference: row.receiptNo,
      Lines: row.details.length,
      Net: row.netAmount,
      Paid: row.cashPayment,
      Payable: row.dueAmount,
    }));
  }

  protected exportCsv(): void {
    downloadCsv('purchase-entries', this.reportRows());
  }

  protected printPdf(): void {
    const rows = this.filtered();
    this.print.report({
      title: 'Purchase entries',
      subtitle: dateRange(this.from(), this.to()),
      filename: 'purchase-entries',
      filters: [
        { label: 'Settlement', value: this.statusLabel() },
        { label: 'Search', value: this.search() || 'All records' },
      ],
      summary: this.tiles(),
      sections: [
        {
          rows: this.reportRows(),
          totals: {
            Lines: sum(rows, (row) => row.details.length),
            Net: sum(rows, (row) => row.netAmount ?? 0),
            Paid: sum(rows, (row) => row.cashPayment),
            Payable: sum(rows, (row) => row.dueAmount ?? 0),
          },
          emptyMessage: 'No purchases in this window.',
        },
      ],
    });
  }

  /** The goods receipt itself, on a letterhead. */
  protected printEntry(entry: PurchaseEntry): void {
    this.print.document({
      title: 'Purchase entry',
      documentNo: entry.invoiceNo,
      status: (entry.dueAmount ?? 0) > 0.5 ? 'Payable' : 'Settled',
      filename: `purchase-${entry.invoiceNo}`,
      meta: [
        { label: 'Received', value: prettyDate(entry.receiptDate) },
        { label: 'Branch', value: entry.branchName ?? '—' },
        { label: 'Supplier reference', value: entry.receiptNo || '—' },
        { label: 'Payment', value: entry.paymentMode },
      ],
      parties: [
        { heading: 'Supplier', lines: [entry.supplierName || '—'] },
        { heading: 'Received at', lines: [entry.branchName, entry.remarks] },
      ],
      section: {
        columns: [
          { key: 'Item', align: 'left' },
          { key: 'Qty', align: 'right' },
          { key: 'Cost', align: 'right' },
          { key: 'Sales price', align: 'right' },
          { key: 'Amount', align: 'right' },
        ],
        rows: entry.details.map((line) => ({
          Item: line.itemName ?? '—',
          Qty: line.quantity,
          Cost: line.purchasePrice,
          'Sales price': line.salesPrice,
          Amount: line.purchasePrice * line.quantity,
        })),
        totals: {
          Qty: sum(entry.details, (line) => line.quantity),
          Amount: entry.grossAmount ?? 0,
        },
      },
      totals: [
        { label: 'Gross', value: currency(entry.grossAmount) },
        { label: 'Discount', value: `− ${currency(entry.discount)}` },
        { label: 'Net', value: currency(entry.netAmount), strong: true },
        { label: `Paid (${entry.paymentMode})`, value: currency(entry.cashPayment) },
        { label: 'Payable', value: currency(entry.dueAmount) },
      ],
      amountInWords: amountInWords(entry.netAmount),
      note: entry.remarks || undefined,
      signatures: ['Store keeper', 'Authorised signature'],
    });
  }

  protected statusLabel(): string {
    const status = this.status();
    return status === 'due'
      ? 'Unpaid balance'
      : status === 'settled'
        ? 'Fully paid'
        : 'All entries';
  }
}

import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { COURIER_CONDITIONS, type SalesEntry } from '../../core/models';
import { ConfirmService } from '../../core/services/confirm';
import { ListStore } from '../../core/services/list-store';
import { PosApi } from '../../core/services/pos-api';
import { ToastService } from '../../core/services/toast';
import {
  addDays,
  currency,
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
import { UiPageHeader, type Tone } from '../../shared/ui/primitives';
import { UiTable, type Column } from '../../shared/ui/table';

@Component({
  selector: 'app-sales-list',
  imports: [
    RouterLink,
    UiPageHeader,
    UiFilterBar,
    UiTable,
    UiButton,
    UiModal,
    UiIcon,
  ],
  template: `
    <div class="space-y-4">
      <ui-page-header
        icon="receipt"
        title="Sales invoices"
        subtitle="Every counter and courier sale raised from this workspace."
      >
        <a [class]="outlineButton" routerLink="/pos">
          <ui-icon name="zap" [size]="16" />
          Terminal
        </a>
        <a [class]="primaryButton" routerLink="/sales/invoices/new">
          <ui-icon name="plus" [size]="16" />
          New invoice
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
        searchLabel="Find an invoice"
        placeholder="Invoice number, customer, remarks…"
        (refresh)="reload()"
        (exported)="exportCsv()"
      >
        <div class="w-40">
          <label class="mb-1.5 block text-[12px] font-medium text-muted" for="sales-status">
            Settlement
          </label>
          <select
            id="sales-status"
            class="ctl"
            [value]="status()"
            (change)="status.set($any($event.target).value)"
          >
            <option value="all">All invoices</option>
            <option value="due">Carrying a due</option>
            <option value="settled">Fully settled</option>
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
        emptyTitle="No invoices in this window"
        emptyMessage="Widen the date range, or raise a new invoice."
      />
    </div>

    <ng-template #rowActions let-row>
      <div class="flex justify-end gap-1">
        <ui-button variant="ghost" size="icon" icon="eye" ariaLabel="View invoice" (pressed)="openDetail(row)" />
        <a [class]="iconButton" [routerLink]="['/sales/invoices', row.id]" aria-label="Edit invoice">
          <ui-icon name="edit" [size]="16" />
        </a>
        <ui-button variant="ghost" size="icon" icon="trash" ariaLabel="Delete invoice" (pressed)="remove(row)" />
      </div>
    </ng-template>

    <ui-modal
      [(open)]="detailOpen"
      variant="drawer"
      size="md"
      [heading]="selected()?.invoiceNo ?? 'Invoice'"
      [subheading]="selected()?.customerName ?? ''"
    >
      @if (selected(); as invoice) {
        <div class="space-y-5">
          <dl class="grid grid-cols-2 gap-3 text-[13px]">
            @for (field of detailFields(invoice); track field.label) {
              <div class="rounded-xl border border-line bg-surface-2/60 px-3 py-2.5">
                <dt class="text-[11.5px] text-muted">{{ field.label }}</dt>
                <dd class="mt-0.5 font-medium text-ink">{{ field.value }}</dd>
              </div>
            }
          </dl>

          <div>
            <h3 class="mb-2 text-[13px] font-semibold text-ink">Lines</h3>
            <div class="overflow-hidden rounded-xl border border-line">
              <table class="w-full text-left text-[13px]">
                <thead class="bg-surface-2">
                  <tr>
                    <th class="px-3 py-2 text-[11px] font-semibold tracking-wider text-faint uppercase">Item</th>
                    <th class="px-3 py-2 text-right text-[11px] font-semibold tracking-wider text-faint uppercase">Qty</th>
                    <th class="px-3 py-2 text-right text-[11px] font-semibold tracking-wider text-faint uppercase">Rate</th>
                    <th class="px-3 py-2 text-right text-[11px] font-semibold tracking-wider text-faint uppercase">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  @for (line of invoice.details; track $index) {
                    <tr class="border-t border-line">
                      <td class="px-3 py-2">
                        <p class="font-medium text-ink">{{ line.itemName }}</p>
                        @if (line.serialNo) {
                          <p class="font-mono text-[11.5px] text-faint">{{ line.serialNo }}</p>
                        }
                      </td>
                      <td class="num px-3 py-2 text-right">{{ line.quantity }}</td>
                      <td class="num px-3 py-2 text-right">{{ money(line.salesPrice) }}</td>
                      <td class="num px-3 py-2 text-right font-medium">
                        {{ money(line.salesPrice * line.quantity) }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <dl class="space-y-1.5 rounded-xl bg-surface-2/60 p-3.5 text-[13px]">
            <div class="flex justify-between">
              <dt class="text-muted">Gross</dt>
              <dd class="num font-medium">{{ money(invoice.grossAmount) }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted">
                Discount ({{ invoice.discountType === 'Percent' ? invoice.discount + '%' : 'flat' }})
              </dt>
              <dd class="num font-medium text-neg">− {{ money(discountValue(invoice)) }}</dd>
            </div>
            @if (invoice.courierCost) {
              <div class="flex justify-between">
                <dt class="text-muted">Courier</dt>
                <dd class="num font-medium">{{ money(invoice.courierCost) }}</dd>
              </div>
            }
            <div class="flex justify-between border-t border-line pt-2">
              <dt class="font-semibold text-ink">Net</dt>
              <dd class="num font-semibold text-ink">{{ currency(invoice.netAmount) }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted">Received ({{ invoice.paymentMode }})</dt>
              <dd class="num font-medium text-pos">{{ money(invoice.receiveAmount) }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted">Due</dt>
              <dd class="num font-semibold" [class]="(invoice.dueAmount ?? 0) > 0.5 ? 'text-warn' : 'text-pos'">
                {{ money(invoice.dueAmount) }}
              </dd>
            </div>
          </dl>
        </div>
      }

      <div modal-footer class="flex gap-2">
        <ui-button variant="ghost" (pressed)="detailOpen.set(false)">Close</ui-button>
        <a [class]="primaryButton" [routerLink]="['/sales/invoices', selected()?.id]">
          <ui-icon name="edit" [size]="16" />
          Edit invoice
        </a>
      </div>
    </ui-modal>
  `,
  host: { class: 'block' },
})
export class SalesListPage {
  private readonly api = inject(PosApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly money = money;
  protected readonly currency = currency;
  protected readonly primaryButton = buttonClass('primary', 'md');
  protected readonly outlineButton = buttonClass('outline', 'md');
  protected readonly iconButton = buttonClass('ghost', 'icon');

  protected readonly search = signal('');
  protected readonly from = signal(addDays(today(), -30));
  protected readonly to = signal(today());
  protected readonly status = signal<'all' | 'due' | 'settled'>('all');
  protected readonly detailOpen = signal(false);
  protected readonly selected = signal<SalesEntry | null>(null);

  protected readonly store = new ListStore<SalesEntry>((filter) => this.api.sales.search(filter));

  protected readonly columns: Column<SalesEntry>[] = [
    { key: 'invoiceNo', header: 'Invoice', value: (row) => row.invoiceNo, kind: 'mono', width: '130px' },
    { key: 'invoiceDate', header: 'Date', value: (row) => row.invoiceDate, kind: 'date', width: '120px' },
    {
      key: 'customerName',
      header: 'Customer',
      value: (row) => row.customerName ?? 'Walk-in',
      kind: 'strong',
      sub: (row) => `${row.details.length} lines · ${row.branchName}`,
    },
    {
      key: 'courier',
      header: 'Courier',
      value: (row) => this.courierLabel(row),
      kind: 'badge',
      tone: (row) => this.courierTone(row),
      hideOnMobile: true,
    },
    { key: 'netAmount', header: 'Net', value: (row) => row.netAmount ?? 0, kind: 'money', align: 'right' },
    {
      key: 'receiveAmount',
      header: 'Received',
      value: (row) => row.receiveAmount,
      kind: 'money',
      align: 'right',
      hideOnMobile: true,
    },
    { key: 'dueAmount', header: 'Due', value: (row) => row.dueAmount ?? 0, kind: 'money', align: 'right' },
  ];

  protected readonly filtered = computed(() => {
    const needle = this.search().toLowerCase();
    return this.store.rows().filter((row) => {
      const hit =
        !needle ||
        `${row.invoiceNo} ${row.customerName} ${row.remarks} ${row.employeeName}`
          .toLowerCase()
          .includes(needle);
      const due = (row.dueAmount ?? 0) > 0.5;
      const statusOk =
        this.status() === 'all' || (this.status() === 'due' ? due : !due);
      return hit && statusOk;
    });
  });

  protected readonly tiles = computed(() => {
    const rows = this.filtered();
    return [
      { label: 'Invoices', value: String(rows.length) },
      { label: 'Net sales', value: currency(sum(rows, (row) => row.netAmount ?? 0)) },
      { label: 'Received', value: currency(sum(rows, (row) => row.receiveAmount)) },
      { label: 'Outstanding', value: currency(sum(rows, (row) => row.dueAmount ?? 0)) },
    ];
  });

  constructor() {
    void this.reload();
  }

  protected reload(): void {
    void this.store.load({ fromDate: this.from(), toDate: this.to() });
  }

  protected courierLabel(row: SalesEntry): string {
    if (!row.courierCondition) return 'Counter';
    return COURIER_CONDITIONS.find((c) => c.value === row.courierCondition)?.label ?? 'Courier';
  }

  protected courierTone(row: SalesEntry): Tone {
    if (!row.courierCondition) return 'neutral';
    return (COURIER_CONDITIONS.find((c) => c.value === row.courierCondition)?.tone ?? 'info') as Tone;
  }

  protected discountValue(row: SalesEntry): number {
    return row.discountType === 'Percent'
      ? ((row.grossAmount ?? 0) * row.discount) / 100
      : row.discount;
  }

  protected detailFields(invoice: SalesEntry) {
    return [
      { label: 'Date', value: prettyDate(invoice.invoiceDate) },
      { label: 'Branch', value: invoice.branchName ?? '—' },
      { label: 'Sold by', value: invoice.employeeName || '—' },
      { label: 'Referred by', value: invoice.referredName || '—' },
      { label: 'Courier', value: this.courierLabel(invoice) },
      { label: 'Remarks', value: invoice.remarks || '—' },
    ];
  }

  protected openDetail(row: SalesEntry): void {
    this.selected.set(row);
    this.detailOpen.set(true);
  }

  protected async remove(row: SalesEntry): Promise<void> {
    if (!(await this.confirm.askDelete(`invoice ${row.invoiceNo}`))) return;
    await firstValueFrom(this.api.sales.remove(row.id));
    this.store.removeWhere((candidate) => candidate.id === row.id);
    this.toast.success('Invoice deleted', `${row.invoiceNo} was removed and stock was released.`);
  }

  protected exportCsv(): void {
    downloadCsv(
      'sales-invoices',
      this.filtered().map((row) => ({
        Invoice: row.invoiceNo,
        Date: row.invoiceDate,
        Customer: row.customerName,
        Branch: row.branchName,
        Lines: row.details.length,
        Gross: row.grossAmount,
        Discount: this.discountValue(row),
        Net: row.netAmount,
        Received: row.receiveAmount,
        Due: row.dueAmount,
        Courier: this.courierLabel(row),
      })),
    );
  }
}

import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { PaymentMode, SalesEntry, SalesReturn } from '../../core/models';
import { ConfirmService } from '../../core/services/confirm';
import { ListStore } from '../../core/services/list-store';
import { Lookups } from '../../core/services/lookups';
import { PosApi } from '../../core/services/pos-api';
import { PrintService } from '../../core/services/print';
import { ToastService } from '../../core/services/toast';
import {
  addDays,
  amountInWords,
  clamp,
  currency,
  dateRange,
  downloadCsv,
  money,
  prettyDate,
  round2,
  sum,
  today,
} from '../../core/util/format';
import { UiButton } from '../../shared/ui/button';
import { UiCombobox } from '../../shared/ui/combobox';
import { UiFilterBar } from '../../shared/ui/filter-bar';
import { UiModal } from '../../shared/ui/modal';
import { UiEmpty, UiField, UiPageHeader } from '../../shared/ui/primitives';
import { UiTable, type Column } from '../../shared/ui/table';

interface ReturnLine {
  key: string;
  itemId: number | null;
  itemName: string;
  salesPrice: number;
  quantity: number;
  maxQuantity: number;
  serialNo: string;
}

@Component({
  selector: 'app-sales-returns',
  imports: [UiPageHeader, UiFilterBar, UiTable, UiButton, UiModal, UiField, UiCombobox, UiEmpty],
  template: `
    <div class="space-y-4">
      <ui-page-header
        icon="undo"
        title="Sales returns"
        subtitle="Goods coming back in, and the refund that goes with them."
      >
        <ui-button variant="primary" icon="plus" (pressed)="openCreate()">New return</ui-button>
      </ui-page-header>

      <div class="grid gap-3 sm:grid-cols-3">
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
        searchLabel="Find a return"
        placeholder="Return number, customer, reason…"
        (refresh)="reload()"
        (exported)="exportCsv()"
        (printed)="printPdf()"
      />

      <ui-table
        [rows]="filtered()"
        [columns]="columns"
        [loading]="store.loading()"
        [actions]="rowActions"
        emptyTitle="No returns recorded"
        emptyMessage="Returns raised against an invoice will appear here."
      />
    </div>

    <ng-template #rowActions let-row>
      <div class="flex justify-end gap-1">
        <ui-button
          variant="ghost"
          size="icon"
          icon="printer"
          ariaLabel="Print credit note"
          (pressed)="printNote(row)"
        />
        <ui-button
          variant="ghost"
          size="icon"
          icon="trash"
          ariaLabel="Delete return"
          (pressed)="remove(row)"
        />
      </div>
    </ng-template>

    <ui-modal
      [(open)]="editorOpen"
      size="lg"
      heading="Record a sales return"
      subheading="Pick the original invoice, then adjust the quantities coming back."
    >
      <div class="space-y-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <ui-field label="Return date" for="sr-date" [required]="true">
            <input
              id="sr-date"
              type="date"
              class="ctl"
              [value]="returnDate()"
              (change)="returnDate.set($any($event.target).value)"
            />
          </ui-field>
          <ui-field
            label="Original invoice"
            [required]="true"
            hint="Only invoices from the last 90 days are listed."
          >
            <ui-combobox
              [options]="invoices()"
              [labelOf]="invoiceLabel"
              [keyOf]="idOf"
              [subOf]="invoiceSub"
              [(value)]="salesEntryId"
              placeholder="Search by invoice number or customer"
              (selected)="loadInvoice($event)"
            />
          </ui-field>
        </div>

        @if (lines().length) {
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
                    class="w-24 px-3 py-2 text-right text-[11px] font-semibold tracking-wider text-faint uppercase"
                  >
                    Sold
                  </th>
                  <th
                    class="w-28 px-3 py-2 text-right text-[11px] font-semibold tracking-wider text-faint uppercase"
                  >
                    Returning
                  </th>
                  <th
                    class="w-28 px-3 py-2 text-right text-[11px] font-semibold tracking-wider text-faint uppercase"
                  >
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (line of lines(); track line.key) {
                  <tr class="border-t border-line">
                    <td class="px-3 py-2">
                      <p class="font-medium text-ink">{{ line.itemName }}</p>
                      <p class="num text-[11.5px] text-faint">{{ money(line.salesPrice) }} each</p>
                    </td>
                    <td class="num px-3 py-2 text-right text-muted">{{ line.maxQuantity }}</td>
                    <td class="px-3 py-2">
                      <input
                        type="number"
                        class="ctl ctl-sm text-right"
                        [value]="line.quantity"
                        [attr.aria-label]="'Quantity returning for ' + line.itemName"
                        (input)="setQuantity(line.key, $any($event.target).value)"
                      />
                    </td>
                    <td class="num px-3 py-2 text-right font-medium">
                      {{ money(line.salesPrice * line.quantity) }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <div class="grid gap-4 sm:grid-cols-3">
            <ui-field label="Refund mode" for="sr-mode">
              <select
                id="sr-mode"
                class="ctl"
                [value]="paymentMode()"
                (change)="onModeChange($any($event.target).value)"
              >
                <option value="Cash">Cash</option>
                <option value="Bank">Bank</option>
              </select>
            </ui-field>
            <ui-field label="Account" for="sr-account">
              <select
                id="sr-account"
                class="ctl"
                [value]="paymentAccountId() ?? ''"
                (change)="paymentAccountId.set(+$any($event.target).value || null)"
              >
                @for (account of accounts(); track account.id) {
                  <option [value]="account.id">{{ account.name }}</option>
                }
              </select>
            </ui-field>
            <ui-field
              label="Refund amount"
              for="sr-refund"
              [hint]="'Return value ' + currency(total())"
            >
              <input
                id="sr-refund"
                type="number"
                class="ctl"
                [value]="refundAmount()"
                (input)="refundAmount.set(+$any($event.target).value || 0)"
              />
            </ui-field>
          </div>

          <ui-field label="Reason" for="sr-remarks">
            <input
              id="sr-remarks"
              type="text"
              class="ctl"
              [value]="remarks()"
              (input)="remarks.set($any($event.target).value)"
              placeholder="Damaged on arrival, wrong variant…"
            />
          </ui-field>
        } @else {
          <ui-empty
            title="Choose an invoice"
            message="The lines from that invoice will appear here, ready to adjust."
            icon="receipt"
          />
        }
      </div>

      <div modal-footer class="flex gap-2">
        <ui-button variant="ghost" (pressed)="editorOpen.set(false)">Cancel</ui-button>
        <ui-button
          variant="primary"
          icon="save"
          [loading]="saving()"
          [disabled]="!total()"
          (pressed)="save()"
        >
          Post return
        </ui-button>
      </div>
    </ui-modal>
  `,
  host: { class: 'block' },
})
export class SalesReturnsPage {
  private readonly api = inject(PosApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly lookups = inject(Lookups);
  private readonly print = inject(PrintService);

  protected readonly money = money;
  protected readonly currency = currency;
  protected readonly idOf = (row: { id: number }) => row.id;
  protected readonly invoiceLabel = (row: SalesEntry) => row.invoiceNo;
  protected readonly invoiceSub = (row: SalesEntry) =>
    `${row.customerName ?? 'Walk-in'} · ${currency(row.netAmount)}`;

  protected readonly search = signal('');
  protected readonly from = signal(addDays(today(), -60));
  protected readonly to = signal(today());
  protected readonly editorOpen = signal(false);
  protected readonly saving = signal(false);

  protected readonly returnDate = signal(today());
  protected readonly salesEntryId = signal<number | string | null>(null);
  protected readonly lines = signal<ReturnLine[]>([]);
  protected readonly paymentMode = signal<PaymentMode>('Cash');
  protected readonly paymentAccountId = signal<number | null>(null);
  protected readonly refundAmount = signal(0);
  protected readonly remarks = signal('');
  protected readonly invoices = signal<SalesEntry[]>([]);
  private readonly source = signal<SalesEntry | null>(null);

  protected readonly store = new ListStore<SalesReturn>((filter) =>
    this.api.salesReturns.search(filter),
  );

  protected readonly columns: Column<SalesReturn>[] = [
    {
      key: 'returnNo',
      header: 'Return',
      value: (row) => row.returnNo,
      kind: 'mono',
      width: '130px',
    },
    {
      key: 'returnDate',
      header: 'Date',
      value: (row) => row.returnDate,
      kind: 'date',
      width: '120px',
    },
    {
      key: 'customerName',
      header: 'Customer',
      value: (row) => row.customerName ?? '—',
      kind: 'strong',
      sub: (row) => row.remarks,
    },
    {
      key: 'lines',
      header: 'Lines',
      value: (row) => row.details.length,
      align: 'right',
      hideOnMobile: true,
    },
    {
      key: 'netAmount',
      header: 'Return value',
      value: (row) => row.netAmount ?? 0,
      kind: 'money',
      align: 'right',
    },
    {
      key: 'refundAmount',
      header: 'Refunded',
      value: (row) => row.refundAmount,
      kind: 'money',
      align: 'right',
    },
  ];

  protected readonly filtered = computed(() => {
    const needle = this.search().toLowerCase();
    return this.store
      .rows()
      .filter((row) =>
        needle
          ? `${row.returnNo} ${row.customerName} ${row.remarks}`.toLowerCase().includes(needle)
          : true,
      );
  });

  protected readonly tiles = computed(() => {
    const rows = this.filtered();
    return [
      { label: 'Returns', value: String(rows.length) },
      { label: 'Return value', value: currency(sum(rows, (row) => row.netAmount ?? 0)) },
      { label: 'Refunded', value: currency(sum(rows, (row) => row.refundAmount)) },
    ];
  });

  protected readonly accounts = computed(() =>
    this.paymentMode() === 'Cash' ? this.lookups.cashAccounts() : this.lookups.bankAccounts(),
  );

  protected readonly total = computed(() =>
    round2(this.lines().reduce((sum, line) => sum + line.salesPrice * line.quantity, 0)),
  );

  constructor() {
    void this.lookups.ensure();
    void this.reload();
  }

  protected reload(): void {
    void this.store.load({ fromDate: this.from(), toDate: this.to() });
  }

  protected async openCreate(): Promise<void> {
    this.returnDate.set(today());
    this.salesEntryId.set(null);
    this.lines.set([]);
    this.refundAmount.set(0);
    this.remarks.set('');
    this.paymentAccountId.set(this.lookups.cashAccounts()[0]?.id ?? null);
    this.editorOpen.set(true);
    this.invoices.set(
      await firstValueFrom(
        this.api.sales.search({ fromDate: addDays(today(), -90), toDate: today() }),
      ),
    );
  }

  protected loadInvoice(invoice: SalesEntry): void {
    this.source.set(invoice);
    this.lines.set(
      invoice.details.map((line, index) => ({
        key: `rl-${index}`,
        itemId: line.itemId,
        itemName: line.itemName ?? '',
        salesPrice: line.salesPrice,
        quantity: 0,
        maxQuantity: line.quantity,
        serialNo: line.serialNo ?? '',
      })),
    );
    this.refundAmount.set(0);
  }

  protected setQuantity(key: string, value: string): void {
    this.lines.update((lines) =>
      lines.map((line) =>
        line.key === key
          ? { ...line, quantity: clamp(Number(value) || 0, 0, line.maxQuantity) }
          : line,
      ),
    );
    this.refundAmount.set(this.total());
  }

  protected onModeChange(mode: string): void {
    this.paymentMode.set(mode as PaymentMode);
    this.paymentAccountId.set(this.accounts()[0]?.id ?? null);
  }

  protected async save(): Promise<void> {
    const invoice = this.source();
    const details = this.lines().filter((line) => line.quantity > 0);
    if (!invoice || !details.length) {
      this.toast.warn('Nothing to return', 'Set a quantity on at least one line.');
      return;
    }

    this.saving.set(true);
    try {
      const saved = await firstValueFrom(
        this.api.salesReturns.create({
          returnDate: this.returnDate(),
          branchId: invoice.branchId,
          customerId: invoice.customerId,
          salesEntryId: invoice.id,
          details: details.map((line) => ({
            itemId: line.itemId,
            salesPrice: line.salesPrice,
            quantity: line.quantity,
            serialNo: line.serialNo,
          })),
          discount: 0,
          refundAmount: this.refundAmount(),
          paymentMode: this.paymentMode(),
          paymentAccountId: this.paymentAccountId(),
          remarks: this.remarks(),
          postBy: 'Aman',
        }),
      );
      this.toast.success('Return posted', `${saved.returnNo} · ${currency(saved.netAmount)}`);
      this.editorOpen.set(false);
      this.reload();
    } catch {
      /* surfaced by the error interceptor */
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(row: SalesReturn): Promise<void> {
    if (!(await this.confirm.askDelete(`return ${row.returnNo}`))) return;
    await firstValueFrom(this.api.salesReturns.remove(row.id));
    this.store.removeWhere((candidate) => candidate.id === row.id);
    this.toast.success('Return deleted', `${row.returnNo} was removed.`);
  }

  /** One row shape, shared by the CSV export and the printed report. */
  private reportRows(): Record<string, unknown>[] {
    return this.filtered().map((row) => ({
      Return: row.returnNo,
      Date: row.returnDate,
      Customer: row.customerName,
      Lines: row.details.length,
      Value: row.netAmount,
      Refunded: row.refundAmount,
      Reason: row.remarks,
    }));
  }

  protected exportCsv(): void {
    downloadCsv('sales-returns', this.reportRows());
  }

  protected printPdf(): void {
    const rows = this.filtered();
    this.print.report({
      title: 'Sales returns',
      subtitle: dateRange(this.from(), this.to()),
      filename: 'sales-returns',
      filters: [{ label: 'Search', value: this.search() || 'All records' }],
      summary: this.tiles(),
      sections: [
        {
          rows: this.reportRows(),
          totals: {
            Lines: sum(rows, (row) => row.details.length),
            Value: sum(rows, (row) => row.netAmount ?? 0),
            Refunded: sum(rows, (row) => row.refundAmount),
          },
          emptyMessage: 'No returns in this window.',
        },
      ],
    });
  }

  /** The credit note handed back to the customer. */
  protected printNote(row: SalesReturn): void {
    this.print.document({
      title: 'Credit note — sales return',
      documentNo: row.returnNo,
      filename: `credit-note-${row.returnNo}`,
      meta: [
        { label: 'Date', value: prettyDate(row.returnDate) },
        { label: 'Against invoice', value: row.salesEntryId ? `#${row.salesEntryId}` : '—' },
        { label: 'Refund mode', value: row.paymentMode },
      ],
      parties: [{ heading: 'Returned by', lines: [row.customerName || 'Walk-in customer'] }],
      section: {
        columns: [
          { key: 'Item', align: 'left' },
          { key: 'Qty', align: 'right' },
          { key: 'Rate', align: 'right' },
          { key: 'Amount', align: 'right' },
        ],
        rows: row.details.map((line) => ({
          Item: line.itemName ?? '—',
          Qty: line.quantity,
          Rate: line.salesPrice,
          Amount: line.salesPrice * line.quantity,
        })),
        totals: {
          Qty: sum(row.details, (line) => line.quantity),
          Amount: sum(row.details, (line) => line.salesPrice * line.quantity),
        },
      },
      totals: [
        { label: 'Discount', value: `− ${currency(row.discount)}` },
        { label: 'Credit value', value: currency(row.netAmount), strong: true },
        { label: `Refunded (${row.paymentMode})`, value: currency(row.refundAmount) },
      ],
      amountInWords: amountInWords(row.netAmount),
      note: row.remarks || undefined,
      signatures: ['Customer', 'Authorised signature'],
    });
  }
}

import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Customer, OutstandingInvoice, PaymentMode, Receipt } from '../../core/models';
import { ConfirmService } from '../../core/services/confirm';
import { ListStore } from '../../core/services/list-store';
import { Lookups } from '../../core/services/lookups';
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
  round2,
  sum,
  today,
} from '../../core/util/format';
import { UiButton } from '../../shared/ui/button';
import { UiCombobox } from '../../shared/ui/combobox';
import { UiFilterBar } from '../../shared/ui/filter-bar';
import { UiIcon } from '../../shared/ui/icon';
import { UiModal } from '../../shared/ui/modal';
import { UiEmpty, UiField, UiPageHeader } from '../../shared/ui/primitives';
import { UiTable, type Column } from '../../shared/ui/table';

interface Allocation extends OutstandingInvoice {
  applied: number;
}

@Component({
  selector: 'app-receipts',
  imports: [
    UiPageHeader,
    UiFilterBar,
    UiTable,
    UiButton,
    UiModal,
    UiField,
    UiCombobox,
    UiIcon,
    UiEmpty,
  ],
  template: `
    <div class="space-y-4">
      <ui-page-header
        icon="wallet"
        title="Receipts"
        subtitle="Money in from customers, allocated against their open invoices."
      >
        <ui-button variant="primary" icon="plus" (pressed)="openCreate()">New receipt</ui-button>
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
        searchLabel="Find a receipt"
        placeholder="Receipt number, customer, reference…"
        (refresh)="reload()"
        (exported)="exportCsv()"
        (printed)="printPdf()"
      />

      <ui-table
        [rows]="filtered()"
        [columns]="columns"
        [loading]="store.loading()"
        [actions]="rowActions"
        emptyTitle="No receipts in this window"
        emptyMessage="Collect against an outstanding invoice to see it here."
      />
    </div>

    <ng-template #rowActions let-row>
      <div class="flex justify-end gap-1">
        <ui-button
          variant="ghost"
          size="icon"
          icon="printer"
          ariaLabel="Print receipt voucher"
          (pressed)="printVoucher(row)"
        />
        <ui-button
          variant="ghost"
          size="icon"
          icon="trash"
          ariaLabel="Delete receipt"
          (pressed)="remove(row)"
        />
      </div>
    </ng-template>

    <ui-modal
      [(open)]="editorOpen"
      size="lg"
      heading="Record a receipt"
      subheading="Allocate against open invoices, or leave it on account as an advance."
    >
      <div class="space-y-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <ui-field label="Receipt date" for="rc-date" [required]="true">
            <input
              id="rc-date"
              type="date"
              class="ctl"
              [value]="receiptDate()"
              (change)="receiptDate.set($any($event.target).value)"
            />
          </ui-field>
          <ui-field label="Customer" [required]="true">
            <ui-combobox
              [options]="lookups.customers()"
              [labelOf]="customerLabel"
              [keyOf]="idOf"
              [subOf]="customerSub"
              [(value)]="customerId"
              placeholder="Who is paying?"
              (selected)="loadOutstanding($event)"
            />
          </ui-field>
        </div>

        <div class="grid gap-4 sm:grid-cols-3">
          <ui-field label="Amount received" for="rc-amount" [required]="true">
            <input
              id="rc-amount"
              type="number"
              step="0.01"
              class="ctl"
              [value]="amount()"
              (input)="amount.set(+$any($event.target).value || 0)"
            />
          </ui-field>
          <ui-field label="Mode" for="rc-mode">
            <select
              id="rc-mode"
              class="ctl"
              [value]="paymentMode()"
              (change)="onModeChange($any($event.target).value)"
            >
              <option value="Cash">Cash</option>
              <option value="Bank">Bank</option>
            </select>
          </ui-field>
          <ui-field label="Account" for="rc-account">
            <select
              id="rc-account"
              class="ctl"
              [value]="paymentAccountId() ?? ''"
              (change)="paymentAccountId.set(+$any($event.target).value || null)"
            >
              @for (account of accounts(); track account.id) {
                <option [value]="account.id">{{ account.name }}</option>
              }
            </select>
          </ui-field>
        </div>

        @if (customerId()) {
          <div class="overflow-hidden rounded-xl border border-line">
            <div
              class="flex items-center justify-between border-b border-line bg-surface-2/60 px-3.5 py-2.5"
            >
              <h3 class="text-[13px] font-semibold text-ink">Open invoices</h3>
              <ui-button variant="soft" size="sm" icon="zap" (pressed)="autoAllocate()">
                Auto-allocate
              </ui-button>
            </div>

            @if (allocations().length) {
              <table class="w-full text-left text-[13px]">
                <thead class="bg-surface-2/40">
                  <tr>
                    <th
                      class="px-3 py-2 text-[11px] font-semibold tracking-wider text-faint uppercase"
                    >
                      Invoice
                    </th>
                    <th
                      class="px-3 py-2 text-[11px] font-semibold tracking-wider text-faint uppercase"
                    >
                      Date
                    </th>
                    <th
                      class="px-3 py-2 text-right text-[11px] font-semibold tracking-wider text-faint uppercase"
                    >
                      Due
                    </th>
                    <th
                      class="w-32 px-3 py-2 text-right text-[11px] font-semibold tracking-wider text-faint uppercase"
                    >
                      Applying
                    </th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of allocations(); track row.documentId) {
                    <tr class="border-t border-line">
                      <td class="px-3 py-2 font-mono text-[12.5px] text-brand-text">
                        {{ row.documentNo }}
                      </td>
                      <td class="px-3 py-2 text-muted">{{ date(row.documentDate) }}</td>
                      <td class="num px-3 py-2 text-right">{{ money(row.dueAmount) }}</td>
                      <td class="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          class="ctl ctl-sm text-right"
                          [value]="row.applied"
                          [attr.aria-label]="'Amount applied to ' + row.documentNo"
                          (input)="setApplied(row.documentId, $any($event.target).value)"
                        />
                      </td>
                    </tr>
                  }
                </tbody>
              </table>

              <div
                class="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3.5 py-2.5 text-[13px]"
              >
                <p class="text-muted">
                  Allocated
                  <span class="num ml-1 font-semibold text-ink">{{ money(allocated()) }}</span>
                </p>
                <p [class]="unallocated() > 0.5 ? 'text-warn' : 'text-muted'">
                  On account
                  <span class="num ml-1 font-semibold">{{ money(unallocated()) }}</span>
                </p>
              </div>
            } @else {
              <ui-empty
                title="No open invoices"
                message="This customer is settled — the receipt will sit on account as an advance."
                icon="checkCircle"
              />
            }
          </div>
        }

        <div class="grid gap-4 sm:grid-cols-2">
          <ui-field label="Reference" for="rc-ref" hint="Cheque or transaction number.">
            <input
              id="rc-ref"
              type="text"
              class="ctl"
              [value]="referenceNo()"
              (input)="referenceNo.set($any($event.target).value)"
            />
          </ui-field>
          <ui-field label="Remarks" for="rc-remarks">
            <input
              id="rc-remarks"
              type="text"
              class="ctl"
              [value]="remarks()"
              (input)="remarks.set($any($event.target).value)"
            />
          </ui-field>
        </div>

        @if (overAllocated()) {
          <p
            class="flex items-center gap-2 rounded-xl bg-neg-soft px-3.5 py-2.5 text-[13px] text-neg"
          >
            <ui-icon name="alert" [size]="16" />
            The allocated total is more than the amount received.
          </p>
        }
      </div>

      <div modal-footer class="flex gap-2">
        <ui-button variant="ghost" (pressed)="editorOpen.set(false)">Cancel</ui-button>
        <ui-button
          variant="primary"
          icon="save"
          [loading]="saving()"
          [disabled]="!customerId() || amount() <= 0 || overAllocated()"
          (pressed)="save()"
        >
          Post receipt
        </ui-button>
      </div>
    </ui-modal>
  `,
  host: { class: 'block' },
})
export class ReceiptsPage {
  private readonly api = inject(PosApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly lookups = inject(Lookups);
  private readonly print = inject(PrintService);

  protected readonly money = money;
  protected readonly date = prettyDate;
  protected readonly idOf = (row: { id: number }) => row.id;
  protected readonly customerLabel = (row: Customer) => row.customerName;
  protected readonly customerSub = (row: Customer) => row.contactNumber;

  protected readonly search = signal('');
  protected readonly from = signal(addDays(today(), -60));
  protected readonly to = signal(today());
  protected readonly editorOpen = signal(false);
  protected readonly saving = signal(false);

  protected readonly receiptDate = signal(today());
  protected readonly customerId = signal<number | string | null>(null);
  protected readonly amount = signal(0);
  protected readonly paymentMode = signal<PaymentMode>('Cash');
  protected readonly paymentAccountId = signal<number | null>(null);
  protected readonly referenceNo = signal('');
  protected readonly remarks = signal('');
  protected readonly allocations = signal<Allocation[]>([]);

  protected readonly store = new ListStore<Receipt>((filter) => this.api.receipts.search(filter));

  protected readonly columns: Column<Receipt>[] = [
    {
      key: 'receiptNo',
      header: 'Receipt',
      value: (row) => row.receiptNo,
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
      key: 'customerName',
      header: 'Customer',
      value: (row) => row.customerName ?? '—',
      kind: 'strong',
      sub: (row) => row.remarks,
    },
    {
      key: 'paymentMode',
      header: 'Mode',
      value: (row) => row.paymentMode,
      kind: 'badge',
      tone: (row) => (row.paymentMode === 'Cash' ? 'pos' : 'info'),
      hideOnMobile: true,
    },
    {
      key: 'allocations',
      header: 'Invoices',
      value: (row) => row.details?.length ?? 0,
      align: 'right',
      hideOnMobile: true,
    },
    { key: 'amount', header: 'Amount', value: (row) => row.amount, kind: 'money', align: 'right' },
  ];

  protected readonly filtered = computed(() => {
    const needle = this.search().toLowerCase();
    return this.store
      .rows()
      .filter((row) =>
        needle
          ? `${row.receiptNo} ${row.customerName} ${row.referenceNo} ${row.remarks}`
              .toLowerCase()
              .includes(needle)
          : true,
      );
  });

  protected readonly tiles = computed(() => {
    const rows = this.filtered();
    return [
      { label: 'Receipts', value: String(rows.length) },
      { label: 'Collected', value: currency(sum(rows, (row) => row.amount)) },
      {
        label: 'Into bank',
        value: currency(
          sum(
            rows.filter((row) => row.paymentMode === 'Bank'),
            (row) => row.amount,
          ),
        ),
      },
    ];
  });

  protected readonly accounts = computed(() =>
    this.paymentMode() === 'Cash' ? this.lookups.cashAccounts() : this.lookups.bankAccounts(),
  );

  protected readonly allocated = computed(() =>
    round2(this.allocations().reduce((total, row) => total + row.applied, 0)),
  );
  protected readonly unallocated = computed(() => round2(this.amount() - this.allocated()));
  protected readonly overAllocated = computed(() => this.allocated() - this.amount() > 0.5);

  constructor() {
    void this.lookups.ensure();
    void this.reload();
  }

  protected reload(): void {
    void this.store.load({ fromDate: this.from(), toDate: this.to() });
  }

  protected openCreate(): void {
    this.receiptDate.set(today());
    this.customerId.set(null);
    this.amount.set(0);
    this.referenceNo.set('');
    this.remarks.set('');
    this.allocations.set([]);
    this.paymentMode.set('Cash');
    this.paymentAccountId.set(this.lookups.cashAccounts()[0]?.id ?? null);
    this.editorOpen.set(true);
  }

  protected async loadOutstanding(customer: Customer): Promise<void> {
    const invoices = await firstValueFrom(this.api.outstandingSales(customer.id));
    this.allocations.set(invoices.map((invoice) => ({ ...invoice, applied: 0 })));
  }

  protected setApplied(documentId: number, value: string): void {
    const applied = Math.max(0, Number(value) || 0);
    this.allocations.update((rows) =>
      rows.map((row) =>
        row.documentId === documentId ? { ...row, applied: Math.min(applied, row.dueAmount) } : row,
      ),
    );
  }

  /** Spreads the receipt across the oldest invoices first. */
  protected autoAllocate(): void {
    let remaining = this.amount();
    this.allocations.update((rows) =>
      rows.map((row) => {
        const applied = round2(Math.min(remaining, row.dueAmount));
        remaining = round2(remaining - applied);
        return { ...row, applied };
      }),
    );
  }

  protected onModeChange(mode: string): void {
    this.paymentMode.set(mode as PaymentMode);
    this.paymentAccountId.set(this.accounts()[0]?.id ?? null);
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    try {
      const saved = await firstValueFrom(
        this.api.receipts.create({
          receiptDate: this.receiptDate(),
          customerId: Number(this.customerId()),
          amount: this.amount(),
          paymentMode: this.paymentMode(),
          paymentAccountId: this.paymentAccountId(),
          details: this.allocations()
            .filter((row) => row.applied > 0)
            .map((row) => ({ salesEntryId: row.documentId, amount: row.applied })),
          referenceNo: this.referenceNo(),
          remarks: this.remarks(),
          postBy: 'Aman',
        }),
      );
      this.toast.success('Receipt posted', `${saved.receiptNo} · ${currency(saved.amount)}`);
      this.editorOpen.set(false);
      this.reload();
    } catch {
      /* surfaced by the error interceptor */
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(row: Receipt): Promise<void> {
    if (!(await this.confirm.askDelete(`receipt ${row.receiptNo}`))) return;
    await firstValueFrom(this.api.receipts.remove(row.id));
    this.store.removeWhere((candidate) => candidate.id === row.id);
    this.toast.success('Receipt deleted', `${row.receiptNo} was reversed.`);
  }

  /** One row shape, shared by the CSV export and the printed report. */
  private reportRows(): Record<string, unknown>[] {
    return this.filtered().map((row) => ({
      Receipt: row.receiptNo,
      Date: row.receiptDate,
      Customer: row.customerName,
      Mode: row.paymentMode,
      Amount: row.amount,
      Reference: row.referenceNo,
      Remarks: row.remarks,
    }));
  }

  protected exportCsv(): void {
    downloadCsv('receipts', this.reportRows());
  }

  protected printPdf(): void {
    this.print.report({
      title: 'Receipts',
      subtitle: dateRange(this.from(), this.to()),
      filename: 'receipts',
      filters: [{ label: 'Search', value: this.search() || 'All records' }],
      summary: this.tiles(),
      sections: [
        {
          rows: this.reportRows(),
          totals: { Amount: sum(this.filtered(), (row) => row.amount) },
          emptyMessage: 'No receipts in this window.',
        },
      ],
    });
  }

  /** The money receipt handed to the customer. */
  protected printVoucher(row: Receipt): void {
    this.print.document({
      title: 'Money receipt',
      documentNo: row.receiptNo,
      filename: `receipt-${row.receiptNo}`,
      meta: [
        { label: 'Date', value: prettyDate(row.receiptDate) },
        { label: 'Mode', value: row.paymentMode },
        { label: 'Reference', value: row.referenceNo || '—' },
      ],
      parties: [{ heading: 'Received from', lines: [row.customerName || '—'] }],
      section: {
        heading: 'Allocated against',
        columns: [
          { key: 'Invoice', align: 'left' },
          { key: 'Amount', align: 'right' },
        ],
        rows: row.details.map((line) => ({
          Invoice: line.invoiceNo ?? 'On account',
          Amount: line.amount,
        })),
        totals: { Amount: sum(row.details, (line) => line.amount) },
        emptyMessage: 'Held on account — not allocated to an invoice.',
      },
      totals: [{ label: 'Received', value: currency(row.amount), strong: true }],
      amountInWords: amountInWords(row.amount),
      note: row.remarks || undefined,
      signatures: ['Paid by', 'Received by'],
    });
  }
}

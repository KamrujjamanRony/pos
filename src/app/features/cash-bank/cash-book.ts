import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { CashBookRow, CashLedgerRow, PaymentMode } from '../../core/models';
import { Lookups } from '../../core/services/lookups';
import { PosApi } from '../../core/services/pos-api';
import { PrintService } from '../../core/services/print';
import {
  addDays,
  currency,
  dateRange,
  downloadCsv,
  money,
  prettyDate,
  sum,
  today,
} from '../../core/util/format';
import { UiDonut, type Point } from '../../shared/ui/charts';
import { UiFilterBar } from '../../shared/ui/filter-bar';
import { UiCard, UiEmpty, UiPageHeader, UiSkeleton } from '../../shared/ui/primitives';
import { UiStat } from '../../shared/ui/stat';
import { UiTable, type Column } from '../../shared/ui/table';

@Component({
  selector: 'app-cash-book',
  imports: [UiPageHeader, UiFilterBar, UiTable, UiCard, UiStat, UiDonut, UiEmpty, UiSkeleton],
  template: `
    <div class="space-y-4">
      <ui-page-header
        icon="bank"
        title="Cash book"
        subtitle="What every document did to your cash and bank accounts. Nothing is posted here directly."
      />

      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ui-stat
          label="Cash in hand"
          [value]="cashTotal()"
          format="money"
          prefix="৳"
          icon="money"
          [series]="3"
        />
        <ui-stat
          label="Cash at bank"
          [value]="bankTotal()"
          format="money"
          prefix="৳"
          icon="bank"
          [series]="1"
        />
        <ui-stat
          label="Money in"
          [value]="inflow()"
          format="money"
          prefix="৳"
          icon="arrowDownRight"
          [series]="6"
        />
        <ui-stat
          label="Money out"
          [value]="outflow()"
          format="money"
          prefix="৳"
          icon="arrowUpRight"
          [series]="2"
          [upIsGood]="false"
        />
      </div>

      <div class="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <ui-card
          heading="Account balances"
          subheading="Opening plus every movement"
          icon="wallet"
          [padded]="false"
        >
          @if (balanceLoading()) {
            <div class="p-4"><ui-skeleton [count]="4" [height]="40" /></div>
          } @else {
            <div class="overflow-x-auto">
              <table class="w-full text-left text-sm">
                <thead>
                  <tr class="border-b border-line bg-surface-2/60">
                    <th
                      class="px-4 py-2.5 text-[11px] font-semibold tracking-wider text-faint uppercase"
                    >
                      Account
                    </th>
                    <th
                      class="px-4 py-2.5 text-right text-[11px] font-semibold tracking-wider text-faint uppercase"
                    >
                      Opening
                    </th>
                    <th
                      class="px-4 py-2.5 text-right text-[11px] font-semibold tracking-wider text-faint uppercase"
                    >
                      In
                    </th>
                    <th
                      class="px-4 py-2.5 text-right text-[11px] font-semibold tracking-wider text-faint uppercase"
                    >
                      Out
                    </th>
                    <th
                      class="px-4 py-2.5 text-right text-[11px] font-semibold tracking-wider text-faint uppercase"
                    >
                      Balance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of balances(); track row.mode + row.accountId; let i = $index) {
                    <tr
                      class="stagger border-b border-line/70 last:border-0 hover:bg-surface-2/50"
                      [style]="'--i:' + i"
                    >
                      <td class="px-4 py-2.5">
                        <p class="font-medium text-ink">{{ row.accountName }}</p>
                        <p class="text-[11.5px] text-faint">{{ row.mode }}</p>
                      </td>
                      <td class="num px-4 py-2.5 text-right text-muted">
                        {{ money(row.opening) }}
                      </td>
                      <td class="num px-4 py-2.5 text-right text-pos">{{ money(row.inflow) }}</td>
                      <td class="num px-4 py-2.5 text-right text-neg">{{ money(row.outflow) }}</td>
                      <td class="num px-4 py-2.5 text-right font-semibold text-ink">
                        {{ money(row.balance) }}
                      </td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr class="border-t-2 border-line bg-surface-2/60 font-semibold">
                    <td class="px-4 py-2.5">All accounts</td>
                    <td class="num px-4 py-2.5 text-right">{{ money(openingTotal()) }}</td>
                    <td class="num px-4 py-2.5 text-right">{{ money(inflow()) }}</td>
                    <td class="num px-4 py-2.5 text-right">{{ money(outflow()) }}</td>
                    <td class="num px-4 py-2.5 text-right">{{ money(balanceTotal()) }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          }
        </ui-card>

        <ui-card heading="Where the money sits" icon="pie">
          @if (balances().length) {
            <ui-donut [data]="mix()" caption="Balance" />
          } @else {
            <ui-empty title="No accounts yet" icon="bank" />
          }
        </ui-card>
      </div>

      <ui-filter-bar
        [(search)]="search"
        [(from)]="from"
        [(to)]="to"
        [dates]="true"
        searchLabel="Find a movement"
        placeholder="Document number or particulars…"
        (refresh)="reload()"
        (exported)="exportCsv()"
        (printed)="printPdf()"
      >
        <div class="w-36">
          <label class="mb-1.5 block text-[12px] font-medium text-muted" for="cb-mode">Mode</label>
          <select
            id="cb-mode"
            class="ctl"
            [value]="mode()"
            (change)="onMode($any($event.target).value)"
          >
            <option value="">Cash & bank</option>
            <option value="Cash">Cash only</option>
            <option value="Bank">Bank only</option>
          </select>
        </div>
        <div class="w-36">
          <label class="mb-1.5 block text-[12px] font-medium text-muted" for="cb-direction"
            >Direction</label
          >
          <select
            id="cb-direction"
            class="ctl"
            [value]="direction()"
            (change)="onDirection($any($event.target).value)"
          >
            <option value="">In & out</option>
            <option value="In">Money in</option>
            <option value="Out">Money out</option>
          </select>
        </div>
      </ui-filter-bar>

      <ui-table
        [rows]="filtered()"
        [columns]="columns"
        [loading]="ledgerLoading()"
        [pageSize]="20"
        [trackBy]="trackRow"
        emptyTitle="No movements in this window"
        emptyMessage="Widen the date range, or clear the filters."
      />
    </div>
  `,
  host: { class: 'block' },
})
export class CashBookPage {
  private readonly api = inject(PosApi);
  private readonly lookups = inject(Lookups);
  private readonly print = inject(PrintService);

  protected readonly money = money;
  protected readonly date = prettyDate;

  protected readonly search = signal('');
  protected readonly from = signal(addDays(today(), -30));
  protected readonly to = signal(today());
  protected readonly mode = signal<'' | PaymentMode>('');
  protected readonly direction = signal<'' | 'In' | 'Out'>('');

  protected readonly balanceLoading = signal(true);
  protected readonly ledgerLoading = signal(true);
  protected readonly balances = signal<CashBookRow[]>([]);
  protected readonly ledger = signal<CashLedgerRow[]>([]);

  private counter = 0;
  protected readonly trackRow = (row: CashLedgerRow) =>
    `${row.documentNo}-${row.accountName}-${row.transactionType}-${this.counter++}`;

  protected readonly columns: Column<CashLedgerRow>[] = [
    { key: 'date', header: 'Date', value: (row) => row.date, kind: 'date', width: '120px' },
    {
      key: 'documentNo',
      header: 'Document',
      value: (row) => row.documentNo,
      kind: 'mono',
      width: '130px',
    },
    {
      key: 'particulars',
      header: 'Particulars',
      value: (row) => row.particulars,
      kind: 'strong',
      sub: (row) => row.accountName,
    },
    {
      key: 'transactionType',
      header: 'Direction',
      value: (row) => (row.transactionType === 'In' ? 'Money in' : 'Money out'),
      kind: 'badge',
      tone: (row) => (row.transactionType === 'In' ? 'pos' : 'neg'),
      hideOnMobile: true,
    },
    { key: 'amount', header: 'Amount', value: (row) => row.amount, kind: 'money', align: 'right' },
    {
      key: 'balance',
      header: 'Running',
      value: (row) => row.balance,
      kind: 'money',
      align: 'right',
      hideOnMobile: true,
    },
  ];

  protected readonly filtered = computed(() => {
    const needle = this.search().toLowerCase();
    return this.ledger().filter((row) =>
      needle
        ? `${row.documentNo} ${row.particulars} ${row.accountName}`.toLowerCase().includes(needle)
        : true,
    );
  });

  protected readonly cashTotal = computed(() =>
    sum(
      this.balances().filter((row) => row.mode === 'Cash'),
      (row) => row.balance,
    ),
  );
  protected readonly bankTotal = computed(() =>
    sum(
      this.balances().filter((row) => row.mode === 'Bank'),
      (row) => row.balance,
    ),
  );
  protected readonly openingTotal = computed(() => sum(this.balances(), (row) => row.opening));
  protected readonly balanceTotal = computed(() => sum(this.balances(), (row) => row.balance));
  protected readonly inflow = computed(() => sum(this.balances(), (row) => row.inflow));
  protected readonly outflow = computed(() => sum(this.balances(), (row) => row.outflow));

  protected readonly mix = computed<Point[]>(() =>
    this.balances()
      .filter((row) => row.balance > 0)
      .map((row) => ({ label: `${row.accountName}`, value: row.balance })),
  );

  constructor() {
    void this.lookups.ensure();
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.balanceLoading.set(true);
    this.ledgerLoading.set(true);
    try {
      const [balances, ledger] = await Promise.all([
        firstValueFrom(this.api.cashBalance({ asOnDate: this.to() })),
        firstValueFrom(
          this.api.cashLedger({
            fromDate: this.from(),
            toDate: this.to(),
            mode: this.mode() || null,
            transactionType: this.direction() || null,
          }),
        ),
      ]);
      this.balances.set(balances);
      this.ledger.set(ledger);
    } finally {
      this.balanceLoading.set(false);
      this.ledgerLoading.set(false);
    }
  }

  protected onMode(value: string): void {
    this.mode.set(value as '' | PaymentMode);
    void this.reload();
  }

  protected onDirection(value: string): void {
    this.direction.set(value as '' | 'In' | 'Out');
    void this.reload();
  }

  /** One row shape, shared by the CSV export and the printed report. */
  private reportRows(): Record<string, unknown>[] {
    return this.filtered().map((row) => ({
      Date: row.date,
      Document: row.documentNo,
      Particulars: row.particulars,
      Mode: row.mode,
      Account: row.accountName,
      Direction: row.transactionType,
      Amount: row.amount,
      Balance: row.balance,
    }));
  }

  protected exportCsv(): void {
    downloadCsv('cash-book', this.reportRows());
  }

  /** Balances and movements together — the cash book as it is kept on paper. */
  protected printPdf(): void {
    const balances = this.balances();
    this.print.report({
      title: 'Cash book',
      subtitle: dateRange(this.from(), this.to()),
      filename: 'cash-book',
      landscape: true,
      filters: [
        { label: 'Mode', value: this.mode() || 'Cash & bank' },
        { label: 'Direction', value: this.direction() || 'In & out' },
        { label: 'Search', value: this.search() || 'All records' },
      ],
      summary: [
        { label: 'Cash in hand', value: currency(this.cashTotal()) },
        { label: 'Cash at bank', value: currency(this.bankTotal()) },
        { label: 'Money in', value: currency(this.inflow()) },
        { label: 'Money out', value: currency(this.outflow()) },
      ],
      sections: [
        {
          heading: 'Account balances',
          rows: balances.map((row) => ({
            Account: row.accountName,
            Mode: row.mode,
            Opening: row.opening,
            In: row.inflow,
            Out: row.outflow,
            Balance: row.balance,
          })),
          totals: {
            Opening: this.openingTotal(),
            In: this.inflow(),
            Out: this.outflow(),
            Balance: this.balanceTotal(),
          },
          emptyMessage: 'No accounts configured.',
        },
        {
          heading: 'Movements',
          rows: this.reportRows(),
          emptyMessage: 'No movements in this window.',
        },
      ],
    });
  }

  protected readonly currency = currency;
}

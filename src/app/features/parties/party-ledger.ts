import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { PartyBalanceRow, PartyLedgerRow } from '../../core/models';
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
  startOfMonth,
  sum,
  today,
} from '../../core/util/format';
import { UiButton } from '../../shared/ui/button';
import { UiCombobox } from '../../shared/ui/combobox';
import { UiFilterBar } from '../../shared/ui/filter-bar';
import { UiIcon } from '../../shared/ui/icon';
import { UiCard, UiEmpty, UiPageHeader, UiSkeleton } from '../../shared/ui/primitives';
import { UiStat } from '../../shared/ui/stat';
import { UiTable, type Column } from '../../shared/ui/table';

export interface PartyLedgerConfig {
  kind: 'customer' | 'supplier';
}

interface PartyOption {
  id: number;
  name: string;
  sub: string;
}

@Component({
  selector: 'app-party-ledger',
  imports: [
    UiPageHeader,
    UiButton,
    UiFilterBar,
    UiTable,
    UiCombobox,
    UiCard,
    UiStat,
    UiEmpty,
    UiSkeleton,
    UiIcon,
  ],
  template: `
    <div class="space-y-4">
      <ui-page-header
        [icon]="isCustomer() ? 'users' : 'inbox'"
        [title]="isCustomer() ? 'Customer ledger' : 'Supplier ledger'"
        [subtitle]="
          isCustomer()
            ? 'Who owes you, and the statement behind each balance.'
            : 'Who you owe, and the statement behind each balance.'
        "
      />

      <div class="grid gap-4 sm:grid-cols-3">
        <ui-stat
          [label]="isCustomer() ? 'Total receivable' : 'Total payable'"
          [value]="outstanding()"
          format="money"
          prefix="৳"
          icon="wallet"
          [series]="2"
          [upIsGood]="false"
        />
        <ui-stat
          [label]="isCustomer() ? 'Customers with a balance' : 'Suppliers with a balance'"
          [value]="withBalance()"
          format="integer"
          icon="users"
          [series]="1"
          [upIsGood]="false"
        />
        <ui-stat
          label="Largest single balance"
          [value]="largest()"
          format="money"
          prefix="৳"
          icon="alert"
          [series]="4"
          [deltaCaption]="largestName()"
          [upIsGood]="false"
        />
      </div>

      <ui-filter-bar
        [(search)]="search"
        [(from)]="from"
        [(to)]="to"
        [dates]="true"
        [searchLabel]="isCustomer() ? 'Find a customer' : 'Find a supplier'"
        placeholder="Search by name…"
        (refresh)="reload()"
        (exported)="exportCsv()"
        (printed)="printPdf()"
      >
        <div class="w-64">
          <label class="mb-1.5 block text-[12px] font-medium text-muted">Statement for</label>
          <ui-combobox
            [options]="parties()"
            [labelOf]="partyLabel"
            [keyOf]="partyKey"
            [subOf]="partySub"
            [(value)]="partyId"
            placeholder="All parties (balance list)"
            (selected)="loadStatement()"
          />
        </div>
      </ui-filter-bar>

      @if (partyId()) {
        <ui-card
          [heading]="selectedName() + ' — statement'"
          [subheading]="date(from()) + ' to ' + date(to())"
          icon="file"
          [padded]="false"
        >
          <div card-actions class="flex items-center gap-3">
            <div class="text-right">
              <p class="text-[11px] tracking-wide text-faint uppercase">Closing balance</p>
              <p
                class="num text-[15px] font-semibold"
                [class]="closing() > 0 ? 'text-warn' : 'text-pos'"
              >
                {{ currency(closing()) }}
              </p>
            </div>
            <ui-button variant="outline" size="sm" icon="printer" (pressed)="printStatement()">
              Print statement
            </ui-button>
          </div>

          @if (statementLoading()) {
            <div class="p-4"><ui-skeleton [count]="6" [height]="38" /></div>
          } @else if (statement().length) {
            <div class="overflow-x-auto">
              <table class="w-full text-left text-sm">
                <thead>
                  <tr class="border-b border-line bg-surface-2/60">
                    <th
                      class="px-4 py-2.5 text-[11px] font-semibold tracking-wider text-faint uppercase"
                    >
                      Date
                    </th>
                    <th
                      class="px-4 py-2.5 text-[11px] font-semibold tracking-wider text-faint uppercase"
                    >
                      Document
                    </th>
                    <th
                      class="px-4 py-2.5 text-[11px] font-semibold tracking-wider text-faint uppercase"
                    >
                      Particulars
                    </th>
                    <th
                      class="px-4 py-2.5 text-right text-[11px] font-semibold tracking-wider text-faint uppercase"
                    >
                      Debit
                    </th>
                    <th
                      class="px-4 py-2.5 text-right text-[11px] font-semibold tracking-wider text-faint uppercase"
                    >
                      Credit
                    </th>
                    <th
                      class="px-4 py-2.5 text-right text-[11px] font-semibold tracking-wider text-faint uppercase"
                    >
                      Balance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of statement(); track $index; let i = $index) {
                    <tr
                      class="stagger border-b border-line/70 last:border-0 hover:bg-surface-2/50"
                      [style]="'--i:' + i"
                    >
                      <td class="px-4 py-2 whitespace-nowrap text-muted">{{ date(row.date) }}</td>
                      <td class="px-4 py-2 font-mono text-[12.5px] text-brand-text">
                        {{ row.documentNo }}
                      </td>
                      <td class="px-4 py-2 text-ink">{{ row.particulars }}</td>
                      <td class="num px-4 py-2 text-right">
                        {{ row.debit ? money(row.debit) : '—' }}
                      </td>
                      <td class="num px-4 py-2 text-right">
                        {{ row.credit ? money(row.credit) : '—' }}
                      </td>
                      <td class="num px-4 py-2 text-right font-medium text-ink">
                        {{ money(row.balance) }}
                      </td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr class="border-t-2 border-line bg-surface-2/60 font-semibold">
                    <td class="px-4 py-2.5" colspan="3">Totals</td>
                    <td class="num px-4 py-2.5 text-right">{{ money(totalDebit()) }}</td>
                    <td class="num px-4 py-2.5 text-right">{{ money(totalCredit()) }}</td>
                    <td class="num px-4 py-2.5 text-right">{{ money(closing()) }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          } @else {
            <ui-empty
              title="No entries in this window"
              message="Widen the date range to see earlier activity."
              icon="file"
            />
          }
        </ui-card>
      } @else {
        <ui-table
          [rows]="filteredBalances()"
          [columns]="columns"
          [loading]="loading()"
          [pageSize]="12"
          [clickable]="true"
          (rowClick)="select($event)"
          [trackBy]="trackParty"
          emptyTitle="No balances"
          emptyMessage="Everyone is settled."
        />

        <p class="flex items-center gap-2 text-[12.5px] text-faint">
          <ui-icon name="info" [size]="14" />
          Pick a row to open its statement.
        </p>
      }
    </div>
  `,
  host: { class: 'block' },
})
export class PartyLedgerPage {
  private readonly api = inject(PosApi);
  private readonly route = inject(ActivatedRoute);
  private readonly lookups = inject(Lookups);
  private readonly print = inject(PrintService);

  protected readonly money = money;
  protected readonly currency = currency;
  protected readonly date = prettyDate;

  private readonly routeData = toSignal(this.route.data, {
    initialValue: this.route.snapshot.data,
  });
  protected readonly isCustomer = computed(
    () => (this.routeData() as unknown as PartyLedgerConfig).kind !== 'supplier',
  );

  protected readonly search = signal('');
  protected readonly from = signal(startOfMonth(new Date(addDays(today(), -60))));
  protected readonly to = signal(today());
  protected readonly partyId = signal<number | string | null>(null);

  protected readonly loading = signal(true);
  protected readonly statementLoading = signal(false);
  protected readonly balances = signal<PartyBalanceRow[]>([]);
  protected readonly statement = signal<PartyLedgerRow[]>([]);

  protected readonly partyLabel = (row: PartyOption) => row.name;
  protected readonly partyKey = (row: PartyOption) => row.id;
  protected readonly partySub = (row: PartyOption) => row.sub;
  protected readonly trackParty = (row: PartyBalanceRow) => row.partyId;

  protected readonly parties = computed<PartyOption[]>(() =>
    this.isCustomer()
      ? this.lookups
          .customers()
          .map((c) => ({ id: c.id, name: c.customerName, sub: c.contactNumber }))
      : this.lookups
          .suppliers()
          .map((s) => ({ id: s.id, name: s.supplierName, sub: s.mobileNumber })),
  );

  protected readonly columns: Column<PartyBalanceRow>[] = [
    {
      key: 'partyName',
      header: 'Name',
      value: (row) => row.partyName,
      kind: 'strong',
      sub: (row) => row.contact,
    },
    {
      key: 'opening',
      header: 'Opening',
      value: (row) => row.opening,
      kind: 'money',
      align: 'right',
      hideOnMobile: true,
    },
    {
      key: 'debit',
      header: 'Debit',
      value: (row) => row.debit,
      kind: 'money',
      align: 'right',
      hideOnMobile: true,
    },
    {
      key: 'credit',
      header: 'Credit',
      value: (row) => row.credit,
      kind: 'money',
      align: 'right',
      hideOnMobile: true,
    },
    {
      key: 'balance',
      header: 'Balance',
      value: (row) => row.balance,
      kind: 'money',
      align: 'right',
    },
    {
      key: 'state',
      header: 'State',
      value: (row) =>
        row.balance > 0.5 ? 'Outstanding' : row.balance < -0.5 ? 'In credit' : 'Clear',
      kind: 'badge',
      align: 'right',
      tone: (row) => (row.balance > 0.5 ? 'warn' : row.balance < -0.5 ? 'info' : 'pos'),
    },
  ];

  protected readonly filteredBalances = computed(() => {
    const needle = this.search().toLowerCase();
    return this.balances().filter((row) =>
      needle ? row.partyName.toLowerCase().includes(needle) : true,
    );
  });

  protected readonly outstanding = computed(() =>
    sum(
      this.balances().filter((row) => row.balance > 0),
      (row) => row.balance,
    ),
  );
  protected readonly withBalance = computed(
    () => this.balances().filter((row) => row.balance > 0.5).length,
  );
  protected readonly largest = computed(() => this.balances()[0]?.balance ?? 0);
  protected readonly largestName = computed(() => this.balances()[0]?.partyName ?? '');

  protected readonly selectedName = computed(
    () => this.parties().find((party) => party.id === Number(this.partyId()))?.name ?? '',
  );

  protected readonly totalDebit = computed(() => sum(this.statement(), (row) => row.debit));
  protected readonly totalCredit = computed(() => sum(this.statement(), (row) => row.credit));
  protected readonly closing = computed(() => this.statement().at(-1)?.balance ?? 0);

  constructor() {
    void this.lookups.ensure();

    // Reload whenever the route flips between customer and supplier.
    effect(() => {
      this.isCustomer();
      this.partyId.set(null);
      this.statement.set([]);
      void this.reload();
    });

    // Deep link: /finance/customer-ledger?partyId=3
    const initial = this.route.snapshot.queryParamMap.get('partyId');
    if (initial) {
      this.partyId.set(Number(initial));
      void this.loadStatement();
    }
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const rows = await firstValueFrom(
        this.isCustomer() ? this.api.customerBalances() : this.api.supplierBalances(),
      );
      this.balances.set(rows);
      if (this.partyId()) await this.loadStatement();
    } finally {
      this.loading.set(false);
    }
  }

  protected async loadStatement(): Promise<void> {
    const id = this.partyId();
    if (!id) return;
    this.statementLoading.set(true);
    try {
      const filter = { partyId: Number(id), fromDate: this.from(), toDate: this.to() };
      this.statement.set(
        await firstValueFrom(
          this.isCustomer() ? this.api.customerLedger(filter) : this.api.supplierLedger(filter),
        ),
      );
    } finally {
      this.statementLoading.set(false);
    }
  }

  protected select(row: PartyBalanceRow): void {
    this.partyId.set(row.partyId);
    void this.loadStatement();
  }

  private statementRows(): Record<string, unknown>[] {
    return this.statement().map((row) => ({
      Date: row.date,
      Document: row.documentNo,
      Particulars: row.particulars,
      Debit: row.debit,
      Credit: row.credit,
      Balance: row.balance,
    }));
  }

  private balanceRows(): Record<string, unknown>[] {
    return this.filteredBalances().map((row) => ({
      Name: row.partyName,
      Contact: row.contact,
      Opening: row.opening,
      Debit: row.debit,
      Credit: row.credit,
      Balance: row.balance,
    }));
  }

  protected exportCsv(): void {
    if (this.partyId()) {
      downloadCsv(`${this.selectedName()}-statement`, this.statementRows());
      return;
    }
    downloadCsv(this.isCustomer() ? 'customer-balances' : 'supplier-balances', this.balanceRows());
  }

  /** A statement when one party is selected, the balance list otherwise. */
  protected printPdf(): void {
    if (this.partyId()) {
      this.printStatement();
      return;
    }

    const rows = this.filteredBalances();
    this.print.report({
      title: this.isCustomer() ? 'Customer balances' : 'Supplier balances',
      subtitle: dateRange(this.from(), this.to()),
      filename: this.isCustomer() ? 'customer-balances' : 'supplier-balances',
      filters: [{ label: 'Search', value: this.search() || 'All parties' }],
      summary: [
        {
          label: this.isCustomer() ? 'Total receivable' : 'Total payable',
          value: currency(this.outstanding()),
        },
        { label: 'Parties listed', value: String(rows.length) },
        { label: 'Carrying a balance', value: String(this.withBalance()) },
      ],
      sections: [
        {
          rows: this.balanceRows(),
          totals: {
            Opening: sum(rows, (row) => row.opening),
            Debit: sum(rows, (row) => row.debit),
            Credit: sum(rows, (row) => row.credit),
            Balance: sum(rows, (row) => row.balance),
          },
          emptyMessage: 'No parties match this search.',
        },
      ],
    });
  }

  /** The statement of account posted or emailed to one party. */
  protected printStatement(): void {
    const name = this.selectedName();
    this.print.document({
      title: this.isCustomer() ? 'Statement of account' : 'Supplier statement',
      documentNo: name || '—',
      status: this.closing() > 0.5 ? 'Outstanding' : 'Clear',
      filename: `${name || 'party'}-statement`,
      meta: [
        { label: 'Period', value: dateRange(this.from(), this.to()) },
        { label: 'Entries', value: String(this.statement().length) },
      ],
      parties: [{ heading: this.isCustomer() ? 'Customer' : 'Supplier', lines: [name || '—'] }],
      section: {
        columns: [
          { key: 'Date', align: 'left' },
          { key: 'Document', align: 'left' },
          { key: 'Particulars', align: 'left' },
          { key: 'Debit', align: 'right' },
          { key: 'Credit', align: 'right' },
          { key: 'Balance', align: 'right' },
        ],
        rows: this.statementRows(),
        totals: { Debit: this.totalDebit(), Credit: this.totalCredit() },
        emptyMessage: 'No movements in this period.',
      },
      totals: [
        { label: 'Total debit', value: currency(this.totalDebit()) },
        { label: 'Total credit', value: currency(this.totalCredit()) },
        { label: 'Closing balance', value: currency(this.closing()), strong: true },
      ],
      note: this.isCustomer()
        ? 'Please quote the document number when settling any of the above.'
        : undefined,
      signatures: ['Prepared by', 'Verified by'],
    });
  }
}

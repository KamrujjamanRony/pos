import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { OpeningType, PartyBalanceRow, Supplier } from '../../core/models';
import { ConfirmService } from '../../core/services/confirm';
import { ListStore } from '../../core/services/list-store';
import { Lookups } from '../../core/services/lookups';
import { PosApi } from '../../core/services/pos-api';
import { PrintService } from '../../core/services/print';
import { ToastService } from '../../core/services/toast';
import { currency, downloadCsv, sum, today } from '../../core/util/format';
import { UiAutofocus } from '../../shared/directives/motion';
import { buttonClass, UiButton } from '../../shared/ui/button';
import { UiFilterBar } from '../../shared/ui/filter-bar';
import { UiIcon } from '../../shared/ui/icon';
import { UiModal } from '../../shared/ui/modal';
import { UiField, UiPageHeader } from '../../shared/ui/primitives';
import { UiStat } from '../../shared/ui/stat';
import { UiTable, type Column } from '../../shared/ui/table';

interface SupplierRow extends Supplier {
  balance: number;
}

@Component({
  selector: 'app-suppliers',
  imports: [
    RouterLink,
    UiPageHeader,
    UiFilterBar,
    UiTable,
    UiButton,
    UiModal,
    UiField,
    UiStat,
    UiIcon,
    UiAutofocus,
  ],
  template: `
    <div class="space-y-4">
      <ui-page-header
        icon="inbox"
        title="Suppliers"
        subtitle="Who you buy from, and what is still payable to them."
      >
        <a [class]="outlineButton" routerLink="/finance/supplier-ledger">
          <ui-icon name="list" [size]="16" />
          Ledger
        </a>
        <ui-button variant="primary" icon="plus" (pressed)="openCreate()">New supplier</ui-button>
      </ui-page-header>

      <div class="grid gap-4 sm:grid-cols-3">
        <ui-stat
          label="Suppliers"
          [value]="rows().length"
          format="integer"
          icon="inbox"
          [series]="1"
        />
        <ui-stat
          label="Total payable"
          [value]="payable()"
          format="money"
          prefix="৳"
          icon="wallet"
          [series]="2"
          [upIsGood]="false"
        />
        <ui-stat
          label="Opening balances"
          [value]="openingTotal()"
          format="money"
          prefix="৳"
          icon="database"
          [series]="6"
        />
      </div>

      <ui-filter-bar
        [(search)]="search"
        searchLabel="Find a supplier"
        placeholder="Name, mobile number, address…"
        (refresh)="reload()"
        (exported)="exportCsv()"
        (printed)="printPdf()"
      />

      <ui-table
        [rows]="filtered()"
        [columns]="columns"
        [loading]="store.loading()"
        [actions]="rowActions"
        emptyTitle="No suppliers match"
        emptyMessage="Adjust the search, or register the first supplier."
      />
    </div>

    <ng-template #rowActions let-row>
      <div class="flex justify-end gap-1">
        <a
          [class]="iconButton"
          [routerLink]="['/finance/supplier-ledger']"
          [queryParams]="{ partyId: row.id }"
          aria-label="Open ledger"
        >
          <ui-icon name="list" [size]="16" />
        </a>
        <ui-button
          variant="ghost"
          size="icon"
          icon="edit"
          ariaLabel="Edit supplier"
          (pressed)="openEdit(row)"
        />
        <ui-button
          variant="ghost"
          size="icon"
          icon="trash"
          ariaLabel="Delete supplier"
          (pressed)="remove(row)"
        />
      </div>
    </ng-template>

    <ui-modal
      [(open)]="editorOpen"
      size="lg"
      [heading]="editing() ? 'Edit supplier' : 'Register supplier'"
      subheading="The opening balance is captured here, on the registration itself."
    >
      <div class="grid gap-4 sm:grid-cols-2">
        <ui-field label="Supplier name" for="s-name" [required]="true">
          <input
            id="s-name"
            uiAutofocus
            type="text"
            class="ctl"
            [value]="supplierName()"
            (input)="supplierName.set($any($event.target).value)"
          />
        </ui-field>
        <ui-field label="Mobile number" for="s-mobile">
          <input
            id="s-mobile"
            type="tel"
            class="ctl"
            [value]="mobileNumber()"
            (input)="mobileNumber.set($any($event.target).value)"
          />
        </ui-field>
        <ui-field label="Opening balance" for="s-opening">
          <input
            id="s-opening"
            type="number"
            step="0.01"
            class="ctl"
            [value]="openingBalance()"
            (input)="openingBalance.set(+$any($event.target).value || 0)"
          />
        </ui-field>
        <ui-field
          label="Direction"
          for="s-type"
          hint="Cr is the normal direction — we owe the supplier."
        >
          <select
            id="s-type"
            class="ctl"
            [value]="openingType()"
            (change)="openingType.set($any($event.target).value)"
          >
            <option value="Cr">Cr — we owe the supplier</option>
            <option value="Dr">Dr — supplier owes us</option>
          </select>
        </ui-field>
        <ui-field label="Opening date" for="s-date">
          <input
            id="s-date"
            type="date"
            class="ctl"
            [value]="openingDate()"
            (change)="openingDate.set($any($event.target).value)"
          />
        </ui-field>
        <ui-field label="Address" for="s-address">
          <input
            id="s-address"
            type="text"
            class="ctl"
            [value]="address()"
            (input)="address.set($any($event.target).value)"
          />
        </ui-field>
      </div>

      <div modal-footer class="flex gap-2">
        <ui-button variant="ghost" (pressed)="editorOpen.set(false)">Cancel</ui-button>
        <ui-button
          variant="primary"
          icon="save"
          [loading]="saving()"
          [disabled]="!supplierName().trim()"
          (pressed)="save()"
        >
          {{ editing() ? 'Save supplier' : 'Register supplier' }}
        </ui-button>
      </div>
    </ui-modal>
  `,
  host: { class: 'block' },
})
export class SuppliersPage {
  private readonly api = inject(PosApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly lookups = inject(Lookups);
  private readonly print = inject(PrintService);

  protected readonly outlineButton = buttonClass('outline', 'md');
  protected readonly iconButton = buttonClass('ghost', 'icon');

  protected readonly search = signal('');
  protected readonly editorOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly editing = signal<Supplier | null>(null);

  protected readonly supplierName = signal('');
  protected readonly mobileNumber = signal('');
  protected readonly address = signal('');
  protected readonly openingBalance = signal(0);
  protected readonly openingType = signal<OpeningType>('Cr');
  protected readonly openingDate = signal(today());

  private readonly balances = signal<PartyBalanceRow[]>([]);

  protected readonly store = new ListStore<Supplier>(() => this.api.suppliers.search({}));

  protected readonly rows = computed<SupplierRow[]>(() =>
    this.store.rows().map((supplier) => ({
      ...supplier,
      balance: this.balances().find((row) => row.partyId === supplier.id)?.balance ?? 0,
    })),
  );

  protected readonly columns: Column<SupplierRow>[] = [
    {
      key: 'supplierName',
      header: 'Supplier',
      value: (row) => row.supplierName,
      kind: 'strong',
      sub: (row) => row.address,
    },
    { key: 'mobileNumber', header: 'Mobile', value: (row) => row.mobileNumber, hideOnMobile: true },
    {
      key: 'openingBalance',
      header: 'Opening',
      value: (row) => row.openingBalance,
      kind: 'money',
      align: 'right',
      hideOnMobile: true,
    },
    {
      key: 'balance',
      header: 'Payable now',
      value: (row) => row.balance,
      kind: 'money',
      align: 'right',
    },
    {
      key: 'state',
      header: 'State',
      value: (row) => (row.balance > 0.5 ? 'Owed' : row.balance < -0.5 ? 'Advance paid' : 'Clear'),
      kind: 'badge',
      align: 'right',
      tone: (row) => (row.balance > 0.5 ? 'warn' : row.balance < -0.5 ? 'info' : 'pos'),
    },
  ];

  protected readonly filtered = computed(() => {
    const needle = this.search().toLowerCase();
    return this.rows().filter((row) =>
      needle
        ? `${row.supplierName} ${row.mobileNumber} ${row.address}`.toLowerCase().includes(needle)
        : true,
    );
  });

  protected readonly payable = computed(() =>
    sum(
      this.rows().filter((row) => row.balance > 0),
      (row) => row.balance,
    ),
  );
  protected readonly openingTotal = computed(() => sum(this.rows(), (row) => row.openingBalance));

  constructor() {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    await this.store.load();
    this.balances.set(await firstValueFrom(this.api.supplierBalances()));
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.supplierName.set('');
    this.mobileNumber.set('');
    this.address.set('');
    this.openingBalance.set(0);
    this.openingType.set('Cr');
    this.openingDate.set(today());
    this.editorOpen.set(true);
  }

  protected openEdit(row: Supplier): void {
    this.editing.set(row);
    this.supplierName.set(row.supplierName);
    this.mobileNumber.set(row.mobileNumber ?? '');
    this.address.set(row.address ?? '');
    this.openingBalance.set(row.openingBalance ?? 0);
    this.openingType.set(row.openingType ?? 'Cr');
    this.openingDate.set(row.openingDate ?? today());
    this.editorOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    const payload: Partial<Supplier> = {
      supplierName: this.supplierName().trim(),
      mobileNumber: this.mobileNumber(),
      address: this.address(),
      openingBalance: this.openingBalance(),
      openingType: this.openingType(),
      openingDate: this.openingDate(),
      postBy: 'Aman',
    };
    try {
      const current = this.editing();
      if (current) {
        await firstValueFrom(this.api.suppliers.update(current.id, payload));
        this.toast.success('Supplier saved', `${payload.supplierName} was updated.`);
      } else {
        await firstValueFrom(this.api.suppliers.create(payload));
        this.toast.success(
          'Supplier registered',
          `${payload.supplierName} is ready to receive from.`,
        );
      }
      this.editorOpen.set(false);
      await this.reload();
      void this.lookups.refresh('suppliers');
    } catch {
      /* surfaced by the error interceptor */
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(row: Supplier): Promise<void> {
    if (!(await this.confirm.askDelete(`supplier “${row.supplierName}”`))) return;
    await firstValueFrom(this.api.suppliers.remove(row.id));
    this.store.removeWhere((candidate) => candidate.id === row.id);
    this.toast.success('Supplier deleted', `${row.supplierName} was removed.`);
    void this.lookups.refresh('suppliers');
  }

  /** One row shape, shared by the CSV export and the printed report. */
  private reportRows(): Record<string, unknown>[] {
    return this.filtered().map((row) => ({
      Supplier: row.supplierName,
      Mobile: row.mobileNumber,
      Address: row.address,
      'Opening balance': row.openingBalance,
      Direction: row.openingType,
      'Payable now': row.balance,
    }));
  }

  protected exportCsv(): void {
    downloadCsv('suppliers', this.reportRows());
  }

  protected printPdf(): void {
    const rows = this.filtered();
    this.print.report({
      title: 'Suppliers',
      subtitle: `${rows.length} of ${this.rows().length} registered`,
      filename: 'suppliers',
      filters: [{ label: 'Search', value: this.search() || 'All records' }],
      summary: [
        { label: 'Suppliers', value: String(rows.length) },
        { label: 'Total payable', value: currency(this.payable()) },
        { label: 'Opening balances', value: currency(this.openingTotal()) },
      ],
      sections: [
        {
          rows: this.reportRows(),
          totals: {
            'Opening balance': sum(rows, (row) => row.openingBalance),
            'Payable now': sum(rows, (row) => row.balance),
          },
          emptyMessage: 'No suppliers match this search.',
        },
      ],
    });
  }
}

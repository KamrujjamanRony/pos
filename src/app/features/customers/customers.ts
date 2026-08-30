import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { Customer, PartyBalanceRow } from '../../core/models';
import { ConfirmService } from '../../core/services/confirm';
import { ListStore } from '../../core/services/list-store';
import { Lookups } from '../../core/services/lookups';
import { PosApi } from '../../core/services/pos-api';
import { PrintService } from '../../core/services/print';
import { ToastService } from '../../core/services/toast';
import { currency, downloadCsv, hueOf, initials, sum } from '../../core/util/format';
import { UiAutofocus } from '../../shared/directives/motion';
import { buttonClass, UiButton } from '../../shared/ui/button';
import { UiCombobox } from '../../shared/ui/combobox';
import { UiFilterBar } from '../../shared/ui/filter-bar';
import { UiIcon } from '../../shared/ui/icon';
import { UiModal } from '../../shared/ui/modal';
import { UiField, UiPageHeader } from '../../shared/ui/primitives';
import { UiStat } from '../../shared/ui/stat';
import { UiTable, type Column } from '../../shared/ui/table';

interface CustomerRow extends Customer {
  balance: number;
}

@Component({
  selector: 'app-customers',
  imports: [
    RouterLink,
    UiPageHeader,
    UiFilterBar,
    UiTable,
    UiButton,
    UiModal,
    UiField,
    UiCombobox,
    UiStat,
    UiIcon,
    UiAutofocus,
  ],
  template: `
    <div class="space-y-4">
      <ui-page-header
        icon="users"
        title="Customer registration"
        subtitle="Everyone you invoice, with what they still owe."
      >
        <a [class]="outlineButton" routerLink="/finance/customer-ledger">
          <ui-icon name="list" [size]="16" />
          Ledger
        </a>
        <ui-button variant="primary" icon="plus" (pressed)="openCreate()">New customer</ui-button>
      </ui-page-header>

      <div class="grid gap-4 sm:grid-cols-3">
        <ui-stat
          label="Customers"
          [value]="rows().length"
          format="integer"
          icon="users"
          [series]="1"
        />
        <ui-stat
          label="Total receivable"
          [value]="receivable()"
          format="money"
          prefix="৳"
          icon="wallet"
          [series]="2"
          [upIsGood]="false"
        />
        <ui-stat
          label="Carrying a balance"
          [value]="withBalance()"
          format="integer"
          icon="alert"
          [series]="4"
          [upIsGood]="false"
        />
      </div>

      <ui-filter-bar
        [(search)]="search"
        searchLabel="Find a customer"
        placeholder="Name, contact number, address…"
        (refresh)="reload()"
        (exported)="exportCsv()"
        (printed)="printPdf()"
      >
        <div class="w-44">
          <label class="mb-1.5 block text-[12px] font-medium text-muted" for="cust-area"
            >Area</label
          >
          <select
            id="cust-area"
            class="ctl"
            [value]="areaFilter()"
            (change)="areaFilter.set($any($event.target).value)"
          >
            <option value="">All areas</option>
            @for (area of lookups.areas(); track area.id) {
              <option [value]="area.id">{{ area.name }}</option>
            }
          </select>
        </div>
      </ui-filter-bar>

      <ui-table
        [rows]="filtered()"
        [columns]="columns"
        [loading]="store.loading()"
        [actions]="rowActions"
        [pageSize]="12"
        emptyTitle="No customers match"
        emptyMessage="Adjust the search, or register the first customer."
      />
    </div>

    <ng-template #rowActions let-row>
      <div class="flex justify-end gap-1">
        <a
          [class]="iconButton"
          [routerLink]="['/finance/customer-ledger']"
          [queryParams]="{ partyId: row.id }"
          aria-label="Open ledger"
        >
          <ui-icon name="list" [size]="16" />
        </a>
        <ui-button
          variant="ghost"
          size="icon"
          icon="edit"
          ariaLabel="Edit customer"
          (pressed)="openEdit(row)"
        />
        <ui-button
          variant="ghost"
          size="icon"
          icon="trash"
          ariaLabel="Delete customer"
          (pressed)="remove(row)"
        />
      </div>
    </ng-template>

    <ui-modal
      [(open)]="editorOpen"
      size="lg"
      [heading]="editing() ? 'Edit customer' : 'Register customer'"
      subheading="Areas and referral sources drive the sales reports."
    >
      <div class="grid gap-4 sm:grid-cols-2">
        <ui-field label="Customer name" for="c-name" [required]="true">
          <input
            id="c-name"
            uiAutofocus
            type="text"
            class="ctl"
            [value]="customerName()"
            (input)="customerName.set($any($event.target).value)"
          />
        </ui-field>
        <ui-field label="Contact number" for="c-contact">
          <input
            id="c-contact"
            type="tel"
            class="ctl"
            [value]="contactNumber()"
            (input)="contactNumber.set($any($event.target).value)"
          />
        </ui-field>
        <ui-field label="Contact person" for="c-person">
          <input
            id="c-person"
            type="text"
            class="ctl"
            [value]="contactPerson()"
            (input)="contactPerson.set($any($event.target).value)"
          />
        </ui-field>
        <ui-field label="Contact person mobile" for="c-person-mobile">
          <input
            id="c-person-mobile"
            type="tel"
            class="ctl"
            [value]="contactPersonMobileNo()"
            (input)="contactPersonMobileNo.set($any($event.target).value)"
          />
        </ui-field>
        <ui-field label="Area">
          <ui-combobox
            [options]="lookups.areas()"
            [labelOf]="nameOf"
            [keyOf]="idOf"
            [(value)]="areaId"
            placeholder="Delivery zone"
          />
        </ui-field>
        <ui-field label="Referred by">
          <ui-combobox
            [options]="lookups.referrals()"
            [labelOf]="nameOf"
            [keyOf]="idOf"
            [(value)]="referredId"
            placeholder="How did they find us?"
          />
        </ui-field>
        <ui-field label="Address" for="c-address" class="sm:col-span-2">
          <textarea
            id="c-address"
            class="ctl"
            rows="2"
            [value]="address()"
            (input)="address.set($any($event.target).value)"
          ></textarea>
        </ui-field>
      </div>

      <div modal-footer class="flex gap-2">
        <ui-button variant="ghost" (pressed)="editorOpen.set(false)">Cancel</ui-button>
        <ui-button
          variant="primary"
          icon="save"
          [loading]="saving()"
          [disabled]="!customerName().trim()"
          (pressed)="save()"
        >
          {{ editing() ? 'Save customer' : 'Register customer' }}
        </ui-button>
      </div>
    </ui-modal>
  `,
  host: { class: 'block' },
})
export class CustomersPage {
  private readonly api = inject(PosApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly lookups = inject(Lookups);
  private readonly print = inject(PrintService);

  protected readonly outlineButton = buttonClass('outline', 'md');
  protected readonly iconButton = buttonClass('ghost', 'icon');
  protected readonly nameOf = (row: { name: string }) => row.name;
  protected readonly idOf = (row: { id: number }) => row.id;

  protected readonly search = signal('');
  protected readonly areaFilter = signal('');
  protected readonly editorOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly editing = signal<Customer | null>(null);

  protected readonly customerName = signal('');
  protected readonly contactNumber = signal('');
  protected readonly contactPerson = signal('');
  protected readonly contactPersonMobileNo = signal('');
  protected readonly address = signal('');
  protected readonly areaId = signal<number | string | null>(null);
  protected readonly referredId = signal<number | string | null>(null);

  private readonly balances = signal<PartyBalanceRow[]>([]);

  protected readonly store = new ListStore<Customer>(() => this.api.customers.search({}));

  protected readonly rows = computed<CustomerRow[]>(() =>
    this.store.rows().map((customer) => ({
      ...customer,
      balance: this.balances().find((row) => row.partyId === customer.id)?.balance ?? 0,
    })),
  );

  protected readonly columns: Column<CustomerRow>[] = [
    {
      key: 'customerName',
      header: 'Customer',
      value: (row) => row.customerName,
      kind: 'strong',
      sub: (row) => [row.contactPerson, row.areaName].filter(Boolean).join(' · '),
    },
    {
      key: 'contactNumber',
      header: 'Contact',
      value: (row) => row.contactNumber,
      hideOnMobile: true,
    },
    {
      key: 'referredName',
      header: 'Referred by',
      value: (row) => row.referredName ?? '—',
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
      value: (row) => (row.balance > 0.5 ? 'Owes' : row.balance < -0.5 ? 'In credit' : 'Clear'),
      kind: 'badge',
      align: 'right',
      tone: (row) => (row.balance > 0.5 ? 'warn' : row.balance < -0.5 ? 'info' : 'pos'),
    },
  ];

  protected readonly filtered = computed(() => {
    const needle = this.search().toLowerCase();
    return this.rows().filter((row) => {
      const inArea = !this.areaFilter() || String(row.areaId) === this.areaFilter();
      const hit =
        !needle ||
        `${row.customerName} ${row.contactNumber} ${row.address} ${row.contactPerson}`
          .toLowerCase()
          .includes(needle);
      return inArea && hit;
    });
  });

  protected readonly receivable = computed(() =>
    sum(
      this.rows().filter((row) => row.balance > 0),
      (row) => row.balance,
    ),
  );
  protected readonly withBalance = computed(
    () => this.rows().filter((row) => row.balance > 0.5).length,
  );

  protected readonly avatar = initials;
  protected readonly hue = hueOf;

  constructor() {
    void this.lookups.ensure();
    void this.reload();
  }

  protected async reload(): Promise<void> {
    await this.store.load();
    this.balances.set(await firstValueFrom(this.api.customerBalances()));
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.customerName.set('');
    this.contactNumber.set('');
    this.contactPerson.set('');
    this.contactPersonMobileNo.set('');
    this.address.set('');
    this.areaId.set(null);
    this.referredId.set(null);
    this.editorOpen.set(true);
  }

  protected openEdit(row: Customer): void {
    this.editing.set(row);
    this.customerName.set(row.customerName);
    this.contactNumber.set(row.contactNumber ?? '');
    this.contactPerson.set(row.contactPerson ?? '');
    this.contactPersonMobileNo.set(row.contactPersonMobileNo ?? '');
    this.address.set(row.address ?? '');
    this.areaId.set(row.areaId);
    this.referredId.set(row.referredId);
    this.editorOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    const payload: Partial<Customer> = {
      customerName: this.customerName().trim(),
      contactNumber: this.contactNumber(),
      contactPerson: this.contactPerson(),
      contactPersonMobileNo: this.contactPersonMobileNo(),
      address: this.address(),
      areaId: this.areaId() === null ? null : Number(this.areaId()),
      referredId: this.referredId() === null ? null : Number(this.referredId()),
      postBy: 'Aman',
    };
    try {
      const current = this.editing();
      if (current) {
        await firstValueFrom(this.api.customers.update(current.id, payload));
        this.toast.success('Customer saved', `${payload.customerName} was updated.`);
      } else {
        await firstValueFrom(this.api.customers.create(payload));
        this.toast.success('Customer registered', `${payload.customerName} can now be invoiced.`);
      }
      this.editorOpen.set(false);
      await this.reload();
      void this.lookups.refresh('customers');
    } catch {
      /* surfaced by the error interceptor */
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(row: Customer): Promise<void> {
    if (!(await this.confirm.askDelete(`customer “${row.customerName}”`))) return;
    await firstValueFrom(this.api.customers.remove(row.id));
    this.store.removeWhere((candidate) => candidate.id === row.id);
    this.toast.success('Customer deleted', `${row.customerName} was removed.`);
    void this.lookups.refresh('customers');
  }

  /** One row shape, shared by the CSV export and the printed report. */
  private reportRows(): Record<string, unknown>[] {
    return this.filtered().map((row) => ({
      Customer: row.customerName,
      Contact: row.contactNumber,
      Person: row.contactPerson,
      Area: row.areaName,
      'Referred by': row.referredName,
      Address: row.address,
      Balance: row.balance,
    }));
  }

  protected exportCsv(): void {
    downloadCsv('customers', this.reportRows());
  }

  protected printPdf(): void {
    const rows = this.filtered();
    const area = this.lookups.areas().find((a) => String(a.id) === this.areaFilter());
    this.print.report({
      title: 'Customers',
      subtitle: `${rows.length} of ${this.rows().length} registered`,
      filename: 'customers',
      landscape: true,
      filters: [
        { label: 'Area', value: area?.name ?? 'All areas' },
        { label: 'Search', value: this.search() || 'All records' },
      ],
      summary: [
        { label: 'Customers', value: String(rows.length) },
        { label: 'Total receivable', value: currency(this.receivable()) },
        { label: 'Carrying a balance', value: String(this.withBalance()) },
      ],
      sections: [
        {
          rows: this.reportRows(),
          totals: { Balance: sum(rows, (row) => row.balance ?? 0) },
          emptyMessage: 'No customers match this search.',
        },
      ],
    });
  }

  protected readonly currency = currency;
}

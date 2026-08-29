import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Customer, CustomerOpening, OpeningType } from '../../core/models';
import { ConfirmService } from '../../core/services/confirm';
import { ListStore } from '../../core/services/list-store';
import { Lookups } from '../../core/services/lookups';
import { PosApi } from '../../core/services/pos-api';
import { PrintService } from '../../core/services/print';
import { ToastService } from '../../core/services/toast';
import { currency, downloadCsv, sum, today } from '../../core/util/format';
import { UiButton } from '../../shared/ui/button';
import { UiCombobox } from '../../shared/ui/combobox';
import { UiFilterBar } from '../../shared/ui/filter-bar';
import { UiModal } from '../../shared/ui/modal';
import { UiField, UiPageHeader } from '../../shared/ui/primitives';
import { UiTable, type Column } from '../../shared/ui/table';

@Component({
  selector: 'app-customer-openings',
  imports: [UiPageHeader, UiFilterBar, UiTable, UiButton, UiModal, UiField, UiCombobox],
  template: `
    <div class="space-y-4">
      <ui-page-header
        icon="database"
        title="Customer opening balances"
        subtitle="What each customer owed before the first invoice in this system."
      >
        <ui-button variant="primary" icon="plus" (pressed)="openCreate()">Add opening</ui-button>
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
        searchLabel="Find an opening"
        placeholder="Customer name or remarks…"
        (refresh)="reload()"
        (exported)="exportCsv()"
        (printed)="printPdf()"
      />

      <ui-table
        [rows]="filtered()"
        [columns]="columns"
        [loading]="store.loading()"
        [actions]="rowActions"
        emptyTitle="No opening balances"
        emptyMessage="Add what customers carried over from the previous book."
      />
    </div>

    <ng-template #rowActions let-row>
      <div class="flex justify-end gap-1">
        <ui-button
          variant="ghost"
          size="icon"
          icon="edit"
          ariaLabel="Edit opening"
          (pressed)="openEdit(row)"
        />
        <ui-button
          variant="ghost"
          size="icon"
          icon="trash"
          ariaLabel="Delete opening"
          (pressed)="remove(row)"
        />
      </div>
    </ng-template>

    <ui-modal
      [(open)]="editorOpen"
      size="md"
      [heading]="editing() ? 'Edit opening balance' : 'Add opening balance'"
      subheading="Dr means the customer owes you; Cr means they are in credit."
    >
      <div class="grid gap-4 sm:grid-cols-2">
        <ui-field label="Customer" [required]="true">
          <ui-combobox
            [options]="lookups.customers()"
            [labelOf]="customerLabel"
            [keyOf]="idOf"
            [subOf]="customerSub"
            [(value)]="customerId"
            placeholder="Choose a customer"
          />
        </ui-field>
        <ui-field label="Opening date" for="co-date" [required]="true">
          <input
            id="co-date"
            type="date"
            class="ctl"
            [value]="openingDate()"
            (change)="openingDate.set($any($event.target).value)"
          />
        </ui-field>
        <ui-field label="Direction" for="co-type" [required]="true">
          <select
            id="co-type"
            class="ctl"
            [value]="openingType()"
            (change)="openingType.set($any($event.target).value)"
          >
            <option value="Dr">Dr — customer owes us</option>
            <option value="Cr">Cr — we owe the customer</option>
          </select>
        </ui-field>
        <ui-field label="Amount" for="co-amount" [required]="true">
          <input
            id="co-amount"
            type="number"
            step="0.01"
            class="ctl"
            [value]="amount()"
            (input)="amount.set(+$any($event.target).value || 0)"
          />
        </ui-field>
        <ui-field label="Remarks" for="co-remarks" class="sm:col-span-2">
          <input
            id="co-remarks"
            type="text"
            class="ctl"
            [value]="remarks()"
            (input)="remarks.set($any($event.target).value)"
          />
        </ui-field>
      </div>

      <div modal-footer class="flex gap-2">
        <ui-button variant="ghost" (pressed)="editorOpen.set(false)">Cancel</ui-button>
        <ui-button
          variant="primary"
          icon="save"
          [loading]="saving()"
          [disabled]="!customerId()"
          (pressed)="save()"
        >
          {{ editing() ? 'Save opening' : 'Add opening' }}
        </ui-button>
      </div>
    </ui-modal>
  `,
  host: { class: 'block' },
})
export class CustomerOpeningsPage {
  private readonly api = inject(PosApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly lookups = inject(Lookups);
  private readonly print = inject(PrintService);

  protected readonly idOf = (row: { id: number }) => row.id;
  protected readonly customerLabel = (row: Customer) => row.customerName;
  protected readonly customerSub = (row: Customer) => row.contactNumber;

  protected readonly search = signal('');
  protected readonly editorOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly editing = signal<CustomerOpening | null>(null);

  protected readonly customerId = signal<number | string | null>(null);
  protected readonly openingDate = signal(today());
  protected readonly openingType = signal<OpeningType>('Dr');
  protected readonly amount = signal(0);
  protected readonly remarks = signal('Carried over');

  protected readonly store = new ListStore<CustomerOpening>(() =>
    this.api.customerOpenings.search({}),
  );

  protected readonly columns: Column<CustomerOpening>[] = [
    {
      key: 'customerName',
      header: 'Customer',
      value: (row) => row.customerName ?? '—',
      kind: 'strong',
      sub: (row) => row.remarks,
    },
    { key: 'openingDate', header: 'As on', value: (row) => row.openingDate, kind: 'date' },
    {
      key: 'openingType',
      header: 'Direction',
      value: (row) => (row.openingType === 'Dr' ? 'Receivable' : 'Credit'),
      kind: 'badge',
      tone: (row) => (row.openingType === 'Dr' ? 'warn' : 'info'),
      hideOnMobile: true,
    },
    { key: 'amount', header: 'Amount', value: (row) => row.amount, kind: 'money', align: 'right' },
  ];

  protected readonly filtered = computed(() => {
    const needle = this.search().toLowerCase();
    return this.store
      .rows()
      .filter((row) =>
        needle ? `${row.customerName} ${row.remarks}`.toLowerCase().includes(needle) : true,
      );
  });

  protected readonly tiles = computed(() => {
    const rows = this.filtered();
    const receivable = sum(
      rows.filter((row) => row.openingType === 'Dr'),
      (row) => row.amount,
    );
    const credit = sum(
      rows.filter((row) => row.openingType === 'Cr'),
      (row) => row.amount,
    );
    return [
      { label: 'Opening rows', value: String(rows.length) },
      { label: 'Opening receivable', value: currency(receivable) },
      { label: 'Opening credit', value: currency(credit) },
    ];
  });

  constructor() {
    void this.lookups.ensure();
    void this.reload();
  }

  protected reload(): void {
    void this.store.load();
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.customerId.set(null);
    this.openingDate.set(today());
    this.openingType.set('Dr');
    this.amount.set(0);
    this.remarks.set('Carried over');
    this.editorOpen.set(true);
  }

  protected openEdit(row: CustomerOpening): void {
    this.editing.set(row);
    this.customerId.set(row.customerId);
    this.openingDate.set(row.openingDate);
    this.openingType.set(row.openingType);
    this.amount.set(row.amount);
    this.remarks.set(row.remarks ?? '');
    this.editorOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    const payload: Partial<CustomerOpening> = {
      customerId: Number(this.customerId()),
      openingDate: this.openingDate(),
      openingType: this.openingType(),
      amount: this.amount(),
      remarks: this.remarks(),
      postBy: 'Aman',
    };
    try {
      const current = this.editing();
      if (current) await firstValueFrom(this.api.customerOpenings.update(current.id, payload));
      else await firstValueFrom(this.api.customerOpenings.create(payload));
      this.toast.success('Opening saved', 'The customer ledger has been rebased.');
      this.editorOpen.set(false);
      this.reload();
    } catch {
      /* surfaced by the error interceptor */
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(row: CustomerOpening): Promise<void> {
    if (!(await this.confirm.askDelete(`opening for ${row.customerName}`))) return;
    await firstValueFrom(this.api.customerOpenings.remove(row.id));
    this.store.removeWhere((candidate) => candidate.id === row.id);
    this.toast.success('Opening deleted', 'The customer ledger has been rebased.');
  }

  /** One row shape, shared by the CSV export and the printed report. */
  private reportRows(): Record<string, unknown>[] {
    return this.filtered().map((row) => ({
      Customer: row.customerName,
      Date: row.openingDate,
      Direction: row.openingType,
      Amount: row.amount,
      Remarks: row.remarks,
    }));
  }

  protected exportCsv(): void {
    downloadCsv('customer-openings', this.reportRows());
  }

  protected printPdf(): void {
    this.print.report({
      title: 'Customer opening balances',
      subtitle: 'What each customer carried over from the previous book',
      filename: 'customer-openings',
      filters: [{ label: 'Search', value: this.search() || 'All records' }],
      summary: this.tiles(),
      sections: [
        {
          rows: this.reportRows(),
          totals: { Amount: sum(this.filtered(), (row) => row.amount) },
          emptyMessage: 'No opening balances recorded.',
        },
      ],
    });
  }
}

import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { CashAccount, FundTransfer, PaymentMode } from '../../core/models';
import { ConfirmService } from '../../core/services/confirm';
import { ListStore } from '../../core/services/list-store';
import { Lookups } from '../../core/services/lookups';
import { PosApi } from '../../core/services/pos-api';
import { ToastService } from '../../core/services/toast';
import { addDays, currency, downloadCsv, sum, today } from '../../core/util/format';
import { UiButton } from '../../shared/ui/button';
import { UiFilterBar } from '../../shared/ui/filter-bar';
import { UiIcon } from '../../shared/ui/icon';
import { UiModal } from '../../shared/ui/modal';
import { UiField, UiPageHeader } from '../../shared/ui/primitives';
import { UiTable, type Column } from '../../shared/ui/table';

@Component({
  selector: 'app-fund-transfers',
  imports: [UiPageHeader, UiFilterBar, UiTable, UiButton, UiModal, UiField, UiIcon],
  template: `
    <div class="space-y-4">
      <ui-page-header
        icon="transfer"
        title="Fund transfers"
        subtitle="Moving money between your own cash and bank accounts."
      >
        <ui-button variant="primary" icon="plus" (pressed)="openCreate()">New transfer</ui-button>
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
        searchLabel="Find a transfer"
        placeholder="Transfer number, account, reference…"
        (refresh)="reload()"
        (exported)="exportCsv()"
      />

      <ui-table
        [rows]="filtered()"
        [columns]="columns"
        [loading]="store.loading()"
        [actions]="rowActions"
        emptyTitle="No transfers in this window"
        emptyMessage="Bank a day's takings to see it here."
      />
    </div>

    <ng-template #rowActions let-row>
      <ui-button variant="ghost" size="icon" icon="trash" ariaLabel="Delete transfer" (pressed)="remove(row)" />
    </ng-template>

    <ui-modal
      [(open)]="editorOpen"
      size="md"
      heading="New fund transfer"
      subheading="One account is credited and the other debited on the same date."
    >
      <div class="space-y-4">
        <ui-field label="Transfer date" for="ft-date" [required]="true">
          <input id="ft-date" type="date" class="ctl" [value]="transferDate()" (change)="transferDate.set($any($event.target).value)" />
        </ui-field>

        <div class="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <div class="space-y-3 rounded-xl border border-line bg-surface-2/50 p-3.5">
            <p class="text-[11.5px] font-semibold tracking-wide text-faint uppercase">From</p>
            <ui-field label="Mode" for="ft-from-mode">
              <select id="ft-from-mode" class="ctl" [value]="fromMode()" (change)="onFromMode($any($event.target).value)">
                <option value="Cash">Cash</option>
                <option value="Bank">Bank</option>
              </select>
            </ui-field>
            <ui-field label="Account" for="ft-from-account">
              <select
                id="ft-from-account"
                class="ctl"
                [value]="fromAccountId() ?? ''"
                (change)="fromAccountId.set(+$any($event.target).value || null)"
              >
                @for (account of fromAccounts(); track account.id) {
                  <option [value]="account.id">{{ account.name }}</option>
                }
              </select>
            </ui-field>
          </div>

          <div class="hidden justify-center pb-6 sm:flex">
            <span class="grid size-9 place-items-center rounded-full bg-brand-soft text-brand-text">
              <ui-icon name="arrowRight" [size]="17" />
            </span>
          </div>

          <div class="space-y-3 rounded-xl border border-line bg-surface-2/50 p-3.5">
            <p class="text-[11.5px] font-semibold tracking-wide text-faint uppercase">To</p>
            <ui-field label="Mode" for="ft-to-mode">
              <select id="ft-to-mode" class="ctl" [value]="toMode()" (change)="onToMode($any($event.target).value)">
                <option value="Cash">Cash</option>
                <option value="Bank">Bank</option>
              </select>
            </ui-field>
            <ui-field label="Account" for="ft-to-account" [error]="sameAccount() ? 'Pick a different account.' : ''">
              <select
                id="ft-to-account"
                class="ctl"
                [value]="toAccountId() ?? ''"
                [attr.aria-invalid]="sameAccount() ? 'true' : null"
                (change)="toAccountId.set(+$any($event.target).value || null)"
              >
                @for (account of toAccounts(); track account.id) {
                  <option [value]="account.id">{{ account.name }}</option>
                }
              </select>
            </ui-field>
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <ui-field label="Amount" for="ft-amount" [required]="true">
            <input id="ft-amount" type="number" step="0.01" class="ctl" [value]="amount()" (input)="amount.set(+$any($event.target).value || 0)" />
          </ui-field>
          <ui-field label="Reference" for="ft-ref" hint="Cheque or deposit slip number.">
            <input id="ft-ref" type="text" class="ctl" [value]="referenceNo()" (input)="referenceNo.set($any($event.target).value)" />
          </ui-field>
        </div>

        <ui-field label="Remarks" for="ft-remarks">
          <input id="ft-remarks" type="text" class="ctl" [value]="remarks()" (input)="remarks.set($any($event.target).value)" placeholder="Day-end banking…" />
        </ui-field>
      </div>

      <div modal-footer class="flex gap-2">
        <ui-button variant="ghost" (pressed)="editorOpen.set(false)">Cancel</ui-button>
        <ui-button
          variant="primary"
          icon="save"
          [loading]="saving()"
          [disabled]="amount() <= 0 || sameAccount()"
          (pressed)="save()"
        >
          Post transfer
        </ui-button>
      </div>
    </ui-modal>
  `,
  host: { class: 'block' },
})
export class FundTransfersPage {
  private readonly api = inject(PosApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly lookups = inject(Lookups);

  protected readonly search = signal('');
  protected readonly from = signal(addDays(today(), -60));
  protected readonly to = signal(today());
  protected readonly editorOpen = signal(false);
  protected readonly saving = signal(false);

  protected readonly transferDate = signal(today());
  protected readonly fromMode = signal<PaymentMode>('Cash');
  protected readonly toMode = signal<PaymentMode>('Bank');
  protected readonly fromAccountId = signal<number | null>(null);
  protected readonly toAccountId = signal<number | null>(null);
  protected readonly amount = signal(0);
  protected readonly referenceNo = signal('');
  protected readonly remarks = signal('');

  protected readonly store = new ListStore<FundTransfer>((filter) =>
    this.api.fundTransfers.search(filter),
  );

  protected readonly columns: Column<FundTransfer>[] = [
    { key: 'transferNo', header: 'Transfer', value: (row) => row.transferNo, kind: 'mono', width: '130px' },
    { key: 'transferDate', header: 'Date', value: (row) => row.transferDate, kind: 'date', width: '120px' },
    {
      key: 'route',
      header: 'Route',
      value: (row) => `${row.fromAccountName} → ${row.toAccountName}`,
      kind: 'strong',
      sub: (row) => `${row.fromMode} to ${row.toMode}${row.remarks ? ' · ' + row.remarks : ''}`,
    },
    { key: 'referenceNo', header: 'Reference', value: (row) => row.referenceNo || '—', hideOnMobile: true },
    { key: 'amount', header: 'Amount', value: (row) => row.amount, kind: 'money', align: 'right' },
  ];

  protected readonly fromAccounts = computed<CashAccount[]>(() =>
    this.fromMode() === 'Cash' ? this.lookups.cashAccounts() : this.lookups.bankAccounts(),
  );
  protected readonly toAccounts = computed<CashAccount[]>(() =>
    this.toMode() === 'Cash' ? this.lookups.cashAccounts() : this.lookups.bankAccounts(),
  );

  protected readonly sameAccount = computed(
    () => this.fromMode() === this.toMode() && this.fromAccountId() === this.toAccountId(),
  );

  protected readonly filtered = computed(() => {
    const needle = this.search().toLowerCase();
    return this.store
      .rows()
      .filter((row) =>
        needle
          ? `${row.transferNo} ${row.fromAccountName} ${row.toAccountName} ${row.referenceNo}`
              .toLowerCase()
              .includes(needle)
          : true,
      );
  });

  protected readonly tiles = computed(() => {
    const rows = this.filtered();
    return [
      { label: 'Transfers', value: String(rows.length) },
      { label: 'Total moved', value: currency(sum(rows, (row) => row.amount)) },
      {
        label: 'Banked',
        value: currency(sum(rows.filter((row) => row.toMode === 'Bank'), (row) => row.amount)),
      },
    ];
  });

  constructor() {
    void this.lookups.ensure();
    void this.reload();
  }

  protected reload(): void {
    void this.store.load({ fromDate: this.from(), toDate: this.to() });
  }

  protected openCreate(): void {
    this.transferDate.set(today());
    this.fromMode.set('Cash');
    this.toMode.set('Bank');
    this.fromAccountId.set(this.lookups.cashAccounts()[0]?.id ?? null);
    this.toAccountId.set(this.lookups.bankAccounts()[0]?.id ?? null);
    this.amount.set(0);
    this.referenceNo.set('');
    this.remarks.set('Day-end banking');
    this.editorOpen.set(true);
  }

  protected onFromMode(mode: string): void {
    this.fromMode.set(mode as PaymentMode);
    this.fromAccountId.set(this.fromAccounts()[0]?.id ?? null);
  }

  protected onToMode(mode: string): void {
    this.toMode.set(mode as PaymentMode);
    this.toAccountId.set(this.toAccounts()[0]?.id ?? null);
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    try {
      const saved = await firstValueFrom(
        this.api.fundTransfers.create({
          transferDate: this.transferDate(),
          fromMode: this.fromMode(),
          fromAccountId: this.fromAccountId(),
          toMode: this.toMode(),
          toAccountId: this.toAccountId(),
          amount: this.amount(),
          referenceNo: this.referenceNo(),
          remarks: this.remarks(),
          postBy: 'Aman',
        }),
      );
      this.toast.success('Transfer posted', `${saved.transferNo} · ${currency(saved.amount)}`);
      this.editorOpen.set(false);
      this.reload();
    } catch {
      /* surfaced by the error interceptor */
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(row: FundTransfer): Promise<void> {
    if (!(await this.confirm.askDelete(`transfer ${row.transferNo}`))) return;
    await firstValueFrom(this.api.fundTransfers.remove(row.id));
    this.store.removeWhere((candidate) => candidate.id === row.id);
    this.toast.success('Transfer deleted', `${row.transferNo} was reversed.`);
  }

  protected exportCsv(): void {
    downloadCsv(
      'fund-transfers',
      this.filtered().map((row) => ({
        Transfer: row.transferNo,
        Date: row.transferDate,
        From: `${row.fromMode} · ${row.fromAccountName}`,
        To: `${row.toMode} · ${row.toAccountName}`,
        Amount: row.amount,
        Reference: row.referenceNo,
        Remarks: row.remarks,
      })),
    );
  }
}

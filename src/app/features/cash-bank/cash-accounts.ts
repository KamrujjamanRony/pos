import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { CashAccount, CashBookRow } from '../../core/models';
import { ConfirmService } from '../../core/services/confirm';
import { ListStore } from '../../core/services/list-store';
import { Lookups } from '../../core/services/lookups';
import { PosApi } from '../../core/services/pos-api';
import { PrintService } from '../../core/services/print';
import { ToastService } from '../../core/services/toast';
import { currency, downloadCsv, prettyDate, sum, today } from '../../core/util/format';
import { UiAutofocus } from '../../shared/directives/motion';
import { UiButton } from '../../shared/ui/button';
import { UiModal } from '../../shared/ui/modal';
import { UiField, UiPageHeader } from '../../shared/ui/primitives';
import { UiStat } from '../../shared/ui/stat';
import { UiTable, type Column } from '../../shared/ui/table';
import type { IconName } from '../../shared/ui/icon';

export interface CashAccountConfig {
  mode: 'Cash' | 'Bank';
  title: string;
  singular: string;
  subtitle: string;
  icon: IconName;
}

interface AccountRow extends CashAccount {
  inflow: number;
  outflow: number;
  balance: number;
}

@Component({
  selector: 'app-cash-accounts',
  imports: [UiPageHeader, UiTable, UiButton, UiModal, UiField, UiStat, UiAutofocus],
  template: `
    <div class="space-y-4">
      <ui-page-header
        [icon]="config().icon"
        [title]="config().title"
        [subtitle]="config().subtitle"
      >
        <ui-button variant="outline" icon="download" (pressed)="exportCsv()">Export CSV</ui-button>
        <ui-button variant="outline" icon="printer" (pressed)="printPdf()">Print / PDF</ui-button>
        <ui-button variant="primary" icon="plus" (pressed)="openCreate()">
          New {{ config().singular }}
        </ui-button>
      </ui-page-header>

      <div class="grid gap-4 sm:grid-cols-4">
        <ui-stat
          label="Accounts"
          [value]="rows().length"
          format="integer"
          [icon]="config().icon"
          [series]="1"
        />
        <ui-stat
          label="Opening total"
          [value]="openingTotal()"
          format="money"
          prefix="৳"
          icon="database"
          [series]="6"
        />
        <ui-stat
          label="Money in"
          [value]="inflowTotal()"
          format="money"
          prefix="৳"
          icon="arrowDownRight"
          [series]="3"
        />
        <ui-stat
          label="Balance now"
          [value]="balanceTotal()"
          format="money"
          prefix="৳"
          icon="wallet"
          [series]="1"
        />
      </div>

      <ui-table
        [rows]="rows()"
        [columns]="columns"
        [loading]="store.loading()"
        [actions]="rowActions"
        [emptyTitle]="'No ' + config().title.toLowerCase()"
        [emptyMessage]="'Create the first ' + config().singular + ' to start posting to it.'"
      />
    </div>

    <ng-template #rowActions let-row>
      <div class="flex justify-end gap-1">
        <ui-button
          variant="ghost"
          size="icon"
          icon="edit"
          ariaLabel="Edit account"
          (pressed)="openEdit(row)"
        />
        <ui-button
          variant="ghost"
          size="icon"
          icon="trash"
          ariaLabel="Delete account"
          (pressed)="remove(row)"
        />
      </div>
    </ng-template>

    <ui-modal
      [(open)]="editorOpen"
      size="sm"
      [heading]="editing() ? 'Edit ' + config().singular : 'New ' + config().singular"
      subheading="The opening balance seeds the cash book; movements come from documents."
    >
      <div class="space-y-4">
        <ui-field label="Account name" for="ca-name" [required]="true">
          <input
            id="ca-name"
            uiAutofocus
            type="text"
            class="ctl"
            [value]="name()"
            (input)="name.set($any($event.target).value)"
          />
        </ui-field>
        <ui-field label="Opening balance" for="ca-opening">
          <input
            id="ca-opening"
            type="number"
            step="0.01"
            class="ctl"
            [value]="openingBalance()"
            (input)="openingBalance.set(+$any($event.target).value || 0)"
          />
        </ui-field>
        <ui-field label="Opening date" for="ca-date">
          <input
            id="ca-date"
            type="date"
            class="ctl"
            [value]="openingDate()"
            (change)="openingDate.set($any($event.target).value)"
          />
        </ui-field>
      </div>

      <div modal-footer class="flex gap-2">
        <ui-button variant="ghost" (pressed)="editorOpen.set(false)">Cancel</ui-button>
        <ui-button
          variant="primary"
          icon="save"
          [loading]="saving()"
          [disabled]="!name().trim()"
          (pressed)="save()"
        >
          {{ editing() ? 'Save account' : 'Create account' }}
        </ui-button>
      </div>
    </ui-modal>
  `,
  host: { class: 'block' },
})
export class CashAccountsPage {
  private readonly api = inject(PosApi);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly lookups = inject(Lookups);
  private readonly print = inject(PrintService);

  private readonly routeData = toSignal(this.route.data, {
    initialValue: this.route.snapshot.data,
  });
  protected readonly config = computed(() => this.routeData() as unknown as CashAccountConfig);

  protected readonly editorOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly editing = signal<CashAccount | null>(null);

  protected readonly name = signal('');
  protected readonly openingBalance = signal(0);
  protected readonly openingDate = signal(today());

  private readonly book = signal<CashBookRow[]>([]);

  protected readonly store = new ListStore<CashAccount>(() => this.endpoint().search({}));

  protected readonly rows = computed<AccountRow[]>(() =>
    this.store.rows().map((account) => {
      const stats = this.book().find(
        (row) => row.mode === this.config().mode && row.accountId === account.id,
      );
      return {
        ...account,
        inflow: stats?.inflow ?? 0,
        outflow: stats?.outflow ?? 0,
        balance: stats?.balance ?? account.openingBalance,
      };
    }),
  );

  protected readonly columns: Column<AccountRow>[] = [
    { key: 'name', header: 'Account', value: (row) => row.name, kind: 'strong' },
    {
      key: 'openingDate',
      header: 'Opened',
      value: (row) => row.openingDate,
      kind: 'date',
      hideOnMobile: true,
    },
    {
      key: 'openingBalance',
      header: 'Opening',
      value: (row) => row.openingBalance,
      kind: 'money',
      align: 'right',
      hideOnMobile: true,
    },
    {
      key: 'inflow',
      header: 'In',
      value: (row) => row.inflow,
      kind: 'money',
      align: 'right',
      hideOnMobile: true,
    },
    {
      key: 'outflow',
      header: 'Out',
      value: (row) => row.outflow,
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
  ];

  protected readonly openingTotal = computed(() => sum(this.rows(), (row) => row.openingBalance));
  protected readonly inflowTotal = computed(() => sum(this.rows(), (row) => row.inflow));
  protected readonly balanceTotal = computed(() => sum(this.rows(), (row) => row.balance));

  constructor() {
    effect(() => {
      this.config();
      void this.reload();
    });
  }

  private endpoint() {
    return this.config().mode === 'Cash' ? this.api.cashAccounts : this.api.bankAccounts;
  }

  protected async reload(): Promise<void> {
    await this.store.load();
    this.book.set(await firstValueFrom(this.api.cashBalance()));
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.name.set('');
    this.openingBalance.set(0);
    this.openingDate.set(today());
    this.editorOpen.set(true);
  }

  protected openEdit(row: CashAccount): void {
    this.editing.set(row);
    this.name.set(row.name);
    this.openingBalance.set(row.openingBalance ?? 0);
    this.openingDate.set(row.openingDate ?? today());
    this.editorOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    const payload: Partial<CashAccount> = {
      name: this.name().trim(),
      openingBalance: this.openingBalance(),
      openingDate: this.openingDate(),
      postBy: 'Aman',
    };
    try {
      const current = this.editing();
      if (current) await firstValueFrom(this.endpoint().update(current.id, payload));
      else await firstValueFrom(this.endpoint().create(payload));
      this.toast.success('Account saved', `${payload.name} is ready to receive postings.`);
      this.editorOpen.set(false);
      await this.reload();
      void this.lookups.refresh(this.config().mode === 'Cash' ? 'cashAccounts' : 'bankAccounts');
    } catch {
      /* surfaced by the error interceptor */
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(row: CashAccount): Promise<void> {
    if (!(await this.confirm.askDelete(`account “${row.name}”`))) return;
    await firstValueFrom(this.endpoint().remove(row.id));
    this.store.removeWhere((candidate) => candidate.id === row.id);
    this.toast.success('Account deleted', `${row.name} was removed.`);
    void this.lookups.refresh(this.config().mode === 'Cash' ? 'cashAccounts' : 'bankAccounts');
  }

  /** One row shape, shared by the CSV export and the printed report. */
  private reportRows(): Record<string, unknown>[] {
    return this.rows().map((row) => ({
      Account: row.name,
      Opened: row.openingDate,
      Opening: row.openingBalance,
      In: row.inflow,
      Out: row.outflow,
      Balance: row.balance,
    }));
  }

  private slug(): string {
    return this.config().title.toLowerCase().replace(/\s+/g, '-');
  }

  protected exportCsv(): void {
    downloadCsv(this.slug(), this.reportRows());
  }

  protected printPdf(): void {
    const rows = this.rows();
    this.print.report({
      title: this.config().title,
      subtitle: `As at ${prettyDate(today())}`,
      filename: this.slug(),
      summary: [
        { label: 'Accounts', value: String(rows.length) },
        { label: 'Opening total', value: currency(this.openingTotal()) },
        { label: 'Money in', value: currency(this.inflowTotal()) },
        { label: 'Balance now', value: currency(this.balanceTotal()) },
      ],
      sections: [
        {
          rows: this.reportRows(),
          totals: {
            Opening: this.openingTotal(),
            In: this.inflowTotal(),
            Out: sum(rows, (row) => row.outflow),
            Balance: this.balanceTotal(),
          },
          emptyMessage: `No ${this.config().title.toLowerCase()} yet.`,
        },
      ],
    });
  }

  protected readonly currency = currency;
}

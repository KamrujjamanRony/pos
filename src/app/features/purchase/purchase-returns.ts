import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { PaymentMode, PurchaseEntry, PurchaseReturn } from '../../core/models';
import { ConfirmService } from '../../core/services/confirm';
import { ListStore } from '../../core/services/list-store';
import { Lookups } from '../../core/services/lookups';
import { PosApi } from '../../core/services/pos-api';
import { ToastService } from '../../core/services/toast';
import { addDays, clamp, currency, downloadCsv, money, round2, sum, today } from '../../core/util/format';
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
  purchasePrice: number;
  quantity: number;
  maxQuantity: number;
}

@Component({
  selector: 'app-purchase-returns',
  imports: [UiPageHeader, UiFilterBar, UiTable, UiButton, UiModal, UiField, UiCombobox, UiEmpty],
  template: `
    <div class="space-y-4">
      <ui-page-header
        icon="undo"
        title="Purchase returns"
        subtitle="Stock going back to a supplier, and the credit that comes with it."
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
        placeholder="Return number, supplier, reason…"
        (refresh)="reload()"
        (exported)="exportCsv()"
      />

      <ui-table
        [rows]="filtered()"
        [columns]="columns"
        [loading]="store.loading()"
        [actions]="rowActions"
        emptyTitle="No purchase returns recorded"
        emptyMessage="Returns raised against a goods receipt will appear here."
      />
    </div>

    <ng-template #rowActions let-row>
      <ui-button variant="ghost" size="icon" icon="trash" ariaLabel="Delete return" (pressed)="remove(row)" />
    </ng-template>

    <ui-modal
      [(open)]="editorOpen"
      size="lg"
      heading="Record a purchase return"
      subheading="Pick the goods receipt, then set what is going back."
    >
      <div class="space-y-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <ui-field label="Return date" for="pr-date" [required]="true">
            <input id="pr-date" type="date" class="ctl" [value]="returnDate()" (change)="returnDate.set($any($event.target).value)" />
          </ui-field>
          <ui-field label="Goods receipt" [required]="true">
            <ui-combobox
              [options]="entries()"
              [labelOf]="entryLabel"
              [keyOf]="idOf"
              [subOf]="entrySub"
              [(value)]="purchaseEntryId"
              placeholder="Search by entry number or supplier"
              (selected)="loadEntry($event)"
            />
          </ui-field>
        </div>

        @if (lines().length) {
          <div class="overflow-hidden rounded-xl border border-line">
            <table class="w-full text-left text-[13px]">
              <thead class="bg-surface-2">
                <tr>
                  <th class="px-3 py-2 text-[11px] font-semibold tracking-wider text-faint uppercase">Item</th>
                  <th class="w-24 px-3 py-2 text-right text-[11px] font-semibold tracking-wider text-faint uppercase">Received</th>
                  <th class="w-28 px-3 py-2 text-right text-[11px] font-semibold tracking-wider text-faint uppercase">Returning</th>
                  <th class="w-28 px-3 py-2 text-right text-[11px] font-semibold tracking-wider text-faint uppercase">Amount</th>
                </tr>
              </thead>
              <tbody>
                @for (line of lines(); track line.key) {
                  <tr class="border-t border-line">
                    <td class="px-3 py-2">
                      <p class="font-medium text-ink">{{ line.itemName }}</p>
                      <p class="num text-[11.5px] text-faint">{{ money(line.purchasePrice) }} each</p>
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
                      {{ money(line.purchasePrice * line.quantity) }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <div class="grid gap-4 sm:grid-cols-3">
            <ui-field label="Credit mode" for="pr-mode">
              <select id="pr-mode" class="ctl" [value]="paymentMode()" (change)="onModeChange($any($event.target).value)">
                <option value="Cash">Cash</option>
                <option value="Bank">Bank</option>
              </select>
            </ui-field>
            <ui-field label="Account" for="pr-account">
              <select
                id="pr-account"
                class="ctl"
                [value]="paymentAccountId() ?? ''"
                (change)="paymentAccountId.set(+$any($event.target).value || null)"
              >
                @for (account of accounts(); track account.id) {
                  <option [value]="account.id">{{ account.name }}</option>
                }
              </select>
            </ui-field>
            <ui-field label="Cash received back" for="pr-cash" [hint]="'Return value ' + currency(total())">
              <input id="pr-cash" type="number" class="ctl" [value]="cashReceive()" (input)="cashReceive.set(+$any($event.target).value || 0)" />
            </ui-field>
          </div>

          <ui-field label="Reason" for="pr-remarks">
            <input id="pr-remarks" type="text" class="ctl" [value]="remarks()" (input)="remarks.set($any($event.target).value)" placeholder="Damaged units, wrong model…" />
          </ui-field>
        } @else {
          <ui-empty title="Choose a goods receipt" message="Its lines will appear here, ready to adjust." icon="truck" />
        }
      </div>

      <div modal-footer class="flex gap-2">
        <ui-button variant="ghost" (pressed)="editorOpen.set(false)">Cancel</ui-button>
        <ui-button variant="primary" icon="save" [loading]="saving()" [disabled]="!total()" (pressed)="save()">
          Post return
        </ui-button>
      </div>
    </ui-modal>
  `,
  host: { class: 'block' },
})
export class PurchaseReturnsPage {
  private readonly api = inject(PosApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly lookups = inject(Lookups);

  protected readonly money = money;
  protected readonly currency = currency;
  protected readonly idOf = (row: { id: number }) => row.id;
  protected readonly entryLabel = (row: PurchaseEntry) => row.invoiceNo;
  protected readonly entrySub = (row: PurchaseEntry) =>
    `${row.supplierName ?? ''} · ${currency(row.netAmount)}`;

  protected readonly search = signal('');
  protected readonly from = signal(addDays(today(), -60));
  protected readonly to = signal(today());
  protected readonly editorOpen = signal(false);
  protected readonly saving = signal(false);

  protected readonly returnDate = signal(today());
  protected readonly purchaseEntryId = signal<number | string | null>(null);
  protected readonly lines = signal<ReturnLine[]>([]);
  protected readonly paymentMode = signal<PaymentMode>('Cash');
  protected readonly paymentAccountId = signal<number | null>(null);
  protected readonly cashReceive = signal(0);
  protected readonly remarks = signal('');
  protected readonly entries = signal<PurchaseEntry[]>([]);
  private readonly source = signal<PurchaseEntry | null>(null);

  protected readonly store = new ListStore<PurchaseReturn>((filter) =>
    this.api.purchaseReturns.search(filter),
  );

  protected readonly columns: Column<PurchaseReturn>[] = [
    { key: 'returnNo', header: 'Return', value: (row) => row.returnNo, kind: 'mono', width: '130px' },
    { key: 'returnDate', header: 'Date', value: (row) => row.returnDate, kind: 'date', width: '120px' },
    {
      key: 'supplierName',
      header: 'Supplier',
      value: (row) => row.supplierName ?? '—',
      kind: 'strong',
      sub: (row) => row.remarks,
    },
    { key: 'lines', header: 'Lines', value: (row) => row.details.length, align: 'right', hideOnMobile: true },
    { key: 'netAmount', header: 'Return value', value: (row) => row.netAmount ?? 0, kind: 'money', align: 'right' },
    { key: 'cashReceive', header: 'Cash back', value: (row) => row.cashReceive, kind: 'money', align: 'right' },
  ];

  protected readonly filtered = computed(() => {
    const needle = this.search().toLowerCase();
    return this.store
      .rows()
      .filter((row) =>
        needle
          ? `${row.returnNo} ${row.supplierName} ${row.remarks}`.toLowerCase().includes(needle)
          : true,
      );
  });

  protected readonly tiles = computed(() => {
    const rows = this.filtered();
    return [
      { label: 'Returns', value: String(rows.length) },
      { label: 'Return value', value: currency(sum(rows, (row) => row.netAmount ?? 0)) },
      { label: 'Cash recovered', value: currency(sum(rows, (row) => row.cashReceive)) },
    ];
  });

  protected readonly accounts = computed(() =>
    this.paymentMode() === 'Cash' ? this.lookups.cashAccounts() : this.lookups.bankAccounts(),
  );

  protected readonly total = computed(() =>
    round2(this.lines().reduce((sum, line) => sum + line.purchasePrice * line.quantity, 0)),
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
    this.purchaseEntryId.set(null);
    this.lines.set([]);
    this.cashReceive.set(0);
    this.remarks.set('');
    this.paymentAccountId.set(this.lookups.cashAccounts()[0]?.id ?? null);
    this.editorOpen.set(true);
    this.entries.set(
      await firstValueFrom(
        this.api.purchases.search({ fromDate: addDays(today(), -120), toDate: today() }),
      ),
    );
  }

  protected loadEntry(entry: PurchaseEntry): void {
    this.source.set(entry);
    this.lines.set(
      entry.details.map((line, index) => ({
        key: `prl-${index}`,
        itemId: line.itemId,
        itemName: line.itemName ?? '',
        purchasePrice: line.purchasePrice,
        quantity: 0,
        maxQuantity: line.quantity,
      })),
    );
    this.cashReceive.set(0);
  }

  protected setQuantity(key: string, value: string): void {
    this.lines.update((lines) =>
      lines.map((line) =>
        line.key === key
          ? { ...line, quantity: clamp(Number(value) || 0, 0, line.maxQuantity) }
          : line,
      ),
    );
    this.cashReceive.set(this.total());
  }

  protected onModeChange(mode: string): void {
    this.paymentMode.set(mode as PaymentMode);
    this.paymentAccountId.set(this.accounts()[0]?.id ?? null);
  }

  protected async save(): Promise<void> {
    const entry = this.source();
    const details = this.lines().filter((line) => line.quantity > 0);
    if (!entry || !details.length) {
      this.toast.warn('Nothing to return', 'Set a quantity on at least one line.');
      return;
    }

    this.saving.set(true);
    try {
      const saved = await firstValueFrom(
        this.api.purchaseReturns.create({
          returnDate: this.returnDate(),
          branchId: entry.branchId,
          supplierId: entry.supplierId,
          purchaseEntryId: entry.id,
          details: details.map((line) => ({
            itemId: line.itemId,
            purchasePrice: line.purchasePrice,
            salesPrice: 0,
            quantity: line.quantity,
          })),
          discount: 0,
          cashReceive: this.cashReceive(),
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

  protected async remove(row: PurchaseReturn): Promise<void> {
    if (!(await this.confirm.askDelete(`return ${row.returnNo}`))) return;
    await firstValueFrom(this.api.purchaseReturns.remove(row.id));
    this.store.removeWhere((candidate) => candidate.id === row.id);
    this.toast.success('Return deleted', `${row.returnNo} was removed.`);
  }

  protected exportCsv(): void {
    downloadCsv(
      'purchase-returns',
      this.filtered().map((row) => ({
        Return: row.returnNo,
        Date: row.returnDate,
        Supplier: row.supplierName,
        Lines: row.details.length,
        Value: row.netAmount,
        'Cash back': row.cashReceive,
        Reason: row.remarks,
      })),
    );
  }
}

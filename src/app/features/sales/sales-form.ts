import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  COURIER_CONDITIONS,
  type DiscountType,
  type Item,
  type PaymentMode,
  type SalesEntry,
} from '../../core/models';
import { Lookups } from '../../core/services/lookups';
import { PosApi } from '../../core/services/pos-api';
import { ToastService } from '../../core/services/toast';
import { clamp, currency, money, round2, today } from '../../core/util/format';
import { buttonClass, UiButton } from '../../shared/ui/button';
import { UiCombobox } from '../../shared/ui/combobox';
import { UiCount } from '../../shared/ui/count';
import { UiIcon } from '../../shared/ui/icon';
import { UiCard, UiEmpty, UiField, UiPageHeader } from '../../shared/ui/primitives';

interface EditableLine {
  key: string;
  itemId: number | null;
  itemName: string;
  salesPrice: number;
  quantity: number;
  serialNo: string;
}

let lineSeed = 0;

@Component({
  selector: 'app-sales-form',
  imports: [
    RouterLink,
    UiPageHeader,
    UiCard,
    UiField,
    UiButton,
    UiCombobox,
    UiIcon,
    UiCount,
    UiEmpty,
  ],
  template: `
    <div class="space-y-4">
      <ui-page-header
        icon="receipt"
        [title]="isEdit() ? 'Edit invoice ' + documentNo() : 'New sales invoice'"
        subtitle="Stock leaves the branch and the customer ledger moves the moment this is saved."
      >
        <a [class]="ghostButton" routerLink="/sales/invoices">Cancel</a>
        <ui-button
          variant="primary"
          icon="save"
          [loading]="saving()"
          [disabled]="!lines().length"
          (pressed)="save()"
        >
          {{ isEdit() ? 'Save invoice' : 'Post invoice' }}
        </ui-button>
      </ui-page-header>

      <div class="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <div class="space-y-4">
          <ui-card heading="Document" icon="file">
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <ui-field label="Invoice date" for="sf-date" [required]="true">
                <input
                  id="sf-date"
                  type="date"
                  class="ctl"
                  [value]="invoiceDate()"
                  (change)="invoiceDate.set($any($event.target).value)"
                />
              </ui-field>

              <ui-field label="Branch" [required]="true">
                <ui-combobox
                  [options]="lookups.branches()"
                  [labelOf]="nameOf"
                  [keyOf]="idOf"
                  [(value)]="branchId"
                  placeholder="Select a branch"
                />
              </ui-field>

              <ui-field label="Customer" hint="Leave empty for a walk-in sale.">
                <ui-combobox
                  [options]="lookups.customers()"
                  [labelOf]="customerLabel"
                  [keyOf]="idOf"
                  [subOf]="customerSub"
                  [(value)]="customerId"
                  placeholder="Walk-in customer"
                />
              </ui-field>

              <ui-field label="Sold by">
                <ui-combobox
                  [options]="lookups.employees()"
                  [labelOf]="employeeLabel"
                  [keyOf]="idOf"
                  [(value)]="employeeId"
                  placeholder="Assign an employee"
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

              <ui-field label="Remarks" for="sf-remarks">
                <input id="sf-remarks" type="text" class="ctl" [value]="remarks()" (input)="remarks.set($any($event.target).value)" />
              </ui-field>
            </div>
          </ui-card>

          <ui-card heading="Lines" [subheading]="lines().length + ' items on this invoice'" icon="box" [padded]="false">
            <div card-actions>
              <ui-button variant="soft" size="sm" icon="plus" (pressed)="addBlankLine()">Add line</ui-button>
            </div>

            <div class="border-b border-line bg-surface-2/50 p-3.5">
              <ui-combobox
                [options]="lookups.items()"
                [labelOf]="itemLabel"
                [keyOf]="idOf"
                [subOf]="itemSub"
                [(value)]="picker"
                placeholder="Search the catalogue to add an item…"
                searchPlaceholder="Item name, code or model…"
                (selected)="addItem($event)"
              />
            </div>

            @if (lines().length) {
              <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                  <thead>
                    <tr class="border-b border-line bg-surface-2/40">
                      <th class="px-3 py-2.5 text-[11px] font-semibold tracking-wider text-faint uppercase">Item</th>
                      <th class="w-28 px-3 py-2.5 text-right text-[11px] font-semibold tracking-wider text-faint uppercase">Rate</th>
                      <th class="w-24 px-3 py-2.5 text-right text-[11px] font-semibold tracking-wider text-faint uppercase">Qty</th>
                      <th class="w-36 px-3 py-2.5 text-[11px] font-semibold tracking-wider text-faint uppercase">Serial</th>
                      <th class="w-28 px-3 py-2.5 text-right text-[11px] font-semibold tracking-wider text-faint uppercase">Amount</th>
                      <th class="w-10 px-3 py-2.5"><span class="sr-only">Remove</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (line of lines(); track line.key; let i = $index) {
                      <tr class="stagger border-b border-line/70 last:border-0" [style]="'--i:' + i">
                        <td class="px-3 py-2">
                          <ui-combobox
                            [options]="lookups.items()"
                            [labelOf]="itemLabel"
                            [keyOf]="idOf"
                            [subOf]="itemSub"
                            [value]="line.itemId"
                            [compact]="true"
                            [clearable]="false"
                            placeholder="Choose an item"
                            (selected)="setLineItem(line.key, $event)"
                          />
                        </td>
                        <td class="px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            class="ctl ctl-sm text-right"
                            [value]="line.salesPrice"
                            [attr.aria-label]="'Rate for line ' + (i + 1)"
                            (input)="patch(line.key, { salesPrice: +$any($event.target).value || 0 })"
                          />
                        </td>
                        <td class="px-3 py-2">
                          <input
                            type="number"
                            class="ctl ctl-sm text-right"
                            [value]="line.quantity"
                            [attr.aria-label]="'Quantity for line ' + (i + 1)"
                            (input)="patch(line.key, { quantity: clamp(+$any($event.target).value || 0, 0, 99999) })"
                          />
                        </td>
                        <td class="px-3 py-2">
                          <input
                            type="text"
                            class="ctl ctl-sm"
                            placeholder="SN-…"
                            [value]="line.serialNo"
                            [attr.aria-label]="'Serial number for line ' + (i + 1)"
                            (input)="patch(line.key, { serialNo: $any($event.target).value })"
                          />
                        </td>
                        <td class="num px-3 py-2 text-right font-medium text-ink">
                          {{ money(line.salesPrice * line.quantity) }}
                        </td>
                        <td class="px-3 py-2 text-right">
                          <button
                            type="button"
                            class="grid size-7 place-items-center rounded-lg text-faint transition hover:bg-neg-soft hover:text-neg"
                            [attr.aria-label]="'Remove line ' + (i + 1)"
                            (click)="removeLine(line.key)"
                          >
                            <ui-icon name="trash" [size]="15" />
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <ui-empty
                title="No lines yet"
                message="Pick an item above to start the invoice."
                icon="box"
              />
            }
          </ui-card>

          <ui-card heading="Courier" subheading="Only needed for deliveries" icon="truck">
            <div class="grid gap-4 sm:grid-cols-3">
              <ui-field label="Courier partner">
                <ui-combobox
                  [options]="lookups.couriers()"
                  [labelOf]="nameOf"
                  [keyOf]="idOf"
                  [(value)]="courierNameId"
                  placeholder="No courier"
                />
              </ui-field>
              <ui-field label="Courier cost" for="sf-courier-cost">
                <input
                  id="sf-courier-cost"
                  type="number"
                  class="ctl"
                  [value]="courierCost()"
                  (input)="courierCost.set(+$any($event.target).value || 0)"
                />
              </ui-field>
              <ui-field label="Delivery status" for="sf-courier-state">
                <select
                  id="sf-courier-state"
                  class="ctl"
                  [value]="courierCondition()"
                  (change)="courierCondition.set(+$any($event.target).value)"
                >
                  <option [value]="0">Not a courier sale</option>
                  @for (condition of courierConditions; track condition.value) {
                    <option [value]="condition.value">{{ condition.label }}</option>
                  }
                </select>
              </ui-field>
            </div>
          </ui-card>
        </div>

        <!-- Summary -->
        <div class="xl:sticky xl:top-20 xl:self-start">
          <ui-card heading="Settlement" icon="wallet">
            <div class="space-y-3.5">
              <div class="grid grid-cols-2 gap-3">
                <ui-field label="Discount" for="sf-discount">
                  <input
                    id="sf-discount"
                    type="number"
                    class="ctl"
                    [value]="discount()"
                    (input)="discount.set(+$any($event.target).value || 0)"
                  />
                </ui-field>
                <ui-field label="Type" for="sf-discount-type">
                  <select
                    id="sf-discount-type"
                    class="ctl"
                    [value]="discountType()"
                    (change)="discountType.set($any($event.target).value)"
                  >
                    <option value="Percent">Percent</option>
                    <option value="Flat">Flat amount</option>
                  </select>
                </ui-field>
              </div>

              <dl class="space-y-1.5 rounded-xl bg-surface-2/60 p-3.5 text-[13px]">
                <div class="flex justify-between">
                  <dt class="text-muted">Gross</dt>
                  <dd class="num font-medium text-ink">{{ money(gross()) }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-muted">Discount</dt>
                  <dd class="num font-medium text-neg">− {{ money(discountValue()) }}</dd>
                </div>
                @if (courierCost() > 0) {
                  <div class="flex justify-between">
                    <dt class="text-muted">Courier</dt>
                    <dd class="num font-medium text-ink">{{ money(courierCost()) }}</dd>
                  </div>
                }
                <div class="flex items-baseline justify-between border-t border-line pt-2">
                  <dt class="font-semibold text-ink">Net payable</dt>
                  <dd class="text-[20px] font-semibold text-ink">
                    <span class="mr-0.5 text-[13px] text-faint">৳</span>
                    <ui-count [value]="net()" format="money" [duration]="420" />
                  </dd>
                </div>
              </dl>

              <div class="grid grid-cols-2 gap-3">
                <ui-field label="Mode" for="sf-mode">
                  <select
                    id="sf-mode"
                    class="ctl"
                    [value]="paymentMode()"
                    (change)="onModeChange($any($event.target).value)"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank">Bank</option>
                  </select>
                </ui-field>
                <ui-field label="Account" for="sf-account">
                  <select
                    id="sf-account"
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

              <ui-field label="Amount received" for="sf-received" [hint]="dueHint()">
                <div class="flex gap-1.5">
                  <input
                    id="sf-received"
                    type="number"
                    class="ctl"
                    [value]="receiveAmount()"
                    (input)="receiveAmount.set(+$any($event.target).value || 0)"
                  />
                  <button
                    type="button"
                    class="shrink-0 rounded-xl border border-line bg-surface px-3 text-[12px] font-semibold text-brand-text transition hover:bg-surface-2"
                    (click)="receiveAmount.set(net())"
                  >
                    Full
                  </button>
                </div>
              </ui-field>
            </div>
          </ui-card>
        </div>
      </div>
    </div>
  `,
  host: { class: 'block' },
})
export class SalesFormPage {
  private readonly api = inject(PosApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly lookups = inject(Lookups);

  protected readonly money = money;
  protected readonly clamp = clamp;
  protected readonly ghostButton = buttonClass('ghost', 'md');
  protected readonly courierConditions = COURIER_CONDITIONS;

  protected readonly nameOf = (row: { name: string }) => row.name;
  protected readonly idOf = (row: { id: number }) => row.id;
  protected readonly customerLabel = (row: { customerName: string }) => row.customerName;
  protected readonly customerSub = (row: { contactNumber: string }) => row.contactNumber;
  protected readonly employeeLabel = (row: { employeeName: string }) => row.employeeName;
  protected readonly itemLabel = (row: Item) => row.name;
  protected readonly itemSub = (row: Item) => `${row.code} · ${currency(row.salesPrice)}`;

  private readonly editingId = signal<number | null>(null);
  protected readonly documentNo = signal('');
  protected readonly saving = signal(false);

  protected readonly invoiceDate = signal(today());
  protected readonly branchId = signal<number | string | null>(null);
  protected readonly customerId = signal<number | string | null>(null);
  protected readonly employeeId = signal<number | string | null>(null);
  protected readonly referredId = signal<number | string | null>(null);
  protected readonly courierNameId = signal<number | string | null>(null);
  protected readonly courierCost = signal(0);
  protected readonly courierCondition = signal(0);
  protected readonly remarks = signal('');
  protected readonly discount = signal(0);
  protected readonly discountType = signal<DiscountType>('Percent');
  protected readonly paymentMode = signal<PaymentMode>('Cash');
  protected readonly paymentAccountId = signal<number | null>(null);
  protected readonly receiveAmount = signal(0);
  protected readonly lines = signal<EditableLine[]>([]);
  /** The "search to add" box clears itself after every pick. */
  protected readonly picker = signal<number | string | null>(null);

  protected readonly isEdit = computed(() => this.editingId() !== null);

  protected readonly accounts = computed(() =>
    this.paymentMode() === 'Cash' ? this.lookups.cashAccounts() : this.lookups.bankAccounts(),
  );

  protected readonly gross = computed(() =>
    round2(this.lines().reduce((total, line) => total + line.salesPrice * line.quantity, 0)),
  );

  protected readonly discountValue = computed(() =>
    this.discountType() === 'Percent'
      ? round2((this.gross() * this.discount()) / 100)
      : round2(this.discount()),
  );

  protected readonly net = computed(() =>
    round2(Math.max(0, this.gross() - this.discountValue() + this.courierCost())),
  );

  protected readonly dueHint = computed(() => {
    const due = round2(this.net() - this.receiveAmount());
    if (due <= 0.5) return 'Nothing left outstanding on this invoice.';
    return `${currency(due)} will be added to the customer ledger.`;
  });

  constructor() {
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    await this.lookups.ensure();
    this.branchId.set(this.lookups.branches()[0]?.id ?? null);
    this.paymentAccountId.set(this.lookups.cashAccounts()[0]?.id ?? null);

    const id = this.route.snapshot.paramMap.get('id');
    if (!id || id === 'new') return;

    try {
      const invoice = await firstValueFrom(this.api.sales.byId(Number(id)));
      this.editingId.set(invoice.id);
      this.documentNo.set(invoice.invoiceNo);
      this.invoiceDate.set(invoice.invoiceDate);
      this.branchId.set(invoice.branchId);
      this.customerId.set(invoice.customerId);
      this.employeeId.set(invoice.byEmployeeId);
      this.referredId.set(invoice.byReferredId);
      this.courierNameId.set(invoice.courierNameId);
      this.courierCost.set(invoice.courierCost ?? 0);
      this.courierCondition.set(invoice.courierCondition ?? 0);
      this.remarks.set(invoice.remarks ?? '');
      this.discount.set(invoice.discount ?? 0);
      this.discountType.set(invoice.discountType ?? 'Percent');
      this.paymentMode.set(invoice.paymentMode ?? 'Cash');
      this.paymentAccountId.set(invoice.paymentAccountId ?? null);
      this.receiveAmount.set(invoice.receiveAmount ?? 0);
      this.lines.set(
        invoice.details.map((line) => ({
          key: `line-${lineSeed++}`,
          itemId: line.itemId,
          itemName: line.itemName ?? '',
          salesPrice: line.salesPrice,
          quantity: line.quantity,
          serialNo: line.serialNo ?? '',
        })),
      );
    } catch {
      await this.router.navigate(['/sales/invoices']);
    }
  }

  protected addItem(item: Item): void {
    this.picker.set(null);
    const existing = this.lines().find((line) => line.itemId === item.id);
    if (existing) {
      this.patch(existing.key, { quantity: existing.quantity + 1 });
      return;
    }
    this.lines.update((lines) => [
      ...lines,
      {
        key: `line-${lineSeed++}`,
        itemId: item.id,
        itemName: item.name,
        salesPrice: item.salesPrice,
        quantity: 1,
        serialNo: '',
      },
    ]);
    this.receiveAmount.set(this.net());
  }

  protected addBlankLine(): void {
    this.lines.update((lines) => [
      ...lines,
      { key: `line-${lineSeed++}`, itemId: null, itemName: '', salesPrice: 0, quantity: 1, serialNo: '' },
    ]);
  }

  protected setLineItem(key: string, item: Item): void {
    this.patch(key, { itemId: item.id, itemName: item.name, salesPrice: item.salesPrice });
  }

  protected patch(key: string, changes: Partial<EditableLine>): void {
    this.lines.update((lines) =>
      lines.map((line) => (line.key === key ? { ...line, ...changes } : line)),
    );
  }

  protected removeLine(key: string): void {
    this.lines.update((lines) => lines.filter((line) => line.key !== key));
  }

  protected onModeChange(mode: string): void {
    this.paymentMode.set(mode as PaymentMode);
    this.paymentAccountId.set(this.accounts()[0]?.id ?? null);
  }

  protected async save(): Promise<void> {
    const details = this.lines().filter((line) => line.itemId && line.quantity > 0);
    if (!details.length) {
      this.toast.warn('Nothing to post', 'Add at least one line with a quantity.');
      return;
    }

    this.saving.set(true);
    const payload: Partial<SalesEntry> = {
      invoiceDate: this.invoiceDate(),
      branchId: this.branchId() === null ? null : Number(this.branchId()),
      customerId: this.customerId() === null ? null : Number(this.customerId()),
      byEmployeeId: this.employeeId() === null ? null : Number(this.employeeId()),
      byReferredId: this.referredId() === null ? null : Number(this.referredId()),
      courierNameId: this.courierNameId() === null ? null : Number(this.courierNameId()),
      courierCost: this.courierCost(),
      courierCondition: this.courierCondition(),
      details: details.map((line) => ({
        itemId: line.itemId,
        salesPrice: line.salesPrice,
        quantity: line.quantity,
        serialNo: line.serialNo,
      })),
      discount: this.discount(),
      discountType: this.discountType(),
      receiveAmount: this.receiveAmount(),
      paymentMode: this.paymentMode(),
      paymentAccountId: this.paymentAccountId(),
      remarks: this.remarks(),
      postBy: 'Aman',
    };

    try {
      const id = this.editingId();
      const saved = id
        ? await firstValueFrom(this.api.sales.update(id, payload))
        : await firstValueFrom(this.api.sales.create(payload));
      this.toast.success(
        id ? 'Invoice updated' : 'Invoice posted',
        `${saved.invoiceNo} · ${currency(saved.netAmount)}`,
      );
      await this.router.navigate(['/sales/invoices']);
    } catch {
      /* surfaced by the error interceptor */
    } finally {
      this.saving.set(false);
    }
  }
}

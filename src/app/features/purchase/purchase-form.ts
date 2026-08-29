import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { Item, PaymentMode, PurchaseEntry } from '../../core/models';
import { Lookups } from '../../core/services/lookups';
import { PosApi } from '../../core/services/pos-api';
import { PrintService } from '../../core/services/print';
import { ToastService } from '../../core/services/toast';
import {
  amountInWords,
  clamp,
  currency,
  money,
  prettyDate,
  round2,
  today,
} from '../../core/util/format';
import { buttonClass, UiButton } from '../../shared/ui/button';
import { UiCombobox } from '../../shared/ui/combobox';
import { UiCount } from '../../shared/ui/count';
import { UiIcon } from '../../shared/ui/icon';
import { UiCard, UiEmpty, UiField, UiPageHeader } from '../../shared/ui/primitives';

interface PurchaseLine {
  key: string;
  itemId: number | null;
  itemName: string;
  purchasePrice: number;
  salesPrice: number;
  quantity: number;
}

let lineSeed = 0;

@Component({
  selector: 'app-purchase-form',
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
        icon="truck"
        [title]="isEdit() ? 'Edit purchase ' + documentNo() : 'New purchase entry'"
        subtitle="Receiving stock raises the supplier balance and updates item costs."
      >
        <a [class]="ghostButton" routerLink="/purchase/entries">Cancel</a>
        <ui-button
          variant="outline"
          icon="printer"
          [disabled]="!lines().length"
          (pressed)="printPdf()"
        >
          Print / PDF
        </ui-button>
        <ui-button
          variant="primary"
          icon="save"
          [loading]="saving()"
          [disabled]="!lines().length"
          (pressed)="save()"
        >
          {{ isEdit() ? 'Save entry' : 'Post entry' }}
        </ui-button>
      </ui-page-header>

      <div class="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <div class="space-y-4">
          <ui-card heading="Goods receipt" icon="file">
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <ui-field label="Receipt date" for="pf-date" [required]="true">
                <input
                  id="pf-date"
                  type="date"
                  class="ctl"
                  [value]="receiptDate()"
                  (change)="receiptDate.set($any($event.target).value)"
                />
              </ui-field>
              <ui-field
                label="Supplier reference"
                for="pf-receipt"
                hint="The number printed on their invoice."
              >
                <input
                  id="pf-receipt"
                  type="text"
                  class="ctl"
                  [value]="receiptNo()"
                  (input)="receiptNo.set($any($event.target).value)"
                />
              </ui-field>
              <ui-field label="Branch" [required]="true">
                <ui-combobox
                  [options]="lookups.branches()"
                  [labelOf]="nameOf"
                  [keyOf]="idOf"
                  [(value)]="branchId"
                  placeholder="Receiving branch"
                />
              </ui-field>
              <ui-field label="Supplier" [required]="true">
                <ui-combobox
                  [options]="lookups.suppliers()"
                  [labelOf]="supplierLabel"
                  [keyOf]="idOf"
                  [subOf]="supplierSub"
                  [(value)]="supplierId"
                  placeholder="Who supplied these goods?"
                />
              </ui-field>
              <ui-field label="Remarks" for="pf-remarks" class="sm:col-span-2">
                <input
                  id="pf-remarks"
                  type="text"
                  class="ctl"
                  [value]="remarks()"
                  (input)="remarks.set($any($event.target).value)"
                />
              </ui-field>
            </div>
          </ui-card>

          <ui-card
            heading="Lines"
            [subheading]="lines().length + ' items received'"
            icon="box"
            [padded]="false"
          >
            <div card-actions>
              <ui-button variant="soft" size="sm" icon="plus" (pressed)="addBlankLine()"
                >Add line</ui-button
              >
            </div>

            <div class="border-b border-line bg-surface-2/50 p-3.5">
              <ui-combobox
                [options]="lookups.items()"
                [labelOf]="itemLabel"
                [keyOf]="idOf"
                [subOf]="itemSub"
                [(value)]="picker"
                placeholder="Search the catalogue to add an item…"
                (selected)="addItem($event)"
              />
            </div>

            @if (lines().length) {
              <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                  <thead>
                    <tr class="border-b border-line bg-surface-2/40">
                      <th
                        class="px-3 py-2.5 text-[11px] font-semibold tracking-wider text-faint uppercase"
                      >
                        Item
                      </th>
                      <th
                        class="w-28 px-3 py-2.5 text-right text-[11px] font-semibold tracking-wider text-faint uppercase"
                      >
                        Cost
                      </th>
                      <th
                        class="w-28 px-3 py-2.5 text-right text-[11px] font-semibold tracking-wider text-faint uppercase"
                      >
                        New sale price
                      </th>
                      <th
                        class="w-24 px-3 py-2.5 text-right text-[11px] font-semibold tracking-wider text-faint uppercase"
                      >
                        Qty
                      </th>
                      <th
                        class="w-28 px-3 py-2.5 text-right text-[11px] font-semibold tracking-wider text-faint uppercase"
                      >
                        Amount
                      </th>
                      <th class="w-10 px-3 py-2.5"><span class="sr-only">Remove</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (line of lines(); track line.key; let i = $index) {
                      <tr
                        class="stagger border-b border-line/70 last:border-0"
                        [style]="'--i:' + i"
                      >
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
                            [value]="line.purchasePrice"
                            [attr.aria-label]="'Cost for line ' + (i + 1)"
                            (input)="
                              patch(line.key, { purchasePrice: +$any($event.target).value || 0 })
                            "
                          />
                        </td>
                        <td class="px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            class="ctl ctl-sm text-right"
                            [value]="line.salesPrice"
                            [attr.aria-label]="'Sale price for line ' + (i + 1)"
                            (input)="
                              patch(line.key, { salesPrice: +$any($event.target).value || 0 })
                            "
                          />
                        </td>
                        <td class="px-3 py-2">
                          <input
                            type="number"
                            class="ctl ctl-sm text-right"
                            [value]="line.quantity"
                            [attr.aria-label]="'Quantity for line ' + (i + 1)"
                            (input)="
                              patch(line.key, {
                                quantity: clamp(+$any($event.target).value || 0, 0, 99999),
                              })
                            "
                          />
                        </td>
                        <td class="num px-3 py-2 text-right font-medium text-ink">
                          {{ money(line.purchasePrice * line.quantity) }}
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
                message="Pick an item above to start the receipt."
                icon="box"
              />
            }
          </ui-card>
        </div>

        <div class="xl:sticky xl:top-20 xl:self-start">
          <ui-card heading="Settlement" icon="wallet">
            <div class="space-y-3.5">
              <ui-field
                label="Discount"
                for="pf-discount"
                hint="A flat amount off the whole receipt."
              >
                <input
                  id="pf-discount"
                  type="number"
                  class="ctl"
                  [value]="discount()"
                  (input)="discount.set(+$any($event.target).value || 0)"
                />
              </ui-field>

              <dl class="space-y-1.5 rounded-xl bg-surface-2/60 p-3.5 text-[13px]">
                <div class="flex justify-between">
                  <dt class="text-muted">Gross</dt>
                  <dd class="num font-medium text-ink">{{ money(gross()) }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-muted">Discount</dt>
                  <dd class="num font-medium text-neg">− {{ money(discount()) }}</dd>
                </div>
                <div class="flex items-baseline justify-between border-t border-line pt-2">
                  <dt class="font-semibold text-ink">Net payable</dt>
                  <dd class="text-[20px] font-semibold text-ink">
                    <span class="mr-0.5 text-[13px] text-faint">৳</span>
                    <ui-count [value]="net()" format="money" [duration]="420" />
                  </dd>
                </div>
              </dl>

              <div class="grid grid-cols-2 gap-3">
                <ui-field label="Mode" for="pf-mode">
                  <select
                    id="pf-mode"
                    class="ctl"
                    [value]="paymentMode()"
                    (change)="onModeChange($any($event.target).value)"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank">Bank</option>
                  </select>
                </ui-field>
                <ui-field label="Account" for="pf-account">
                  <select
                    id="pf-account"
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

              <ui-field label="Paid now" for="pf-paid" [hint]="dueHint()">
                <div class="flex gap-1.5">
                  <input
                    id="pf-paid"
                    type="number"
                    class="ctl"
                    [value]="cashPayment()"
                    (input)="cashPayment.set(+$any($event.target).value || 0)"
                  />
                  <button
                    type="button"
                    class="shrink-0 rounded-xl border border-line bg-surface px-3 text-[12px] font-semibold text-brand-text transition hover:bg-surface-2"
                    (click)="cashPayment.set(net())"
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
export class PurchaseFormPage {
  private readonly api = inject(PosApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly lookups = inject(Lookups);
  private readonly print = inject(PrintService);

  protected readonly money = money;
  protected readonly clamp = clamp;
  protected readonly ghostButton = buttonClass('ghost', 'md');

  protected readonly nameOf = (row: { name: string }) => row.name;
  protected readonly idOf = (row: { id: number }) => row.id;
  protected readonly supplierLabel = (row: { supplierName: string }) => row.supplierName;
  protected readonly supplierSub = (row: { mobileNumber: string }) => row.mobileNumber;
  protected readonly itemLabel = (row: Item) => row.name;
  protected readonly itemSub = (row: Item) => `${row.code} · cost ${currency(row.purchasePrice)}`;

  private readonly editingId = signal<number | null>(null);
  protected readonly documentNo = signal('');
  protected readonly saving = signal(false);

  protected readonly receiptDate = signal(today());
  protected readonly receiptNo = signal('');
  protected readonly branchId = signal<number | string | null>(null);
  protected readonly supplierId = signal<number | string | null>(null);
  protected readonly remarks = signal('');
  protected readonly discount = signal(0);
  protected readonly paymentMode = signal<PaymentMode>('Cash');
  protected readonly paymentAccountId = signal<number | null>(null);
  protected readonly cashPayment = signal(0);
  protected readonly lines = signal<PurchaseLine[]>([]);
  /** The "search to add" box clears itself after every pick. */
  protected readonly picker = signal<number | string | null>(null);

  protected readonly isEdit = computed(() => this.editingId() !== null);

  protected readonly accounts = computed(() =>
    this.paymentMode() === 'Cash' ? this.lookups.cashAccounts() : this.lookups.bankAccounts(),
  );

  protected readonly gross = computed(() =>
    round2(this.lines().reduce((total, line) => total + line.purchasePrice * line.quantity, 0)),
  );

  protected readonly net = computed(() => round2(Math.max(0, this.gross() - this.discount())));

  protected readonly dueHint = computed(() => {
    const due = round2(this.net() - this.cashPayment());
    return due <= 0.5
      ? 'This receipt will be fully settled.'
      : `${currency(due)} stays on the supplier ledger.`;
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
      const entry = await firstValueFrom(this.api.purchases.byId(Number(id)));
      this.editingId.set(entry.id);
      this.documentNo.set(entry.invoiceNo);
      this.receiptDate.set(entry.receiptDate);
      this.receiptNo.set(entry.receiptNo ?? '');
      this.branchId.set(entry.branchId);
      this.supplierId.set(entry.supplierId);
      this.remarks.set(entry.remarks ?? '');
      this.discount.set(entry.discount ?? 0);
      this.paymentMode.set(entry.paymentMode ?? 'Cash');
      this.paymentAccountId.set(entry.paymentAccountId ?? null);
      this.cashPayment.set(entry.cashPayment ?? 0);
      this.lines.set(
        entry.details.map((line) => ({
          key: `pl-${lineSeed++}`,
          itemId: line.itemId,
          itemName: line.itemName ?? '',
          purchasePrice: line.purchasePrice,
          salesPrice: line.salesPrice ?? 0,
          quantity: line.quantity,
        })),
      );
    } catch {
      await this.router.navigate(['/purchase/entries']);
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
        key: `pl-${lineSeed++}`,
        itemId: item.id,
        itemName: item.name,
        purchasePrice: item.purchasePrice,
        salesPrice: item.salesPrice,
        quantity: 1,
      },
    ]);
  }

  protected addBlankLine(): void {
    this.lines.update((lines) => [
      ...lines,
      {
        key: `pl-${lineSeed++}`,
        itemId: null,
        itemName: '',
        purchasePrice: 0,
        salesPrice: 0,
        quantity: 1,
      },
    ]);
  }

  protected setLineItem(key: string, item: Item): void {
    this.patch(key, {
      itemId: item.id,
      itemName: item.name,
      purchasePrice: item.purchasePrice,
      salesPrice: item.salesPrice,
    });
  }

  protected patch(key: string, changes: Partial<PurchaseLine>): void {
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

  /**
   * Prints what is on the form — a goods received note while it is still a
   * draft, the posted entry once it has a number.
   */
  protected printPdf(): void {
    const supplier = this.lookups.suppliers().find((row) => row.id === Number(this.supplierId()));
    const branch = this.lookups.branches().find((row) => row.id === Number(this.branchId()));
    const payable = round2(this.net() - this.cashPayment());
    const number = this.documentNo() || 'DRAFT';

    this.print.document({
      title: this.isEdit() ? 'Purchase entry' : 'Goods received note',
      documentNo: number,
      status: this.isEdit() ? (payable > 0.5 ? 'Payable' : 'Settled') : 'Not yet posted',
      filename: `purchase-${number}`,
      meta: [
        { label: 'Received', value: prettyDate(this.receiptDate()) },
        { label: 'Branch', value: branch?.name ?? '—' },
        { label: 'Supplier reference', value: this.receiptNo() || '—' },
        { label: 'Payment', value: this.paymentMode() },
      ],
      parties: [
        { heading: 'Supplier', lines: [supplier?.supplierName ?? '—', supplier?.mobileNumber] },
        { heading: 'Notes', lines: [this.remarks()] },
      ],
      section: {
        columns: [
          { key: 'Item', align: 'left' },
          { key: 'Qty', align: 'right' },
          { key: 'Cost', align: 'right' },
          { key: 'Sales price', align: 'right' },
          { key: 'Amount', align: 'right' },
        ],
        rows: this.lines().map((line) => ({
          Item: line.itemName,
          Qty: line.quantity,
          Cost: line.purchasePrice,
          'Sales price': line.salesPrice,
          Amount: round2(line.purchasePrice * line.quantity),
        })),
        totals: {
          Qty: this.lines().reduce((total, line) => total + line.quantity, 0),
          Amount: this.gross(),
        },
      },
      totals: [
        { label: 'Gross', value: currency(this.gross()) },
        { label: 'Discount', value: `− ${currency(this.discount())}` },
        { label: 'Net', value: currency(this.net()), strong: true },
        { label: `Paid (${this.paymentMode()})`, value: currency(this.cashPayment()) },
        { label: 'Payable', value: currency(payable) },
      ],
      amountInWords: amountInWords(this.net()),
      note: this.isEdit()
        ? this.remarks() || undefined
        : 'Draft — this receipt has not been posted to stock yet.',
      signatures: ['Store keeper', 'Authorised signature'],
    });
  }

  protected async save(): Promise<void> {
    const details = this.lines().filter((line) => line.itemId && line.quantity > 0);
    if (!details.length) {
      this.toast.warn('Nothing to post', 'Add at least one line with a quantity.');
      return;
    }
    if (!this.supplierId()) {
      this.toast.warn('Supplier required', 'Choose the supplier this receipt belongs to.');
      return;
    }

    this.saving.set(true);
    const payload: Partial<PurchaseEntry> = {
      receiptDate: this.receiptDate(),
      receiptNo: this.receiptNo(),
      branchId: this.branchId() === null ? null : Number(this.branchId()),
      supplierId: Number(this.supplierId()),
      details: details.map((line) => ({
        itemId: line.itemId,
        purchasePrice: line.purchasePrice,
        salesPrice: line.salesPrice,
        quantity: line.quantity,
      })),
      discount: this.discount(),
      cashPayment: this.cashPayment(),
      paymentMode: this.paymentMode(),
      paymentAccountId: this.paymentAccountId(),
      remarks: this.remarks(),
      postBy: 'Aman',
    };

    try {
      const id = this.editingId();
      const saved = id
        ? await firstValueFrom(this.api.purchases.update(id, payload))
        : await firstValueFrom(this.api.purchases.create(payload));
      this.toast.success(
        id ? 'Purchase updated' : 'Purchase posted',
        `${saved.invoiceNo} · ${currency(saved.netAmount)}`,
      );
      await this.router.navigate(['/purchase/entries']);
    } catch {
      /* surfaced by the error interceptor */
    } finally {
      this.saving.set(false);
    }
  }
}

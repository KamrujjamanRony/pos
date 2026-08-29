import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { DiscountType, Item, PaymentMode, SalesDetail, SalesEntry } from '../../core/models';
import { Lookups } from '../../core/services/lookups';
import { PosApi } from '../../core/services/pos-api';
import { ToastService } from '../../core/services/toast';
import { clamp, currency, hueOf, initials, money, round2, today } from '../../core/util/format';
import { UiAutofocus, UiRipple } from '../../shared/directives/motion';
import { buttonClass } from '../../shared/ui/button';
import { UiButton } from '../../shared/ui/button';
import { UiCombobox } from '../../shared/ui/combobox';
import { UiCount } from '../../shared/ui/count';
import { UiIcon } from '../../shared/ui/icon';
import { UiBadge, UiEmpty, UiSkeleton } from '../../shared/ui/primitives';

interface CartLine extends SalesDetail {
  key: string;
  itemId: number;
  itemName: string;
  itemCode: string;
  salesPrice: number;
  quantity: number;
  serialNo: string;
}

@Component({
  selector: 'app-pos-terminal',
  imports: [
    RouterLink,
    UiIcon,
    UiButton,
    UiBadge,
    UiCombobox,
    UiCount,
    UiEmpty,
    UiSkeleton,
    UiRipple,
    UiAutofocus,
  ],
  template: `
    <div class="grid h-[calc(100dvh-7rem)] min-h-[36rem] gap-4 xl:grid-cols-[1fr_25rem]">
      <!-- Catalogue -->
      <section class="surface-card flex min-h-0 flex-col overflow-hidden">
        <header class="flex flex-wrap items-center gap-3 border-b border-line p-3.5">
          <div class="relative min-w-52 flex-1">
            <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint">
              <ui-icon name="barcode" [size]="16" />
            </span>
            <input
              uiAutofocus
              type="search"
              class="ctl pl-9"
              placeholder="Scan a code or search the catalogue…"
              [value]="search()"
              (input)="search.set($any($event.target).value)"
              (keydown.enter)="addFirstMatch()"
              aria-label="Search catalogue"
            />
          </div>
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="rounded-lg px-3 py-2 text-[13px] font-medium transition"
              [class]="
                category() === null
                  ? 'bg-brand text-white shadow-soft'
                  : 'bg-surface-2 text-muted hover:text-ink'
              "
              (click)="category.set(null)"
            >
              All
            </button>
            @for (c of lookups.categories(); track c.id) {
              <button
                type="button"
                class="rounded-lg px-3 py-2 text-[13px] font-medium transition"
                [class]="
                  category() === c.id
                    ? 'bg-brand text-white shadow-soft'
                    : 'bg-surface-2 text-muted hover:text-ink'
                "
                (click)="category.set(c.id)"
              >
                {{ c.name }}
              </button>
            }
          </div>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto p-3.5">
          @if (!lookups.ready()) {
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              @for (n of [1, 2, 3, 4, 5, 6, 7, 8]; track n) {
                <ui-skeleton [count]="1" [height]="96" />
              }
            </div>
          } @else if (visibleItems().length) {
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              @for (item of visibleItems(); track item.id; let i = $index) {
                <button
                  type="button"
                  uiRipple
                  class="stagger group surface-card flex flex-col items-start gap-2 p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/45 hover:shadow-card"
                  [style]="'--i:' + i"
                  (click)="addToCart(item)"
                >
                  <div class="flex w-full items-start gap-2.5">
                    <span
                      class="grid size-10 shrink-0 place-items-center rounded-xl text-[12px] font-semibold text-white transition-transform duration-200 group-hover:scale-105"
                      [style.background]="swatch(item.name)"
                    >
                      {{ short(item.name) }}
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-[13.5px] font-medium text-ink">
                        {{ item.name }}
                      </span>
                      <span class="block truncate text-[11.5px] text-faint">
                        {{ item.code }} · {{ item.categoryName }}
                      </span>
                    </span>
                  </div>
                  <div class="flex w-full items-center justify-between">
                    <span class="num text-[15px] font-semibold text-ink">
                      {{ currency(item.salesPrice) }}
                    </span>
                    @if (countOf(item.id); as count) {
                      <ui-badge tone="brand">{{ count }} in cart</ui-badge>
                    }
                  </div>
                </button>
              }
            </div>
          } @else {
            <ui-empty
              title="Nothing matches that search"
              message="Try a different code, name or category."
              icon="search"
            />
          }
        </div>
      </section>

      <!-- Cart -->
      <aside class="surface-card flex min-h-0 flex-col overflow-hidden">
        <header class="flex items-center gap-3 border-b border-line p-3.5">
          <span class="grid size-9 place-items-center rounded-xl bg-brand-soft text-brand-text">
            <ui-icon name="cart" [size]="18" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-[14px] font-semibold text-ink">Current sale</p>
            <p class="text-[12px] text-muted">
              {{ lines().length }} {{ lines().length === 1 ? 'line' : 'lines' }} ·
              {{ totalQuantity() }} units
            </p>
          </div>
          @if (lines().length) {
            <ui-button variant="ghost" size="icon" icon="trash" ariaLabel="Clear cart" (pressed)="clear()" />
          }
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
          @if (lines().length) {
            <ul class="space-y-2">
              @for (line of lines(); track line.key; let i = $index) {
                <li
                  class="rounded-xl border border-line bg-surface-2/60 p-2.5"
                  style="animation: pop 0.3s var(--ease-spring) both"
                >
                  <div class="flex items-start gap-2">
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-[13px] font-medium text-ink">{{ line.itemName }}</p>
                      <p class="num text-[11.5px] text-faint">
                        {{ currency(line.salesPrice) }} each
                      </p>
                    </div>
                    <button
                      type="button"
                      class="grid size-6 shrink-0 place-items-center rounded-lg text-faint transition hover:bg-neg-soft hover:text-neg"
                      [attr.aria-label]="'Remove ' + line.itemName"
                      (click)="removeLine(line.key)"
                    >
                      <ui-icon name="close" [size]="13" />
                    </button>
                  </div>

                  <div class="mt-2 flex items-center justify-between gap-2">
                    <div class="flex items-center rounded-lg border border-line bg-surface">
                      <button
                        type="button"
                        class="grid size-7 place-items-center rounded-l-lg text-muted transition hover:bg-surface-2 hover:text-ink"
                        [attr.aria-label]="'Decrease ' + line.itemName"
                        (click)="step(line.key, -1)"
                      >
                        <ui-icon name="minus" [size]="13" />
                      </button>
                      <input
                        type="number"
                        class="num w-11 border-x border-line bg-transparent py-1 text-center text-[13px] outline-none"
                        [value]="line.quantity"
                        [attr.aria-label]="line.itemName + ' quantity'"
                        (change)="setQuantity(line.key, $any($event.target).value)"
                      />
                      <button
                        type="button"
                        class="grid size-7 place-items-center rounded-r-lg text-muted transition hover:bg-surface-2 hover:text-ink"
                        [attr.aria-label]="'Increase ' + line.itemName"
                        (click)="step(line.key, 1)"
                      >
                        <ui-icon name="plus" [size]="13" />
                      </button>
                    </div>
                    <span class="num text-[13.5px] font-semibold text-ink">
                      {{ money(line.salesPrice * line.quantity) }}
                    </span>
                  </div>
                </li>
              }
            </ul>
          } @else {
            <ui-empty
              title="The cart is empty"
              message="Pick an item on the left, or scan a barcode into the search box."
              icon="cart"
            />
          }
        </div>

        <!-- Totals & payment -->
        <div class="border-t border-line bg-surface-2/50 p-3.5">
          <div class="space-y-2.5">
            <div>
              <label class="mb-1 block text-[11.5px] font-medium text-muted">Customer</label>
              <ui-combobox
                [options]="lookups.customers()"
                [labelOf]="customerLabel"
                [keyOf]="customerKey"
                [subOf]="customerSub"
                [(value)]="customerId"
                [compact]="true"
                [dropUp]="true"
                placeholder="Walk-in customer"
              />
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="mb-1 block text-[11.5px] font-medium text-muted" for="pos-discount">
                  Discount
                </label>
                <div class="flex">
                  <input
                    id="pos-discount"
                    type="number"
                    class="ctl ctl-sm rounded-r-none"
                    [value]="discount()"
                    (input)="discount.set(+$any($event.target).value || 0)"
                  />
                  <button
                    type="button"
                    class="rounded-r-lg border border-l-0 border-line bg-surface px-2 text-[12px] font-semibold text-brand-text transition hover:bg-surface-2"
                    [attr.aria-label]="'Discount type: ' + discountType()"
                    (click)="toggleDiscountType()"
                  >
                    {{ discountType() === 'Percent' ? '%' : '৳' }}
                  </button>
                </div>
              </div>
              <div>
                <label class="mb-1 block text-[11.5px] font-medium text-muted" for="pos-courier">
                  Courier cost
                </label>
                <input
                  id="pos-courier"
                  type="number"
                  class="ctl ctl-sm"
                  [value]="courierCost()"
                  (input)="courierCost.set(+$any($event.target).value || 0)"
                />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="mb-1 block text-[11.5px] font-medium text-muted" for="pos-mode">
                  Mode
                </label>
                <select
                  id="pos-mode"
                  class="ctl ctl-sm"
                  [value]="paymentMode()"
                  (change)="onModeChange($any($event.target).value)"
                >
                  <option value="Cash">Cash</option>
                  <option value="Bank">Bank</option>
                </select>
              </div>
              <div>
                <label class="mb-1 block text-[11.5px] font-medium text-muted" for="pos-account">
                  Account
                </label>
                <select
                  id="pos-account"
                  class="ctl ctl-sm"
                  [value]="paymentAccountId() ?? ''"
                  (change)="paymentAccountId.set(+$any($event.target).value || null)"
                >
                  @for (account of accounts(); track account.id) {
                    <option [value]="account.id">{{ account.name }}</option>
                  }
                </select>
              </div>
            </div>

            <dl class="space-y-1 pt-1 text-[13px]">
              <div class="flex justify-between">
                <dt class="text-muted">Subtotal</dt>
                <dd class="num font-medium text-ink">{{ money(gross()) }}</dd>
              </div>
              @if (discountValue() > 0) {
                <div class="flex justify-between">
                  <dt class="text-muted">Discount</dt>
                  <dd class="num font-medium text-neg">− {{ money(discountValue()) }}</dd>
                </div>
              }
              @if (courierCost() > 0) {
                <div class="flex justify-between">
                  <dt class="text-muted">Courier</dt>
                  <dd class="num font-medium text-ink">{{ money(courierCost()) }}</dd>
                </div>
              }
              <div class="flex items-baseline justify-between border-t border-line pt-2">
                <dt class="text-[13px] font-semibold text-ink">Payable</dt>
                <dd class="text-[22px] font-semibold tracking-tight text-ink">
                  <span class="mr-0.5 text-[14px] text-faint">৳</span>
                  <ui-count [value]="net()" format="money" [duration]="450" />
                </dd>
              </div>
            </dl>

            <div>
              <label class="mb-1 block text-[11.5px] font-medium text-muted" for="pos-received">
                Amount received
              </label>
              <div class="flex gap-1.5">
                <input
                  id="pos-received"
                  type="number"
                  class="ctl"
                  [value]="received()"
                  (input)="received.set(+$any($event.target).value || 0)"
                />
                <button
                  type="button"
                  class="shrink-0 rounded-xl border border-line bg-surface px-3 text-[12px] font-semibold text-brand-text transition hover:bg-surface-2"
                  (click)="received.set(net())"
                >
                  Exact
                </button>
              </div>
              <p class="mt-1.5 text-[12px]" [class]="change() >= 0 ? 'text-muted' : 'text-warn'">
                @if (change() >= 0) {
                  Change to return
                  <span class="num font-semibold text-ink">{{ money(change()) }}</span>
                } @else {
                  Remaining due
                  <span class="num font-semibold text-warn">{{ money(-change()) }}</span>
                }
              </p>
            </div>

            <ui-button
              variant="primary"
              size="lg"
              [block]="true"
              icon="checkCircle"
              [disabled]="!lines().length"
              [loading]="saving()"
              (pressed)="checkout()"
            >
              Complete sale
            </ui-button>
          </div>
        </div>
      </aside>
    </div>

    <!-- Receipt confirmation -->
    @if (lastInvoice(); as invoice) {
      <div
        class="animate-fade fixed inset-0 z-[95] grid place-items-center bg-black/55 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Sale completed"
        (click)="lastInvoice.set(null)"
      >
        <div
          class="animate-pop w-full max-w-sm overflow-hidden rounded-2xl border border-line bg-surface shadow-float"
          (click)="$event.stopPropagation()"
        >
          <div class="flex flex-col items-center gap-3 border-b border-line px-6 py-7 text-center">
            <span
              class="animate-pulse-ring grid size-14 place-items-center rounded-full bg-pos-soft text-pos"
            >
              <ui-icon name="checkCircle" [size]="28" />
            </span>
            <div>
              <p class="text-[16px] font-semibold text-ink">Sale completed</p>
              <p class="mt-0.5 font-mono text-[13px] text-brand-text">{{ invoice.invoiceNo }}</p>
            </div>
          </div>
          <dl class="space-y-2 px-6 py-5 text-[13px]">
            <div class="flex justify-between">
              <dt class="text-muted">Customer</dt>
              <dd class="font-medium text-ink">{{ invoice.customerName || 'Walk-in' }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted">Net amount</dt>
              <dd class="num font-medium text-ink">{{ currency(invoice.netAmount) }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted">Received</dt>
              <dd class="num font-medium text-ink">{{ currency(invoice.receiveAmount) }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted">Due</dt>
              <dd class="num font-medium" [class]="(invoice.dueAmount ?? 0) > 0 ? 'text-warn' : 'text-pos'">
                {{ currency(invoice.dueAmount) }}
              </dd>
            </div>
          </dl>
          <div class="flex gap-2 border-t border-line px-5 py-3.5">
            <a [class]="outlineButton" [routerLink]="['/sales/invoices']" class="flex-1">
              Open invoice list
            </a>
            <ui-button variant="primary" [block]="true" (pressed)="lastInvoice.set(null)">
              New sale
            </ui-button>
          </div>
        </div>
      </div>
    }
  `,
  host: { class: 'block' },
})
export class PosTerminalPage {
  private readonly api = inject(PosApi);
  private readonly toast = inject(ToastService);
  protected readonly lookups = inject(Lookups);

  protected readonly money = money;
  protected readonly currency = currency;
  protected readonly short = initials;
  protected readonly outlineButton = buttonClass('outline', 'md');

  protected readonly search = signal('');
  protected readonly category = signal<number | null>(null);
  protected readonly lines = signal<CartLine[]>([]);
  protected readonly customerId = signal<number | string | null>(null);
  protected readonly discount = signal(0);
  protected readonly discountType = signal<DiscountType>('Percent');
  protected readonly courierCost = signal(0);
  protected readonly paymentMode = signal<PaymentMode>('Cash');
  protected readonly paymentAccountId = signal<number | null>(null);
  protected readonly received = signal(0);
  protected readonly saving = signal(false);
  protected readonly lastInvoice = signal<SalesEntry | null>(null);

  protected readonly customerLabel = (row: { customerName: string }) => row.customerName;
  protected readonly customerKey = (row: { id: number }) => row.id;
  protected readonly customerSub = (row: { contactNumber: string }) => row.contactNumber;

  constructor() {
    void this.lookups.ensure();
    // Default the payment account once the account lists arrive.
    effect(() => {
      const accounts = this.accounts();
      if (accounts.length && !accounts.some((a) => a.id === this.paymentAccountId())) {
        this.paymentAccountId.set(accounts[0].id);
      }
    });
  }

  protected readonly accounts = computed(() =>
    this.paymentMode() === 'Cash' ? this.lookups.cashAccounts() : this.lookups.bankAccounts(),
  );

  protected readonly visibleItems = computed(() => {
    const needle = this.search().trim().toLowerCase();
    const category = this.category();
    return this.lookups
      .items()
      .filter((item) => (category ? item.categoryId === category : true))
      .filter((item) =>
        needle
          ? `${item.name} ${item.code} ${item.model} ${item.brandName ?? ''}`
              .toLowerCase()
              .includes(needle)
          : true,
      );
  });

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

  protected readonly change = computed(() => round2(this.received() - this.net()));

  protected readonly totalQuantity = computed(() =>
    this.lines().reduce((total, line) => total + line.quantity, 0),
  );

  protected swatch(name: string): string {
    return `linear-gradient(135deg, oklch(0.62 0.16 ${hueOf(name)}), oklch(0.52 0.19 ${(hueOf(name) + 40) % 360}))`;
  }

  protected countOf(itemId: number): number {
    return this.lines()
      .filter((line) => line.itemId === itemId)
      .reduce((total, line) => total + line.quantity, 0);
  }

  protected addFirstMatch(): void {
    const first = this.visibleItems()[0];
    if (first) {
      this.addToCart(first);
      this.search.set('');
    }
  }

  protected addToCart(item: Item): void {
    this.lines.update((lines) => {
      const existing = lines.find((line) => line.itemId === item.id);
      if (existing) {
        return lines.map((line) =>
          line.key === existing.key ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [
        ...lines,
        {
          key: `${item.id}-${Date.now()}`,
          itemId: item.id,
          itemName: item.name,
          itemCode: item.code,
          salesPrice: item.salesPrice,
          quantity: 1,
          serialNo: '',
        },
      ];
    });
    this.syncReceived();
  }

  protected step(key: string, delta: number): void {
    this.lines.update((lines) =>
      lines
        .map((line) =>
          line.key === key ? { ...line, quantity: clamp(line.quantity + delta, 0, 9999) } : line,
        )
        .filter((line) => line.quantity > 0),
    );
    this.syncReceived();
  }

  protected setQuantity(key: string, value: string): void {
    const quantity = clamp(Number(value) || 0, 0, 9999);
    this.lines.update((lines) =>
      lines.map((line) => (line.key === key ? { ...line, quantity } : line)).filter((line) => line.quantity > 0),
    );
    this.syncReceived();
  }

  protected removeLine(key: string): void {
    this.lines.update((lines) => lines.filter((line) => line.key !== key));
    this.syncReceived();
  }

  protected clear(): void {
    this.lines.set([]);
    this.discount.set(0);
    this.courierCost.set(0);
    this.received.set(0);
  }

  protected toggleDiscountType(): void {
    this.discountType.update((type) => (type === 'Percent' ? 'Flat' : 'Percent'));
    this.syncReceived();
  }

  protected onModeChange(mode: string): void {
    this.paymentMode.set(mode as PaymentMode);
  }

  /** Keeps "received" tracking the payable while the cashier is still building the cart. */
  private syncReceived(): void {
    this.received.set(this.net());
  }

  protected async checkout(): Promise<void> {
    if (!this.lines().length) return;
    this.saving.set(true);
    try {
      const payload: Partial<SalesEntry> = {
        invoiceDate: today(),
        branchId: this.lookups.branches()[0]?.id ?? 1,
        customerId: this.customerId() === null ? null : Number(this.customerId()),
        byReferredId: null,
        byEmployeeId: this.lookups.employees()[0]?.id ?? null,
        courierNameId: null,
        courierCost: this.courierCost(),
        courierCondition: 0,
        details: this.lines().map(({ itemId, salesPrice, quantity, serialNo }) => ({
          itemId,
          salesPrice,
          quantity,
          serialNo,
        })),
        discount: this.discount(),
        discountType: this.discountType(),
        receiveAmount: Math.min(this.received(), this.net()),
        paymentMode: this.paymentMode(),
        paymentAccountId: this.paymentAccountId(),
        remarks: 'Counter sale',
        postBy: 'Aman',
      };
      const invoice = await firstValueFrom(this.api.sales.create(payload));
      this.lastInvoice.set(invoice);
      this.toast.success('Sale recorded', `${invoice.invoiceNo} · ${currency(invoice.netAmount)}`);
      this.clear();
      this.customerId.set(null);
    } catch {
      /* surfaced by the error interceptor */
    } finally {
      this.saving.set(false);
    }
  }
}

import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { DiscountType, Item, PaymentMode, SalesDetail, SalesEntry } from '../../core/models';
import { Lookups } from '../../core/services/lookups';
import { PosApi } from '../../core/services/pos-api';
import { PrintService } from '../../core/services/print';
import { ToastService } from '../../core/services/toast';
import {
  amountInWords,
  clamp,
  currency,
  hueOf,
  initials,
  money,
  prettyDate,
  round2,
  today,
} from '../../core/util/format';
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
    <div
      class="xl:grid xl:h-[calc(100dvh-7rem)] xl:min-h-144 xl:grid-cols-[minmax(0,1fr)_25rem] xl:gap-4"
    >
      <!-- Catalogue. Below xl it grows with the page and the cart lives in a sheet. -->
      <section class="surface-card flex flex-col xl:min-h-0 xl:overflow-hidden">
        <header
          class="sticky top-0 z-10 flex flex-wrap items-center gap-2.5 rounded-t-[inherit] border-b border-line bg-surface p-3 sm:gap-3 sm:p-3.5 xl:static"
        >
          <div class="relative min-w-52 flex-1 basis-full sm:basis-auto">
            <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint">
              <ui-icon name="barcode" [size]="16" />
            </span>
            <input
              uiAutofocus
              type="search"
              enterkeyhint="search"
              class="ctl pl-9"
              placeholder="Scan a code or search the catalogue…"
              [value]="search()"
              (input)="search.set($any($event.target).value)"
              (keydown.enter)="addFirstMatch()"
              aria-label="Search catalogue"
            />
          </div>
          <div
            class="flex max-w-full shrink-0 items-center gap-1.5 overflow-x-auto overscroll-x-contain scrollbar-none"
            role="group"
            aria-label="Filter by category"
          >
            <button
              type="button"
              class="shrink-0 rounded-lg px-3 py-2 text-[13px] font-medium whitespace-nowrap transition"
              [class]="
                category() === null
                  ? 'bg-brand text-white shadow-soft'
                  : 'bg-surface-2 text-muted hover:text-ink'
              "
              [attr.aria-pressed]="category() === null"
              (click)="category.set(null)"
            >
              All
            </button>
            @for (c of lookups.categories(); track c.id) {
              <button
                type="button"
                class="shrink-0 rounded-lg px-3 py-2 text-[13px] font-medium whitespace-nowrap transition"
                [class]="
                  category() === c.id
                    ? 'bg-brand text-white shadow-soft'
                    : 'bg-surface-2 text-muted hover:text-ink'
                "
                [attr.aria-pressed]="category() === c.id"
                (click)="category.set(c.id)"
              >
                {{ c.name }}
              </button>
            }
          </div>
        </header>

        <div class="p-2.5 sm:p-3.5 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
          @if (!lookups.ready()) {
            <div
              class="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4"
            >
              @for (n of [1, 2, 3, 4, 5, 6, 7, 8]; track n) {
                <ui-skeleton [count]="1" [height]="96" />
              }
            </div>
          } @else if (visibleItems().length) {
            <div
              class="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4"
            >
              @for (item of visibleItems(); track item.id; let i = $index) {
                <button
                  type="button"
                  uiRipple
                  class="stagger group surface-card flex min-w-0 flex-col items-start gap-2 p-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/45 hover:shadow-card sm:p-3"
                  [style]="'--i:' + i"
                  (click)="addToCart(item)"
                >
                  <div class="flex w-full items-start gap-2 sm:gap-2.5">
                    <span
                      class="grid size-8 shrink-0 place-items-center rounded-lg text-[11px] font-semibold text-white transition-transform duration-200 group-hover:scale-105 sm:size-10 sm:rounded-xl sm:text-[12px]"
                      [style.background]="swatch(item.name)"
                    >
                      {{ short(item.name) }}
                    </span>
                    <span class="min-w-0 flex-1">
                      <span
                        class="block truncate text-[13px] font-medium text-ink sm:text-[13.5px]"
                      >
                        {{ item.name }}
                      </span>
                      <span class="block truncate text-[11.5px] text-faint">
                        {{ item.code }} · {{ item.categoryName }}
                      </span>
                    </span>
                  </div>
                  <div class="flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <span class="num text-[14px] font-semibold text-ink sm:text-[15px]">
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

      <!-- Opens the cart sheet on phones and tablets; pinned to the bottom of the page. -->
      <div class="sticky bottom-3 z-20 mt-3 xl:hidden">
        <button
          #cartTrigger
          type="button"
          class="flex w-full items-center gap-3 rounded-2xl bg-brand px-3.5 py-3 text-left text-white shadow-float transition active:scale-[0.99]"
          aria-controls="pos-cart"
          [attr.aria-expanded]="cartOpen()"
          (click)="openCart()"
        >
          <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-white/15">
            <ui-icon name="cart" [size]="18" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-[14px] font-semibold">Review &amp; pay</span>
            <span class="block truncate text-[12px]">
              {{ lines().length }} {{ lines().length === 1 ? 'line' : 'lines' }} ·
              {{ totalQuantity() }} units
            </span>
          </span>
          <span class="num shrink-0 text-[16px] font-semibold">{{ currency(net()) }}</span>
          <ui-icon name="chevronUp" [size]="16" class="shrink-0" />
        </button>
      </div>

      @if (cartOpen()) {
        <div
          class="animate-fade fixed inset-0 z-65 bg-black/50 backdrop-blur-sm xl:hidden"
          aria-hidden="true"
          (click)="closeCart()"
        ></div>
      }

      <!-- Cart: a bottom sheet on phones, a floating panel on tablets, a column on desktop.
           Visibility transitions only on close, so the sheet is focusable the moment it opens. -->
      <div
        id="pos-cart"
        class="surface-card fixed inset-x-0 bottom-0 z-70 flex max-h-[92dvh] flex-col overflow-hidden rounded-b-none duration-300 ease-out-expo sm:inset-x-auto sm:top-4 sm:right-4 sm:bottom-4 sm:max-h-none sm:w-104 sm:rounded-b-xl2 xl:visible xl:static xl:z-auto xl:min-h-0 xl:w-auto xl:translate-x-0 xl:translate-y-0 xl:transition-none"
        [class]="
          cartOpen()
            ? 'visible transition-[translate]'
            : 'invisible translate-y-full transition-[translate,visibility] sm:translate-x-[calc(100%+2rem)] sm:translate-y-0'
        "
        [attr.role]="cartOpen() ? 'dialog' : 'region'"
        [attr.aria-modal]="cartOpen() || null"
        aria-labelledby="pos-cart-title"
      >
        <header class="relative flex items-center gap-3 border-b border-line p-3.5 pt-5 sm:pt-3.5">
          <span
            class="absolute top-2 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-line sm:hidden"
            aria-hidden="true"
          ></span>
          <span
            class="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-text"
          >
            <ui-icon name="cart" [size]="18" />
          </span>
          <div class="min-w-0 flex-1">
            <p id="pos-cart-title" class="text-[14px] font-semibold text-ink">Current sale</p>
            <p class="text-[12px] text-muted">
              {{ lines().length }} {{ lines().length === 1 ? 'line' : 'lines' }} ·
              {{ totalQuantity() }} units
            </p>
          </div>
          @if (lines().length) {
            <ui-button
              variant="ghost"
              size="icon"
              icon="trash"
              ariaLabel="Clear cart"
              (pressed)="clear()"
            />
          }
          <button
            #cartClose
            type="button"
            class="grid size-9 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-ink xl:hidden"
            aria-label="Close cart"
            (click)="closeCart()"
          >
            <ui-icon name="close" [size]="16" />
          </button>
        </header>

        <!-- One scroller on small screens; on desktop only the lines scroll once space runs out. -->
        <div class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          <div class="px-3.5 py-3 xl:min-h-40 xl:flex-1 xl:overflow-y-auto">
            @if (lines().length) {
              <ul class="space-y-2">
                @for (line of lines(); track line.key; let i = $index) {
                  <li
                    class="rounded-xl border border-line bg-surface-2/60 p-2.5"
                    style="animation: pop 0.3s var(--ease-spring) both"
                  >
                    <div class="flex items-start gap-2">
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-[13px] font-medium text-ink">
                          {{ line.itemName }}
                        </p>
                        <p class="num text-[11.5px] text-faint">
                          {{ currency(line.salesPrice) }} each
                        </p>
                      </div>
                      <button
                        type="button"
                        class="grid size-8 shrink-0 place-items-center rounded-lg text-faint transition hover:bg-neg-soft hover:text-neg xl:size-6"
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
                          class="grid size-9 place-items-center rounded-l-lg text-muted transition hover:bg-surface-2 hover:text-ink xl:size-7"
                          [attr.aria-label]="'Decrease ' + line.itemName"
                          (click)="step(line.key, -1)"
                        >
                          <ui-icon name="minus" [size]="13" />
                        </button>
                        <input
                          type="number"
                          inputmode="numeric"
                          class="num w-12 self-stretch border-x border-line bg-transparent text-center text-[13px] outline-none xl:w-11"
                          [value]="line.quantity"
                          [attr.aria-label]="line.itemName + ' quantity'"
                          (change)="setQuantity(line.key, $any($event.target).value)"
                        />
                        <button
                          type="button"
                          class="grid size-9 place-items-center rounded-r-lg text-muted transition hover:bg-surface-2 hover:text-ink xl:size-7"
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
                message="Pick an item from the catalogue, or scan a barcode into the search box."
                icon="cart"
              />
            }
          </div>

          <!-- Totals & payment -->
          <div class="mt-auto shrink-0 space-y-2.5 border-t border-line bg-surface-2/50 p-3.5">
            <div>
              <label class="mb-1 block text-[11.5px] font-medium text-muted" for="pos-customer">
                Customer
              </label>
              <ui-combobox
                inputId="pos-customer"
                [options]="lookups.customers()"
                [labelOf]="customerLabel"
                [keyOf]="idOf"
                [subOf]="customerSub"
                [(value)]="customerId"
                [compact]="true"
                [dropUp]="true"
                placeholder="Walk-in customer"
              />
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div class="min-w-0">
                <label class="mb-1 block text-[11.5px] font-medium text-muted" for="pos-employee">
                  Sold by
                </label>
                <ui-combobox
                  inputId="pos-employee"
                  [options]="lookups.employees()"
                  [labelOf]="employeeLabel"
                  [keyOf]="idOf"
                  [(value)]="employeeId"
                  [compact]="true"
                  [dropUp]="true"
                  placeholder="Employee"
                  searchPlaceholder="Search employees…"
                />
              </div>
              <div class="min-w-0">
                <label class="mb-1 block text-[11.5px] font-medium text-muted" for="pos-referred">
                  Referred by
                </label>
                <ui-combobox
                  inputId="pos-referred"
                  [options]="lookups.referrals()"
                  [labelOf]="nameOf"
                  [keyOf]="idOf"
                  [(value)]="referredId"
                  [compact]="true"
                  [dropUp]="true"
                  placeholder="None"
                  searchPlaceholder="Search referrals…"
                />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div class="min-w-0">
                <label class="mb-1 block text-[11.5px] font-medium text-muted" for="pos-discount">
                  Discount
                </label>
                <div class="flex">
                  <input
                    id="pos-discount"
                    type="number"
                    inputmode="decimal"
                    class="ctl ctl-sm min-w-0 rounded-r-none"
                    [value]="discount()"
                    (input)="discount.set(+$any($event.target).value || 0)"
                  />
                  <button
                    type="button"
                    class="min-w-9 shrink-0 rounded-r-lg border border-l-0 border-line bg-surface px-2 text-[12px] font-semibold text-brand-text transition hover:bg-surface-2"
                    [attr.aria-label]="'Discount type: ' + discountType()"
                    (click)="toggleDiscountType()"
                  >
                    {{ discountType() === 'Percent' ? '%' : '৳' }}
                  </button>
                </div>
              </div>
              <div class="min-w-0">
                <label class="mb-1 block text-[11.5px] font-medium text-muted" for="pos-courier">
                  Courier cost
                </label>
                <input
                  id="pos-courier"
                  type="number"
                  inputmode="decimal"
                  class="ctl ctl-sm"
                  [value]="courierCost()"
                  (input)="courierCost.set(+$any($event.target).value || 0)"
                />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div class="min-w-0">
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
              <div class="min-w-0">
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
                  inputmode="decimal"
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
          </div>
        </div>

        <!-- Pinned, so the sale can be completed without scrolling the sheet to the end. -->
        <div class="shrink-0 border-t border-line bg-surface-2/50 p-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
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
              <dd
                class="num font-medium"
                [class]="(invoice.dueAmount ?? 0) > 0 ? 'text-warn' : 'text-pos'"
              >
                {{ currency(invoice.dueAmount) }}
              </dd>
            </div>
          </dl>
          <div class="flex flex-col gap-2 border-t border-line px-5 py-3.5">
            <div class="flex gap-2">
              <ui-button
                variant="outline"
                icon="printer"
                [block]="true"
                (pressed)="printReceipt(invoice)"
              >
                Print receipt
              </ui-button>
              <ui-button
                variant="outline"
                icon="file"
                [block]="true"
                (pressed)="printInvoice(invoice)"
              >
                A4 invoice
              </ui-button>
            </div>
            <div class="flex gap-2">
              <a [class]="outlineButton" [routerLink]="['/sales/invoices']" class="flex-1">
                Open invoice list
              </a>
              <ui-button variant="primary" [block]="true" (pressed)="lastInvoice.set(null)">
                New sale
              </ui-button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
  host: {
    class: 'block',
    '(document:keydown.escape)': 'onEscape($event)',
    '(window:resize)': 'onResize()',
  },
})
export class PosTerminalPage {
  private readonly api = inject(PosApi);
  private readonly toast = inject(ToastService);
  private readonly print = inject(PrintService);
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
  private readonly lastLines = signal<CartLine[]>([]);
  protected readonly employeeId = signal<number | string | null>(null);
  protected readonly referredId = signal<number | string | null>(null);
  /** The cart sheet on phones and tablets; on desktop the cart is always on screen. */
  protected readonly cartOpen = signal(false);

  private readonly cartTrigger = viewChild<ElementRef<HTMLElement>>('cartTrigger');
  private readonly cartClose = viewChild<ElementRef<HTMLElement>>('cartClose');
  private readonly injector = inject(Injector);

  protected readonly idOf = (row: { id: number }) => row.id;
  protected readonly nameOf = (row: { name: string }) => row.name;
  protected readonly customerLabel = (row: { customerName: string }) => row.customerName;
  protected readonly customerSub = (row: { contactNumber: string }) => row.contactNumber;
  protected readonly employeeLabel = (row: { employeeName: string }) => row.employeeName;

  constructor() {
    void this.lookups.ensure();
    // Default the payment account once the account lists arrive.
    effect(() => {
      const accounts = this.accounts();
      if (accounts.length && !accounts.some((a) => a.id === this.paymentAccountId())) {
        this.paymentAccountId.set(accounts[0].id);
      }
    });
    // Credit the sale to the first employee until the cashier picks someone else.
    effect(() => {
      const first = this.lookups.employees()[0];
      if (first && untracked(this.employeeId) === null) {
        this.employeeId.set(first.id);
      }
    });
  }

  /** Growing the window to desktop puts the cart back in its column, so drop the sheet. */
  protected onResize(): void {
    if (this.cartOpen() && matchMedia('(min-width: 80rem)').matches) {
      this.cartOpen.set(false);
    }
  }

  protected openCart(): void {
    this.cartOpen.set(true);
    afterNextRender(() => this.cartClose()?.nativeElement.focus(), { injector: this.injector });
  }

  protected closeCart(restoreFocus = true): void {
    if (!this.cartOpen()) return;
    this.cartOpen.set(false);
    if (restoreFocus) this.cartTrigger()?.nativeElement.focus();
  }

  /** Escape dismisses the receipt first, then the cart sheet — unless a popup inside already used it. */
  protected onEscape(event: Event): void {
    if (event.defaultPrevented) return;
    if (this.lastInvoice()) {
      this.lastInvoice.set(null);
    } else {
      this.closeCart();
    }
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
      lines
        .map((line) => (line.key === key ? { ...line, quantity } : line))
        .filter((line) => line.quantity > 0),
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

  /** The lines as they were rung up, falling back to what the API echoed back. */
  private receiptLines(invoice: SalesEntry) {
    const snapshot = this.lastLines();
    if (snapshot.length) {
      return snapshot.map((line) => ({
        name: line.itemName,
        note: line.serialNo || undefined,
        quantity: line.quantity,
        rate: line.salesPrice,
        amount: round2(line.salesPrice * line.quantity),
      }));
    }
    return invoice.details.map((line) => ({
      name: line.itemName ?? 'Item',
      note: line.serialNo || undefined,
      quantity: line.quantity,
      rate: line.salesPrice,
      amount: round2(line.salesPrice * line.quantity),
    }));
  }

  /** 80mm till receipt for the customer standing at the counter. */
  protected printReceipt(invoice: SalesEntry): void {
    const discount = (invoice.grossAmount ?? 0) - (invoice.netAmount ?? 0) + invoice.courierCost;
    this.print.receipt({
      documentNo: invoice.invoiceNo,
      filename: `receipt-${invoice.invoiceNo}`,
      meta: [
        { label: 'Date', value: prettyDate(invoice.invoiceDate) },
        { label: 'Customer', value: invoice.customerName || 'Walk-in' },
        { label: 'Payment', value: invoice.paymentMode },
      ],
      lines: this.receiptLines(invoice),
      totals: [
        { label: 'Gross', value: money(invoice.grossAmount) },
        ...(discount > 0.005 ? [{ label: 'Discount', value: `- ${money(discount)}` }] : []),
        ...(invoice.courierCost ? [{ label: 'Courier', value: money(invoice.courierCost) }] : []),
        { label: 'Net', value: currency(invoice.netAmount), strong: true },
        { label: 'Received', value: money(invoice.receiveAmount) },
        { label: 'Due', value: money(invoice.dueAmount) },
      ],
    });
  }

  /** The same sale on a letterhead, for a customer who wants an A4 invoice. */
  protected printInvoice(invoice: SalesEntry): void {
    const discount = (invoice.grossAmount ?? 0) - (invoice.netAmount ?? 0) + invoice.courierCost;
    this.print.document({
      title: 'Sales invoice',
      documentNo: invoice.invoiceNo,
      status: (invoice.dueAmount ?? 0) > 0.5 ? 'Due' : 'Paid',
      filename: `invoice-${invoice.invoiceNo}`,
      meta: [
        { label: 'Date', value: prettyDate(invoice.invoiceDate) },
        { label: 'Branch', value: invoice.branchName ?? '—' },
        { label: 'Payment', value: invoice.paymentMode },
      ],
      parties: [{ heading: 'Billed to', lines: [invoice.customerName || 'Walk-in customer'] }],
      section: {
        columns: [
          { key: 'Item', align: 'left' },
          { key: 'Qty', align: 'right' },
          { key: 'Rate', align: 'right' },
          { key: 'Amount', align: 'right' },
        ],
        rows: this.receiptLines(invoice).map((line) => ({
          Item: line.name,
          Qty: line.quantity,
          Rate: line.rate,
          Amount: line.amount,
        })),
        totals: { Amount: invoice.grossAmount ?? 0 },
      },
      totals: [
        { label: 'Gross', value: currency(invoice.grossAmount) },
        { label: 'Discount', value: `− ${currency(discount)}` },
        { label: 'Net payable', value: currency(invoice.netAmount), strong: true },
        { label: 'Received', value: currency(invoice.receiveAmount) },
        { label: 'Due', value: currency(invoice.dueAmount) },
      ],
      amountInWords: amountInWords(invoice.netAmount),
      signatures: ['Received by', 'For the counter'],
    });
  }

  /** Keeps "received" tracking the payable while the cashier is still building the cart. */
  private syncReceived(): void {
    this.received.set(this.net());
  }

  protected async checkout(): Promise<void> {
    if (!this.lines().length) return;
    this.saving.set(true);
    // Kept for the receipt: `clear()` empties the cart the moment the sale posts.
    const lines = this.lines();
    try {
      const payload: Partial<SalesEntry> = {
        invoiceDate: today(),
        branchId: this.lookups.branches()[0]?.id ?? 1,
        customerId: this.customerId() === null ? null : Number(this.customerId()),
        byReferredId: this.referredId() === null ? null : Number(this.referredId()),
        byEmployeeId: this.employeeId() === null ? null : Number(this.employeeId()),
        courierNameId: null,
        courierCost: this.courierCost(),
        courierCondition: 0,
        details: lines.map(({ itemId, salesPrice, quantity, serialNo }) => ({
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
      this.lastLines.set(lines);
      this.toast.success('Sale recorded', `${invoice.invoiceNo} · ${currency(invoice.netAmount)}`);
      this.clear();
      // The receipt dialog takes over, so focus stays with it rather than the trigger.
      this.closeCart(false);
      this.customerId.set(null);
      // The same cashier rings up the next sale; the referral belonged to this customer.
      this.referredId.set(null);
    } catch {
      /* surfaced by the error interceptor */
    } finally {
      this.saving.set(false);
    }
  }
}

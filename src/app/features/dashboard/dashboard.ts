import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PosApi } from '../../core/services/pos-api';
import { Lookups } from '../../core/services/lookups';
import {
  addDays,
  compact,
  currency,
  money,
  prettyDate,
  shortDate,
  sum,
  today,
} from '../../core/util/format';
import { UiReveal } from '../../shared/directives/motion';
import { buttonClass } from '../../shared/ui/button';
import { UiColumns, UiDonut, UiMeter, type Point } from '../../shared/ui/charts';
import { UiIcon } from '../../shared/ui/icon';
import { UiSegmented } from '../../shared/ui/overlays';
import { UiBadge, UiCard, UiEmpty, UiPageHeader, UiSkeleton } from '../../shared/ui/primitives';
import { UiStat } from '../../shared/ui/stat';
import type {
  CashBookRow,
  DailySalesRow,
  GrossProfitRow,
  PartyBalanceRow,
  SalesEntry,
  StockRow,
  TopItemRow,
} from '../../core/models';

type Range = 7 | 30 | 90;

@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink,
    UiPageHeader,
    UiCard,
    UiBadge,
    UiStat,
    UiColumns,
    UiDonut,
    UiMeter,
    UiIcon,
    UiSegmented,
    UiSkeleton,
    UiEmpty,
    UiReveal,
  ],
  template: `
    <div class="space-y-5">
      <ui-page-header
        icon="dashboard"
        title="Dashboard"
        [subtitle]="'Trading performance for ' + rangeLabel()"
      >
        <ui-segmented
          [options]="rangeOptions"
          [(value)]="range"
          ariaLabel="Reporting period"
        />
        <a [class]="primaryButton" routerLink="/pos">
          <ui-icon name="zap" [size]="17" />
          Open terminal
        </a>
      </ui-page-header>

      <!-- Headline figures -->
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ui-stat
          label="Net sales"
          [value]="netSales()"
          format="money"
          prefix="৳"
          icon="receipt"
          [series]="1"
          [delta]="salesDelta()"
          [deltaCaption]="'vs previous ' + range() + ' days'"
          [trend]="salesTrend()"
        />
        <ui-stat
          label="Gross profit"
          [value]="profit()"
          format="money"
          prefix="৳"
          icon="trendUp"
          [series]="3"
          [delta]="marginPercent()"
          deltaCaption="Average margin on sales"
          [trend]="profitTrend()"
        />
        <ui-stat
          label="Receivables"
          [value]="receivables()"
          format="money"
          prefix="৳"
          icon="wallet"
          [series]="2"
          [upIsGood]="false"
          [delta]="overdueShare()"
          deltaCaption="Share of customers carrying a balance"
        />
        <ui-stat
          label="Cash & bank"
          [value]="liquidity()"
          format="money"
          prefix="৳"
          icon="bank"
          [series]="6"
          [deltaCaption]="accounts().length + ' accounts in the book'"
        />
      </div>

      <!-- Sales trend + category mix -->
      <div class="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <ui-card
          heading="Net sales by day"
          [subheading]="rangeLabel()"
          icon="chart"
          [padded]="false"
          uiReveal
        >
          <div card-actions class="hidden text-right sm:block">
            <p class="text-[11px] tracking-wide text-faint uppercase">Busiest day</p>
            <p class="text-[13px] font-semibold text-ink">{{ busiestDay() }}</p>
          </div>
          <div class="p-4">
            @if (loading()) {
              <ui-skeleton [count]="1" [height]="200" />
            } @else if (salesSeries().length) {
              <ui-columns
                [data]="salesSeries()"
                [height]="210"
                color="var(--viz-1)"
                ariaLabel="Net sales by day"
              />
            } @else {
              <ui-empty title="No sales in this window" icon="receipt" />
            }
          </div>
        </ui-card>

        <ui-card heading="Sales mix by category" icon="pie" uiReveal>
          @if (loading()) {
            <ui-skeleton [count]="4" [height]="26" />
          } @else if (categoryMix().length) {
            <ui-donut [data]="categoryMix()" caption="Net sales" />
          } @else {
            <ui-empty title="Nothing sold yet" icon="tag" />
          }
        </ui-card>
      </div>

      <!-- Best sellers + low stock -->
      <div class="grid gap-4 xl:grid-cols-2">
        <ui-card heading="Best sellers" subheading="Ranked by value" icon="sparkles" uiReveal>
          <a card-actions [class]="ghostButton" routerLink="/reports/top-items">Full report</a>
          @if (loading()) {
            <ui-skeleton [count]="5" [height]="34" />
          } @else {
            <ol class="space-y-3.5">
              @for (item of bestSellers(); track item.itemId; let i = $index) {
                <li class="stagger flex items-center gap-3" [style]="'--i:' + i">
                  <span
                    class="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-[12px] font-semibold text-muted"
                  >
                    {{ i + 1 }}
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-baseline justify-between gap-3">
                      <p class="truncate text-[13.5px] font-medium text-ink">{{ item.itemName }}</p>
                      <p class="num shrink-0 text-[13px] font-semibold text-ink">
                        {{ money(item.amount) }}
                      </p>
                    </div>
                    <div class="mt-1.5 flex items-center gap-2.5">
                      <ui-meter
                        [value]="item.amount"
                        [max]="topAmount()"
                        [color]="'var(--viz-1)'"
                        [ariaLabel]="item.itemName + ' share of sales'"
                      />
                      <span class="num w-14 shrink-0 text-right text-[11.5px] text-faint">
                        {{ item.quantity }} pcs
                      </span>
                    </div>
                  </div>
                </li>
              } @empty {
                <ui-empty title="No item sales in range" icon="box" />
              }
            </ol>
          }
        </ui-card>

        <ui-card heading="Reorder watchlist" subheading="At or below reorder level" icon="alert" uiReveal>
          <a card-actions [class]="ghostButton" routerLink="/inventory/stock">Stock balance</a>
          @if (loading()) {
            <ui-skeleton [count]="5" [height]="34" />
          } @else {
            <ul class="divide-y divide-line">
              @for (row of lowStock(); track row.itemId + '-' + row.branchId; let i = $index) {
                <li class="stagger flex items-center gap-3 py-2.5 first:pt-0" [style]="'--i:' + i">
                  <span
                    class="grid size-9 shrink-0 place-items-center rounded-xl"
                    [class]="row.balance <= 0 ? 'bg-neg-soft text-neg' : 'bg-warn-soft text-warn'"
                  >
                    <ui-icon name="box" [size]="16" />
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-[13.5px] font-medium text-ink">{{ row.itemName }}</p>
                    <p class="truncate text-[12px] text-faint">
                      {{ row.branchName }} · reorder at {{ row.reorderQuantity }}
                    </p>
                  </div>
                  <ui-badge [tone]="row.balance <= 0 ? 'neg' : 'warn'">
                    {{ row.balance }} left
                  </ui-badge>
                </li>
              } @empty {
                <ui-empty
                  title="Every item is above its reorder level"
                  message="Nothing needs restocking right now."
                  icon="checkCircle"
                />
              }
            </ul>
          }
        </ui-card>
      </div>

      <!-- Recent invoices -->
      <ui-card heading="Latest invoices" icon="receipt" [padded]="false" uiReveal>
        <a card-actions [class]="ghostButton" routerLink="/sales/invoices">All invoices</a>
        @if (loading()) {
          <div class="p-4"><ui-skeleton [count]="5" [height]="40" /></div>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead>
                <tr class="border-b border-line bg-surface-2/60">
                  <th class="px-4 py-2.5 text-[11px] font-semibold tracking-wider text-faint uppercase">
                    Invoice
                  </th>
                  <th class="px-4 py-2.5 text-[11px] font-semibold tracking-wider text-faint uppercase">
                    Customer
                  </th>
                  <th
                    class="hidden px-4 py-2.5 text-[11px] font-semibold tracking-wider text-faint uppercase md:table-cell"
                  >
                    Date
                  </th>
                  <th class="px-4 py-2.5 text-right text-[11px] font-semibold tracking-wider text-faint uppercase">
                    Net
                  </th>
                  <th class="px-4 py-2.5 text-right text-[11px] font-semibold tracking-wider text-faint uppercase">
                    Due
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (invoice of recent(); track invoice.id; let i = $index) {
                  <tr class="stagger border-b border-line/70 last:border-0 hover:bg-surface-2/60" [style]="'--i:' + i">
                    <td class="px-4 py-2.5 font-mono text-[12.5px] text-brand-text">
                      {{ invoice.invoiceNo }}
                    </td>
                    <td class="px-4 py-2.5 font-medium text-ink">{{ invoice.customerName }}</td>
                    <td class="hidden px-4 py-2.5 text-muted md:table-cell">
                      {{ date(invoice.invoiceDate) }}
                    </td>
                    <td class="num px-4 py-2.5 text-right font-medium">
                      {{ money(invoice.netAmount) }}
                    </td>
                    <td class="px-4 py-2.5 text-right">
                      @if ((invoice.dueAmount ?? 0) > 0.5) {
                        <ui-badge tone="warn">{{ money(invoice.dueAmount) }}</ui-badge>
                      } @else {
                        <ui-badge tone="pos">Settled</ui-badge>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="5">
                      <ui-empty title="No invoices yet" icon="receipt" />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </ui-card>
    </div>
  `,
  host: { class: 'block' },
})
export class DashboardPage {
  private readonly api = inject(PosApi);
  private readonly lookups = inject(Lookups);

  protected readonly money = money;
  protected readonly date = prettyDate;
  protected readonly primaryButton = buttonClass('primary', 'md');
  protected readonly ghostButton = buttonClass('ghost', 'sm');

  protected readonly range = signal<Range>(30);
  protected readonly rangeOptions = [
    { value: 7 as Range, label: '7 days' },
    { value: 30 as Range, label: '30 days' },
    { value: 90 as Range, label: '90 days' },
  ];

  protected readonly loading = signal(true);
  private readonly daily = signal<DailySalesRow[]>([]);
  private readonly previousDaily = signal<DailySalesRow[]>([]);
  private readonly profits = signal<GrossProfitRow[]>([]);
  private readonly top = signal<TopItemRow[]>([]);
  private readonly balances = signal<PartyBalanceRow[]>([]);
  protected readonly accounts = signal<CashBookRow[]>([]);
  protected readonly recent = signal<SalesEntry[]>([]);
  private readonly stock = signal<StockRow[]>([]);

  constructor() {
    void this.lookups.ensure();
    // Re-reads the books whenever the reporting window changes.
    effect(() => {
      this.range();
      void this.load();
    });
  }

  protected readonly rangeLabel = computed(() => {
    const from = addDays(today(), -(this.range() - 1));
    return `${shortDate(from)} – ${shortDate(today())}`;
  });

  protected readonly netSales = computed(() => sum(this.daily(), (row) => row.netAmount));
  protected readonly profit = computed(() => sum(this.profits(), (row) => row.profit));
  protected readonly receivables = computed(() =>
    sum(this.balances().filter((row) => row.balance > 0), (row) => row.balance),
  );
  protected readonly liquidity = computed(() => sum(this.accounts(), (row) => row.balance));

  protected readonly salesDelta = computed(() => {
    const previous = sum(this.previousDaily(), (row) => row.netAmount);
    if (!previous) return null;
    return ((this.netSales() - previous) / previous) * 100;
  });

  protected readonly marginPercent = computed(() => {
    const sales = sum(this.profits(), (row) => row.salesAmount);
    return sales ? (this.profit() / sales) * 100 : 0;
  });

  protected readonly overdueShare = computed(() => {
    const rows = this.balances();
    if (!rows.length) return 0;
    return (rows.filter((row) => row.balance > 0).length / rows.length) * 100;
  });

  protected readonly salesSeries = computed<Point[]>(() =>
    this.daily().map((row) => ({ label: shortDate(row.date), value: row.netAmount })),
  );

  protected readonly salesTrend = computed(() => this.daily().slice(-12).map((row) => row.netAmount));
  protected readonly profitTrend = computed(() => this.profits().slice(-12).map((row) => row.profit));

  protected readonly busiestDay = computed(() => {
    const best = [...this.daily()].sort((a, b) => b.netAmount - a.netAmount)[0];
    return best ? `${shortDate(best.date)} · ${currency(best.netAmount)}` : '—';
  });

  protected readonly bestSellers = computed(() => this.top().slice(0, 6));
  protected readonly topAmount = computed(() => this.top()[0]?.amount ?? 1);

  /** Category mix is derived from the item catalogue plus ranked item sales. */
  protected readonly categoryMix = computed<Point[]>(() => {
    const items = this.lookups.items();
    const grouped = new Map<string, number>();
    for (const row of this.top()) {
      const category = items.find((item) => item.id === row.itemId)?.categoryName ?? 'Unclassified';
      grouped.set(category, (grouped.get(category) ?? 0) + row.amount);
    }
    return [...grouped.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  });

  protected readonly lowStock = computed(() =>
    this.stock()
      .filter((row) => row.balance <= row.reorderQuantity)
      .sort((a, b) => a.balance - b.balance)
      .slice(0, 6),
  );

  protected readonly compactValue = compact;

  private async load(): Promise<void> {
    this.loading.set(true);
    const span = this.range();
    const from = addDays(today(), -(span - 1));
    const to = today();
    const previousFrom = addDays(from, -span);
    const previousTo = addDays(from, -1);

    try {
      const [daily, previous, profits, top, balances, accounts, recent, stock] = await Promise.all([
        firstValueFrom(this.api.dailySales({ fromDate: from, toDate: to })),
        firstValueFrom(this.api.dailySales({ fromDate: previousFrom, toDate: previousTo })),
        firstValueFrom(this.api.grossProfit({ fromDate: from, toDate: to })),
        firstValueFrom(this.api.topItems({ fromDate: from, toDate: to, top: 8, rankBy: 'Value' })),
        firstValueFrom(this.api.customerBalances()),
        firstValueFrom(this.api.cashBalance()),
        firstValueFrom(this.api.sales.search({})),
        firstValueFrom(this.api.stock()),
      ]);

      this.daily.set(daily);
      this.previousDaily.set(previous);
      this.profits.set(profits);
      this.top.set(top);
      this.balances.set(balances);
      this.accounts.set(accounts);
      this.recent.set(recent.slice(0, 8));
      this.stock.set(stock);
    } finally {
      this.loading.set(false);
    }
  }
}

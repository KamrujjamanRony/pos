import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { StaffSalesRow } from '../../core/models';
import { PosApi } from '../../core/services/pos-api';
import { addDays, currency, downloadCsv, money, sum, today } from '../../core/util/format';
import { UiColumns, UiMeter, type Point } from '../../shared/ui/charts';
import { UiFilterBar } from '../../shared/ui/filter-bar';
import { UiIcon } from '../../shared/ui/icon';
import { UiCard, UiEmpty, UiPageHeader, UiSkeleton } from '../../shared/ui/primitives';
import { UiStat } from '../../shared/ui/stat';

@Component({
  selector: 'app-staff-sales-report',
  imports: [
    UiPageHeader,
    UiFilterBar,
    UiCard,
    UiStat,
    UiColumns,
    UiMeter,
    UiIcon,
    UiEmpty,
    UiSkeleton,
  ],
  template: `
    <div class="space-y-4">
      <ui-page-header
        icon="users"
        title="Staff & referral performance"
        subtitle="Who is closing the sales, and where the customers came from."
      />

      <div class="grid gap-4 sm:grid-cols-3">
        <ui-stat label="Total attributed" [value]="totalSales()" format="money" prefix="৳" icon="money" [series]="1" />
        <ui-stat label="Active sellers" [value]="employees().length" format="integer" icon="briefcase" [series]="3" />
        <ui-stat label="Referral sources" [value]="referrals().length" format="integer" icon="compass" [series]="6" />
      </div>

      <ui-filter-bar
        [(from)]="from"
        [(to)]="to"
        [dates]="true"
        [(search)]="search"
        searchLabel="Find a name"
        placeholder="Employee or referral source…"
        (refresh)="reload()"
        (exported)="exportCsv()"
      />

      <div class="grid gap-4 xl:grid-cols-2">
        <ui-card heading="Sales by employee" subheading="Ranked by attributed value" icon="briefcase" [padded]="false">
          <div class="p-4">
            @if (loading()) {
              <ui-skeleton [count]="1" [height]="220" />
            } @else if (employeeSeries().length) {
              <ui-columns [data]="employeeSeries()" [height]="230" color="var(--viz-1)" ariaLabel="Sales by employee" />
            } @else {
              <ui-empty title="No attributed sales" icon="briefcase" />
            }
          </div>

          <ul class="space-y-3 border-t border-line p-4">
            @for (row of filteredEmployees(); track row.id; let i = $index) {
              <li class="stagger flex items-center gap-3" [style]="'--i:' + i">
                <span
                  class="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-[12px] font-semibold text-muted"
                >
                  {{ i + 1 }}
                </span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-baseline justify-between gap-3">
                    <p class="truncate text-[13.5px] font-medium text-ink">{{ row.name }}</p>
                    <p class="num shrink-0 text-[13px] font-semibold text-ink">{{ money(row.amount) }}</p>
                  </div>
                  <div class="mt-1.5 flex items-center gap-2.5">
                    <ui-meter
                      [value]="row.amount"
                      [max]="employeeMax()"
                      color="var(--viz-1)"
                      [ariaLabel]="row.name + ' share'"
                    />
                    <span class="num w-20 shrink-0 text-right text-[11.5px] text-faint">
                      {{ row.invoiceCount }} invoices
                    </span>
                  </div>
                </div>
              </li>
            } @empty {
              <li class="py-6 text-center text-[13px] text-faint">Nothing to rank yet.</li>
            }
          </ul>
        </ui-card>

        <ui-card heading="Sales by referral source" subheading="Where the business comes from" icon="compass" [padded]="false">
          <div class="p-4">
            @if (loading()) {
              <ui-skeleton [count]="1" [height]="220" />
            } @else if (referralSeries().length) {
              <ui-columns [data]="referralSeries()" [height]="230" color="var(--viz-3)" ariaLabel="Sales by referral source" />
            } @else {
              <ui-empty title="No referral data" icon="compass" />
            }
          </div>

          <ul class="space-y-3 border-t border-line p-4">
            @for (row of filteredReferrals(); track row.id; let i = $index) {
              <li class="stagger flex items-center gap-3" [style]="'--i:' + i">
                <span class="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">
                  <ui-icon name="compass" [size]="14" />
                </span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-baseline justify-between gap-3">
                    <p class="truncate text-[13.5px] font-medium text-ink">{{ row.name }}</p>
                    <p class="num shrink-0 text-[13px] font-semibold text-ink">{{ money(row.amount) }}</p>
                  </div>
                  <div class="mt-1.5 flex items-center gap-2.5">
                    <ui-meter
                      [value]="row.amount"
                      [max]="referralMax()"
                      color="var(--viz-3)"
                      [ariaLabel]="row.name + ' share'"
                    />
                    <span class="num w-20 shrink-0 text-right text-[11.5px] text-faint">
                      {{ row.invoiceCount }} invoices
                    </span>
                  </div>
                </div>
              </li>
            } @empty {
              <li class="py-6 text-center text-[13px] text-faint">Nothing to rank yet.</li>
            }
          </ul>
        </ui-card>
      </div>
    </div>
  `,
  host: { class: 'block' },
})
export class StaffSalesReportPage {
  private readonly api = inject(PosApi);

  protected readonly money = money;

  protected readonly search = signal('');
  protected readonly from = signal(addDays(today(), -29));
  protected readonly to = signal(today());
  protected readonly loading = signal(true);

  protected readonly employees = signal<StaffSalesRow[]>([]);
  protected readonly referrals = signal<StaffSalesRow[]>([]);

  protected readonly filteredEmployees = computed(() => this.filter(this.employees()));
  protected readonly filteredReferrals = computed(() => this.filter(this.referrals()));

  protected readonly totalSales = computed(() => sum(this.employees(), (row) => row.amount));
  protected readonly employeeMax = computed(() =>
    Math.max(1, ...this.employees().map((row) => row.amount)),
  );
  protected readonly referralMax = computed(() =>
    Math.max(1, ...this.referrals().map((row) => row.amount)),
  );

  protected readonly employeeSeries = computed<Point[]>(() =>
    this.employees()
      .slice(0, 10)
      .map((row) => ({ label: row.name.split(' ')[0], value: row.amount })),
  );
  protected readonly referralSeries = computed<Point[]>(() =>
    this.referrals()
      .slice(0, 10)
      .map((row) => ({ label: row.name.slice(0, 10), value: row.amount })),
  );

  constructor() {
    void this.reload();
  }

  private filter(rows: StaffSalesRow[]): StaffSalesRow[] {
    const needle = this.search().toLowerCase();
    return rows.filter((row) => (needle ? row.name.toLowerCase().includes(needle) : true));
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    const filter = { fromDate: this.from(), toDate: this.to() };
    try {
      const [employees, referrals] = await Promise.all([
        firstValueFrom(this.api.employeeSales(filter)),
        firstValueFrom(this.api.referredSales(filter)),
      ]);
      this.employees.set(employees);
      this.referrals.set(referrals);
    } finally {
      this.loading.set(false);
    }
  }

  protected exportCsv(): void {
    downloadCsv('staff-and-referral-sales', [
      ...this.filteredEmployees().map((row) => ({
        Type: 'Employee',
        Name: row.name,
        Invoices: row.invoiceCount,
        Amount: row.amount,
      })),
      ...this.filteredReferrals().map((row) => ({
        Type: 'Referral',
        Name: row.name,
        Invoices: row.invoiceCount,
        Amount: row.amount,
      })),
    ]);
  }

  protected readonly currency = currency;
}

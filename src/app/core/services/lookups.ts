import { Service, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PosApi } from './pos-api';
import type { CashAccount, Customer, Employee, Id, Item, NamedEntity, Supplier } from '../models';

/**
 * Master data used by pickers all over the app. Loaded once per session and
 * shared, so opening a form does not refetch nine lists.
 */
@Service()
export class Lookups {
  private readonly api = inject(PosApi);

  readonly branches = signal<NamedEntity[]>([]);
  readonly couriers = signal<NamedEntity[]>([]);
  readonly departments = signal<NamedEntity[]>([]);
  readonly categories = signal<NamedEntity[]>([]);
  readonly units = signal<NamedEntity[]>([]);
  readonly origins = signal<NamedEntity[]>([]);
  readonly brands = signal<NamedEntity[]>([]);
  readonly areas = signal<NamedEntity[]>([]);
  readonly referrals = signal<NamedEntity[]>([]);
  readonly items = signal<Item[]>([]);
  readonly customers = signal<Customer[]>([]);
  readonly suppliers = signal<Supplier[]>([]);
  readonly employees = signal<Employee[]>([]);
  readonly cashAccounts = signal<CashAccount[]>([]);
  readonly bankAccounts = signal<CashAccount[]>([]);

  readonly ready = signal(false);

  /** Cash and bank accounts as one list, tagged by mode, for payment pickers. */
  readonly paymentAccounts = computed(() => [
    ...this.cashAccounts().map((account) => ({ ...account, mode: 'Cash' as const })),
    ...this.bankAccounts().map((account) => ({ ...account, mode: 'Bank' as const })),
  ]);

  private pending: Promise<void> | null = null;

  /** Idempotent: concurrent callers share one round of requests. */
  ensure(): Promise<void> {
    this.pending ??= this.loadAll();
    return this.pending;
  }

  /** Reload a single list after a master screen changes it. */
  async refresh(key: keyof Lookups): Promise<void> {
    const loaders: Partial<Record<string, () => Promise<void>>> = {
      branches: async () => this.branches.set(await firstValueFrom(this.api.branches.search())),
      couriers: async () => this.couriers.set(await firstValueFrom(this.api.couriers.search())),
      departments: async () =>
        this.departments.set(await firstValueFrom(this.api.departments.search())),
      categories: async () => this.categories.set(await firstValueFrom(this.api.categories.search())),
      units: async () => this.units.set(await firstValueFrom(this.api.units.search())),
      origins: async () => this.origins.set(await firstValueFrom(this.api.origins.search())),
      brands: async () => this.brands.set(await firstValueFrom(this.api.brands.search())),
      areas: async () => this.areas.set(await firstValueFrom(this.api.areas.search())),
      referrals: async () => this.referrals.set(await firstValueFrom(this.api.referrals.search())),
      items: async () => this.items.set(await firstValueFrom(this.api.items.search())),
      customers: async () => this.customers.set(await firstValueFrom(this.api.customers.search())),
      suppliers: async () => this.suppliers.set(await firstValueFrom(this.api.suppliers.search())),
      employees: async () => this.employees.set(await firstValueFrom(this.api.employees.search())),
      cashAccounts: async () =>
        this.cashAccounts.set(await firstValueFrom(this.api.cashAccounts.search())),
      bankAccounts: async () =>
        this.bankAccounts.set(await firstValueFrom(this.api.bankAccounts.search())),
    };
    await loaders[key as string]?.();
  }

  private async loadAll(): Promise<void> {
    const keys = [
      'branches', 'couriers', 'departments', 'categories', 'units', 'origins', 'brands',
      'areas', 'referrals', 'items', 'customers', 'suppliers', 'employees',
      'cashAccounts', 'bankAccounts',
    ] as const;
    await Promise.all(keys.map((key) => this.refresh(key)));
    this.ready.set(true);
  }

  itemById(id: Id | null | undefined): Item | undefined {
    return this.items().find((item) => item.id === Number(id));
  }

  customerById(id: Id | null | undefined): Customer | undefined {
    return this.customers().find((customer) => customer.id === Number(id));
  }

  supplierById(id: Id | null | undefined): Supplier | undefined {
    return this.suppliers().find((supplier) => supplier.id === Number(id));
  }
}

/** `[{id, name}]` → the name, or an em dash. */
export function nameById(rows: readonly NamedEntity[], id: Id | null | undefined): string {
  return rows.find((row) => row.id === Number(id))?.name ?? '—';
}

import { Component, computed, inject, signal } from '@angular/core';
import { FormField, form, min, required, submit } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import type { Item } from '../../core/models';
import { ConfirmService } from '../../core/services/confirm';
import { ListStore } from '../../core/services/list-store';
import { Lookups } from '../../core/services/lookups';
import { PosApi } from '../../core/services/pos-api';
import { ToastService } from '../../core/services/toast';
import { currency, downloadCsv, matches, money, round2 } from '../../core/util/format';
import { UiAutofocus } from '../../shared/directives/motion';
import { UiButton } from '../../shared/ui/button';
import { UiCombobox } from '../../shared/ui/combobox';
import { UiFilterBar } from '../../shared/ui/filter-bar';
import { UiModal } from '../../shared/ui/modal';
import { UiBadge, UiField, UiPageHeader } from '../../shared/ui/primitives';
import { UiTable, type Column } from '../../shared/ui/table';

@Component({
  selector: 'app-items',
  imports: [
    UiPageHeader,
    UiTable,
    UiFilterBar,
    UiButton,
    UiModal,
    UiField,
    UiBadge,
    UiCombobox,
    FormField,
    UiAutofocus,
  ],
  template: `
    <div class="space-y-4">
      <ui-page-header
        icon="tag"
        title="Items"
        subtitle="The catalogue every sale, purchase and stock movement points at."
      >
        <ui-button variant="primary" icon="plus" (pressed)="openCreate()">New item</ui-button>
      </ui-page-header>

      <ui-filter-bar
        [(search)]="search"
        searchLabel="Find an item"
        placeholder="Search by name, code or model…"
        (refresh)="reload()"
        (exported)="exportCsv()"
      >
        <div class="w-48">
          <label class="mb-1.5 block text-[12px] font-medium text-muted" for="item-category">
            Category
          </label>
          <select
            id="item-category"
            class="ctl"
            [value]="categoryFilter()"
            (change)="categoryFilter.set($any($event.target).value)"
          >
            <option value="">All categories</option>
            @for (category of lookups.categories(); track category.id) {
              <option [value]="category.id">{{ category.name }}</option>
            }
          </select>
        </div>
      </ui-filter-bar>

      <div class="grid gap-3 sm:grid-cols-3">
        @for (tile of summary(); track tile.label) {
          <div class="surface-card stagger flex items-center gap-3 p-3.5" [style]="'--i:' + $index">
            <span class="grid size-10 place-items-center rounded-xl" [class]="tile.chip">
              <ui-badge [tone]="tile.tone">{{ tile.short }}</ui-badge>
            </span>
            <div>
              <p class="text-[12px] text-muted">{{ tile.label }}</p>
              <p class="num text-[17px] font-semibold text-ink">{{ tile.value }}</p>
            </div>
          </div>
        }
      </div>

      <ui-table
        [rows]="filtered()"
        [columns]="columns"
        [loading]="store.loading()"
        [actions]="rowActions"
        [pageSize]="12"
        emptyTitle="No items match"
        emptyMessage="Adjust the search, or register the first item."
      />
    </div>

    <ng-template #rowActions let-row>
      <div class="flex justify-end gap-1">
        <ui-button variant="ghost" size="icon" icon="edit" ariaLabel="Edit item" (pressed)="openEdit(row)" />
        <ui-button variant="ghost" size="icon" icon="trash" ariaLabel="Delete item" (pressed)="remove(row)" />
      </div>
    </ng-template>

    <ui-modal
      [(open)]="editorOpen"
      size="lg"
      [heading]="editing() ? 'Edit item' : 'Register item'"
      subheading="Codes must be unique; prices seed every new document line."
    >
      <form class="grid gap-4 sm:grid-cols-2" (submit)="save($event)">
        <ui-field label="Item code" for="item-code" [required]="true" [error]="error('code')">
          <input id="item-code" uiAutofocus type="text" class="ctl" [formField]="itemForm.code" />
        </ui-field>

        <ui-field label="Item name" for="item-name" [required]="true" [error]="error('name')">
          <input id="item-name" type="text" class="ctl" [formField]="itemForm.name" />
        </ui-field>

        <ui-field label="Model" for="item-model">
          <input id="item-model" type="text" class="ctl" [formField]="itemForm.model" />
        </ui-field>

        <ui-field label="Category">
          <ui-combobox
            [options]="lookups.categories()"
            [labelOf]="nameOf"
            [keyOf]="idOf"
            [(value)]="categoryId"
            placeholder="Choose a category"
          />
        </ui-field>

        <ui-field label="Unit">
          <ui-combobox
            [options]="lookups.units()"
            [labelOf]="nameOf"
            [keyOf]="idOf"
            [(value)]="unitId"
            placeholder="Choose a unit"
          />
        </ui-field>

        <ui-field label="Brand">
          <ui-combobox
            [options]="lookups.brands()"
            [labelOf]="nameOf"
            [keyOf]="idOf"
            [(value)]="brandId"
            placeholder="Choose a brand"
          />
        </ui-field>

        <ui-field label="Origin">
          <ui-combobox
            [options]="lookups.origins()"
            [labelOf]="nameOf"
            [keyOf]="idOf"
            [(value)]="originId"
            placeholder="Country of origin"
          />
        </ui-field>

        <ui-field label="Reorder quantity" for="item-reorder" hint="Drives the reorder watchlist.">
          <input id="item-reorder" type="number" class="ctl" [formField]="itemForm.reorderQuantity" />
        </ui-field>

        <ui-field
          label="Purchase price"
          for="item-purchase"
          [required]="true"
          [error]="error('purchasePrice')"
        >
          <input id="item-purchase" type="number" step="0.01" class="ctl" [formField]="itemForm.purchasePrice" />
        </ui-field>

        <ui-field
          label="Sales price"
          for="item-sales"
          [required]="true"
          [error]="error('salesPrice')"
          [hint]="marginHint()"
        >
          <input id="item-sales" type="number" step="0.01" class="ctl" [formField]="itemForm.salesPrice" />
        </ui-field>

        <ui-field label="Description" for="item-description" class="sm:col-span-2">
          <textarea id="item-description" class="ctl" rows="2" [formField]="itemForm.description"></textarea>
        </ui-field>
      </form>

      <div modal-footer class="flex gap-2">
        <ui-button variant="ghost" (pressed)="editorOpen.set(false)">Cancel</ui-button>
        <ui-button variant="primary" icon="save" [loading]="saving()" (pressed)="save()">
          {{ editing() ? 'Save item' : 'Register item' }}
        </ui-button>
      </div>
    </ui-modal>
  `,
  host: { class: 'block' },
})
export class ItemsPage {
  private readonly api = inject(PosApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly lookups = inject(Lookups);

  protected readonly search = signal('');
  protected readonly categoryFilter = signal('');
  protected readonly editorOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly editing = signal<Item | null>(null);

  protected readonly categoryId = signal<number | string | null>(null);
  protected readonly unitId = signal<number | string | null>(null);
  protected readonly brandId = signal<number | string | null>(null);
  protected readonly originId = signal<number | string | null>(null);

  protected readonly nameOf = (row: { name: string }) => row.name;
  protected readonly idOf = (row: { id: number }) => row.id;

  private readonly model = signal({
    code: '',
    name: '',
    model: '',
    purchasePrice: 0,
    salesPrice: 0,
    reorderQuantity: 0,
    description: '',
  });

  protected readonly itemForm = form(this.model, (path) => {
    required(path.code, { message: 'A code is required.' });
    required(path.name, { message: 'A name is required.' });
    min(path.purchasePrice, 0, { message: 'Cannot be negative.' });
    min(path.salesPrice, 0, { message: 'Cannot be negative.' });
  });

  protected readonly store = new ListStore<Item>(() => this.api.items.search({}));

  protected readonly columns: Column<Item>[] = [
    { key: 'code', header: 'Code', value: (row) => row.code, kind: 'mono', width: '110px' },
    {
      key: 'name',
      header: 'Item',
      value: (row) => row.name,
      kind: 'strong',
      sub: (row) => [row.brandName, row.model].filter(Boolean).join(' · '),
    },
    { key: 'category', header: 'Category', value: (row) => row.categoryName ?? '—', hideOnMobile: true },
    { key: 'unit', header: 'Unit', value: (row) => row.unitName ?? '—', hideOnMobile: true },
    {
      key: 'purchasePrice',
      header: 'Purchase',
      value: (row) => row.purchasePrice,
      kind: 'money',
      align: 'right',
      hideOnMobile: true,
    },
    { key: 'salesPrice', header: 'Sales', value: (row) => row.salesPrice, kind: 'money', align: 'right' },
    {
      key: 'margin',
      header: 'Margin',
      value: (row) => this.marginOf(row),
      align: 'right',
      kind: 'badge',
      tone: (row) => (this.marginValue(row) >= 15 ? 'pos' : this.marginValue(row) >= 7 ? 'warn' : 'neg'),
      hideOnMobile: true,
    },
  ];

  protected readonly filtered = computed(() =>
    this.store.rows().filter((row) => {
      const inCategory =
        !this.categoryFilter() || String(row.categoryId) === this.categoryFilter();
      const hit =
        matches(row.name, this.search()) ||
        matches(row.code, this.search()) ||
        matches(row.model, this.search());
      return inCategory && hit;
    }),
  );

  protected readonly summary = computed(() => {
    const rows = this.filtered();
    const stockValue = rows.reduce((total, row) => total + row.purchasePrice, 0);
    const averageMargin = rows.length
      ? rows.reduce((total, row) => total + this.marginValue(row), 0) / rows.length
      : 0;
    return [
      { label: 'Items listed', value: String(rows.length), short: 'SKU', tone: 'brand' as const, chip: 'bg-brand-soft' },
      { label: 'Catalogue cost', value: currency(stockValue), short: '৳', tone: 'info' as const, chip: 'bg-info-soft' },
      { label: 'Average margin', value: `${averageMargin.toFixed(1)}%`, short: '%', tone: 'pos' as const, chip: 'bg-pos-soft' },
    ];
  });

  protected readonly marginHint = computed(() => {
    const { purchasePrice, salesPrice } = this.model();
    if (!purchasePrice || !salesPrice) return 'Margin is calculated once both prices are set.';
    const margin = ((salesPrice - purchasePrice) / salesPrice) * 100;
    return `Margin ${margin.toFixed(1)}% · ${money(salesPrice - purchasePrice)} per unit.`;
  });

  constructor() {
    void this.lookups.ensure();
    void this.store.load();
  }

  private marginValue(row: Item): number {
    return row.salesPrice ? ((row.salesPrice - row.purchasePrice) / row.salesPrice) * 100 : 0;
  }

  protected marginOf(row: Item): string {
    return `${round2(this.marginValue(row))}%`;
  }

  protected reload(): void {
    void this.store.load();
  }

  protected error(field: 'code' | 'name' | 'purchasePrice' | 'salesPrice'): string {
    const state = this.itemForm[field]();
    if (!state.touched() || !state.invalid()) return '';
    return state.errors()[0]?.message ?? 'Check this field.';
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.model.set({
      code: `ITM-${String(this.store.rows().length + 1).padStart(3, '0')}`,
      name: '',
      model: '',
      purchasePrice: 0,
      salesPrice: 0,
      reorderQuantity: 5,
      description: '',
    });
    this.categoryId.set(null);
    this.unitId.set(this.lookups.units()[0]?.id ?? null);
    this.brandId.set(null);
    this.originId.set(null);
    this.itemForm().reset();
    this.editorOpen.set(true);
  }

  protected openEdit(row: Item): void {
    this.editing.set(row);
    this.model.set({
      code: row.code,
      name: row.name,
      model: row.model ?? '',
      purchasePrice: row.purchasePrice,
      salesPrice: row.salesPrice,
      reorderQuantity: row.reorderQuantity ?? 0,
      description: row.description ?? '',
    });
    this.categoryId.set(row.categoryId);
    this.unitId.set(row.unitId);
    this.brandId.set(row.brandId);
    this.originId.set(row.originId);
    this.itemForm().reset();
    this.editorOpen.set(true);
  }

  protected async save(event?: Event): Promise<void> {
    event?.preventDefault();
    await submit(this.itemForm, async () => {
      this.saving.set(true);
      const payload: Partial<Item> = {
        ...this.model(),
        categoryId: this.categoryId() === null ? null : Number(this.categoryId()),
        unitId: this.unitId() === null ? null : Number(this.unitId()),
        brandId: this.brandId() === null ? null : Number(this.brandId()),
        originId: this.originId() === null ? null : Number(this.originId()),
        postBy: 'Aman',
      };
      const current = this.editing();
      try {
        if (current) {
          await firstValueFrom(this.api.items.update(current.id, payload));
          this.toast.success('Item saved', `${payload.name} was updated.`);
        } else {
          await firstValueFrom(this.api.items.create(payload));
          this.toast.success('Item registered', `${payload.name} is now in the catalogue.`);
        }
        this.editorOpen.set(false);
        this.reload();
        void this.lookups.refresh('items');
      } catch {
        /* surfaced by the error interceptor */
      } finally {
        this.saving.set(false);
      }
      return undefined;
    });
  }

  protected async remove(row: Item): Promise<void> {
    if (!(await this.confirm.askDelete(`item “${row.name}”`))) return;
    await firstValueFrom(this.api.items.remove(row.id));
    this.store.removeWhere((candidate) => candidate.id === row.id);
    this.toast.success('Item deleted', `${row.name} was removed from the catalogue.`);
    void this.lookups.refresh('items');
  }

  protected exportCsv(): void {
    downloadCsv(
      'items',
      this.filtered().map((row) => ({
        Code: row.code,
        Name: row.name,
        Model: row.model,
        Category: row.categoryName,
        Unit: row.unitName,
        Brand: row.brandName,
        Origin: row.originName,
        Purchase: row.purchasePrice,
        Sales: row.salesPrice,
        'Reorder qty': row.reorderQuantity,
      })),
    );
  }
}

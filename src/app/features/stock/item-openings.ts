import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Item, ItemOpening } from '../../core/models';
import { ConfirmService } from '../../core/services/confirm';
import { ListStore } from '../../core/services/list-store';
import { Lookups } from '../../core/services/lookups';
import { PosApi } from '../../core/services/pos-api';
import { ToastService } from '../../core/services/toast';
import { currency, downloadCsv, sum, today } from '../../core/util/format';
import { UiButton } from '../../shared/ui/button';
import { UiCombobox } from '../../shared/ui/combobox';
import { UiFilterBar } from '../../shared/ui/filter-bar';
import { UiModal } from '../../shared/ui/modal';
import { UiField, UiPageHeader } from '../../shared/ui/primitives';
import { UiTable, type Column } from '../../shared/ui/table';

@Component({
  selector: 'app-item-openings',
  imports: [UiPageHeader, UiFilterBar, UiTable, UiButton, UiModal, UiField, UiCombobox],
  template: `
    <div class="space-y-4">
      <ui-page-header
        icon="database"
        title="Opening stock"
        subtitle="The quantities each branch started with, before any document was raised."
      >
        <ui-button variant="primary" icon="plus" (pressed)="openCreate()">Add opening</ui-button>
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
        searchLabel="Find an opening"
        placeholder="Item or branch…"
        (refresh)="reload()"
        (exported)="exportCsv()"
      />

      <ui-table
        [rows]="filtered()"
        [columns]="columns"
        [loading]="store.loading()"
        [actions]="rowActions"
        [pageSize]="15"
        emptyTitle="No opening balances"
        emptyMessage="Record what each branch held on day one."
      />
    </div>

    <ng-template #rowActions let-row>
      <div class="flex justify-end gap-1">
        <ui-button variant="ghost" size="icon" icon="edit" ariaLabel="Edit opening" (pressed)="openEdit(row)" />
        <ui-button variant="ghost" size="icon" icon="trash" ariaLabel="Delete opening" (pressed)="remove(row)" />
      </div>
    </ng-template>

    <ui-modal
      [(open)]="editorOpen"
      size="md"
      [heading]="editing() ? 'Edit opening stock' : 'Add opening stock'"
      subheading="Opening rows sit before every document in the stock ledger."
    >
      <div class="grid gap-4 sm:grid-cols-2">
        <ui-field label="Item" [required]="true">
          <ui-combobox
            [options]="lookups.items()"
            [labelOf]="itemLabel"
            [keyOf]="idOf"
            [subOf]="itemSub"
            [(value)]="itemId"
            placeholder="Choose an item"
            (selected)="onItem($event)"
          />
        </ui-field>
        <ui-field label="Branch" [required]="true">
          <ui-combobox [options]="lookups.branches()" [labelOf]="nameOf" [keyOf]="idOf" [(value)]="branchId" placeholder="Choose a branch" />
        </ui-field>
        <ui-field label="Opening date" for="io-date" [required]="true">
          <input id="io-date" type="date" class="ctl" [value]="openingDate()" (change)="openingDate.set($any($event.target).value)" />
        </ui-field>
        <ui-field label="Quantity" for="io-qty" [required]="true">
          <input id="io-qty" type="number" class="ctl" [value]="quantity()" (input)="quantity.set(+$any($event.target).value || 0)" />
        </ui-field>
        <ui-field label="Rate at cost" for="io-rate" [hint]="'Opening value ' + currency(quantity() * rate())">
          <input id="io-rate" type="number" step="0.01" class="ctl" [value]="rate()" (input)="rate.set(+$any($event.target).value || 0)" />
        </ui-field>
        <ui-field label="Remarks" for="io-remarks">
          <input id="io-remarks" type="text" class="ctl" [value]="remarks()" (input)="remarks.set($any($event.target).value)" />
        </ui-field>
      </div>

      <div modal-footer class="flex gap-2">
        <ui-button variant="ghost" (pressed)="editorOpen.set(false)">Cancel</ui-button>
        <ui-button variant="primary" icon="save" [loading]="saving()" [disabled]="!itemId() || !branchId()" (pressed)="save()">
          {{ editing() ? 'Save opening' : 'Add opening' }}
        </ui-button>
      </div>
    </ui-modal>
  `,
  host: { class: 'block' },
})
export class ItemOpeningsPage {
  private readonly api = inject(PosApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly lookups = inject(Lookups);

  protected readonly currency = currency;
  protected readonly nameOf = (row: { name: string }) => row.name;
  protected readonly idOf = (row: { id: number }) => row.id;
  protected readonly itemLabel = (row: Item) => row.name;
  protected readonly itemSub = (row: Item) => row.code;

  protected readonly search = signal('');
  protected readonly editorOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly editing = signal<ItemOpening | null>(null);

  protected readonly itemId = signal<number | string | null>(null);
  protected readonly branchId = signal<number | string | null>(null);
  protected readonly openingDate = signal(today());
  protected readonly quantity = signal(0);
  protected readonly rate = signal(0);
  protected readonly remarks = signal('Opening stock');

  protected readonly store = new ListStore<ItemOpening>(() => this.api.itemOpenings.search({}));

  protected readonly columns: Column<ItemOpening>[] = [
    {
      key: 'itemName',
      header: 'Item',
      value: (row) => row.itemName ?? '—',
      kind: 'strong',
      sub: (row) => row.remarks,
    },
    { key: 'branchName', header: 'Branch', value: (row) => row.branchName ?? '—' },
    { key: 'openingDate', header: 'As on', value: (row) => row.openingDate, kind: 'date', hideOnMobile: true },
    { key: 'quantity', header: 'Quantity', value: (row) => row.quantity, kind: 'number', align: 'right' },
    { key: 'rate', header: 'Rate', value: (row) => row.rate, kind: 'money', align: 'right', hideOnMobile: true },
    { key: 'value', header: 'Value', value: (row) => row.quantity * row.rate, kind: 'money', align: 'right' },
  ];

  protected readonly filtered = computed(() => {
    const needle = this.search().toLowerCase();
    return this.store
      .rows()
      .filter((row) =>
        needle ? `${row.itemName} ${row.branchName}`.toLowerCase().includes(needle) : true,
      );
  });

  protected readonly tiles = computed(() => {
    const rows = this.filtered();
    return [
      { label: 'Opening rows', value: String(rows.length) },
      { label: 'Units', value: String(sum(rows, (row) => row.quantity)) },
      { label: 'Opening value', value: currency(sum(rows, (row) => row.quantity * row.rate)) },
    ];
  });

  constructor() {
    void this.lookups.ensure();
    void this.reload();
  }

  protected reload(): void {
    void this.store.load();
  }

  protected onItem(item: Item): void {
    if (!this.rate()) this.rate.set(item.purchasePrice);
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.itemId.set(null);
    this.branchId.set(this.lookups.branches()[0]?.id ?? null);
    this.openingDate.set(today());
    this.quantity.set(0);
    this.rate.set(0);
    this.remarks.set('Opening stock');
    this.editorOpen.set(true);
  }

  protected openEdit(row: ItemOpening): void {
    this.editing.set(row);
    this.itemId.set(row.itemId);
    this.branchId.set(row.branchId);
    this.openingDate.set(row.openingDate);
    this.quantity.set(row.quantity);
    this.rate.set(row.rate);
    this.remarks.set(row.remarks ?? '');
    this.editorOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    const payload: Partial<ItemOpening> = {
      itemId: Number(this.itemId()),
      branchId: Number(this.branchId()),
      openingDate: this.openingDate(),
      quantity: this.quantity(),
      rate: this.rate(),
      remarks: this.remarks(),
      postBy: 'Aman',
    };
    try {
      const current = this.editing();
      if (current) {
        await firstValueFrom(this.api.itemOpenings.update(current.id, payload));
        this.toast.success('Opening saved', 'The stock ledger has been rebased.');
      } else {
        await firstValueFrom(this.api.itemOpenings.create(payload));
        this.toast.success('Opening added', 'The branch now has an opening quantity.');
      }
      this.editorOpen.set(false);
      this.reload();
    } catch {
      /* surfaced by the error interceptor */
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(row: ItemOpening): Promise<void> {
    if (!(await this.confirm.askDelete(`opening for ${row.itemName}`))) return;
    await firstValueFrom(this.api.itemOpenings.remove(row.id));
    this.store.removeWhere((candidate) => candidate.id === row.id);
    this.toast.success('Opening deleted', 'The stock ledger has been rebased.');
  }

  protected exportCsv(): void {
    downloadCsv(
      'opening-stock',
      this.filtered().map((row) => ({
        Item: row.itemName,
        Branch: row.branchName,
        Date: row.openingDate,
        Quantity: row.quantity,
        Rate: row.rate,
        Value: row.quantity * row.rate,
        Remarks: row.remarks,
      })),
    );
  }
}

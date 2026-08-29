import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Item, StockTransfer } from '../../core/models';
import { ConfirmService } from '../../core/services/confirm';
import { ListStore } from '../../core/services/list-store';
import { Lookups } from '../../core/services/lookups';
import { PosApi } from '../../core/services/pos-api';
import { ToastService } from '../../core/services/toast';
import { addDays, clamp, downloadCsv, sum, today } from '../../core/util/format';
import { UiButton } from '../../shared/ui/button';
import { UiCombobox } from '../../shared/ui/combobox';
import { UiFilterBar } from '../../shared/ui/filter-bar';
import { UiIcon } from '../../shared/ui/icon';
import { UiModal } from '../../shared/ui/modal';
import { UiEmpty, UiField, UiPageHeader } from '../../shared/ui/primitives';
import { UiTable, type Column } from '../../shared/ui/table';

interface TransferLine {
  key: string;
  itemId: number | null;
  itemName: string;
  quantity: number;
  remarks: string;
}

let lineSeed = 0;

@Component({
  selector: 'app-stock-transfers',
  imports: [
    UiPageHeader,
    UiFilterBar,
    UiTable,
    UiButton,
    UiModal,
    UiField,
    UiCombobox,
    UiIcon,
    UiEmpty,
  ],
  template: `
    <div class="space-y-4">
      <ui-page-header
        icon="transfer"
        title="Stock transfers"
        subtitle="Moving units between branches without touching the ledger."
      >
        <ui-button variant="primary" icon="plus" (pressed)="openCreate()">New transfer</ui-button>
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
        searchLabel="Find a transfer"
        placeholder="Transfer number, branch, remarks…"
        (refresh)="reload()"
        (exported)="exportCsv()"
      />

      <ui-table
        [rows]="filtered()"
        [columns]="columns"
        [loading]="store.loading()"
        [actions]="rowActions"
        emptyTitle="No transfers in this window"
        emptyMessage="Move stock between branches to see it here."
      />
    </div>

    <ng-template #rowActions let-row>
      <ui-button variant="ghost" size="icon" icon="trash" ariaLabel="Delete transfer" (pressed)="remove(row)" />
    </ng-template>

    <ui-modal
      [(open)]="editorOpen"
      size="lg"
      heading="New stock transfer"
      subheading="Units leave the source branch and arrive at the destination immediately."
    >
      <div class="space-y-4">
        <div class="grid gap-4 sm:grid-cols-3">
          <ui-field label="Transfer date" for="st-date" [required]="true">
            <input id="st-date" type="date" class="ctl" [value]="transferDate()" (change)="transferDate.set($any($event.target).value)" />
          </ui-field>
          <ui-field label="From branch" [required]="true">
            <ui-combobox [options]="lookups.branches()" [labelOf]="nameOf" [keyOf]="idOf" [(value)]="fromBranchId" placeholder="Source" />
          </ui-field>
          <ui-field label="To branch" [required]="true" [error]="branchError()">
            <ui-combobox
              [options]="lookups.branches()"
              [labelOf]="nameOf"
              [keyOf]="idOf"
              [(value)]="toBranchId"
              [invalid]="!!branchError()"
              placeholder="Destination"
            />
          </ui-field>
        </div>

        <div class="rounded-xl border border-line">
          <div class="border-b border-line bg-surface-2/50 p-3">
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
            <table class="w-full text-left text-[13px]">
              <thead class="bg-surface-2/40">
                <tr>
                  <th class="px-3 py-2 text-[11px] font-semibold tracking-wider text-faint uppercase">Item</th>
                  <th class="w-24 px-3 py-2 text-right text-[11px] font-semibold tracking-wider text-faint uppercase">Qty</th>
                  <th class="px-3 py-2 text-[11px] font-semibold tracking-wider text-faint uppercase">Note</th>
                  <th class="w-10 px-3 py-2"><span class="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                @for (line of lines(); track line.key; let i = $index) {
                  <tr class="border-t border-line">
                    <td class="px-3 py-2 font-medium text-ink">{{ line.itemName }}</td>
                    <td class="px-3 py-2">
                      <input
                        type="number"
                        class="ctl ctl-sm text-right"
                        [value]="line.quantity"
                        [attr.aria-label]="'Quantity for ' + line.itemName"
                        (input)="patch(line.key, { quantity: clamp(+$any($event.target).value || 0, 0, 99999) })"
                      />
                    </td>
                    <td class="px-3 py-2">
                      <input
                        type="text"
                        class="ctl ctl-sm"
                        [value]="line.remarks"
                        [attr.aria-label]="'Note for ' + line.itemName"
                        (input)="patch(line.key, { remarks: $any($event.target).value })"
                      />
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
          } @else {
            <ui-empty title="No items on this transfer" message="Add at least one item to move." icon="box" />
          }
        </div>

        <ui-field label="Remarks" for="st-remarks">
          <input id="st-remarks" type="text" class="ctl" [value]="remarks()" (input)="remarks.set($any($event.target).value)" placeholder="Branch rebalancing…" />
        </ui-field>
      </div>

      <div modal-footer class="flex gap-2">
        <ui-button variant="ghost" (pressed)="editorOpen.set(false)">Cancel</ui-button>
        <ui-button
          variant="primary"
          icon="save"
          [loading]="saving()"
          [disabled]="!lines().length || !!branchError()"
          (pressed)="save()"
        >
          Post transfer
        </ui-button>
      </div>
    </ui-modal>
  `,
  host: { class: 'block' },
})
export class StockTransfersPage {
  private readonly api = inject(PosApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly lookups = inject(Lookups);

  protected readonly clamp = clamp;
  protected readonly nameOf = (row: { name: string }) => row.name;
  protected readonly idOf = (row: { id: number }) => row.id;
  protected readonly itemLabel = (row: Item) => row.name;
  protected readonly itemSub = (row: Item) => row.code;

  protected readonly search = signal('');
  protected readonly from = signal(addDays(today(), -60));
  protected readonly to = signal(today());
  protected readonly editorOpen = signal(false);
  protected readonly saving = signal(false);

  protected readonly transferDate = signal(today());
  protected readonly fromBranchId = signal<number | string | null>(null);
  protected readonly toBranchId = signal<number | string | null>(null);
  protected readonly remarks = signal('');
  protected readonly lines = signal<TransferLine[]>([]);
  /** The "search to add" box clears itself after every pick. */
  protected readonly picker = signal<number | string | null>(null);

  protected readonly store = new ListStore<StockTransfer>((filter) =>
    this.api.stockTransfers.search(filter),
  );

  protected readonly columns: Column<StockTransfer>[] = [
    { key: 'transferNo', header: 'Transfer', value: (row) => row.transferNo, kind: 'mono', width: '130px' },
    { key: 'transferDate', header: 'Date', value: (row) => row.transferDate, kind: 'date', width: '120px' },
    {
      key: 'route',
      header: 'Route',
      value: (row) => `${row.fromBranchName} → ${row.toBranchName}`,
      kind: 'strong',
      sub: (row) => row.remarks,
    },
    { key: 'lines', header: 'Lines', value: (row) => row.details.length, align: 'right', hideOnMobile: true },
    { key: 'totalQuantity', header: 'Units moved', value: (row) => row.totalQuantity ?? 0, kind: 'number', align: 'right' },
  ];

  protected readonly filtered = computed(() => {
    const needle = this.search().toLowerCase();
    return this.store
      .rows()
      .filter((row) =>
        needle
          ? `${row.transferNo} ${row.fromBranchName} ${row.toBranchName} ${row.remarks}`
              .toLowerCase()
              .includes(needle)
          : true,
      );
  });

  protected readonly tiles = computed(() => {
    const rows = this.filtered();
    return [
      { label: 'Transfers', value: String(rows.length) },
      { label: 'Units moved', value: String(sum(rows, (row) => row.totalQuantity ?? 0)) },
      { label: 'Lines', value: String(sum(rows, (row) => row.details.length)) },
    ];
  });

  protected readonly branchError = computed(() =>
    this.fromBranchId() && this.fromBranchId() === this.toBranchId()
      ? 'Pick a different destination branch.'
      : '',
  );

  constructor() {
    void this.lookups.ensure();
    void this.reload();
  }

  protected reload(): void {
    void this.store.load({ fromDate: this.from(), toDate: this.to() });
  }

  protected openCreate(): void {
    this.transferDate.set(today());
    this.fromBranchId.set(this.lookups.branches()[0]?.id ?? null);
    this.toBranchId.set(this.lookups.branches()[1]?.id ?? null);
    this.remarks.set('');
    this.lines.set([]);
    this.editorOpen.set(true);
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
      { key: `tl-${lineSeed++}`, itemId: item.id, itemName: item.name, quantity: 1, remarks: '' },
    ]);
  }

  protected patch(key: string, changes: Partial<TransferLine>): void {
    this.lines.update((lines) =>
      lines.map((line) => (line.key === key ? { ...line, ...changes } : line)),
    );
  }

  protected removeLine(key: string): void {
    this.lines.update((lines) => lines.filter((line) => line.key !== key));
  }

  protected async save(): Promise<void> {
    const details = this.lines().filter((line) => line.itemId && line.quantity > 0);
    if (!details.length || this.branchError()) return;

    this.saving.set(true);
    try {
      const saved = await firstValueFrom(
        this.api.stockTransfers.create({
          transferDate: this.transferDate(),
          fromBranchId: Number(this.fromBranchId()),
          toBranchId: Number(this.toBranchId()),
          details: details.map((line) => ({
            itemId: line.itemId,
            quantity: line.quantity,
            remarks: line.remarks,
          })),
          remarks: this.remarks(),
          postBy: 'Aman',
        }),
      );
      this.toast.success('Transfer posted', `${saved.transferNo} moved ${saved.totalQuantity} units.`);
      this.editorOpen.set(false);
      this.reload();
    } catch {
      /* surfaced by the error interceptor */
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(row: StockTransfer): Promise<void> {
    if (!(await this.confirm.askDelete(`transfer ${row.transferNo}`))) return;
    await firstValueFrom(this.api.stockTransfers.remove(row.id));
    this.store.removeWhere((candidate) => candidate.id === row.id);
    this.toast.success('Transfer deleted', `${row.transferNo} was reversed.`);
  }

  protected exportCsv(): void {
    downloadCsv(
      'stock-transfers',
      this.filtered().map((row) => ({
        Transfer: row.transferNo,
        Date: row.transferDate,
        From: row.fromBranchName,
        To: row.toBranchName,
        Lines: row.details.length,
        Units: row.totalQuantity,
        Remarks: row.remarks,
      })),
    );
  }
}

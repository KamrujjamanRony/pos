import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { MenuItem, PermissionKey } from '../../core/models';
import { ConfirmService } from '../../core/services/confirm';
import { ListStore } from '../../core/services/list-store';
import { PosApi } from '../../core/services/pos-api';
import { PrintService } from '../../core/services/print';
import { ToastService } from '../../core/services/toast';
import { downloadCsv } from '../../core/util/format';
import { UiAutofocus } from '../../shared/directives/motion';
import { UiButton } from '../../shared/ui/button';
import { UiCombobox } from '../../shared/ui/combobox';
import { UiFilterBar } from '../../shared/ui/filter-bar';
import { UiIcon } from '../../shared/ui/icon';
import { UiModal } from '../../shared/ui/modal';
import { UiField, UiPageHeader } from '../../shared/ui/primitives';
import { UiTable, type Column } from '../../shared/ui/table';

const ALL_PERMISSIONS: PermissionKey[] = ['view', 'create', 'edit', 'delete'];

@Component({
  selector: 'app-menus',
  imports: [
    UiPageHeader,
    UiFilterBar,
    UiTable,
    UiButton,
    UiModal,
    UiField,
    UiCombobox,
    UiIcon,
    UiAutofocus,
  ],
  template: `
    <div class="space-y-4">
      <ui-page-header
        icon="list"
        title="Menu registry"
        subtitle="The screens the API knows about — the source for user permissions."
      >
        <ui-button variant="primary" icon="plus" (pressed)="openCreate()">New menu</ui-button>
      </ui-page-header>

      <ui-filter-bar
        [(search)]="search"
        searchLabel="Find a menu"
        placeholder="Name or URL…"
        (refresh)="reload()"
        (exported)="exportCsv()"
        (printed)="printPdf()"
      />

      <div class="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <ui-table
          [rows]="filtered()"
          [columns]="columns"
          [loading]="store.loading()"
          [actions]="rowActions"
          [pageSize]="15"
          emptyTitle="No menus registered"
          emptyMessage="Register the screens your users need access to."
        />

        <div class="surface-card h-fit p-4">
          <h2 class="text-[13px] font-semibold text-ink">Tree preview</h2>
          <p class="mt-0.5 text-[12px] text-muted">How the registry nests, by parent.</p>
          <ul class="mt-3 space-y-1.5">
            @for (root of tree(); track root.id) {
              <li>
                <div class="flex items-center gap-2 rounded-lg bg-surface-2/60 px-2.5 py-2">
                  <ui-icon name="chevronRight" [size]="13" class="text-faint" />
                  <span class="flex-1 truncate text-[13px] font-medium text-ink">{{
                    root.menuName
                  }}</span>
                  <span class="font-mono text-[11px] text-faint">{{ root.serialNo }}</span>
                </div>
                @if (childrenOf(root.id).length) {
                  <ul class="mt-1 ml-4 space-y-1 border-l border-line pl-3">
                    @for (child of childrenOf(root.id); track child.id) {
                      <li class="truncate py-1 text-[12.5px] text-muted">{{ child.menuName }}</li>
                    }
                  </ul>
                }
              </li>
            } @empty {
              <li class="py-6 text-center text-[12.5px] text-faint">Nothing registered yet.</li>
            }
          </ul>
        </div>
      </div>
    </div>

    <ng-template #rowActions let-row>
      <div class="flex justify-end gap-1">
        <ui-button
          variant="ghost"
          size="icon"
          icon="edit"
          ariaLabel="Edit menu"
          (pressed)="openEdit(row)"
        />
        <ui-button
          variant="ghost"
          size="icon"
          icon="trash"
          ariaLabel="Delete menu"
          (pressed)="remove(row)"
        />
      </div>
    </ng-template>

    <ui-modal
      [(open)]="editorOpen"
      size="md"
      [heading]="editing() ? 'Edit menu' : 'Register menu'"
      subheading="Menu names and URLs must match the routes the app actually serves."
    >
      <div class="grid gap-4 sm:grid-cols-2">
        <ui-field label="Menu name" for="m-name" [required]="true">
          <input
            id="m-name"
            uiAutofocus
            type="text"
            class="ctl"
            [value]="menuName()"
            (input)="menuName.set($any($event.target).value)"
          />
        </ui-field>
        <ui-field label="URL" for="m-url" [required]="true">
          <input
            id="m-url"
            type="text"
            class="ctl"
            placeholder="/sales/invoices"
            [value]="url()"
            (input)="url.set($any($event.target).value)"
          />
        </ui-field>
        <ui-field label="Parent" hint="Leave empty for a top-level entry.">
          <ui-combobox
            [options]="parentOptions()"
            [labelOf]="menuLabel"
            [keyOf]="idOf"
            [(value)]="parentId"
            placeholder="Top level"
          />
        </ui-field>
        <ui-field label="Icon" for="m-icon">
          <input
            id="m-icon"
            type="text"
            class="ctl"
            placeholder="cart"
            [value]="icon()"
            (input)="icon.set($any($event.target).value)"
          />
        </ui-field>
        <ui-field label="Serial number" for="m-serial" hint="Controls the order in the sidebar.">
          <input
            id="m-serial"
            type="number"
            class="ctl"
            [value]="serialNo()"
            (input)="serialNo.set(+$any($event.target).value || 0)"
          />
        </ui-field>
        <ui-field label="Permission keys">
          <div class="flex flex-wrap gap-1.5 pt-1">
            @for (permission of allPermissions; track permission) {
              <button
                type="button"
                class="rounded-full px-3 py-1.5 text-[12px] font-semibold capitalize transition"
                [class]="
                  permissionsKey().includes(permission)
                    ? 'bg-brand text-white'
                    : 'bg-surface-2 text-muted hover:text-ink'
                "
                [attr.aria-pressed]="permissionsKey().includes(permission)"
                (click)="togglePermission(permission)"
              >
                {{ permission }}
              </button>
            }
          </div>
        </ui-field>
      </div>

      <div modal-footer class="flex gap-2">
        <ui-button variant="ghost" (pressed)="editorOpen.set(false)">Cancel</ui-button>
        <ui-button
          variant="primary"
          icon="save"
          [loading]="saving()"
          [disabled]="!menuName().trim()"
          (pressed)="save()"
        >
          {{ editing() ? 'Save menu' : 'Register menu' }}
        </ui-button>
      </div>
    </ui-modal>
  `,
  host: { class: 'block' },
})
export class MenusPage {
  private readonly api = inject(PosApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly print = inject(PrintService);

  protected readonly allPermissions = ALL_PERMISSIONS;
  protected readonly idOf = (row: { id: number }) => row.id;
  protected readonly menuLabel = (row: MenuItem) => row.menuName;

  protected readonly search = signal('');
  protected readonly editorOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly editing = signal<MenuItem | null>(null);

  protected readonly menuName = signal('');
  protected readonly url = signal('');
  protected readonly icon = signal('');
  protected readonly serialNo = signal(1);
  protected readonly parentId = signal<number | string | null>(null);
  protected readonly permissionsKey = signal<PermissionKey[]>(['view']);

  protected readonly store = new ListStore<MenuItem>(() => this.api.menus.search({}));

  protected readonly columns: Column<MenuItem>[] = [
    {
      key: 'menuName',
      header: 'Menu',
      value: (row) => row.menuName,
      kind: 'strong',
      sub: (row) => (row.parentId ? `Under ${this.nameOfMenu(row.parentId)}` : 'Top level'),
    },
    { key: 'url', header: 'URL', value: (row) => row.url, kind: 'mono' },
    {
      key: 'serialNo',
      header: 'Order',
      value: (row) => row.serialNo,
      kind: 'number',
      align: 'right',
      hideOnMobile: true,
    },
    {
      key: 'permissionsKey',
      header: 'Permissions',
      value: (row) => (row.permissionsKey ?? []).join(', ') || '—',
      hideOnMobile: true,
    },
  ];

  protected readonly filtered = computed(() => {
    const needle = this.search().toLowerCase();
    return this.store
      .rows()
      .filter((row) =>
        needle ? `${row.menuName} ${row.url}`.toLowerCase().includes(needle) : true,
      );
  });

  protected readonly tree = computed(() =>
    [...this.store.rows()].filter((row) => !row.parentId).sort((a, b) => a.serialNo - b.serialNo),
  );

  protected readonly parentOptions = computed(() =>
    this.store.rows().filter((row) => row.id !== this.editing()?.id && !row.parentId),
  );

  constructor() {
    void this.reload();
  }

  protected reload(): void {
    void this.store.load();
  }

  protected childrenOf(parentId: number): MenuItem[] {
    return this.store
      .rows()
      .filter((row) => row.parentId === parentId)
      .sort((a, b) => a.serialNo - b.serialNo);
  }

  protected nameOfMenu(id: number): string {
    return this.store.rows().find((row) => row.id === id)?.menuName ?? '—';
  }

  protected togglePermission(permission: PermissionKey): void {
    this.permissionsKey.update((keys) =>
      keys.includes(permission) ? keys.filter((key) => key !== permission) : [...keys, permission],
    );
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.menuName.set('');
    this.url.set('');
    this.icon.set('');
    this.serialNo.set(this.store.rows().length + 1);
    this.parentId.set(null);
    this.permissionsKey.set(['view']);
    this.editorOpen.set(true);
  }

  protected openEdit(row: MenuItem): void {
    this.editing.set(row);
    this.menuName.set(row.menuName);
    this.url.set(row.url ?? '');
    this.icon.set(row.icon ?? '');
    this.serialNo.set(row.serialNo ?? 1);
    this.parentId.set(row.parentId);
    this.permissionsKey.set([...(row.permissionsKey ?? ['view'])]);
    this.editorOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    const payload: Partial<MenuItem> = {
      menuName: this.menuName().trim(),
      parentId: this.parentId() === null ? null : Number(this.parentId()),
      url: this.url(),
      icon: this.icon(),
      serialNo: this.serialNo(),
      permissionsKey: this.permissionsKey(),
      postBy: 'Aman',
    };
    try {
      const current = this.editing();
      if (current) await firstValueFrom(this.api.menus.update(current.id, payload));
      else await firstValueFrom(this.api.menus.create(payload));
      this.toast.success('Menu saved', `${payload.menuName} is registered.`);
      this.editorOpen.set(false);
      this.reload();
    } catch {
      /* surfaced by the error interceptor */
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(row: MenuItem): Promise<void> {
    if (!(await this.confirm.askDelete(`menu “${row.menuName}”`))) return;
    await firstValueFrom(this.api.menus.remove(row.id));
    this.store.removeWhere((candidate) => candidate.id === row.id);
    this.toast.success('Menu deleted', `${row.menuName} was removed from the registry.`);
  }

  /** One row shape, shared by the CSV export and the printed report. */
  private reportRows(): Record<string, unknown>[] {
    return this.filtered().map((row) => ({
      Menu: row.menuName,
      Parent: row.parentId ? this.nameOfMenu(row.parentId) : '',
      URL: row.url,
      Icon: row.icon,
      Order: row.serialNo,
      Permissions: (row.permissionsKey ?? []).join(' '),
    }));
  }

  protected exportCsv(): void {
    downloadCsv('menus', this.reportRows());
  }

  protected printPdf(): void {
    this.print.report({
      title: 'Menu registry',
      subtitle: 'Every screen the app can grant access to',
      filename: 'menus',
      landscape: true,
      filters: [{ label: 'Search', value: this.search() || 'All records' }],
      summary: [
        { label: 'Menus registered', value: String(this.filtered().length) },
        { label: 'Top level', value: String(this.tree().length) },
      ],
      sections: [
        {
          rows: this.reportRows(),
          emptyMessage: 'Nothing registered yet.',
        },
      ],
    });
  }
}

import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { AppUser, MenuPermissionNode, PermissionKey } from '../../core/models';
import { ConfirmService } from '../../core/services/confirm';
import { ListStore } from '../../core/services/list-store';
import { PosApi } from '../../core/services/pos-api';
import { ToastService } from '../../core/services/toast';
import { downloadCsv, prettyDate } from '../../core/util/format';
import { UiAutofocus } from '../../shared/directives/motion';
import { UiButton } from '../../shared/ui/button';
import { UiFilterBar } from '../../shared/ui/filter-bar';
import { UiIcon } from '../../shared/ui/icon';
import { UiModal } from '../../shared/ui/modal';
import { UiField, UiPageHeader } from '../../shared/ui/primitives';
import { UiTable, type Column } from '../../shared/ui/table';

const ALL_PERMISSIONS: PermissionKey[] = ['view', 'create', 'edit', 'delete'];

@Component({
  selector: 'app-users',
  imports: [
    UiPageHeader,
    UiFilterBar,
    UiTable,
    UiButton,
    UiModal,
    UiField,
    UiIcon,
    UiAutofocus,
  ],
  template: `
    <div class="space-y-4">
      <ui-page-header
        icon="key"
        title="Users & access"
        subtitle="Who can sign in, and which screens and actions they get."
      >
        <ui-button variant="primary" icon="plus" (pressed)="openCreate()">New user</ui-button>
      </ui-page-header>

      <ui-filter-bar
        [(search)]="search"
        searchLabel="Find a user"
        placeholder="Username…"
        (refresh)="reload()"
        (exported)="exportCsv()"
      />

      <ui-table
        [rows]="filtered()"
        [columns]="columns"
        [loading]="store.loading()"
        [actions]="rowActions"
        emptyTitle="No users yet"
        emptyMessage="Create an operator account to get someone on the till."
      />
    </div>

    <ng-template #rowActions let-row>
      <div class="flex justify-end gap-1">
        <ui-button variant="ghost" size="icon" icon="edit" ariaLabel="Edit user" (pressed)="openEdit(row)" />
        <ui-button variant="ghost" size="icon" icon="trash" ariaLabel="Delete user" (pressed)="remove(row)" />
      </div>
    </ng-template>

    <ui-modal
      [(open)]="editorOpen"
      size="lg"
      [heading]="editing() ? 'Edit ' + userName() : 'New user'"
      subheading="Tick a screen to grant it, then choose what they can do there."
    >
      <div class="space-y-5">
        <div class="grid gap-4 sm:grid-cols-3">
          <ui-field label="Username" for="u-name" [required]="true">
            <input id="u-name" uiAutofocus type="text" class="ctl" [value]="userName()" (input)="userName.set($any($event.target).value)" />
          </ui-field>
          <ui-field
            label="Password"
            for="u-password"
            [hint]="editing() ? 'Leave blank to keep the current password.' : 'At least 8 characters.'"
          >
            <input id="u-password" type="password" class="ctl" autocomplete="new-password" [value]="password()" (input)="password.set($any($event.target).value)" />
          </ui-field>
          <ui-field label="Status" for="u-active">
            <select id="u-active" class="ctl" [value]="isActive() ? 'true' : 'false'" (change)="isActive.set($any($event.target).value === 'true')">
              <option value="true">Active</option>
              <option value="false">Suspended</option>
            </select>
          </ui-field>
        </div>

        <div class="overflow-hidden rounded-xl border border-line">
          <div class="flex items-center justify-between border-b border-line bg-surface-2/60 px-3.5 py-2.5">
            <h3 class="text-[13px] font-semibold text-ink">Screen access</h3>
            <div class="flex gap-1.5">
              <ui-button variant="ghost" size="sm" (pressed)="selectAll(true)">Select all</ui-button>
              <ui-button variant="ghost" size="sm" (pressed)="selectAll(false)">Clear</ui-button>
            </div>
          </div>

          <ul class="divide-y divide-line">
            @for (node of permissions(); track node.menuId; let i = $index) {
              <li class="stagger px-3.5 py-3" [style]="'--i:' + i">
                <div class="flex flex-wrap items-center gap-3">
                  <label class="flex min-w-44 flex-1 cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      class="size-4 accent-[var(--c-brand)]"
                      [checked]="node.isSelected"
                      (change)="toggleMenu(node.menuId, $any($event.target).checked)"
                    />
                    <span class="text-[13.5px] font-medium text-ink">{{ node.menuName }}</span>
                  </label>

                  <div class="flex flex-wrap gap-1.5">
                    @for (permission of allPermissions; track permission) {
                      <button
                        type="button"
                        class="rounded-full px-2.5 py-1 text-[11.5px] font-semibold capitalize transition"
                        [class]="
                          node.permissions.includes(permission)
                            ? 'bg-brand text-white'
                            : 'bg-surface-2 text-muted hover:text-ink'
                        "
                        [disabled]="!node.isSelected"
                        [class.opacity-40]="!node.isSelected"
                        [attr.aria-pressed]="node.permissions.includes(permission)"
                        (click)="togglePermission(node.menuId, permission)"
                      >
                        {{ permission }}
                      </button>
                    }
                  </div>
                </div>
              </li>
            }
          </ul>
        </div>

        <p class="flex items-center gap-2 text-[12.5px] text-faint">
          <ui-icon name="info" [size]="14" />
          Permissions are sent exactly as the API models them: a menu id, a selected flag and a
          list of permission keys.
        </p>
      </div>

      <div modal-footer class="flex gap-2">
        <ui-button variant="ghost" (pressed)="editorOpen.set(false)">Cancel</ui-button>
        <ui-button variant="primary" icon="save" [loading]="saving()" [disabled]="!userName().trim()" (pressed)="save()">
          {{ editing() ? 'Save access' : 'Create user' }}
        </ui-button>
      </div>
    </ui-modal>
  `,
  host: { class: 'block' },
})
export class UsersPage {
  private readonly api = inject(PosApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly allPermissions = ALL_PERMISSIONS;

  protected readonly search = signal('');
  protected readonly editorOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly editing = signal<AppUser | null>(null);

  protected readonly userName = signal('');
  protected readonly password = signal('');
  protected readonly isActive = signal(true);
  protected readonly permissions = signal<MenuPermissionNode[]>([]);

  protected readonly store = new ListStore<AppUser>(() => this.api.users.search({}));

  protected readonly columns: Column<AppUser>[] = [
    {
      key: 'userName',
      header: 'Username',
      value: (row) => row.userName,
      kind: 'strong',
      sub: (row) => `${this.grantedCount(row)} screens granted`,
    },
    {
      key: 'isActive',
      header: 'Status',
      value: (row) => (row.isActive ? 'Active' : 'Suspended'),
      kind: 'badge',
      tone: (row) => (row.isActive ? 'pos' : 'neutral'),
    },
    { key: 'postBy', header: 'Created by', value: (row) => row.postBy ?? '—', hideOnMobile: true },
    {
      key: 'postDate',
      header: 'Created',
      value: (row) => row.postDate ?? '',
      kind: 'date',
      align: 'right',
      hideOnMobile: true,
    },
  ];

  protected readonly filtered = computed(() => {
    const needle = this.search().toLowerCase();
    return this.store
      .rows()
      .filter((row) => (needle ? row.userName.toLowerCase().includes(needle) : true));
  });

  constructor() {
    void this.reload();
  }

  protected reload(): void {
    void this.store.load();
  }

  protected grantedCount(user: AppUser): number {
    return (user.menuPermissions ?? []).filter((node) => node.isSelected).length;
  }

  private async loadMenuTree(existing: MenuPermissionNode[] = []): Promise<void> {
    const tree = await firstValueFrom(this.api.menuTree(this.editing()?.id ?? 0));
    // Flatten one level: the editor grants per screen, matching the API's node shape.
    const flat = tree.flatMap((node) => [node, ...node.children]);
    this.permissions.set(
      flat.map((node) => {
        const current = existing.find((candidate) => candidate.menuId === node.menuId);
        return {
          menuId: node.menuId,
          menuName: node.menuName,
          isSelected: current?.isSelected ?? false,
          permissions: current?.permissions ?? ['view'],
          children: [],
        };
      }),
    );
  }

  protected async openCreate(): Promise<void> {
    this.editing.set(null);
    this.userName.set('');
    this.password.set('');
    this.isActive.set(true);
    this.editorOpen.set(true);
    await this.loadMenuTree();
  }

  protected async openEdit(user: AppUser): Promise<void> {
    this.editing.set(user);
    this.userName.set(user.userName);
    this.password.set('');
    this.isActive.set(user.isActive);
    this.editorOpen.set(true);
    await this.loadMenuTree(user.menuPermissions ?? []);
  }

  protected toggleMenu(menuId: number, checked: boolean): void {
    this.permissions.update((nodes) =>
      nodes.map((node) =>
        node.menuId === menuId
          ? {
              ...node,
              isSelected: checked,
              permissions: checked && !node.permissions.length ? ['view'] : node.permissions,
            }
          : node,
      ),
    );
  }

  protected togglePermission(menuId: number, permission: PermissionKey): void {
    this.permissions.update((nodes) =>
      nodes.map((node) => {
        if (node.menuId !== menuId || !node.isSelected) return node;
        const has = node.permissions.includes(permission);
        return {
          ...node,
          permissions: has
            ? node.permissions.filter((candidate) => candidate !== permission)
            : [...node.permissions, permission],
        };
      }),
    );
  }

  protected selectAll(selected: boolean): void {
    this.permissions.update((nodes) =>
      nodes.map((node) => ({
        ...node,
        isSelected: selected,
        permissions: selected ? [...ALL_PERMISSIONS] : [],
      })),
    );
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    const payload: Partial<AppUser> = {
      userName: this.userName().trim(),
      password: this.password(),
      isActive: this.isActive(),
      menuPermissions: this.permissions(),
      postBy: 'Aman',
    };
    try {
      const current = this.editing();
      if (current) {
        await firstValueFrom(this.api.users.update(current.id, payload));
        this.toast.success('Access saved', `${payload.userName}'s permissions were updated.`);
      } else {
        await firstValueFrom(this.api.users.create(payload));
        this.toast.success('User created', `${payload.userName} can now sign in.`);
      }
      this.editorOpen.set(false);
      this.reload();
    } catch {
      /* surfaced by the error interceptor */
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(user: AppUser): Promise<void> {
    if (!(await this.confirm.askDelete(`user “${user.userName}”`))) return;
    await firstValueFrom(this.api.users.remove(user.id));
    this.store.removeWhere((candidate) => candidate.id === user.id);
    this.toast.success('User deleted', `${user.userName} can no longer sign in.`);
  }

  protected exportCsv(): void {
    downloadCsv(
      'users',
      this.filtered().map((row) => ({
        Username: row.userName,
        Active: row.isActive ? 'Yes' : 'No',
        'Screens granted': this.grantedCount(row),
        'Created by': row.postBy ?? '',
        Created: prettyDate(row.postDate),
      })),
    );
  }
}

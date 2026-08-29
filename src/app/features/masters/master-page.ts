import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { FormField, form, required, submit } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import type { Id, NamedEntity } from '../../core/models';
import { ConfirmService } from '../../core/services/confirm';
import { ListStore } from '../../core/services/list-store';
import { Lookups } from '../../core/services/lookups';
import { PosApi } from '../../core/services/pos-api';
import { PrintService } from '../../core/services/print';
import { ToastService } from '../../core/services/toast';
import { downloadCsv, matches, prettyDate } from '../../core/util/format';
import { UiAutofocus } from '../../shared/directives/motion';
import { UiButton } from '../../shared/ui/button';
import { UiFilterBar } from '../../shared/ui/filter-bar';
import type { IconName } from '../../shared/ui/icon';
import { UiModal } from '../../shared/ui/modal';
import { UiField, UiPageHeader } from '../../shared/ui/primitives';
import { UiTable, type Column } from '../../shared/ui/table';

/** Which `PosApi` resource a master route is bound to. */
export type MasterResource =
  | 'branches'
  | 'couriers'
  | 'departments'
  | 'categories'
  | 'units'
  | 'origins'
  | 'brands'
  | 'areas'
  | 'referrals';

export interface MasterConfig {
  resource: MasterResource;
  title: string;
  singular: string;
  subtitle: string;
  icon: IconName;
}

/**
 * One screen for the nine "name only" endpoints — Branch, CourierName,
 * Department, Category, Unit, Origin, Brand, Area and Referred. The route's
 * `data` says which resource it is editing.
 */
@Component({
  selector: 'app-master-page',
  imports: [UiPageHeader, UiTable, UiFilterBar, UiButton, UiModal, UiField, FormField, UiAutofocus],
  template: `
    <div class="space-y-4">
      <ui-page-header
        [icon]="config().icon"
        [title]="config().title"
        [subtitle]="config().subtitle"
      >
        <ui-button variant="primary" icon="plus" (pressed)="openCreate()">
          New {{ config().singular }}
        </ui-button>
      </ui-page-header>

      <ui-filter-bar
        [(search)]="search"
        [searchLabel]="'Find a ' + config().singular"
        [placeholder]="'Search ' + config().title.toLowerCase() + '…'"
        (refresh)="reload()"
        (exported)="exportCsv()"
        (printed)="printPdf()"
      />

      <ui-table
        [rows]="filtered()"
        [columns]="columns"
        [loading]="store.loading()"
        [actions]="rowActions"
        [emptyTitle]="'No ' + config().title.toLowerCase() + ' yet'"
        [emptyMessage]="
          'Create the first ' + config().singular + ' to start using it in documents.'
        "
      />
    </div>

    <ng-template #rowActions let-row>
      <div class="flex justify-end gap-1">
        <ui-button
          variant="ghost"
          size="icon"
          icon="edit"
          [ariaLabel]="'Edit ' + row.name"
          (pressed)="openEdit(row)"
        />
        <ui-button
          variant="ghost"
          size="icon"
          icon="trash"
          [ariaLabel]="'Delete ' + row.name"
          (pressed)="remove(row)"
        />
      </div>
    </ng-template>

    <ui-modal
      [(open)]="editorOpen"
      size="sm"
      [heading]="editing() ? 'Edit ' + config().singular : 'New ' + config().singular"
      [subheading]="config().subtitle"
    >
      <form id="master-form" class="space-y-4" (submit)="save($event)">
        <ui-field
          label="Name"
          for="master-name"
          [required]="true"
          [error]="nameError()"
          hint="Shown in every picker that references this list."
        >
          <input
            id="master-name"
            uiAutofocus
            type="text"
            class="ctl"
            [formField]="entryForm.name"
            [attr.aria-invalid]="nameError() ? 'true' : null"
            [placeholder]="'e.g. ' + config().singular"
          />
        </ui-field>
      </form>

      <div modal-footer class="flex gap-2">
        <ui-button variant="ghost" (pressed)="editorOpen.set(false)">Cancel</ui-button>
        <ui-button variant="primary" icon="save" [loading]="saving()" (pressed)="save()">
          {{ editing() ? 'Save changes' : 'Create' }}
        </ui-button>
      </div>
    </ui-modal>
  `,
  host: { class: 'block' },
})
export class MasterPage {
  private readonly api = inject(PosApi);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly lookups = inject(Lookups);
  private readonly print = inject(PrintService);

  private readonly routeData = toSignal(this.route.data, {
    initialValue: this.route.snapshot.data,
  });

  protected readonly config = computed(() => this.routeData() as unknown as MasterConfig);

  protected readonly search = signal('');
  protected readonly editorOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly editing = signal<NamedEntity | null>(null);

  private readonly model = signal({ name: '' });
  protected readonly entryForm = form(this.model, (path) => {
    required(path.name, { message: 'A name is required.' });
  });

  protected readonly store = new ListStore<NamedEntity>((filter) => this.endpoint().search(filter));

  protected readonly columns: Column<NamedEntity>[] = [
    { key: 'name', header: 'Name', value: (row) => row.name, kind: 'strong' },
    {
      key: 'postBy',
      header: 'Created by',
      value: (row) => row.postBy ?? '—',
      hideOnMobile: true,
    },
    {
      key: 'postDate',
      header: 'Created',
      value: (row) => row.postDate ?? '',
      kind: 'date',
      align: 'right',
      hideOnMobile: true,
    },
  ];

  protected readonly filtered = computed(() =>
    this.store.rows().filter((row) => matches(row.name, this.search())),
  );

  constructor() {
    // The same component instance serves all nine routes, so reload on data change.
    effect(() => {
      this.config();
      this.search.set('');
      void this.store.load({});
    });
  }

  private endpoint() {
    return this.api[this.config().resource];
  }

  protected reload(): void {
    void this.store.load({});
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.model.set({ name: '' });
    this.entryForm().reset();
    this.editorOpen.set(true);
  }

  protected openEdit(row: NamedEntity): void {
    this.editing.set(row);
    this.model.set({ name: row.name });
    this.entryForm().reset();
    this.editorOpen.set(true);
  }

  protected nameError(): string {
    const field = this.entryForm.name();
    return field.touched() && field.invalid() ? 'A name is required.' : '';
  }

  protected async save(event?: Event): Promise<void> {
    event?.preventDefault();
    await submit(this.entryForm, async () => {
      this.saving.set(true);
      const payload = { name: this.model().name.trim(), postBy: 'Aman' };
      const current = this.editing();
      try {
        if (current) {
          await firstValueFrom(this.endpoint().update(current.id, payload));
          this.toast.success('Saved', `${payload.name} was updated.`);
        } else {
          await firstValueFrom(this.endpoint().create(payload));
          this.toast.success('Created', `${payload.name} was added.`);
        }
        this.editorOpen.set(false);
        this.reload();
        void this.lookups.refresh(this.config().resource);
      } catch {
        /* surfaced by the error interceptor */
      } finally {
        this.saving.set(false);
      }
      return undefined;
    });
  }

  protected async remove(row: NamedEntity): Promise<void> {
    const confirmed = await this.confirm.askDelete(`“${row.name}”`);
    if (!confirmed) return;
    try {
      await firstValueFrom(this.endpoint().remove(row.id as Id));
      this.store.removeWhere((candidate) => candidate.id === row.id);
      this.toast.success('Deleted', `${row.name} was removed.`);
      void this.lookups.refresh(this.config().resource);
    } catch {
      /* surfaced by the error interceptor */
    }
  }

  /** One row shape, shared by the CSV export and the printed report. */
  private reportRows(): Record<string, unknown>[] {
    return this.filtered().map((row) => ({
      Name: row.name,
      'Created by': row.postBy ?? '',
      Created: prettyDate(row.postDate),
    }));
  }

  private slug(): string {
    return this.config().title.toLowerCase().replace(/\s+/g, '-');
  }

  protected exportCsv(): void {
    downloadCsv(this.slug(), this.reportRows());
  }

  protected printPdf(): void {
    this.print.report({
      title: this.config().title,
      subtitle: this.config().subtitle,
      filename: this.slug(),
      filters: [{ label: 'Search', value: this.search() || 'All records' }],
      summary: [{ label: 'Records', value: String(this.filtered().length) }],
      sections: [
        {
          rows: this.reportRows(),
          emptyMessage: `No ${this.config().title.toLowerCase()} recorded yet.`,
        },
      ],
    });
  }
}

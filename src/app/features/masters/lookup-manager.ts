import { Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Id, NamedEntity } from '../../core/models';
import { Lookups } from '../../core/services/lookups';
import { PosApi } from '../../core/services/pos-api';
import { SetupLock } from '../../core/services/setup-lock';
import { UiAutofocus } from '../../shared/directives/motion';
import { UiButton } from '../../shared/ui/button';
import { UiIcon } from '../../shared/ui/icon';
import { UiModal } from '../../shared/ui/modal';

/** The "name only" master lists this editor covers. */
export type LookupResource = 'categories' | 'units' | 'origins' | 'brands' | 'areas' | 'referrals';

/** The sets each registration screen exposes, in tab order. */
export const ITEM_LOOKUPS: readonly LookupResource[] = ['categories', 'units', 'origins', 'brands'];
export const CUSTOMER_LOOKUPS: readonly LookupResource[] = ['areas', 'referrals'];

interface LookupMeta {
  singular: string;
  plural: string;
  hint: string;
  placeholder: string;
}

const LISTS: Record<LookupResource, LookupMeta> = {
  categories: {
    singular: 'category',
    plural: 'Categories',
    hint: 'Groups the catalogue for reporting and stock filters.',
    placeholder: 'e.g. Beverages',
  },
  units: {
    singular: 'unit',
    plural: 'Units',
    hint: 'How each item is counted — pieces, boxes, sets.',
    placeholder: 'e.g. Piece',
  },
  origins: {
    singular: 'origin',
    plural: 'Origins',
    hint: 'Country of origin, printed on invoices where required.',
    placeholder: 'e.g. Bangladesh',
  },
  brands: {
    singular: 'brand',
    plural: 'Brands',
    hint: 'Manufacturers behind the items you stock.',
    placeholder: 'e.g. Aurora',
  },
  areas: {
    singular: 'area',
    plural: 'Areas',
    hint: 'Delivery zones used to group customers on the sales reports.',
    placeholder: 'e.g. Gazipur',
  },
  referrals: {
    singular: 'referral source',
    plural: 'Referral sources',
    hint: 'Where a customer came from — walk-in, page, referral.',
    placeholder: 'e.g. Facebook page',
  },
};

/** A change waiting for the passcode. Nothing reaches the API until it clears. */
type Pending =
  | { kind: 'add'; name: string }
  | { kind: 'rename'; row: NamedEntity; name: string }
  | { kind: 'delete'; row: NamedEntity };

/**
 * Editor for the "name only" master lists, reachable only from the registration
 * screen that uses them — `resources` picks the set. The lists are readable,
 * but every add, rename and delete is held back until the setup passcode is
 * entered for that one change.
 *
 * It opens over the registration form so a missing value can be added without
 * losing what is half typed, and keeps its feedback inside the panel: a modal
 * `<dialog>` sits in the top layer, where the app's toast and confirm hosts
 * would be painted underneath it.
 */
@Component({
  selector: 'app-lookup-manager',
  imports: [UiModal, UiButton, UiIcon, UiAutofocus],
  template: `
    <ui-modal [(open)]="open" size="md" heading="Master lists" [subheading]="subheading()">
      @if (pending(); as action) {
        <div class="mx-auto max-w-sm py-4 text-center">
          <span
            class="mx-auto grid size-12 place-items-center rounded-2xl"
            [class]="action.kind === 'delete' ? 'bg-neg-soft text-neg' : 'bg-warn-soft text-warn'"
          >
            <ui-icon name="lock" [size]="22" />
          </span>
          <h3 class="mt-3 text-[15px] font-semibold text-ink">{{ challenge().title }}</h3>
          <p class="mx-auto mt-1 max-w-xs text-[13px] text-muted">{{ challenge().detail }}</p>

          <!-- \`autofocus\` is what a <dialog> honours on showModal(); the
               directive covers the panel being swapped in mid-session. -->
          <form class="mt-5 space-y-2 text-left" (submit)="confirmPending($event)">
            <label class="block text-[12.5px] font-medium text-muted" for="setup-passcode">
              Setup passcode
            </label>
            <input
              id="setup-passcode"
              autofocus
              uiAutofocus
              type="password"
              class="ctl"
              inputmode="numeric"
              autocomplete="off"
              [value]="passcode()"
              [attr.aria-invalid]="passcodeError() ? 'true' : null"
              [attr.aria-describedby]="passcodeError() ? 'setup-passcode-error' : null"
              (input)="onPasscode($event)"
            />
            @if (passcodeError()) {
              <p id="setup-passcode-error" class="text-[12px] font-medium text-neg" role="alert">
                {{ passcodeError() }}
              </p>
            } @else {
              <p class="text-[12px] text-faint">Ask a supervisor if you do not have it.</p>
            }
          </form>
        </div>
      } @else {
        <div class="space-y-4">
          <div class="flex flex-wrap gap-1.5" role="group" aria-label="Choose a master list">
            @for (tab of resources(); track tab) {
              <button
                type="button"
                class="rounded-lg px-3 py-1.5 text-[13px] font-medium transition"
                [class]="
                  tab === resource()
                    ? 'bg-brand-soft text-brand-text'
                    : 'text-muted hover:bg-surface-2 hover:text-ink'
                "
                [attr.aria-pressed]="tab === resource()"
                (click)="switchTo(tab)"
              >
                {{ pluralOf(tab) }}
              </button>
            }
          </div>

          <p class="text-[12.5px] text-faint">
            {{ meta().hint }} Every add, rename and delete asks for the setup passcode.
          </p>

          <form class="space-y-2" (submit)="requestAdd($event)">
            <label class="block text-[12.5px] font-medium text-muted" for="lookup-new">
              New {{ meta().singular }}
            </label>
            <div class="flex gap-2">
              <input
                id="lookup-new"
                autofocus
                uiAutofocus
                type="text"
                class="ctl min-w-0 flex-1"
                autocomplete="off"
                [placeholder]="meta().placeholder"
                [value]="draft()"
                [attr.aria-invalid]="error() ? 'true' : null"
                (input)="onDraft($event)"
              />
              <ui-button type="submit" variant="primary" icon="plus">Add</ui-button>
            </div>
          </form>

          @if (error()) {
            <p class="text-[12px] font-medium text-neg" role="alert">{{ error() }}</p>
          } @else if (note()) {
            <p class="text-[12px] font-medium text-pos" role="status">{{ note() }}</p>
          }

          <div class="overflow-hidden rounded-xl border border-line">
            <ul class="max-h-72 divide-y divide-line overflow-y-auto overscroll-contain">
              @for (row of rows(); track row.id) {
                <li class="px-3 py-2">
                  @if (editingId() === row.id) {
                    <form class="flex items-center gap-2" (submit)="requestRename($event, row)">
                      <input
                        uiAutofocus
                        type="text"
                        class="ctl ctl-sm min-w-0 flex-1"
                        autocomplete="off"
                        [value]="editDraft()"
                        [attr.aria-label]="'Rename ' + row.name"
                        (input)="editDraft.set($any($event.target).value)"
                      />
                      <ui-button type="submit" size="sm" variant="primary">Save</ui-button>
                      <ui-button size="sm" variant="ghost" (pressed)="editingId.set(null)">
                        Cancel
                      </ui-button>
                    </form>
                  } @else {
                    <div class="flex items-center gap-2">
                      <span class="min-w-0 flex-1 truncate text-[13px] text-ink">
                        {{ row.name }}
                      </span>
                      <ui-button
                        size="icon"
                        variant="ghost"
                        icon="edit"
                        [ariaLabel]="'Rename ' + row.name"
                        (pressed)="startEdit(row)"
                      />
                      <ui-button
                        size="icon"
                        variant="ghost"
                        icon="trash"
                        [ariaLabel]="'Delete ' + row.name"
                        (pressed)="requestDelete(row)"
                      />
                    </div>
                  }
                </li>
              } @empty {
                <li class="px-3 py-8 text-center text-[13px] text-faint">
                  No {{ meta().plural.toLowerCase() }} yet — add the first one above.
                </li>
              }
            </ul>
          </div>
        </div>
      }

      <div modal-footer class="flex gap-2">
        @if (pending()) {
          <ui-button variant="ghost" (pressed)="cancelPending()">Cancel</ui-button>
          <ui-button variant="primary" icon="key" [loading]="busy()" (pressed)="confirmPending()">
            Confirm
          </ui-button>
        } @else {
          <ui-button variant="outline" (pressed)="open.set(false)">Done</ui-button>
        }
      </div>
    </ui-modal>
  `,
  host: { class: 'contents' },
})
export class LookupManager {
  private readonly api = inject(PosApi);
  private readonly lookups = inject(Lookups);
  private readonly lock = inject(SetupLock);

  readonly open = model(false);
  /** Which list opens first; the tab strip writes the user's choice back. */
  readonly resource = model<LookupResource>('categories');
  /** The tabs on offer — one registration screen never edits another's lists. */
  readonly resources = input<readonly LookupResource[]>(ITEM_LOOKUPS);
  readonly subheading = input('Category, unit, origin and brand — shared by every item.');

  /** Lets the caller select what was just added — the reason the panel exists. */
  readonly created = output<{ resource: LookupResource; entity: NamedEntity }>();

  protected readonly meta = computed(() => LISTS[this.resource()]);
  protected readonly rows = computed<NamedEntity[]>(() => this.lookups[this.resource()]());

  protected readonly draft = signal('');
  protected readonly error = signal('');
  protected readonly note = signal('');
  protected readonly busy = signal(false);
  protected readonly passcode = signal('');
  protected readonly passcodeError = signal('');
  protected readonly editingId = signal<Id | null>(null);
  protected readonly editDraft = signal('');
  protected readonly pending = signal<Pending | null>(null);

  /** Says exactly what the passcode is about to authorise. */
  protected readonly challenge = computed(() => {
    const action = this.pending();
    const { singular, plural } = this.meta();
    if (!action) return { title: '', detail: '' };
    switch (action.kind) {
      case 'add':
        return {
          title: `Add this ${singular}?`,
          detail: `“${action.name}” joins ${plural.toLowerCase()} once the passcode checks out.`,
        };
      case 'rename':
        return {
          title: `Rename this ${singular}?`,
          detail: `“${action.row.name}” becomes “${action.name}” everywhere it is used.`,
        };
      case 'delete':
        return {
          title: `Delete this ${singular}?`,
          detail: `“${action.row.name}” goes for good, and items pointing at it lose the link.`,
        };
    }
  });

  constructor() {
    // Nothing half-typed, and no pending change, survives a close and reopen.
    effect(() => {
      this.open();
      this.reset();
    });
  }

  protected pluralOf(resource: LookupResource): string {
    return LISTS[resource].plural;
  }

  protected switchTo(resource: LookupResource): void {
    this.resource.set(resource);
    this.reset();
  }

  protected onDraft(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
    this.error.set('');
  }

  protected startEdit(row: NamedEntity): void {
    this.error.set('');
    this.note.set('');
    this.editingId.set(row.id);
    this.editDraft.set(row.name);
  }

  /* Requests: validated here, then held until the passcode clears them. ---- */

  protected requestAdd(event: Event): void {
    event.preventDefault();
    const name = this.draft().trim();
    const { singular } = this.meta();
    if (!name) {
      this.error.set(`Type a ${singular} name first.`);
      return;
    }
    if (this.exists(name)) {
      this.error.set(`“${name}” is already on this list.`);
      return;
    }
    this.challengeFor({ kind: 'add', name });
  }

  protected requestRename(event: Event, row: NamedEntity): void {
    event.preventDefault();
    const name = this.editDraft().trim();
    if (!name) {
      this.error.set('A name is required.');
      return;
    }
    if (name === row.name) {
      this.editingId.set(null);
      return;
    }
    if (this.exists(name, row.id)) {
      this.error.set(`“${name}” is already on this list.`);
      return;
    }
    this.challengeFor({ kind: 'rename', row, name });
  }

  protected requestDelete(row: NamedEntity): void {
    this.editingId.set(null);
    this.challengeFor({ kind: 'delete', row });
  }

  /* The passcode challenge ------------------------------------------------ */

  protected onPasscode(event: Event): void {
    this.passcode.set((event.target as HTMLInputElement).value);
    this.passcodeError.set('');
  }

  protected async confirmPending(event?: Event): Promise<void> {
    event?.preventDefault();
    const action = this.pending();
    if (!action || this.busy()) return;
    if (!this.lock.verify(this.passcode())) {
      this.passcode.set('');
      this.passcodeError.set('That passcode is not right.');
      return;
    }
    this.passcode.set('');
    this.passcodeError.set('');
    await this.perform(action);
  }

  protected cancelPending(): void {
    this.pending.set(null);
    this.passcode.set('');
    this.passcodeError.set('');
  }

  private challengeFor(action: Pending): void {
    this.error.set('');
    this.note.set('');
    this.passcode.set('');
    this.passcodeError.set('');
    this.pending.set(action);
  }

  private async perform(action: Pending): Promise<void> {
    const resource = this.resource();
    const endpoint = this.api[resource];
    this.busy.set(true);
    try {
      switch (action.kind) {
        case 'add': {
          const entity = await firstValueFrom(
            endpoint.create({ name: action.name, postBy: 'Aman' }),
          );
          await this.lookups.refresh(resource);
          this.draft.set('');
          this.note.set(`“${action.name}” added.`);
          this.created.emit({ resource, entity });
          break;
        }
        case 'rename': {
          await firstValueFrom(
            endpoint.update(action.row.id, { name: action.name, postBy: 'Aman' }),
          );
          await this.lookups.refresh(resource);
          this.editingId.set(null);
          this.note.set(`Renamed to “${action.name}”.`);
          break;
        }
        case 'delete': {
          await firstValueFrom(endpoint.remove(action.row.id));
          await this.lookups.refresh(resource);
          this.note.set(`“${action.row.name}” was removed.`);
          break;
        }
      }
    } catch {
      this.error.set(FAILURES[action.kind]);
    } finally {
      // Either way the challenge is spent — back to the list, passcode and all.
      this.pending.set(null);
      this.busy.set(false);
    }
  }

  private exists(name: string, ignore?: Id): boolean {
    const needle = name.toLowerCase();
    return this.rows().some((row) => row.id !== ignore && row.name.trim().toLowerCase() === needle);
  }

  private reset(): void {
    this.draft.set('');
    this.error.set('');
    this.note.set('');
    this.passcode.set('');
    this.passcodeError.set('');
    this.editingId.set(null);
    this.editDraft.set('');
    this.pending.set(null);
  }
}

const FAILURES: Record<Pending['kind'], string> = {
  add: 'Could not save that entry. Try again.',
  rename: 'Could not rename that entry. Try again.',
  delete: 'Could not delete that entry — items may still point at it.',
};

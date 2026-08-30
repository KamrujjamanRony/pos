import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { UiAutofocus } from '../directives/motion';
import { UiIcon } from './icon';

/** The offsets written onto the popup, already corrected for its origin. */
interface PanelBox {
  left: number;
  width: number;
  /** Exactly one of `top` / `bottom` is set; the other stays unstyled. */
  top: number | null;
  bottom: number | null;
  maxHeight: number;
}

/** Where the popup should end up, in viewport pixels. */
interface Target {
  left: number;
  /** Set when the popup drops down: the viewport y of its top edge. */
  top: number | null;
  /** Set when it drops up: the viewport y of its bottom edge. */
  bottomEdge: number | null;
}

const GAP = 6;
const EDGE = 8;
const MIN_WIDTH = 224;
const MIN_HEIGHT = 180;
const MAX_HEIGHT = 340;

/**
 * Type-ahead single-select. Used wherever a plain `<select>` would be painful:
 * items, customers, suppliers, accounts.
 *
 * The popup is `position: fixed` and measured against the trigger rather than
 * absolutely positioned inside it. Half the comboboxes in the app sit in a
 * dialog whose body scrolls, and an absolute popup is clipped by that
 * `overflow-y-auto` the moment the list is longer than the space beneath.
 *
 * Fixed offsets are not always viewport offsets: a transform, filter or
 * animation anywhere above the popup makes that ancestor the containing block,
 * and the modal panel's entry animation does exactly that. So the popup is
 * placed, measured once while still hidden, and the difference folded into
 * `adjust` — after which it tracks the trigger correctly wherever it lives.
 */
@Component({
  selector: 'ui-combobox',
  imports: [UiAutofocus, UiIcon],
  template: `
    <div class="relative">
      <button
        type="button"
        #trigger
        role="combobox"
        class="ctl flex items-center gap-2 text-left"
        [class.ctl-sm]="compact()"
        [class.pr-14]="showClear()"
        aria-haspopup="listbox"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="open() ? listId : null"
        [attr.aria-invalid]="invalid() || null"
        [disabled]="disabled()"
        (click)="toggle()"
        (keydown)="onTriggerKey($event)"
      >
        <span class="min-w-0 flex-1 truncate" [class.text-faint]="!selectedLabel()">
          {{ selectedLabel() || placeholder() }}
        </span>
        <ui-icon
          name="chevronDown"
          [size]="15"
          class="text-faint transition-transform duration-200"
          [class.rotate-180]="open()"
        />
      </button>

      <!-- Sibling of the trigger, never nested inside it: a button inside a
           button is invalid and trips the nested-interactive rule. -->
      @if (showClear()) {
        <button
          type="button"
          class="absolute top-1/2 right-8 grid size-5 -translate-y-1/2 place-items-center rounded text-faint transition hover:text-neg"
          aria-label="Clear selection"
          (click)="clear($event)"
        >
          <ui-icon name="close" [size]="13" />
        </button>
      }

      @if (open()) {
        <div
          #panelEl
          class="animate-pop fixed z-50 flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-float"
          [style.left.px]="panel().left"
          [style.width.px]="panel().width"
          [style.top.px]="panel().top"
          [style.bottom.px]="panel().bottom"
          [style.max-height.px]="panel().maxHeight"
          [style.visibility]="placed() ? null : 'hidden'"
        >
          <div class="border-b border-line p-2">
            <div class="relative">
              <span
                class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint"
              >
                <ui-icon name="search" [size]="15" />
              </span>
              <input
                uiAutofocus
                type="text"
                class="ctl ctl-sm pl-8"
                [placeholder]="searchPlaceholder()"
                [value]="query()"
                [attr.aria-label]="searchPlaceholder()"
                [attr.aria-controls]="listId"
                [attr.aria-activedescendant]="activeOptionId()"
                (input)="onQuery($event)"
                (keydown)="onSearchKey($event)"
                autocomplete="off"
              />
            </div>
          </div>

          <ul
            [id]="listId"
            role="listbox"
            class="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1"
          >
            @for (option of filtered(); track keyOf()(option); let i = $index) {
              <li role="none">
                <button
                  type="button"
                  role="option"
                  [id]="listId + '-option-' + i"
                  class="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition"
                  [class]="
                    i === active() ? 'bg-brand-soft text-brand-text' : 'text-ink hover:bg-surface-2'
                  "
                  [attr.aria-selected]="keyOf()(option) === value()"
                  (mouseenter)="active.set(i)"
                  (click)="choose(option)"
                >
                  <span class="min-w-0 flex-1 truncate">{{ labelOf()(option) }}</span>
                  @if (subOf(); as sub) {
                    <span class="shrink-0 text-[11.5px] text-faint">{{ sub(option) }}</span>
                  }
                  @if (keyOf()(option) === value()) {
                    <ui-icon name="check" [size]="14" class="text-brand" />
                  }
                </button>
              </li>
            } @empty {
              <li role="none" class="px-3 py-6 text-center text-[13px] text-faint">
                No match for “{{ query() }}”
              </li>
            }
          </ul>
        </div>
      }
    </div>
  `,
  host: { class: 'block' },
})
export class UiCombobox<T> {
  readonly options = input.required<readonly T[]>();
  readonly labelOf = input.required<(option: T) => string>();
  readonly keyOf = input.required<(option: T) => number | string>();
  readonly subOf = input<((option: T) => string) | null>(null);

  readonly value = model<number | string | null>(null);
  readonly placeholder = input('Select…');
  readonly searchPlaceholder = input('Type to search…');
  readonly disabled = input(false);
  readonly compact = input(false);
  readonly clearable = input(true);
  readonly invalid = input(false);
  /** Opens upward — for comboboxes near the bottom of a panel. */
  readonly dropUp = input(false);

  readonly selected = output<T>();

  protected readonly listId = `combobox-${Math.random().toString(36).slice(2, 9)}`;
  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly active = signal(0);
  protected readonly panel = signal<PanelBox>({
    left: 0,
    width: MIN_WIDTH,
    top: 0,
    bottom: null,
    maxHeight: MAX_HEIGHT,
  });
  /** False for the one frame between rendering the popup and aligning it. */
  protected readonly placed = signal(false);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panelEl = viewChild<ElementRef<HTMLElement>>('panelEl');

  private target: Target = { left: 0, top: 0, bottomEdge: null };
  /** Distance from the popup's containing block to the viewport, once known. */
  private readonly adjust = { x: 0, y: 0, bottom: 0 };

  protected readonly filtered = computed(() => {
    const needle = this.query().trim().toLowerCase();
    const label = this.labelOf();
    const sub = this.subOf();
    if (!needle) return this.options();
    return this.options().filter((option) =>
      `${label(option)} ${sub ? sub(option) : ''}`.toLowerCase().includes(needle),
    );
  });

  protected readonly showClear = computed(
    () => this.clearable() && !this.disabled() && this.value() !== null && this.value() !== '',
  );

  protected readonly selectedLabel = computed(() => {
    const current = this.value();
    if (current === null || current === undefined || current === '') return '';
    const match = this.options().find((option) => this.keyOf()(option) === current);
    return match ? this.labelOf()(match) : '';
  });

  /** Points assistive tech at the highlighted row without moving real focus. */
  protected readonly activeOptionId = computed(() =>
    this.filtered().length ? `${this.listId}-option-${this.active()}` : null,
  );

  constructor() {
    effect((onCleanup) => {
      if (!this.open()) {
        this.placed.set(false);
        return;
      }
      this.active.set(0);
      this.measure();
      if (typeof window === 'undefined') return;

      // A fixed popup is not clipped by a scrolling dialog body, but it does not
      // travel with it either — so follow anything that moves underneath it.
      // Scroll does not bubble, hence the capture-phase listener.
      const reposition = () => this.measure();
      // Dismissing on an outside press beats a full-screen click-away layer:
      // that layer is fixed too, so it only ever covered its own containing
      // block, and a click on the page behind a dialog missed it entirely.
      const dismiss = (event: Event) => {
        const target = event.target as Node | null;
        if (!target || !this.host.nativeElement.contains(target)) this.close();
      };
      document.addEventListener('scroll', reposition, true);
      document.addEventListener('pointerdown', dismiss, true);
      window.addEventListener('resize', reposition);
      onCleanup(() => {
        document.removeEventListener('scroll', reposition, true);
        document.removeEventListener('pointerdown', dismiss, true);
        window.removeEventListener('resize', reposition);
      });
    });

    // Once per opening, after the popup's styles have hit the DOM and before
    // the browser paints — the only phase where its box can be trusted.
    afterRenderEffect(() => {
      const element = this.panelEl()?.nativeElement;
      if (element && !this.placed()) this.align(element);
    });
  }

  /** Pins the popup to the trigger, flipping it up when it would not fit. */
  private measure(): void {
    const trigger = this.trigger()?.nativeElement;
    if (!trigger || typeof window === 'undefined') return;

    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - GAP - EDGE;
    const above = rect.top - GAP - EDGE;
    const up = (this.dropUp() && above >= MIN_HEIGHT) || (below < MIN_HEIGHT && above > below);

    const width = Math.min(Math.max(rect.width, MIN_WIDTH), window.innerWidth - EDGE * 2);
    const left = Math.min(Math.max(EDGE, rect.left), window.innerWidth - width - EDGE);

    this.target = {
      left,
      top: up ? null : rect.bottom + GAP,
      bottomEdge: up ? rect.top - GAP : null,
    };

    this.panel.set({
      width,
      maxHeight: Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, up ? above : below)),
      left: left + this.adjust.x,
      top: up ? null : rect.bottom + GAP + this.adjust.y,
      bottom: up ? window.innerHeight - rect.top + GAP + this.adjust.bottom : null,
    });
  }

  /**
   * Corrects for a containing block that is not the viewport. The gap between
   * asked-for and actual is constant while the popup is open, so folding it
   * into `adjust` fixes this placement and every reposition after it.
   */
  private align(element: HTMLElement): void {
    const actual = element.getBoundingClientRect();
    const wantedTop = this.target.top ?? (this.target.bottomEdge ?? 0) - actual.height;
    const dx = actual.left - this.target.left;
    const dy = actual.top - wantedTop;

    if (dx || dy) {
      this.adjust.x -= dx;
      this.adjust.y -= dy;
      this.adjust.bottom += dy;
      this.measure();
    }
    this.placed.set(true);
  }

  protected toggle(): void {
    if (this.disabled()) return;
    this.open.update((v) => !v);
    if (this.open()) this.query.set('');
  }

  protected close(): void {
    this.open.set(false);
  }

  /** Selecting or escaping hands focus back to the trigger, not to the page. */
  private closeAndReturnFocus(): void {
    this.close();
    this.trigger()?.nativeElement.focus({ preventScroll: true });
  }

  protected clear(event: Event): void {
    event.stopPropagation();
    this.value.set(null);
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.active.set(0);
  }

  protected choose(option: T): void {
    this.value.set(this.keyOf()(option));
    this.selected.emit(option);
    this.closeAndReturnFocus();
  }

  protected onTriggerKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.open.set(true);
      this.query.set('');
      return;
    }
    if (event.key === 'Escape' && this.open()) {
      event.preventDefault();
      this.close();
    }
  }

  protected onSearchKey(event: KeyboardEvent): void {
    const options = this.filtered();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.active.update((i) => Math.min(i + 1, options.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.active.update((i) => Math.max(i - 1, 0));
        break;
      case 'Enter': {
        event.preventDefault();
        const option = options[this.active()];
        if (option) this.choose(option);
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.closeAndReturnFocus();
        break;
      case 'Tab':
        // Focus is leaving the popup; there is nothing left to dismiss it.
        this.close();
        break;
      default:
        break;
    }
  }
}

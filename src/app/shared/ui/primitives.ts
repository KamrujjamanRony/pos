import { Component, computed, input } from '@angular/core';
import { IconName, UiIcon } from './icon';

export type Tone = 'brand' | 'pos' | 'neg' | 'warn' | 'info' | 'neutral';

const BADGE_TONES: Record<Tone, string> = {
  brand: 'bg-brand-soft text-brand-text',
  pos: 'bg-pos-soft text-pos',
  neg: 'bg-neg-soft text-neg',
  warn: 'bg-warn-soft text-warn',
  info: 'bg-info-soft text-info',
  neutral: 'bg-surface-3 text-muted',
};

const DOT_TONES: Record<Tone, string> = {
  brand: 'bg-brand',
  pos: 'bg-pos',
  neg: 'bg-neg',
  warn: 'bg-warn',
  info: 'bg-info',
  neutral: 'bg-faint',
};

/** Compact status pill. */
@Component({
  selector: 'ui-badge',
  template: `
    @if (dot()) {
      <span class="size-1.5 rounded-full" [class]="dotClass()" aria-hidden="true"></span>
    }
    <ng-content />
  `,
  host: {
    '[class]': 'classes()',
  },
})
export class UiBadge {
  readonly tone = input<Tone>('neutral');
  readonly dot = input(false);

  protected readonly classes = computed(
    () =>
      `inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${BADGE_TONES[this.tone()]}`,
  );
  protected readonly dotClass = computed(() => DOT_TONES[this.tone()]);
}

/** Rounded panel with an optional titled header row. */
@Component({
  selector: 'ui-card',
  imports: [UiIcon],
  template: `
    @if (heading() || icon()) {
      <header class="flex items-center gap-3 border-b border-line px-5 py-4">
        @if (icon(); as glyph) {
          <span class="grid size-9 place-items-center rounded-xl bg-brand-soft text-brand-text">
            <ui-icon [name]="glyph" [size]="18" />
          </span>
        }
        <div class="min-w-0 flex-1">
          <h2 class="truncate text-sm font-semibold text-ink">{{ heading() }}</h2>
          @if (subheading()) {
            <p class="truncate text-xs text-muted">{{ subheading() }}</p>
          }
        </div>
        <ng-content select="[card-actions]" />
      </header>
    }
    <div [class]="bodyClass()">
      <ng-content />
    </div>
  `,
  host: { class: 'surface-card block overflow-hidden' },
})
export class UiCard {
  readonly heading = input('');
  readonly subheading = input('');
  readonly icon = input<IconName | null>(null);
  readonly padded = input(true);

  protected readonly bodyClass = computed(() => (this.padded() ? 'p-5' : ''));
}

/** Page title block with breadcrumb-free, action-friendly layout. */
@Component({
  selector: 'ui-page-header',
  imports: [UiIcon],
  template: `
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="flex min-w-0 items-center gap-3.5">
        @if (icon(); as glyph) {
          <span
            class="grid size-11 place-items-center rounded-2xl bg-linear-to-br from-brand to-accent text-white shadow-glow"
          >
            <ui-icon [name]="glyph" [size]="21" />
          </span>
        }
        <div class="min-w-0">
          <h1 class="truncate text-xl font-semibold tracking-tight text-ink sm:text-[22px]">
            {{ title() }}
          </h1>
          @if (subtitle()) {
            <p class="mt-0.5 text-sm text-muted">{{ subtitle() }}</p>
          }
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <ng-content />
      </div>
    </div>
  `,
  host: { class: 'block animate-rise' },
})
export class UiPageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly icon = input<IconName | null>(null);
}

/** Placeholder for an empty result set. */
@Component({
  selector: 'ui-empty',
  imports: [UiIcon],
  template: `
    <div class="animate-pop flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span
        class="grid size-14 place-items-center rounded-2xl bg-surface-2 text-faint ring-1 ring-line"
      >
        <ui-icon [name]="icon()" [size]="26" />
      </span>
      <div>
        <p class="text-sm font-semibold text-ink">{{ title() }}</p>
        @if (message()) {
          <p class="mx-auto mt-1 max-w-sm text-[13px] text-muted">{{ message() }}</p>
        }
      </div>
      <ng-content />
    </div>
  `,
  host: { class: 'block' },
})
export class UiEmpty {
  readonly title = input('Nothing here yet');
  readonly message = input('');
  readonly icon = input<IconName>('inbox');
}

/** Shimmering placeholder rows shown while a request is in flight. */
@Component({
  selector: 'ui-skeleton',
  template: `
    @for (row of rows(); track $index) {
      <div class="skeleton" [style.height.px]="height()" [style.width]="widthFor($index)"></div>
    }
  `,
  host: { class: 'flex flex-col gap-2.5', 'aria-hidden': 'true' },
})
export class UiSkeleton {
  readonly count = input(5);
  readonly height = input(38);

  protected readonly rows = computed(() => Array.from({ length: this.count() }));

  protected widthFor(index: number): string {
    // Slight variation reads as content rather than as a loading bar.
    return `${100 - ((index * 7) % 22)}%`;
  }
}

/** Label + hint + validation message wrapper for native controls. */
@Component({
  selector: 'ui-field',
  template: `
    <label class="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-muted" [attr.for]="for()">
      {{ label() }}
      @if (required()) {
        <span class="text-neg" aria-hidden="true">*</span>
      }
    </label>
    <ng-content />
    @if (error()) {
      <p class="animate-fade mt-1.5 text-[12px] font-medium text-neg">{{ error() }}</p>
    } @else if (hint()) {
      <p class="mt-1.5 text-[12px] text-faint">{{ hint() }}</p>
    }
  `,
  host: { class: 'block min-w-0' },
})
export class UiField {
  readonly label = input.required<string>();
  readonly for = input<string | null>(null);
  readonly hint = input('');
  readonly error = input('');
  readonly required = input(false);
}

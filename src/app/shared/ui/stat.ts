import { Component, computed, input } from '@angular/core';
import { UiSparkline } from './charts';
import { UiCount } from './count';
import { IconName, UiIcon } from './icon';

/**
 * Stat tile: label · value · optional signed delta vs a named period ·
 * optional 12-point trend. The value uses proportional figures — tabular
 * digits only belong in columns that align vertically.
 */
@Component({
  selector: 'ui-stat',
  imports: [UiIcon, UiCount, UiSparkline],
  template: `
    <div
      class="surface-card group relative h-full overflow-hidden p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card"
    >
      <!-- Decorative wash; purely presentational. -->
      <div
        class="pointer-events-none absolute -top-12 -right-10 size-32 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-45"
        [style.background]="accent()"
        aria-hidden="true"
      ></div>

      <div class="relative flex items-start justify-between gap-3">
        <p class="text-[12.5px] font-medium text-muted">{{ label() }}</p>
        @if (icon(); as glyph) {
          <span
            class="grid size-8 shrink-0 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-110"
            [style.background]="soft()"
            [style.color]="accent()"
          >
            <ui-icon [name]="glyph" [size]="16" />
          </span>
        }
      </div>

      <p class="relative mt-2 text-[26px] leading-none font-semibold tracking-tight text-ink">
        @if (prefix()) {
          <span class="mr-0.5 text-[15px] font-medium text-faint">{{ prefix() }}</span>
        }
        <ui-count [value]="value()" [format]="format()" />
        @if (suffix()) {
          <span class="ml-0.5 text-[15px] font-medium text-faint">{{ suffix() }}</span>
        }
      </p>

      <div class="relative mt-3 flex items-end justify-between gap-3">
        @if (delta() !== null) {
          <span
            class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold"
            [class]="deltaClass()"
          >
            <ui-icon [name]="deltaUp() ? 'trendUp' : 'trendDown'" [size]="13" />
            {{ deltaLabel() }}
          </span>
          @if (deltaCaption()) {
            <span class="sr-only">{{ deltaCaption() }}</span>
          }
        } @else {
          <span></span>
        }

        @if (trend().length > 1) {
          <div class="w-24 shrink-0 opacity-80">
            <ui-sparkline
              [values]="trend()"
              [height]="30"
              [color]="accent()"
              [ariaLabel]="label() + ' trend'"
            />
          </div>
        }
      </div>

      @if (deltaCaption()) {
        <p class="relative mt-1.5 text-[11.5px] text-faint">{{ deltaCaption() }}</p>
      }
    </div>
  `,
  host: { class: 'block' },
})
export class UiStat {
  readonly label = input.required<string>();
  readonly value = input(0);
  readonly format = input<'money' | 'plain' | 'compact' | 'percent' | 'integer'>('money');
  readonly prefix = input('');
  readonly suffix = input('');
  readonly icon = input<IconName | null>(null);
  readonly series = input(1);
  /** Percentage change; `null` hides the delta chip. */
  readonly delta = input<number | null>(null);
  readonly deltaCaption = input('');
  /** Set false where a rise is bad (e.g. outstanding dues). */
  readonly upIsGood = input(true);
  readonly trend = input<readonly number[]>([]);

  protected readonly accent = computed(() => `var(--viz-${this.series()})`);
  protected readonly soft = computed(
    () => `color-mix(in oklab, var(--viz-${this.series()}) 16%, transparent)`,
  );

  protected readonly deltaUp = computed(() => (this.delta() ?? 0) >= 0);

  protected readonly deltaLabel = computed(() => {
    const value = this.delta() ?? 0;
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  });

  protected readonly deltaClass = computed(() => {
    const good = this.deltaUp() === this.upIsGood();
    return good ? 'bg-pos-soft text-pos' : 'bg-neg-soft text-neg';
  });
}

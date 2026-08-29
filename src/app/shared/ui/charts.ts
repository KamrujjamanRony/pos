import { Component, computed, input, signal } from '@angular/core';
import { compact, money } from '../../core/util/format';

/* Series slots are assigned in fixed order and never cycled; see styles.css. */
export const SERIES = [
  'var(--viz-1)',
  'var(--viz-2)',
  'var(--viz-3)',
  'var(--viz-4)',
  'var(--viz-5)',
  'var(--viz-6)',
] as const;

export interface Point {
  label: string;
  value: number;
}

/* ------------------------------------------------------------------ *
 * Sparkline — the trend line inside a stat tile. Single series, so no
 * legend: the tile's label already says what is plotted.
 * ------------------------------------------------------------------ */
@Component({
  selector: 'ui-sparkline',
  template: `
    <svg
      [attr.viewBox]="'0 0 ' + width + ' ' + height()"
      preserveAspectRatio="none"
      class="w-full"
      [style.height.px]="height()"
      role="img"
      [attr.aria-label]="ariaLabel()"
    >
      <defs>
        <linearGradient [attr.id]="gradientId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" [attr.stop-color]="color()" stop-opacity="0.18" />
          <stop offset="100%" [attr.stop-color]="color()" stop-opacity="0" />
        </linearGradient>
      </defs>

      @if (points().length > 1) {
        <path [attr.d]="areaPath()" [attr.fill]="'url(#' + gradientId + ')'" />
        <path
          [attr.d]="linePath()"
          fill="none"
          [attr.stroke]="color()"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="spark-line"
        />
        <!-- End marker: r=4 with a 2px surface ring so it stays legible. -->
        <circle
          [attr.cx]="last().x"
          [attr.cy]="last().y"
          r="4"
          [attr.fill]="color()"
          stroke="var(--c-surface)"
          stroke-width="2"
        />
      }
    </svg>
  `,
  styles: `
    .spark-line {
      stroke-dasharray: 1000;
      stroke-dashoffset: 1000;
      animation: draw 1.1s var(--ease-out-expo) forwards;
    }
    @keyframes draw {
      to {
        stroke-dashoffset: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .spark-line {
        stroke-dasharray: none;
        animation: none;
      }
    }
  `,
  host: { class: 'block' },
})
export class UiSparkline {
  readonly values = input.required<readonly number[]>();
  readonly height = input(40);
  readonly color = input('var(--viz-1)');
  readonly ariaLabel = input('Trend');

  protected readonly width = 160;
  protected readonly gradientId = `spark-${Math.random().toString(36).slice(2, 9)}`;

  protected readonly points = computed(() => {
    const values = this.values();
    if (values.length < 2) return [];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const pad = 5;
    const usable = this.height() - pad * 2;
    return values.map((value, index) => ({
      x: (index / (values.length - 1)) * this.width,
      y: pad + usable - ((value - min) / span) * usable,
    }));
  });

  protected readonly last = computed(() => this.points().at(-1) ?? { x: 0, y: 0 });

  protected readonly linePath = computed(() =>
    this.points()
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' '),
  );

  protected readonly areaPath = computed(() => {
    const points = this.points();
    if (!points.length) return '';
    return `${this.linePath()} L${this.width} ${this.height()} L0 ${this.height()} Z`;
  });
}

/* ------------------------------------------------------------------ *
 * Column chart — magnitude over time. Hairline solid grid, capped bar
 * thickness, rounded data-end, per-column hover with a generous hit area.
 * ------------------------------------------------------------------ */
@Component({
  selector: 'ui-columns',
  template: `
    <div class="relative">
      <svg
        [attr.viewBox]="'0 0 ' + width + ' ' + totalHeight()"
        class="w-full"
        [style.height.px]="totalHeight()"
        role="img"
        [attr.aria-label]="ariaLabel()"
      >
        <!-- Recessive hairline grid. -->
        @for (tick of ticks(); track tick.value) {
          <line
            x1="46"
            [attr.x2]="width"
            [attr.y1]="tick.y"
            [attr.y2]="tick.y"
            stroke="var(--viz-grid)"
            stroke-width="1"
          />
          <text
            x="40"
            [attr.y]="tick.y + 3.5"
            text-anchor="end"
            class="num fill-[var(--c-faint)] text-[9px]"
          >
            {{ tick.label }}
          </text>
        }

        @for (bar of bars(); track bar.label; let i = $index) {
          <!-- Hit area spans the whole band so hovering never demands precision. -->
          <rect
            [attr.x]="bar.bandX"
            y="0"
            [attr.width]="bar.bandWidth"
            [attr.height]="plotHeight()"
            fill="transparent"
            (pointerenter)="hover.set(i)"
            (pointerleave)="hover.set(null)"
          />
          <path
            [attr.d]="bar.path"
            [attr.fill]="color()"
            [style.opacity]="hover() === null || hover() === i ? 1 : 0.42"
            class="origin-bottom transition-opacity duration-150"
            [style.animation]="'bar-grow 0.7s var(--ease-out-expo) ' + i * 28 + 'ms both'"
            [style.transform-origin]="bar.x + 'px ' + plotHeight() + 'px'"
          />
          @if (bar.isPeak) {
            <text
              [attr.x]="bar.x + bar.width / 2"
              [attr.y]="bar.y - 6"
              text-anchor="middle"
              class="num fill-[var(--c-muted)] text-[9px] font-semibold"
            >
              {{ formatShort(bar.value) }}
            </text>
          }
        }

        @for (bar of bars(); track bar.label; let i = $index) {
          @if (showLabel(i)) {
            <text
              [attr.x]="bar.bandX + bar.bandWidth / 2"
              [attr.y]="totalHeight() - 4"
              text-anchor="middle"
              class="fill-[var(--c-faint)] text-[9px]"
            >
              {{ bar.label }}
            </text>
          }
        }
      </svg>

      @if (hover() !== null && bars()[hover()!]; as active) {
        <div
          class="animate-fade pointer-events-none absolute -translate-x-1/2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11.5px] shadow-float"
          [style.left.%]="((active.bandX + active.bandWidth / 2) / width) * 100"
          [style.top.px]="Math.max(0, active.y - 46)"
        >
          <p class="font-medium text-ink">{{ active.label }}</p>
          <p class="num text-muted">{{ format()(active.value) }}</p>
        </div>
      }
    </div>
  `,
  host: { class: 'block' },
})
export class UiColumns {
  readonly data = input.required<readonly Point[]>();
  readonly height = input(180);
  readonly color = input('var(--viz-1)');
  readonly ariaLabel = input('Column chart');
  readonly format = input<(value: number) => string>((value) => money(value));

  protected readonly width = 640;
  protected readonly Math = Math;
  protected readonly hover = signal<number | null>(null);

  protected readonly axisBand = 18;
  protected readonly plotHeight = computed(() => this.height());
  protected readonly totalHeight = computed(() => this.height() + this.axisBand);

  private readonly max = computed(() => {
    const peak = Math.max(0, ...this.data().map((d) => d.value));
    if (peak === 0) return 1;
    // Round the top of the scale up to a clean number.
    const magnitude = Math.pow(10, Math.floor(Math.log10(peak)));
    return Math.ceil(peak / (magnitude / 2)) * (magnitude / 2);
  });

  protected readonly ticks = computed(() => {
    const max = this.max();
    const steps = 4;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const value = (max / steps) * i;
      return {
        value,
        label: compact(value),
        y: this.plotHeight() - (value / max) * (this.plotHeight() - 14),
      };
    });
  });

  protected readonly bars = computed(() => {
    const data = this.data();
    const max = this.max();
    const left = 50;
    const bandWidth = (this.width - left) / Math.max(1, data.length);
    const barWidth = Math.min(24, bandWidth * 0.62);
    const usable = this.plotHeight() - 14;
    const peak = Math.max(0, ...data.map((d) => d.value));

    return data.map((point) => {
      const index = data.indexOf(point);
      const bandX = left + index * bandWidth;
      const x = bandX + (bandWidth - barWidth) / 2;
      const barHeight = Math.max(2, (point.value / max) * usable);
      const y = this.plotHeight() - barHeight;
      const r = Math.min(4, barWidth / 2, barHeight);
      return {
        ...point,
        bandX,
        bandWidth,
        x,
        y,
        width: barWidth,
        // Rounded data-end, square where it meets the baseline.
        path: `M${x} ${this.plotHeight()} L${x} ${y + r} Q${x} ${y} ${x + r} ${y} L${x + barWidth - r} ${y} Q${x + barWidth} ${y} ${x + barWidth} ${y + r} L${x + barWidth} ${this.plotHeight()} Z`,
        isPeak: point.value === peak && peak > 0,
      };
    });
  });

  protected showLabel(index: number): boolean {
    const total = this.data().length;
    const every = Math.max(1, Math.ceil(total / 8));
    return index % every === 0 || index === total - 1;
  }

  protected formatShort(value: number): string {
    return compact(value);
  }
}

/* ------------------------------------------------------------------ *
 * Donut — part-to-whole at a glance, capped at six segments. The legend
 * carries a direct label + value for every segment, which is also the
 * relief the light-mode contrast warning requires.
 * ------------------------------------------------------------------ */
@Component({
  selector: 'ui-donut',
  template: `
    <div class="flex flex-wrap items-center gap-6">
      <svg
        width="152"
        height="152"
        viewBox="0 0 152 152"
        role="img"
        [attr.aria-label]="ariaLabel()"
        class="shrink-0"
      >
        <circle cx="76" cy="76" r="58" fill="none" stroke="var(--viz-track)" stroke-width="18" />
        @for (arc of arcs(); track arc.label; let i = $index) {
          <circle
            cx="76"
            cy="76"
            r="58"
            fill="none"
            [attr.stroke]="arc.color"
            stroke-width="18"
            stroke-linecap="butt"
            [attr.stroke-dasharray]="arc.dash"
            [attr.stroke-dashoffset]="arc.offset"
            transform="rotate(-90 76 76)"
            [style.opacity]="hover() === null || hover() === i ? 1 : 0.35"
            class="transition-opacity duration-150"
            (pointerenter)="hover.set(i)"
            (pointerleave)="hover.set(null)"
          />
        }
        <text x="76" y="72" text-anchor="middle" class="fill-[var(--c-faint)] text-[10px]">
          {{ caption() }}
        </text>
        <text
          x="76"
          y="92"
          text-anchor="middle"
          class="fill-[var(--c-text)] text-[17px] font-semibold"
        >
          {{ centerValue() }}
        </text>
      </svg>

      <ul class="min-w-40 flex-1 space-y-2">
        @for (arc of arcs(); track arc.label; let i = $index) {
          <li
            class="flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-[13px] transition-colors"
            [class.bg-surface-2]="hover() === i"
            (pointerenter)="hover.set(i)"
            (pointerleave)="hover.set(null)"
          >
            <span class="size-2.5 shrink-0 rounded-sm" [style.background]="arc.color"></span>
            <span class="min-w-0 flex-1 truncate text-muted">{{ arc.label }}</span>
            <span class="num shrink-0 font-medium text-ink">{{ format()(arc.value) }}</span>
            <span class="num w-11 shrink-0 text-right text-[12px] text-faint">
              {{ arc.share }}%
            </span>
          </li>
        }
      </ul>
    </div>
  `,
  host: { class: 'block' },
})
export class UiDonut {
  readonly data = input.required<readonly Point[]>();
  readonly caption = input('Total');
  readonly ariaLabel = input('Share by category');
  readonly format = input<(value: number) => string>((value) => money(value));

  protected readonly hover = signal<number | null>(null);

  /** Six segments maximum; anything past that folds into "Other". */
  private readonly segments = computed(() => {
    const sorted = [...this.data()].sort((a, b) => b.value - a.value);
    if (sorted.length <= 6) return sorted;
    const head = sorted.slice(0, 5);
    const tail = sorted.slice(5).reduce((total, point) => total + point.value, 0);
    return [...head, { label: 'Other', value: tail }];
  });

  private readonly total = computed(() =>
    this.segments().reduce((sum, point) => sum + point.value, 0),
  );

  protected readonly centerValue = computed(() => compact(this.total()));

  protected readonly arcs = computed(() => {
    const circumference = 2 * Math.PI * 58;
    const total = this.total() || 1;
    let consumed = 0;
    return this.segments().map((point, index) => {
      const fraction = point.value / total;
      const length = Math.max(0, fraction * circumference - 2); // 2px surface gap
      const arc = {
        ...point,
        color: SERIES[index % SERIES.length],
        share: Math.round(fraction * 1000) / 10,
        dash: `${length} ${circumference - length}`,
        offset: -consumed,
      };
      consumed += fraction * circumference;
      return arc;
    });
  });
}

/* ------------------------------------------------------------------ *
 * Meter — a single proportion. Track is a lighter step of the fill's ramp.
 * ------------------------------------------------------------------ */
@Component({
  selector: 'ui-meter',
  template: `
    <div
      class="h-2 w-full overflow-hidden rounded-full bg-[var(--viz-track)]"
      role="meter"
      [attr.aria-valuenow]="Math.round(percent())"
      aria-valuemin="0"
      aria-valuemax="100"
      [attr.aria-label]="ariaLabel()"
    >
      <div
        class="h-full rounded-full transition-[width] duration-700 ease-out"
        [style.width.%]="percent()"
        [style.background]="color()"
      ></div>
    </div>
  `,
  host: { class: 'block' },
})
export class UiMeter {
  readonly value = input(0);
  readonly max = input(100);
  readonly color = input('var(--viz-1)');
  readonly ariaLabel = input('Progress');

  protected readonly Math = Math;
  protected readonly percent = computed(() =>
    Math.max(0, Math.min(100, (this.value() / (this.max() || 1)) * 100)),
  );
}

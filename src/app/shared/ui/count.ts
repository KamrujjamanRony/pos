import { Component, effect, input, signal } from '@angular/core';
import { compact, money, percent, qty } from '../../core/util/format';

type CountFormat = 'money' | 'plain' | 'compact' | 'percent' | 'integer';

const FORMATTERS: Record<CountFormat, (value: number) => string> = {
  money: money,
  plain: qty,
  compact: compact,
  percent: (value) => percent(value),
  integer: (value) => Math.round(value).toLocaleString('en-US'),
};

/**
 * A number that eases to its new value instead of snapping. Driven by
 * `requestAnimationFrame` writing to a signal, so it works under zoneless CD.
 */
@Component({
  selector: 'ui-count',
  template: '{{ display() }}',
})
export class UiCount {
  readonly value = input(0);
  readonly format = input<CountFormat>('plain');
  readonly duration = input(850);

  protected readonly display = signal('0');
  private from = 0;
  private frame = 0;

  constructor() {
    effect((onCleanup) => {
      const target = Number(this.value()) || 0;
      const format = FORMATTERS[this.format()];
      const start = this.from;
      const span = target - start;
      const reduced =
        typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (reduced || span === 0 || this.duration() <= 0) {
        this.from = target;
        this.display.set(format(target));
        return;
      }

      const began = performance.now();
      const duration = this.duration();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - began) / duration);
        // easeOutExpo — fast, then settles.
        const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        const current = start + span * eased;
        this.display.set(format(current));
        if (progress < 1) this.frame = requestAnimationFrame(tick);
        else this.from = target;
      };
      this.frame = requestAnimationFrame(tick);

      onCleanup(() => cancelAnimationFrame(this.frame));
    });
  }
}

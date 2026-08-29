import { Component, computed, inject, input, model } from '@angular/core';
import { ConfirmService } from '../../core/services/confirm';
import { ToastService, type ToastTone } from '../../core/services/toast';
import { UiAutofocus } from '../directives/motion';
import { UiButton } from './button';
import { IconName, UiIcon } from './icon';

const TOAST_STYLE: Record<ToastTone, { icon: IconName; ring: string; chip: string }> = {
  success: { icon: 'checkCircle', ring: 'border-l-pos', chip: 'bg-pos-soft text-pos' },
  error: { icon: 'alert', ring: 'border-l-neg', chip: 'bg-neg-soft text-neg' },
  warn: { icon: 'alert', ring: 'border-l-warn', chip: 'bg-warn-soft text-warn' },
  info: { icon: 'info', ring: 'border-l-info', chip: 'bg-info-soft text-info' },
};

/** Stacked toasts in the corner. Mounted once, by the shell. */
@Component({
  selector: 'ui-toast-host',
  imports: [UiIcon],
  template: `
    <div
      class="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-end gap-2 p-4 sm:top-0 sm:bottom-auto"
      role="region"
      aria-label="Notifications"
    >
      @for (toast of toasts(); track toast.id) {
        <output
          class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-line border-l-4 bg-surface p-3.5 shadow-float"
          [class]="style(toast.tone).ring"
          [attr.aria-live]="toast.tone === 'error' ? 'assertive' : 'polite'"
          style="animation: toast-in 0.4s var(--ease-spring) both"
        >
          <span
            class="grid size-7 shrink-0 place-items-center rounded-lg"
            [class]="style(toast.tone).chip"
          >
            <ui-icon [name]="style(toast.tone).icon" [size]="15" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-[13px] font-semibold text-ink">{{ toast.title }}</p>
            @if (toast.message) {
              <p class="mt-0.5 text-[12.5px] leading-snug text-muted">{{ toast.message }}</p>
            }
          </div>
          <button
            type="button"
            class="grid size-6 shrink-0 place-items-center rounded text-faint transition hover:text-ink"
            [attr.aria-label]="'Dismiss notification: ' + toast.title"
            (click)="dismiss(toast.id)"
          >
            <ui-icon name="close" [size]="14" />
          </button>
        </output>
      }
    </div>
  `,
})
export class UiToastHost {
  private readonly service = inject(ToastService);
  protected readonly toasts = this.service.toasts;

  protected style(tone: ToastTone) {
    return TOAST_STYLE[tone];
  }

  protected dismiss(id: number): void {
    this.service.dismiss(id);
  }
}

/** Renders whatever `ConfirmService` is currently asking. */
@Component({
  selector: 'ui-confirm-host',
  imports: [UiAutofocus, UiButton, UiIcon],
  template: `
    @if (request(); as pending) {
      <!-- The backdrop is presentational; the dialog role belongs on the panel. -->
      <div
        class="animate-fade fixed inset-0 z-[110] grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
        (click)="answer(false)"
      >
        <div
          uiAutofocus
          tabindex="-1"
          class="animate-pop w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-float outline-none"
          role="alertdialog"
          aria-modal="true"
          [attr.aria-labelledby]="titleId"
          [attr.aria-describedby]="messageId"
          (click)="$event.stopPropagation()"
        >
          <div class="flex items-start gap-3.5">
            <span
              class="grid size-10 shrink-0 place-items-center rounded-xl"
              [class]="pending.tone === 'danger' ? 'bg-neg-soft text-neg' : 'bg-brand-soft text-brand-text'"
            >
              <ui-icon [name]="pending.tone === 'danger' ? 'alert' : 'info'" [size]="19" />
            </span>
            <div class="min-w-0">
              <h2 [id]="titleId" class="text-[15px] font-semibold text-ink">{{ pending.title }}</h2>
              <p [id]="messageId" class="mt-1 text-[13px] leading-relaxed text-muted">
                {{ pending.message }}
              </p>
            </div>
          </div>
          <div class="mt-5 flex justify-end gap-2">
            <ui-button variant="ghost" (pressed)="answer(false)">
              {{ pending.cancelLabel }}
            </ui-button>
            <ui-button
              [variant]="pending.tone === 'danger' ? 'danger' : 'primary'"
              (pressed)="answer(true)"
            >
              {{ pending.confirmLabel }}
            </ui-button>
          </div>
        </div>
      </div>
    }
  `,
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class UiConfirmHost {
  private readonly service = inject(ConfirmService);
  protected readonly request = this.service.pending;

  protected readonly titleId = 'confirm-title';
  protected readonly messageId = 'confirm-message';

  protected answer(value: boolean): void {
    this.service.answer(value);
  }

  /** Escape means "no" — the same as Cancel and as clicking the backdrop. */
  protected onEscape(): void {
    if (this.request()) this.answer(false);
  }
}

export interface SegmentOption<T> {
  value: T;
  label: string;
  icon?: IconName;
}

/** Small segmented control with a sliding highlight. */
@Component({
  selector: 'ui-segmented',
  imports: [UiIcon],
  template: `
    <div
      class="relative inline-flex rounded-xl border border-line bg-surface-2 p-1"
      role="tablist"
      [attr.aria-label]="ariaLabel()"
    >
      <span
        class="absolute top-1 bottom-1 rounded-lg bg-surface shadow-soft transition-[left,width] duration-300"
        [style.left]="'calc(' + activeIndex() * (100 / options().length) + '% + 4px)'"
        [style.width]="'calc(' + 100 / options().length + '% - 8px)'"
        aria-hidden="true"
      ></span>
      @for (option of options(); track option.value) {
        <button
          type="button"
          role="tab"
          class="relative z-10 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors"
          [class]="option.value === value() ? 'text-ink' : 'text-muted hover:text-ink'"
          [attr.aria-selected]="option.value === value()"
          [attr.tabindex]="option.value === value() ? null : -1"
          (click)="value.set(option.value)"
          (keydown)="onKey($event)"
        >
          @if (option.icon; as glyph) {
            <ui-icon [name]="glyph" [size]="15" />
          }
          {{ option.label }}
        </button>
      }
    </div>
  `,
  host: { class: 'inline-block' },
})
export class UiSegmented<T> {
  readonly options = input.required<readonly SegmentOption<T>[]>();
  readonly value = model.required<T>();
  readonly ariaLabel = input('View');

  protected readonly activeIndex = computed(() =>
    Math.max(0, this.options().findIndex((option) => option.value === this.value())),
  );

  /** Arrow keys move between tabs, as the tablist pattern requires. */
  protected onKey(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();

    const options = this.options();
    const next = (this.activeIndex() + step + options.length) % options.length;
    this.value.set(options[next].value);

    const buttons = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll('button');
    buttons?.[next]?.focus();
  }
}

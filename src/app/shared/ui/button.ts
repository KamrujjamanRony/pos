import { Component, computed, input, output } from '@angular/core';
import { UiRipple } from '../directives/motion';
import { IconName, UiIcon } from './icon';

export type ButtonVariant = 'primary' | 'soft' | 'ghost' | 'outline' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const BASE =
  'relative inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap select-none ' +
  'rounded-xl transition-[transform,box-shadow,background-color,color,border-color] duration-200 ' +
  'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 cursor-pointer';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'text-white bg-linear-to-br from-brand to-accent shadow-glow hover:brightness-110 hover:-translate-y-px',
  soft: 'bg-brand-soft text-brand-text hover:bg-brand/15 border border-transparent',
  ghost: 'text-muted hover:text-ink hover:bg-surface-2',
  outline: 'border border-line-strong text-ink bg-surface hover:bg-surface-2 hover:border-brand/50',
  danger: 'text-white bg-neg hover:brightness-110 shadow-soft',
  success: 'text-white bg-pos hover:brightness-110 shadow-soft',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-[15px]',
  icon: 'h-9 w-9 p-0',
};

/** Shared class recipe so anchors (`routerLink`) can look identical to buttons. */
export function buttonClass(variant: ButtonVariant = 'soft', size: ButtonSize = 'md'): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]}`;
}

@Component({
  selector: 'ui-button',
  imports: [UiIcon, UiRipple],
  template: `
    <button
      [uiRipple]="rippleColor()"
      [class]="classes()"
      [attr.type]="type()"
      [disabled]="disabled() || loading()"
      [attr.aria-busy]="loading() || null"
      [attr.aria-label]="ariaLabel()"
      (click)="pressed.emit($event)"
    >
      @if (loading()) {
        <span
          class="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        ></span>
      } @else if (icon(); as glyph) {
        <ui-icon [name]="glyph" [size]="size() === 'lg' ? 19 : 17" />
      }
      <ng-content />
      @if (trailingIcon(); as glyph) {
        <ui-icon [name]="glyph" [size]="16" />
      }
    </button>
  `,
  host: { class: 'contents' },
})
export class UiButton {
  readonly variant = input<ButtonVariant>('soft');
  readonly size = input<ButtonSize>('md');
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly icon = input<IconName | null>(null);
  readonly trailingIcon = input<IconName | null>(null);
  readonly disabled = input(false);
  readonly loading = input(false);
  readonly block = input(false);
  readonly ariaLabel = input<string | null>(null);

  readonly pressed = output<MouseEvent>();

  protected readonly classes = computed(
    () => `${buttonClass(this.variant(), this.size())} ${this.block() ? 'w-full' : ''}`,
  );

  protected readonly rippleColor = computed(() =>
    this.variant() === 'primary' || this.variant() === 'danger' || this.variant() === 'success'
      ? 'rgba(255,255,255,0.6)'
      : 'currentColor',
  );
}

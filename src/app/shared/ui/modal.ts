import {
  Component,
  ElementRef,
  computed,
  effect,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';
import { UiIcon } from './icon';

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
} as const;

/**
 * Dialog built on the native `<dialog>` element, so focus trapping, the
 * backdrop and Escape-to-close come from the platform rather than from us.
 * `variant="drawer"` slides in from the right for record detail panels.
 */
@Component({
  selector: 'ui-modal',
  imports: [UiIcon],
  template: `
    <dialog
      #dialog
      class="m-0 max-h-none max-w-none bg-transparent p-0 text-ink"
      [class]="shellClass()"
      [attr.aria-label]="heading()"
      (cancel)="onCancel($event)"
      (close)="open.set(false)"
      (click)="onBackdropClick($event)"
    >
      <div [class]="panelClass()" (click)="$event.stopPropagation()">
        <header class="flex items-start gap-3 border-b border-line px-5 py-4">
          <div class="min-w-0 flex-1">
            <h2 class="truncate text-[15px] font-semibold text-ink">{{ heading() }}</h2>
            @if (subheading()) {
              <p class="mt-0.5 truncate text-[13px] text-muted">{{ subheading() }}</p>
            }
          </div>
          <button
            type="button"
            class="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
            aria-label="Close dialog"
            (click)="close()"
          >
            <ui-icon name="close" [size]="17" />
          </button>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          <ng-content />
        </div>

        <footer class="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5">
          <ng-content select="[modal-footer]" />
        </footer>
      </div>
    </dialog>
  `,
  styles: `
    /* The layout classes above set \`display\` on the dialog, and a Tailwind
       utility out-ranks the user-agent \`dialog:not([open]) { display: none }\`
       rule — without this a closed dialog stays painted over the page and no
       amount of \`.close()\` makes it go away. Component styles are unlayered,
       so they win over Tailwind's \`@layer utilities\` whatever it emits. */
    dialog:not([open]) {
      display: none;
    }

    dialog[open] > div {
      animation: pop 0.34s var(--ease-spring) both;
    }
    dialog.drawer[open] > div {
      animation: slide-left 0.4s var(--ease-out-expo) both;
    }
    @media (prefers-reduced-motion: reduce) {
      dialog[open] > div {
        animation: none;
      }
    }
  `,
  host: { class: 'contents' },
})
export class UiModal {
  readonly open = model(false);
  readonly heading = input('');
  readonly subheading = input('');
  readonly size = input<keyof typeof SIZES>('md');
  readonly variant = input<'center' | 'drawer'>('center');
  readonly dismissable = input(true);

  readonly dismissed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly shellClass = computed(() => {
    // Only advertise the click-to-dismiss affordance when it actually dismisses.
    const backdrop = this.dismissable() ? 'backdrop:cursor-pointer' : '';
    return this.variant() === 'drawer'
      ? `drawer fixed inset-y-0 right-0 left-auto h-dvh w-full ${backdrop}`
      : `fixed inset-0 grid h-dvh w-dvw place-items-center p-4 ${backdrop}`;
  });

  protected readonly panelClass = computed(() => {
    const shared = 'flex flex-col bg-surface shadow-float ring-1 ring-line';
    return this.variant() === 'drawer'
      ? `${shared} ml-auto h-dvh w-full ${SIZES[this.size()]} rounded-l-2xl`
      : `${shared} max-h-[88dvh] w-full ${SIZES[this.size()]} rounded-2xl`;
  });

  constructor() {
    effect(() => {
      const element = this.dialog().nativeElement;
      if (this.open()) {
        if (!element.open) element.showModal();
      } else if (element.open) {
        element.close();
      }
    });
  }

  close(): void {
    this.open.set(false);
    this.dismissed.emit();
  }

  /** Escape and the platform's own dismiss gesture both land here first. */
  protected onCancel(event: Event): void {
    if (!this.dismissable()) {
      event.preventDefault();
      return;
    }
    this.dismissed.emit();
  }

  protected onBackdropClick(event: MouseEvent): void {
    // The click target is the <dialog> itself only when the backdrop was hit.
    if (this.dismissable() && event.target === this.dialog().nativeElement) this.close();
  }
}

import { Directive, ElementRef, OnDestroy, inject, input } from '@angular/core';

const REDUCED = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Material-style press feedback. Renders a circle at the pointer and expands it
 * with the Web Animations API, so nothing lingers in the DOM or in change detection.
 */
@Directive({
  selector: '[uiRipple]',
  host: {
    '(pointerdown)': 'spawn($event)',
    style: 'position: relative; overflow: hidden;',
  },
})
export class UiRipple {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly uiRipple = input<string>('currentColor');

  protected spawn(event: PointerEvent): void {
    if (REDUCED()) return;
    const element = this.host.nativeElement;
    const rect = element.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);

    const circle = document.createElement('span');
    circle.setAttribute('aria-hidden', 'true');
    Object.assign(circle.style, {
      position: 'absolute',
      left: `${event.clientX - rect.left - size / 2}px`,
      top: `${event.clientY - rect.top - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      background: this.uiRipple(),
      opacity: '0.28',
      pointerEvents: 'none',
      transform: 'scale(0)',
    } satisfies Partial<CSSStyleDeclaration>);

    element.appendChild(circle);
    circle
      .animate(
        [
          { transform: 'scale(0)', opacity: 0.3 },
          { transform: 'scale(2.6)', opacity: 0 },
        ],
        { duration: 550, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      )
      .addEventListener('finish', () => circle.remove());
  }
}

/**
 * Reveals an element the first time it scrolls into view. Used for long report
 * pages where animating everything up-front would be wasted work.
 */
@Directive({ selector: '[uiReveal]' })
export class UiReveal implements OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer?: IntersectionObserver;

  constructor() {
    const element = this.host.nativeElement;
    if (REDUCED() || typeof IntersectionObserver === 'undefined') return;

    element.style.opacity = '0';
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          element.style.opacity = '';
          element.animate(
            [
              { opacity: 0, transform: 'translateY(18px)' },
              { opacity: 1, transform: 'none' },
            ],
            { duration: 520, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' },
          );
          this.observer?.unobserve(entry.target);
        }
      },
      { threshold: 0.12 },
    );
    this.observer.observe(element);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}

/** Autofocuses a control once it enters the DOM — used by dialogs and the POS search. */
@Directive({ selector: '[uiAutofocus]' })
export class UiAutofocus {
  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    requestAnimationFrame(() => element.focus({ preventScroll: true }));
  }
}

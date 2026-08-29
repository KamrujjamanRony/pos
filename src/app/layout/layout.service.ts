import { Service, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

const KEY = 'aurora-pos.sidebar';

function storedCollapsed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Chrome state shared between the shell, the sidebar and the topbar. */
@Service()
export class LayoutService {
  /** Rail mode on desktop. */
  readonly collapsed = signal(storedCollapsed());
  /** Drawer on phones and tablets. */
  readonly mobileOpen = signal(false);
  /** Command palette visibility. */
  readonly paletteOpen = signal(false);

  private readonly router = inject(Router);

  /** The active URL as a signal, so navigation can drive computed state. */
  readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(KEY, this.collapsed() ? '1' : '0');
      } catch {
        /* ignore */
      }
    });
  }

  toggleCollapsed(): void {
    this.collapsed.update((v) => !v);
  }

  closeMobile(): void {
    this.mobileOpen.set(false);
  }
}

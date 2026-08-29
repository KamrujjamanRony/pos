import { Component, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { inFlight } from '../core/http/interceptors';
import { AppCommandPalette } from './command-palette';
import { LayoutService } from './layout.service';
import { AppSidebar } from './sidebar';
import { AppTopbar } from './topbar';

/** Authenticated chrome: sidebar, topbar, progress bar and the routed page. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, AppSidebar, AppTopbar, AppCommandPalette],
  template: `
    <!-- Indeterminate progress for in-flight requests. -->
    <div
      class="pointer-events-none fixed inset-x-0 top-0 z-120 h-0.5 overflow-hidden transition-opacity duration-300"
      [class.opacity-0]="!busy()"
      role="progressbar"
      aria-label="Loading"
      [attr.aria-hidden]="!busy()"
    >
      <div
        class="h-full w-1/3 rounded-full bg-linear-to-r from-transparent via-brand to-transparent"
        style="animation: sweep 1.1s linear infinite"
      ></div>
    </div>

    <div class="flex h-dvh overflow-hidden bg-bg">
      <!-- Desktop sidebar -->
      <div class="hidden shrink-0 lg:block">
        <app-sidebar />
      </div>

      <!-- Mobile drawer -->
      @if (layout.mobileOpen()) {
        <div
          class="animate-fade fixed inset-0 z-50 bg-black/50 backdrop-blur-sm lg:hidden"
          (click)="layout.closeMobile()"
          aria-hidden="true"
        ></div>
        <div
          class="fixed inset-y-0 left-0 z-50 lg:hidden"
          style="animation: rise 0.32s var(--ease-out-expo) both"
        >
          <app-sidebar />
        </div>
      }

      <div class="flex min-w-0 flex-1 flex-col">
        <app-topbar />
        <main #scroller class="min-h-0 flex-1 overflow-y-auto">
          <div class="mx-auto w-full max-w-[1600px] p-4 sm:p-6">
            <router-outlet />
          </div>
        </main>
      </div>
    </div>

    <app-command-palette />
  `,
  host: { class: 'block' },
})
export class AppShell {
  protected readonly layout = inject(LayoutService);
  protected readonly busy = computed(() => inFlight() > 0);

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  constructor() {
    // Each navigation starts at the top of the page, like a full page load.
    effect(() => {
      this.layout.url();
      this.scroller()?.nativeElement.scrollTo({ top: 0, behavior: 'instant' });
    });
  }
}

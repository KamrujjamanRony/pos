import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth/auth';
import { ThemeService } from '../core/services/theme';
import { initials } from '../core/util/format';
import { UiIcon } from '../shared/ui/icon';
import { LayoutService } from './layout.service';
import { NAVIGATION } from './navigation';

@Component({
  selector: 'app-topbar',
  imports: [RouterLink, UiIcon],
  template: `
    <header
      class="glass sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line px-4 sm:px-5"
    >
      <button
        type="button"
        class="grid size-9 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-ink lg:hidden"
        aria-label="Open navigation"
        (click)="layout.mobileOpen.set(true)"
      >
        <ui-icon name="menu" [size]="19" />
      </button>

      <!-- Breadcrumb, derived from the navigation model. -->
      <nav aria-label="Breadcrumb" class="hidden min-w-0 sm:block">
        <ol class="flex items-center gap-1.5 text-[13px]">
          @for (crumb of breadcrumbs(); track crumb.label; let last = $last) {
            <li class="flex items-center gap-1.5">
              @if (!last && crumb.path) {
                <a
                  [routerLink]="crumb.path"
                  class="rounded text-muted transition hover:text-ink"
                >
                  {{ crumb.label }}
                </a>
              } @else {
                <span class="font-medium text-ink" [attr.aria-current]="last ? 'page' : null">
                  {{ crumb.label }}
                </span>
              }
              @if (!last) {
                <ui-icon name="chevronRight" [size]="13" class="text-faint" />
              }
            </li>
          }
        </ol>
      </nav>

      <div class="flex-1"></div>

      <!-- Command palette trigger -->
      <button
        type="button"
        class="hidden items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-faint transition hover:border-line-strong hover:text-muted md:flex"
        (click)="layout.paletteOpen.set(true)"
      >
        <ui-icon name="search" [size]="15" />
        <span>Search or jump to…</span>
        <kbd
          class="ml-4 rounded border border-line bg-surface-2 px-1.5 py-0.5 font-sans text-[10.5px] font-medium text-muted"
        >
          {{ shortcutHint }}
        </kbd>
      </button>

      <button
        type="button"
        class="grid size-9 place-items-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-ink md:hidden"
        aria-label="Search"
        (click)="layout.paletteOpen.set(true)"
      >
        <ui-icon name="search" [size]="18" />
      </button>

      <!-- Theme -->
      <button
        type="button"
        class="grid size-9 place-items-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-ink"
        [attr.aria-label]="theme.isDark() ? 'Switch to light theme' : 'Switch to dark theme'"
        (click)="theme.toggle()"
      >
        <span class="grid transition-transform duration-500" [class.rotate-180]="theme.isDark()">
          <ui-icon [name]="theme.isDark() ? 'moon' : 'sun'" [size]="18" />
        </span>
      </button>

      <!-- Notifications -->
      <div class="relative">
        <button
          type="button"
          class="grid size-9 place-items-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-ink"
          aria-label="Notifications"
          [attr.aria-expanded]="alertsOpen()"
          (click)="alertsOpen.set(!alertsOpen())"
        >
          <ui-icon name="bell" [size]="18" />
          <span
            class="absolute top-1.5 right-1.5 size-2 rounded-full bg-neg ring-2 ring-[var(--c-surface)]"
            aria-hidden="true"
          ></span>
        </button>

        @if (alertsOpen()) {
          <div class="fixed inset-0 z-40" (click)="alertsOpen.set(false)"></div>
          <div
            class="animate-pop absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-surface shadow-float"
          >
            <p class="border-b border-line px-4 py-3 text-[13px] font-semibold text-ink">
              Shift notes
            </p>
            <ul class="divide-y divide-line">
              @for (note of notes; track note.title) {
                <li class="flex gap-3 px-4 py-3">
                  <span
                    class="mt-1 size-2 shrink-0 rounded-full"
                    [class]="note.tone"
                    aria-hidden="true"
                  ></span>
                  <div class="min-w-0">
                    <p class="text-[13px] font-medium text-ink">{{ note.title }}</p>
                    <p class="mt-0.5 text-[12px] text-muted">{{ note.detail }}</p>
                  </div>
                </li>
              }
            </ul>
          </div>
        }
      </div>

      <!-- Account -->
      <div class="relative">
        <button
          type="button"
          class="flex items-center gap-2.5 rounded-xl py-1 pr-2 pl-1 transition hover:bg-surface-2"
          [attr.aria-expanded]="menuOpen()"
          aria-label="Account menu"
          (click)="menuOpen.set(!menuOpen())"
        >
          <span
            class="grid size-8 place-items-center rounded-lg text-[12px] font-semibold text-white"
            [style.background]="'linear-gradient(135deg, var(--c-brand), var(--c-accent))'"
          >
            {{ avatar() }}
          </span>
          <span class="hidden text-left sm:block">
            <span class="block text-[13px] leading-tight font-medium text-ink">
              {{ user()?.displayName }}
            </span>
            <span class="block text-[11px] text-faint">{{ user()?.role }}</span>
          </span>
          <ui-icon name="chevronDown" [size]="14" class="hidden text-faint sm:block" />
        </button>

        @if (menuOpen()) {
          <div class="fixed inset-0 z-40" (click)="menuOpen.set(false)"></div>
          <div
            class="animate-pop absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-surface shadow-float"
          >
            <div class="border-b border-line px-4 py-3">
              <p class="truncate text-[13px] font-semibold text-ink">{{ user()?.displayName }}</p>
              <p class="truncate text-[12px] text-muted">&#64;{{ user()?.userName }}</p>
            </div>
            <div class="p-1.5">
              <a
                routerLink="/admin/settings"
                class="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-muted transition hover:bg-surface-2 hover:text-ink"
                (click)="menuOpen.set(false)"
              >
                <ui-icon name="settings" [size]="16" />
                Workspace settings
              </a>
              <a
                routerLink="/admin/users"
                class="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-muted transition hover:bg-surface-2 hover:text-ink"
                (click)="menuOpen.set(false)"
              >
                <ui-icon name="key" [size]="16" />
                Users &amp; access
              </a>
              <button
                type="button"
                class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-neg transition hover:bg-neg-soft"
                (click)="signOut()"
              >
                <ui-icon name="logout" [size]="16" />
                Sign out
              </button>
            </div>
          </div>
        }
      </div>
    </header>
  `,
})
export class AppTopbar {
  protected readonly layout = inject(LayoutService);
  protected readonly theme = inject(ThemeService);
  private readonly auth = inject(AuthService);

  protected readonly user = this.auth.user;
  protected readonly menuOpen = signal(false);
  protected readonly alertsOpen = signal(false);

  protected readonly shortcutHint =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';

  protected readonly notes = [
    { title: 'Low stock on 6 items', detail: 'Balance is at or below the reorder level.', tone: 'bg-warn' },
    { title: 'Courier parcels awaiting update', detail: 'Some invoices are still marked in transit.', tone: 'bg-info' },
    { title: 'Overdue customer balances', detail: 'Receivables are ageing past 30 days.', tone: 'bg-neg' },
  ];

  protected readonly avatar = computed(() => initials(this.user()?.displayName));

  /** Walks the navigation model to label the current location. */
  protected readonly breadcrumbs = computed(() => {
    const url = this.layout.url().split('?')[0];
    const trail: Array<{ label: string; path?: string }> = [{ label: 'Workspace' }];

    for (const section of NAVIGATION) {
      if (section.path && url.startsWith(section.path)) {
        trail.push({ label: section.label, path: section.path });
        return trail;
      }
      const link = section.links?.find((candidate) => url.startsWith(candidate.path));
      if (link) {
        trail.push({ label: section.label });
        trail.push({ label: link.label, path: link.path });
        if (url !== link.path) trail.push({ label: url.endsWith('/new') ? 'New' : 'Detail' });
        return trail;
      }
    }
    return trail;
  });

  protected signOut(): void {
    this.menuOpen.set(false);
    void this.auth.logout();
  }
}

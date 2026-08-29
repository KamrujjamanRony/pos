import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { UiIcon } from '../shared/ui/icon';
import { LayoutService } from './layout.service';
import { NAVIGATION, type NavSection } from './navigation';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, UiIcon],
  template: `
    <aside
      class="flex h-full flex-col border-r border-line bg-surface transition-[width] duration-300"
      [style.width.px]="width()"
    >
      <!-- Brand -->
      <div class="flex h-16 items-center gap-2.5 border-b border-line px-4">
        <a
          routerLink="/dashboard"
          class="flex items-center gap-2.5 overflow-hidden rounded-lg"
          [attr.aria-label]="'Aurora POS home'"
        >
          <span
            class="grid size-9 shrink-0 place-items-center rounded-xl bg-linear-to-br from-brand to-accent text-white shadow-glow"
          >
            <ui-icon name="zap" [size]="19" />
          </span>
          @if (!collapsed()) {
            <span class="animate-fade min-w-0">
              <span class="block truncate text-[15px] leading-tight font-semibold text-ink">
                Aurora POS
              </span>
              <span class="block truncate text-[11px] text-faint">Retail operations</span>
            </span>
          }
        </a>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 overflow-x-hidden overflow-y-auto px-2.5 py-3" aria-label="Main">
        <ul class="space-y-0.5">
          @for (section of navigation; track section.label; let i = $index) {
            <li class="stagger" [style]="'--i:' + i">
              @if (section.path) {
                <a
                  [routerLink]="section.path"
                  routerLinkActive="bg-brand-soft! text-brand-text! font-semibold"
                  class="group relative flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-[13.5px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                  [attr.title]="collapsed() ? section.label : null"
                  (click)="layout.closeMobile()"
                >
                  <ui-icon [name]="section.icon" [size]="18" class="shrink-0" />
                  @if (!collapsed()) {
                    <span class="truncate">{{ section.label }}</span>
                  }
                </a>
              } @else {
                <button
                  type="button"
                  class="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-[13.5px] transition-colors hover:bg-surface-2 hover:text-ink"
                  [class]="isSectionActive(section) ? 'text-brand-text font-semibold' : 'text-muted'"
                  [attr.aria-expanded]="isExpanded(section.label)"
                  [attr.title]="collapsed() ? section.label : null"
                  (click)="toggle(section.label)"
                >
                  <ui-icon [name]="section.icon" [size]="18" class="shrink-0" />
                  @if (!collapsed()) {
                    <span class="min-w-0 flex-1 truncate text-left">{{ section.label }}</span>
                    <ui-icon
                      name="chevronDown"
                      [size]="14"
                      class="shrink-0 text-faint transition-transform duration-300"
                      [class.rotate-180]="isExpanded(section.label)"
                    />
                  }
                </button>

                @if (!collapsed() && isExpanded(section.label)) {
                  <ul
                    class="mt-0.5 ml-4.75 space-y-0.5 border-l border-line pl-3"
                    style="animation: rise 0.28s var(--ease-out-expo) both"
                  >
                    @for (link of section.links; track link.path) {
                      <li>
                        <a
                          [routerLink]="link.path"
                          routerLinkActive="text-brand-text! font-medium before:opacity-100"
                          [routerLinkActiveOptions]="{ exact: true }"
                          class="relative block rounded-lg px-2.5 py-1.75 text-[13px] text-muted transition-colors before:absolute before:top-1/2 before:-left-3.25 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-brand before:opacity-0 before:transition-opacity hover:bg-surface-2 hover:text-ink"
                          (click)="layout.closeMobile()"
                        >
                          {{ link.label }}
                        </a>
                      </li>
                    }
                  </ul>
                }
              }
            </li>
          }
        </ul>
      </nav>

      <!-- Collapse control -->
      <div class="border-t border-line p-2.5">
        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          [attr.aria-label]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
          (click)="layout.toggleCollapsed()"
        >
          <ui-icon
            name="chevronLeft"
            [size]="17"
            class="shrink-0 transition-transform duration-300"
            [class.rotate-180]="collapsed()"
          />
          @if (!collapsed()) {
            <span>Collapse</span>
          }
        </button>
      </div>
    </aside>
  `,
  host: { class: 'block h-full' },
})
export class AppSidebar {
  protected readonly layout = inject(LayoutService);

  protected readonly navigation = NAVIGATION;
  protected readonly collapsed = this.layout.collapsed;
  protected readonly width = computed(() => (this.collapsed() ? 74 : 264));

  private readonly expanded = signal<ReadonlySet<string>>(new Set<string>());

  constructor() {
    // Keep the group containing the current route open as the user navigates.
    effect(() => {
      const url = this.layout.url();
      const owner = NAVIGATION.find((section) =>
        section.links?.some((link) => url.startsWith(link.path)),
      );
      if (owner) {
        this.expanded.update((current) =>
          current.has(owner.label) ? current : new Set([...current, owner.label]),
        );
      }
    });
  }

  protected isExpanded(label: string): boolean {
    return this.expanded().has(label);
  }

  protected toggle(label: string): void {
    this.expanded.update((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  protected isSectionActive(section: NavSection): boolean {
    return !!section.links?.some((link) => this.layout.url().startsWith(link.path));
  }
}

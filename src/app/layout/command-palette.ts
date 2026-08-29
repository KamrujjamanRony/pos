import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UiAutofocus } from '../shared/directives/motion';
import { UiIcon } from '../shared/ui/icon';
import { LayoutService } from './layout.service';
import { COMMANDS, type CommandEntry } from './navigation';

/** ⌘K / Ctrl-K launcher over every destination in the workspace. */
@Component({
  selector: 'app-command-palette',
  imports: [UiIcon, UiAutofocus],
  template: `
    @if (layout.paletteOpen()) {
      <div
        class="animate-fade fixed inset-0 z-[90] bg-black/45 px-4 pt-[12vh] backdrop-blur-sm"
        (click)="close()"
      >
        <div
          class="animate-pop mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-float"
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          (click)="$event.stopPropagation()"
        >
          <div class="flex items-center gap-3 border-b border-line px-4">
            <ui-icon name="search" [size]="18" class="text-faint" />
            <input
              uiAutofocus
              type="text"
              class="h-14 w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-faint"
              placeholder="Search screens…"
              role="combobox"
              aria-expanded="true"
              [attr.aria-controls]="listId"
              [attr.aria-activedescendant]="activeOptionId()"
              [value]="query()"
              (input)="onInput($event)"
              (keydown)="onKey($event)"
              aria-label="Search screens"
            />
            <kbd class="rounded border border-line px-1.5 py-0.5 text-[10.5px] text-faint">esc</kbd>
          </div>

          <ul [id]="listId" class="max-h-80 overflow-y-auto p-2" role="listbox" aria-label="Screens">
            @for (entry of results(); track entry.path; let i = $index) {
              <li role="none">
                <button
                  type="button"
                  role="option"
                  [id]="listId + '-option-' + i"
                  [attr.aria-selected]="i === active()"
                  class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition"
                  [class]="i === active() ? 'bg-brand-soft' : 'hover:bg-surface-2'"
                  (mouseenter)="active.set(i)"
                  (click)="go(entry)"
                >
                  <span
                    class="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted"
                  >
                    <ui-icon [name]="entry.icon" [size]="16" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-[13.5px] font-medium text-ink">
                      {{ entry.label }}
                    </span>
                    <span class="block truncate text-[11.5px] text-faint">{{ entry.group }}</span>
                  </span>
                  @if (i === active()) {
                    <ui-icon name="arrowRight" [size]="15" class="text-brand-text" />
                  }
                </button>
              </li>
            } @empty {
              <li role="none" class="px-3 py-10 text-center text-[13px] text-faint">
                Nothing matches “{{ query() }}”.
              </li>
            }
          </ul>
        </div>
      </div>
    }
  `,
  host: {
    '(document:keydown)': 'onGlobalKey($event)',
  },
})
export class AppCommandPalette {
  protected readonly layout = inject(LayoutService);
  private readonly router = inject(Router);

  protected readonly listId = 'command-palette-results';
  protected readonly query = signal('');
  protected readonly active = signal(0);

  protected readonly results = computed(() => {
    const needle = this.query().trim().toLowerCase();
    if (!needle) return COMMANDS.slice(0, 8);
    return COMMANDS.filter((entry) =>
      `${entry.label} ${entry.group}`.toLowerCase().includes(needle),
    ).slice(0, 20);
  });

  /** Points assistive tech at the highlighted row without moving real focus. */
  protected readonly activeOptionId = computed(() =>
    this.results().length ? `${this.listId}-option-${this.active()}` : null,
  );

  constructor() {
    effect(() => {
      if (this.layout.paletteOpen()) {
        this.query.set('');
        this.active.set(0);
      }
    });
  }

  protected onGlobalKey(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.layout.paletteOpen.update((open) => !open);
      return;
    }
    if (event.key === 'Escape' && this.layout.paletteOpen()) {
      event.preventDefault();
      this.close();
    }
  }

  protected onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.active.set(0);
  }

  protected onKey(event: KeyboardEvent): void {
    const results = this.results();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.active.update((i) => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.active.update((i) => Math.max(i - 1, 0));
        break;
      case 'Enter': {
        event.preventDefault();
        const entry = results[this.active()];
        if (entry) this.go(entry);
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
      default:
        break;
    }
  }

  protected go(entry: CommandEntry): void {
    this.close();
    void this.router.navigateByUrl(entry.path);
  }

  protected close(): void {
    this.layout.paletteOpen.set(false);
  }
}

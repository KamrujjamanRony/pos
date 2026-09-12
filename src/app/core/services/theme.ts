import { Service, computed, effect, signal } from '@angular/core';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'supersoft-pos.theme';

function readStored(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    /* private mode / blocked storage — fall through to the default */
  }
  return 'system';
}

/** Owns the light/dark preference and keeps the `.dark` class on `<html>` in sync. */
@Service()
export class ThemeService {
  private readonly systemDark = signal(
    typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)').matches : false,
  );

  readonly preference = signal<ThemePreference>(readStored());

  readonly isDark = computed(() =>
    this.preference() === 'system' ? this.systemDark() : this.preference() === 'dark',
  );

  constructor() {
    if (typeof matchMedia === 'function') {
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) =>
        this.systemDark.set(event.matches),
      );
    }

    effect(() => {
      const dark = this.isDark();
      document.documentElement.classList.toggle('dark', dark);
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', dark ? '#1b1e29' : '#f5f6fb');
    });

    effect(() => {
      const value = this.preference();
      try {
        localStorage.setItem(STORAGE_KEY, value);
      } catch {
        /* ignore storage failures */
      }
    });
  }

  set(preference: ThemePreference): void {
    this.preference.set(preference);
  }

  toggle(): void {
    this.preference.set(this.isDark() ? 'light' : 'dark');
  }
}

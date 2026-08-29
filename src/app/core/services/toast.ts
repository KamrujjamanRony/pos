import { Service, signal } from '@angular/core';

export type ToastTone = 'success' | 'error' | 'info' | 'warn';

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
  /** ms before auto-dismiss; 0 keeps it until dismissed. */
  duration: number;
}

let nextId = 1;

/** Transient, non-blocking feedback. Rendered by `<app-toast-host>` in the shell. */
@Service()
export class ToastService {
  private readonly items = signal<Toast[]>([]);
  readonly toasts = this.items.asReadonly();

  success(title: string, message?: string) {
    return this.push('success', title, message);
  }

  error(title: string, message?: string) {
    return this.push('error', title, message, 6000);
  }

  info(title: string, message?: string) {
    return this.push('info', title, message);
  }

  warn(title: string, message?: string) {
    return this.push('warn', title, message, 5000);
  }

  dismiss(id: number): void {
    this.items.update((list) => list.filter((t) => t.id !== id));
  }

  clear(): void {
    this.items.set([]);
  }

  private push(tone: ToastTone, title: string, message?: string, duration = 4000): number {
    const id = nextId++;
    this.items.update((list) => [...list, { id, tone, title, message, duration }].slice(-4));
    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }
    return id;
  }
}

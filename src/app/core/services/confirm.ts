import { Service, signal } from '@angular/core';

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'brand';
}

interface PendingConfirm extends ConfirmRequest {
  resolve: (answer: boolean) => void;
}

/**
 * Promise-based confirmation. `<app-confirm-host>` renders the pending request,
 * so any service or component can `await confirm.ask(...)` without a template.
 */
@Service()
export class ConfirmService {
  readonly pending = signal<PendingConfirm | null>(null);

  ask(request: ConfirmRequest): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.pending.set({
        confirmLabel: 'Confirm',
        cancelLabel: 'Cancel',
        tone: 'brand',
        ...request,
        resolve,
      });
    });
  }

  /** Shorthand for the common "delete this record?" case. */
  askDelete(what: string): Promise<boolean> {
    return this.ask({
      title: `Delete ${what}?`,
      message: 'This removes the record permanently. Documents that reference it may be affected.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
  }

  answer(value: boolean): void {
    const request = this.pending();
    if (!request) return;
    this.pending.set(null);
    request.resolve(value);
  }
}

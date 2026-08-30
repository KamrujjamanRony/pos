import { Service } from '@angular/core';

/**
 * Passcode behind the master lists edited from Item registration.
 *
 * Category, unit, origin and brand are referenced by every item, so each add,
 * rename and delete is confirmed with a supervisor passcode. Nothing is
 * remembered between actions: one change, one check.
 */
@Service()
export class SetupLock {
  /** Held here so no component or template has to carry the passcode. */
  private readonly passcode = '1223';

  verify(code: string): boolean {
    return code.trim() === this.passcode;
  }
}

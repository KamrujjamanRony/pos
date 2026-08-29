import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { UiModal } from './modal';

/** jsdom ships `<dialog>` without the modal methods; emulate just enough of them. */
function polyfillDialog(): void {
  const proto = globalThis.HTMLDialogElement?.prototype;
  if (!proto) return;
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
  if (typeof proto.close !== 'function') {
    proto.close = function (this: HTMLDialogElement, value?: string) {
      if (!this.open) return;
      this.removeAttribute('open');
      if (value !== undefined) this.returnValue = value;
      this.dispatchEvent(new Event('close'));
    };
  }
}

@Component({
  selector: 'test-host',
  imports: [UiModal],
  template: `
    <ui-modal
      [(open)]="open"
      [dismissable]="dismissable()"
      heading="Test dialog"
      (dismissed)="dismissals.set(dismissals() + 1)"
    >
      body
    </ui-modal>
  `,
})
class Host {
  readonly open = signal(true);
  readonly dismissable = signal(true);
  readonly dismissals = signal(0);
}

describe('UiModal', () => {
  beforeEach(() => {
    polyfillDialog();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  const render = async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      host: fixture.componentInstance,
      dialog: root.querySelector('dialog') as HTMLDialogElement,
      closeButton: root.querySelector('button[aria-label="Close dialog"]') as HTMLButtonElement,
    };
  };

  it('reflects `open` onto the native dialog', async () => {
    const { fixture, host, dialog } = await render();
    expect(dialog.open).toBe(true);

    host.open.set(false);
    await fixture.whenStable();
    expect(dialog.open).toBe(false);

    host.open.set(true);
    await fixture.whenStable();
    expect(dialog.open).toBe(true);
  });

  it('closes on the header close button', async () => {
    const { fixture, host, dialog, closeButton } = await render();
    closeButton.click();
    await fixture.whenStable();

    expect(host.open()).toBe(false);
    expect(dialog.open).toBe(false);
    expect(host.dismissals()).toBe(1);
  });

  it('closes when the backdrop is clicked', async () => {
    const { fixture, host, dialog } = await render();
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await fixture.whenStable();

    expect(host.open()).toBe(false);
    expect(dialog.open).toBe(false);
    expect(host.dismissals()).toBe(1);
  });

  it('keeps the dialog open when a click lands on the panel', async () => {
    const { fixture, host, dialog } = await render();
    const panel = dialog.querySelector('div') as HTMLElement;
    panel.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await fixture.whenStable();

    expect(host.open()).toBe(true);
    expect(host.dismissals()).toBe(0);
  });

  it('reports Escape as a dismissal', async () => {
    const { fixture, host, dialog } = await render();
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    await fixture.whenStable();

    expect(host.dismissals()).toBe(1);
  });

  it('refuses backdrop and Escape dismissal when not dismissable', async () => {
    const { fixture, host, dialog } = await render();
    host.dismissable.set(false);
    await fixture.whenStable();

    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const cancel = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel);
    await fixture.whenStable();

    expect(host.open()).toBe(true);
    expect(host.dismissals()).toBe(0);
    expect(cancel.defaultPrevented).toBe(true);
  });

  it('hides a closed dialog even though layout utilities set `display`', () => {
    // Tailwind's `grid` utility out-ranks the user-agent
    // `dialog:not([open]) { display: none }` rule, so the component has to
    // restore it itself — otherwise `close()` leaves the panel on screen.
    const styles = (UiModal as unknown as { ɵcmp: { styles: string[] } }).ɵcmp.styles.join('');
    // Encapsulation rewrites this to `dialog[_ngcontent-%COMP%]:not([open])`.
    expect(styles.replace(/\s+/g, '')).toMatch(/dialog\[[^\]]+\]:not\(\[open\]\)\{display:none/);
  });
});

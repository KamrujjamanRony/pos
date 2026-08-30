import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UiCombobox } from './combobox';

/**
 * The popup is `position: fixed`, but a transform or animation above it makes
 * that ancestor the containing block instead of the viewport — which is what
 * the modal panel's entry animation does. jsdom has no layout, so the box below
 * stands in for one: offsets are resolved against it, and the component has to
 * measure its way back to the viewport coordinates it actually asked for.
 */
const BLOCK = { left: 128, top: 75, height: 600 };
const PANEL_HEIGHT = 200;
const GAP = 6;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

let triggerBox: Box = { left: 400, top: 300, width: 250, height: 40 };

const rect = (box: Box): DOMRect =>
  ({
    ...box,
    right: box.left + box.width,
    bottom: box.top + box.height,
    x: box.left,
    y: box.top,
    toJSON: () => box,
  }) as DOMRect;

const offset = (value: string): number | null =>
  value && value !== 'auto' ? parseFloat(value) : null;

/**
 * Where the browser would actually paint the popup, given its inline offsets.
 * jsdom has no top layer, so this always resolves against `BLOCK` — the worst
 * case, and the one the self-correction has to handle on its own.
 */
function paintedPanel(element: HTMLElement): DOMRect {
  const left = offset(element.style.left) ?? 0;
  const top = offset(element.style.top);
  const bottom = offset(element.style.bottom);
  return rect({
    left: BLOCK.left + left,
    top: top !== null ? BLOCK.top + top : BLOCK.top + BLOCK.height - (bottom ?? 0) - PANEL_HEIGHT,
    width: parseFloat(element.style.width || '0'),
    height: PANEL_HEIGHT,
  });
}

@Component({
  selector: 'test-host',
  imports: [UiCombobox],
  template: `
    <ui-combobox
      [options]="options"
      [labelOf]="labelOf"
      [keyOf]="keyOf"
      [(value)]="value"
      [dropUp]="dropUp()"
    />
  `,
})
class Host {
  readonly options = [
    { id: 1, name: 'Walk-in' },
    { id: 2, name: 'Facebook Page' },
  ];
  readonly labelOf = (row: { name: string }) => row.name;
  readonly keyOf = (row: { id: number }) => row.id;
  readonly value = signal<number | string | null>(null);
  readonly dropUp = signal(false);
}

describe('UiCombobox popup placement', () => {
  const original = Element.prototype.getBoundingClientRect;

  beforeEach(() => {
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.getAttribute('role') === 'combobox') return rect(triggerBox);
      if (this.classList.contains('animate-pop')) return paintedPanel(this as HTMLElement);
      return original.call(this);
    };
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  afterEach(() => {
    Element.prototype.getBoundingClientRect = original;
    triggerBox = { left: 400, top: 300, width: 250, height: 40 };
  });

  const open = async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    (root.querySelector('[role="combobox"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    return { fixture, root, panel: root.querySelector('.animate-pop') as HTMLElement };
  };

  it('lands under the trigger even when offsets resolve against an ancestor', async () => {
    const { panel } = await open();
    const painted = paintedPanel(panel);

    expect(painted.left).toBe(triggerBox.left);
    expect(painted.top).toBe(triggerBox.top + triggerBox.height + GAP);
    expect(panel.style.visibility).toBe('');
  });

  it('flips above the trigger when the space below is too tight', async () => {
    triggerBox = { left: 400, top: 600, width: 250, height: 40 };

    const { panel } = await open();
    const painted = paintedPanel(panel);

    // `auto`, never blank: the popover user-agent sheet would otherwise supply
    // a `top: 0` of its own and stretch the box between both edges.
    expect(panel.style.top).toBe('auto');
    expect(painted.bottom).toBe(triggerBox.top - GAP);
  });

  it('escapes an ancestor that would clip it by entering the top layer', async () => {
    const shown: string[] = [];
    (HTMLElement.prototype as { showPopover?: () => void }).showPopover = function (
      this: HTMLElement,
    ) {
      shown.push(this.getAttribute('popover') ?? '');
    };

    try {
      const { panel } = await open();
      expect(panel.getAttribute('popover')).toBe('manual');
      expect(shown).toEqual(['manual']);
    } finally {
      delete (HTMLElement.prototype as { showPopover?: () => void }).showPopover;
    }
  });

  it('never narrows below the readable minimum, nor overflows the viewport', async () => {
    triggerBox = { left: 900, top: 300, width: 90, height: 40 };

    const { panel } = await open();
    const painted = paintedPanel(panel);

    expect(painted.width).toBe(224);
    expect(painted.right).toBeLessThanOrEqual(window.innerWidth);
  });

  it('closes on a press outside the combobox', async () => {
    const { fixture, root } = await open();
    expect(root.querySelector('.animate-pop')).not.toBeNull();

    document.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await fixture.whenStable();

    expect(root.querySelector('.animate-pop')).toBeNull();
  });
});

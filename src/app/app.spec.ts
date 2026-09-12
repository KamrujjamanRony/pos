import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from './core/auth/auth';
import { authInterceptor } from './core/http/interceptors';
import { mockBackendInterceptor, resetMockDatabase } from './core/http/mock-backend';
import { DashboardPage } from './features/dashboard/dashboard';
import { LoginPage } from './features/auth/login';
import { PosTerminalPage } from './features/pos/pos-terminal';
import { SalesFormPage } from './features/sales/sales-form';
import { SalesListPage } from './features/sales/sales-list';
import { CashBookPage } from './features/cash-bank/cash-book';
import { SalesReturnsPage } from './features/sales/sales-returns';
import { AppShell } from './layout/shell';

/** Smoke coverage: every heavy screen must render without throwing. */
describe('screens render', () => {
  beforeEach(() => {
    // jsdom has no scroll implementation; the shell resets scroll on navigation.
    Element.prototype.scrollTo ??= () => { };
    resetMockDatabase();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', children: [] }]),
        provideHttpClient(withInterceptors([authInterceptor, mockBackendInterceptor])),
      ],
    });
  });

  const render = async (component: unknown) => {
    const fixture = TestBed.createComponent(component as never);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  it('renders the sign-in screen', async () => {
    const element = await render(LoginPage);
    expect(element.textContent).toContain('Welcome back');
    expect(element.querySelector('input#username')).toBeTruthy();
  });

  it('renders the POS terminal with a catalogue', async () => {
    const element = await render(PosTerminalPage);
    expect(element.textContent).toContain('Current sale');
    expect(element.textContent).toContain('The cart is empty');
  });

  it('renders the dashboard with headline figures', async () => {
    const element = await render(DashboardPage);
    expect(element.textContent).toContain('Net sales');
    expect(element.textContent).toContain('Gross profit');
  });

  it('renders the invoice list', async () => {
    const element = await render(SalesListPage);
    expect(element.textContent).toContain('Sales invoices');
  });

  it('renders the invoice editor', async () => {
    const element = await render(SalesFormPage);
    expect(element.textContent).toContain('New sales invoice');
    expect(element.textContent).toContain('Settlement');
  });

  it('renders the returns screen with its editor dialog closed', async () => {
    const element = await render(SalesReturnsPage);
    expect(element.textContent).toContain('Sales returns');
    // The dialog is in the DOM from the start; it must not be showing.
    expect(element.querySelector('dialog')?.hasAttribute('open')).toBe(false);
  });

  it('renders the app chrome', async () => {
    const element = await render(AppShell);
    expect(element.querySelector('app-topbar')).toBeTruthy();
    expect(element.querySelector('app-sidebar')).toBeTruthy();
    expect(element.querySelector('app-command-palette')).toBeTruthy();
  });

  it('renders the cash book', async () => {
    const element = await render(CashBookPage);
    expect(element.textContent).toContain('Cash book');
    expect(element.textContent).toContain('Account balances');
  });

  it('signs in through the signal form and stores the session', async () => {
    localStorage.removeItem('supersoft-pos.session');
    const fixture = TestBed.createComponent(LoginPage);
    await fixture.whenStable();

    const form = (fixture.nativeElement as HTMLElement).querySelector('form')!;
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    const auth = TestBed.inject(AuthService);
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.user()?.userName).toBe('Aman');
    auth.clear();
  });
});

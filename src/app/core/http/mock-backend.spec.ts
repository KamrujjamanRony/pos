import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import type {
  ApiEnvelope,
  AuthTokens,
  CashBookRow,
  DailySalesRow,
  NamedEntity,
  PartyBalanceRow,
  SalesEntry,
  StockRow,
} from '../models';
import { mockBackendInterceptor, resetMockDatabase } from './mock-backend';

/**
 * The in-memory backend is what every screen talks to in demo mode, so these
 * cover the routes the UI actually depends on.
 */
describe('mock backend', () => {
  const base = environment.apiBaseUrl;
  let http: HttpClient;

  const post = <T>(path: string, body: unknown = {}) =>
    firstValueFrom(http.post<ApiEnvelope<T>>(`${base}/${path}`, body));
  const get = <T>(path: string) => firstValueFrom(http.get<ApiEnvelope<T>>(`${base}/${path}`));

  beforeEach(() => {
    resetMockDatabase();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  it('issues a token on login and rejects empty credentials', async () => {
    const ok = await post<AuthTokens>('Authentication/Login', {
      username: 'Aman',
      password: '123455.',
    });
    expect(ok.data?.token).toBeTruthy();
    expect(ok.data?.userName).toBe('Aman');

    await expect(post('Authentication/Login', { username: '', password: '' })).rejects.toMatchObject(
      { status: 401 },
    );
  });

  it('round-trips a master through create, search, update and delete', async () => {
    const created = await post<NamedEntity>('Category', { name: 'Drones' });
    const id = created.data!.id;
    expect(id).toBeGreaterThan(0);

    const listed = await post<NamedEntity[]>('Category/Search', {});
    expect(listed.data?.some((row) => row.name === 'Drones')).toBe(true);

    await firstValueFrom(http.put(`${base}/Category/${id}`, { name: 'Drones & FPV' }));
    const afterUpdate = await post<NamedEntity[]>('Category/Search', { search: 'FPV' });
    expect(afterUpdate.data?.[0].name).toBe('Drones & FPV');

    await firstValueFrom(http.delete(`${base}/Category/${id}`));
    const afterDelete = await post<NamedEntity[]>('Category/Search', { search: 'FPV' });
    expect(afterDelete.data?.length).toBe(0);
  });

  it('mints an invoice number and derives totals when a sale is posted', async () => {
    const items = await post<{ id: number; salesPrice: number }[]>('ItemRegistration/Search', {});
    const item = items.data![0];

    const created = await post<SalesEntry>('SalesEntry', {
      invoiceDate: '2026-08-27',
      branchId: 1,
      customerId: 1,
      details: [{ itemId: item.id, salesPrice: 1000, quantity: 2, serialNo: 'SN-TEST' }],
      discount: 10,
      discountType: 'Percent',
      courierCost: 100,
      receiveAmount: 500,
      paymentMode: 'Cash',
      paymentAccountId: 1,
    });

    const sale = created.data!;
    expect(sale.invoiceNo).toMatch(/^BLI2608\d{4}$/);
    expect(sale.grossAmount).toBe(2000);
    expect(sale.netAmount).toBe(1900); // 2000 - 10% + 100 courier
    expect(sale.dueAmount).toBe(1400);
    expect(sale.details[0].itemName).toBeTruthy();

    const byNo = await get<SalesEntry>(`SalesEntry/ByInvoiceNo/${sale.invoiceNo}`);
    expect(byNo.data?.id).toBe(sale.id);
  });

  it('reflects a sale in the stock balance', async () => {
    const before = await post<StockRow[]>('Stock/Search', { branchId: 1 });
    const row = before.data!.find((candidate) => candidate.balance > 5)!;

    await post('SalesEntry', {
      invoiceDate: '2026-08-27',
      branchId: 1,
      customerId: 1,
      details: [{ itemId: row.itemId, salesPrice: 100, quantity: 3, serialNo: '' }],
      discount: 0,
      discountType: 'Flat',
      receiveAmount: 0,
      paymentMode: 'Cash',
      paymentAccountId: 1,
    });

    const after = await post<StockRow[]>('Stock/Search', { branchId: 1 });
    const updated = after.data!.find((candidate) => candidate.itemId === row.itemId)!;
    expect(updated.balance).toBe(row.balance - 3);
  });

  it('keeps the cash book balanced against opening plus movements', async () => {
    const balances = await post<CashBookRow[]>('CashBook/Balance', {});
    expect(balances.data!.length).toBeGreaterThan(0);
    for (const row of balances.data!) {
      expect(row.balance).toBeCloseTo(row.opening + row.inflow - row.outflow, 2);
    }
  });

  it('lists outstanding invoices only for the requested customer', async () => {
    const balances = await post<PartyBalanceRow[]>('PartyLedger/CustomerBalance', {});
    const owing = balances.data!.find((row) => row.balance > 0)!;

    const outstanding = await get<{ dueAmount: number }[]>(`Receipt/Outstanding/${owing.partyId}`);
    expect(Array.isArray(outstanding.data)).toBe(true);
    for (const invoice of outstanding.data!) expect(invoice.dueAmount).toBeGreaterThan(0);
  });

  it('reports daily sales inside the requested window', async () => {
    const report = await post<DailySalesRow[]>('Report/DailySales', {
      fromDate: '2026-08-01',
      toDate: '2026-08-31',
    });
    for (const row of report.data!) {
      expect(row.date >= '2026-08-01' && row.date <= '2026-08-31').toBe(true);
      expect(row.invoiceCount).toBeGreaterThan(0);
    }
  });

  it('answers 404 for an unknown record', async () => {
    await expect(get('SalesEntry/999999')).rejects.toMatchObject({ status: 404 });
  });
});

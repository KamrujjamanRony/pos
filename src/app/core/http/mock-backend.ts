import {
  HttpErrorResponse,
  HttpEvent,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Observable, delay, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { addDays, round2, today } from '../util/format';
import { MockDb, createDb, nextDocNo, nextId } from './mock-db';
import type {
  CashBookRow,
  CashLedgerRow,
  DailySalesRow,
  GrossProfitRow,
  Id,
  MenuPermissionNode,
  OutstandingInvoice,
  PartyBalanceRow,
  PartyLedgerRow,
  PaymentMode,
  PurchaseEntry,
  SalesEntry,
  SearchFilter,
  StaffSalesRow,
  StockLedgerRow,
  StockRow,
  TopItemRow,
} from '../models';

/* ------------------------------------------------------------------ *
 * Store
 * ------------------------------------------------------------------ */
let db: MockDb | null = null;
const database = (): MockDb => (db ??= createDb());

type TableKey = {
  [K in keyof MockDb]: MockDb[K] extends Array<{ id: number }> ? K : never;
}[keyof MockDb];

/** Maps the API resource segment onto the in-memory collection that backs it. */
const TABLES: Record<string, TableKey> = {
  Branch: 'branches',
  CourierName: 'couriers',
  Department: 'departments',
  Category: 'categories',
  Unit: 'units',
  Origin: 'origins',
  Brand: 'brands',
  Area: 'areas',
  Referred: 'referreds',
  ItemRegistration: 'items',
  ItemOpening: 'itemOpenings',
  CustomerRegistration: 'customers',
  CustomerOpening: 'customerOpenings',
  SupplierRegistration: 'suppliers',
  CashInHand: 'cashAccounts',
  CashAtBank: 'bankAccounts',
  Employee: 'employees',
  Menu: 'menus',
  User: 'users',
  ImageGallery: 'gallery',
  SalesEntry: 'salesEntries',
  SalesReturn: 'salesReturns',
  PurchaseEntry: 'purchaseEntries',
  PurchaseReturn: 'purchaseReturns',
  Receipt: 'receipts',
  Payment: 'payments',
  StockTransfer: 'stockTransfers',
  FundTransfer: 'fundTransfers',
};

/** The field each document sorts and date-filters on. */
const DATE_FIELD: Record<string, string> = {
  salesEntries: 'invoiceDate',
  salesReturns: 'returnDate',
  purchaseEntries: 'receiptDate',
  purchaseReturns: 'returnDate',
  receipts: 'receiptDate',
  payments: 'paymentDate',
  stockTransfers: 'transferDate',
  fundTransfers: 'transferDate',
  itemOpenings: 'openingDate',
  customerOpenings: 'openingDate',
};

/** Prefix used when the mock mints a document number. */
const DOC_PREFIX: Record<string, { field: string; prefix: string }> = {
  salesEntries: { field: 'invoiceNo', prefix: 'BLI' },
  salesReturns: { field: 'returnNo', prefix: 'SR' },
  purchaseEntries: { field: 'invoiceNo', prefix: 'PI' },
  purchaseReturns: { field: 'returnNo', prefix: 'PR' },
  stockTransfers: { field: 'transferNo', prefix: 'ST' },
  fundTransfers: { field: 'transferNo', prefix: 'FT' },
  receipts: { field: 'receiptNo', prefix: 'RC' },
  payments: { field: 'paymentNo', prefix: 'PY' },
};

type Row = Record<string, unknown> & { id: number };

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */
const nameOf = (rows: Array<{ id: number; name: string }>, id: unknown) =>
  rows.find((r) => r.id === Number(id))?.name ?? '';

function textOf(row: Row): string {
  return Object.values(row)
    .filter((v) => typeof v === 'string' || typeof v === 'number')
    .join(' ')
    .toLowerCase();
}

function withinRange(value: unknown, from?: string, to?: string): boolean {
  const date = String(value ?? '').slice(0, 10);
  if (!date) return true;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

/** Fills denormalised display fields and recomputes document totals. */
function decorate(table: TableKey, row: Row): Row {
  const d = database();
  switch (table) {
    case 'items':
      row['categoryName'] = nameOf(d.categories, row['categoryId']);
      row['unitName'] = nameOf(d.units, row['unitId']);
      row['brandName'] = nameOf(d.brands, row['brandId']);
      row['originName'] = nameOf(d.origins, row['originId']);
      break;
    case 'itemOpenings':
      row['itemName'] = d.items.find((i) => i.id === Number(row['itemId']))?.name ?? '';
      row['branchName'] = nameOf(d.branches, row['branchId']);
      break;
    case 'customers':
      row['areaName'] = nameOf(d.areas, row['areaId']);
      row['referredName'] = nameOf(d.referreds, row['referredId']);
      break;
    case 'customerOpenings':
      row['customerName'] =
        d.customers.find((c) => c.id === Number(row['customerId']))?.customerName ?? '';
      break;
    case 'employees':
      row['branchName'] = nameOf(d.branches, row['branchId']);
      row['departmentName'] = nameOf(d.departments, row['departmentId']);
      break;
    case 'salesEntries': {
      const entry = row as unknown as SalesEntry;
      const gross = round2(
        (entry.details ?? []).reduce((t, l) => t + Number(l.salesPrice) * Number(l.quantity), 0),
      );
      const discountValue =
        entry.discountType === 'Percent'
          ? round2((gross * Number(entry.discount ?? 0)) / 100)
          : Number(entry.discount ?? 0);
      const net = round2(gross - discountValue + Number(entry.courierCost ?? 0));
      entry.grossAmount = gross;
      entry.netAmount = net;
      entry.dueAmount = round2(net - Number(entry.receiveAmount ?? 0));
      entry.customerName =
        d.customers.find((c) => c.id === Number(entry.customerId))?.customerName ?? '';
      entry.branchName = nameOf(d.branches, entry.branchId);
      entry.employeeName =
        d.employees.find((e) => e.id === Number(entry.byEmployeeId))?.employeeName ?? '';
      entry.referredName = nameOf(d.referreds, entry.byReferredId);
      entry.courierName = nameOf(d.couriers, entry.courierNameId);
      for (const line of entry.details ?? []) {
        const item = d.items.find((i) => i.id === Number(line.itemId));
        line.itemName = item?.name ?? '';
        line.itemCode = item?.code ?? '';
        line.purchasePrice = item?.purchasePrice ?? 0;
      }
      break;
    }
    case 'salesReturns': {
      const ret = row as unknown as import('../models').SalesReturn;
      const gross = round2(
        (ret.details ?? []).reduce((t, l) => t + Number(l.salesPrice) * Number(l.quantity), 0),
      );
      ret.netAmount = round2(gross - Number(ret.discount ?? 0));
      ret.customerName =
        d.customers.find((c) => c.id === Number(ret.customerId))?.customerName ?? '';
      for (const line of ret.details ?? []) {
        const item = d.items.find((i) => i.id === Number(line.itemId));
        line.itemName = item?.name ?? '';
      }
      break;
    }
    case 'purchaseEntries': {
      const entry = row as unknown as PurchaseEntry;
      const gross = round2(
        (entry.details ?? []).reduce((t, l) => t + Number(l.purchasePrice) * Number(l.quantity), 0),
      );
      const net = round2(gross - Number(entry.discount ?? 0));
      entry.grossAmount = gross;
      entry.netAmount = net;
      entry.dueAmount = round2(net - Number(entry.cashPayment ?? 0));
      entry.supplierName =
        d.suppliers.find((s) => s.id === Number(entry.supplierId))?.supplierName ?? '';
      entry.branchName = nameOf(d.branches, entry.branchId);
      for (const line of entry.details ?? []) {
        const item = d.items.find((i) => i.id === Number(line.itemId));
        line.itemName = item?.name ?? '';
        line.itemCode = item?.code ?? '';
      }
      break;
    }
    case 'purchaseReturns': {
      const ret = row as unknown as import('../models').PurchaseReturn;
      const gross = round2(
        (ret.details ?? []).reduce((t, l) => t + Number(l.purchasePrice) * Number(l.quantity), 0),
      );
      ret.netAmount = round2(gross - Number(ret.discount ?? 0));
      ret.supplierName =
        d.suppliers.find((s) => s.id === Number(ret.supplierId))?.supplierName ?? '';
      for (const line of ret.details ?? []) {
        line.itemName = d.items.find((i) => i.id === Number(line.itemId))?.name ?? '';
      }
      break;
    }
    case 'receipts':
      row['customerName'] =
        d.customers.find((c) => c.id === Number(row['customerId']))?.customerName ?? '';
      break;
    case 'payments':
      row['supplierName'] =
        d.suppliers.find((s) => s.id === Number(row['supplierId']))?.supplierName ?? '';
      break;
    case 'stockTransfers': {
      const transfer = row as unknown as import('../models').StockTransfer;
      transfer.fromBranchName = nameOf(d.branches, transfer.fromBranchId);
      transfer.toBranchName = nameOf(d.branches, transfer.toBranchId);
      transfer.totalQuantity = (transfer.details ?? []).reduce(
        (t, l) => t + Number(l.quantity ?? 0),
        0,
      );
      for (const line of transfer.details ?? []) {
        line.itemName = d.items.find((i) => i.id === Number(line.itemId))?.name ?? '';
      }
      break;
    }
    case 'fundTransfers': {
      const transfer = row as unknown as import('../models').FundTransfer;
      const from = transfer.fromMode === 'Cash' ? d.cashAccounts : d.bankAccounts;
      const to = transfer.toMode === 'Cash' ? d.cashAccounts : d.bankAccounts;
      transfer.fromAccountName = nameOf(from, transfer.fromAccountId);
      transfer.toAccountName = nameOf(to, transfer.toAccountId);
      break;
    }
    default:
      break;
  }
  return row;
}

/* ------------------------------------------------------------------ *
 * Derived reads
 * ------------------------------------------------------------------ */
function computeStock(filter: SearchFilter): StockRow[] {
  const d = database();
  const asOn = filter.asOnDate;
  const before = (date: string) => (asOn ? date <= asOn : true);
  const branchFilter = filter.branchId ? Number(filter.branchId) : null;

  const key = (itemId: number, branchId: number) => `${itemId}:${branchId}`;
  const map = new Map<string, StockRow>();

  const touch = (itemId: number, branchId: number): StockRow => {
    const id = key(itemId, branchId);
    let row = map.get(id);
    if (!row) {
      const item = d.items.find((i) => i.id === itemId);
      row = {
        itemId,
        itemCode: item?.code ?? '',
        itemName: item?.name ?? '',
        branchId,
        branchName: nameOf(d.branches, branchId),
        categoryName: item?.categoryName ?? '',
        opening: 0,
        purchase: 0,
        purchaseReturn: 0,
        sales: 0,
        salesReturn: 0,
        transferIn: 0,
        transferOut: 0,
        balance: 0,
        rate: item?.purchasePrice ?? 0,
        value: 0,
        reorderQuantity: item?.reorderQuantity ?? 0,
      };
      map.set(id, row);
    }
    return row;
  };

  for (const opening of d.itemOpenings) {
    if (!before(opening.openingDate)) continue;
    touch(Number(opening.itemId), Number(opening.branchId)).opening += Number(opening.quantity);
  }
  for (const entry of d.purchaseEntries) {
    if (!before(entry.receiptDate)) continue;
    for (const line of entry.details)
      touch(Number(line.itemId), Number(entry.branchId)).purchase += Number(line.quantity);
  }
  for (const entry of d.purchaseReturns) {
    if (!before(entry.returnDate)) continue;
    for (const line of entry.details)
      touch(Number(line.itemId), Number(entry.branchId)).purchaseReturn += Number(line.quantity);
  }
  for (const entry of d.salesEntries) {
    if (!before(entry.invoiceDate)) continue;
    for (const line of entry.details)
      touch(Number(line.itemId), Number(entry.branchId)).sales += Number(line.quantity);
  }
  for (const entry of d.salesReturns) {
    if (!before(entry.returnDate)) continue;
    for (const line of entry.details)
      touch(Number(line.itemId), Number(entry.branchId)).salesReturn += Number(line.quantity);
  }
  for (const transfer of d.stockTransfers) {
    if (!before(transfer.transferDate)) continue;
    for (const line of transfer.details) {
      touch(Number(line.itemId), Number(transfer.fromBranchId)).transferOut += Number(line.quantity);
      touch(Number(line.itemId), Number(transfer.toBranchId)).transferIn += Number(line.quantity);
    }
  }

  return [...map.values()]
    .filter((row) => (branchFilter ? row.branchId === branchFilter : true))
    .filter((row) => (filter.itemId ? row.itemId === Number(filter.itemId) : true))
    .filter((row) =>
      filter.search
        ? `${row.itemName} ${row.itemCode} ${row.categoryName}`
            .toLowerCase()
            .includes(filter.search.toLowerCase())
        : true,
    )
    .map((row) => {
      row.balance =
        row.opening + row.purchase + row.salesReturn + row.transferIn -
        row.sales - row.purchaseReturn - row.transferOut;
      row.value = round2(row.balance * row.rate);
      return row;
    })
    .sort((a, b) => a.itemName.localeCompare(b.itemName) || a.branchId - b.branchId);
}

function stockLedger(filter: SearchFilter): StockLedgerRow[] {
  const d = database();
  const rows: StockLedgerRow[] = [];
  const push = (
    date: string,
    documentNo: string,
    documentType: string,
    itemId: Id,
    branchId: Id,
    inQty: number,
    outQty: number,
    remarks: string,
  ) => {
    rows.push({
      date,
      documentNo,
      documentType,
      itemId: Number(itemId),
      itemName: d.items.find((i) => i.id === Number(itemId))?.name ?? '',
      branchName: nameOf(d.branches, branchId),
      inQty,
      outQty,
      balance: 0,
      remarks,
    });
  };

  for (const o of d.itemOpenings)
    push(o.openingDate, 'OPENING', 'Opening', o.itemId!, o.branchId!, o.quantity, 0, o.remarks);
  for (const e of d.purchaseEntries)
    for (const l of e.details)
      push(e.receiptDate, e.invoiceNo, 'Purchase', l.itemId!, e.branchId!, l.quantity, 0, e.supplierName ?? '');
  for (const e of d.purchaseReturns)
    for (const l of e.details)
      push(e.returnDate, e.returnNo, 'Purchase return', l.itemId!, e.branchId!, 0, l.quantity, e.supplierName ?? '');
  for (const e of d.salesEntries)
    for (const l of e.details)
      push(e.invoiceDate, e.invoiceNo, 'Sale', l.itemId!, e.branchId!, 0, l.quantity, e.customerName ?? '');
  for (const e of d.salesReturns)
    for (const l of e.details)
      push(e.returnDate, e.returnNo, 'Sales return', l.itemId!, e.branchId!, l.quantity, 0, e.customerName ?? '');
  for (const t of d.stockTransfers)
    for (const l of t.details) {
      push(t.transferDate, t.transferNo, 'Transfer out', l.itemId!, t.fromBranchId!, 0, l.quantity, t.toBranchName ?? '');
      push(t.transferDate, t.transferNo, 'Transfer in', l.itemId!, t.toBranchId!, l.quantity, 0, t.fromBranchName ?? '');
    }

  let running = 0;
  return rows
    .filter((r) => (filter.itemId ? r.itemId === Number(filter.itemId) : true))
    .filter((r) => withinRange(r.date, filter.fromDate, filter.toDate))
    .filter((r) =>
      filter.search ? `${r.itemName} ${r.documentNo}`.toLowerCase().includes(filter.search.toLowerCase()) : true,
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.documentNo.localeCompare(b.documentNo))
    .map((row) => {
      running += row.inQty - row.outQty;
      return { ...row, balance: running };
    });
}

interface CashMovement {
  date: string;
  documentNo: string;
  particulars: string;
  mode: PaymentMode;
  accountId: Id;
  amount: number;
  direction: 'In' | 'Out';
}

function cashMovements(): CashMovement[] {
  const d = database();
  const rows: CashMovement[] = [];

  for (const e of d.salesEntries)
    if (e.receiveAmount > 0)
      rows.push({
        date: e.invoiceDate, documentNo: e.invoiceNo, particulars: `Sale — ${e.customerName}`,
        mode: e.paymentMode, accountId: Number(e.paymentAccountId ?? 1), amount: e.receiveAmount, direction: 'In',
      });
  for (const r of d.receipts)
    rows.push({
      date: r.receiptDate, documentNo: r.receiptNo, particulars: `Receipt — ${r.customerName}`,
      mode: r.paymentMode, accountId: Number(r.paymentAccountId ?? 1), amount: r.amount, direction: 'In',
    });
  for (const r of d.purchaseReturns)
    rows.push({
      date: r.returnDate, documentNo: r.returnNo, particulars: `Purchase return — ${r.supplierName}`,
      mode: r.paymentMode, accountId: Number(r.paymentAccountId ?? 1), amount: r.cashReceive, direction: 'In',
    });
  for (const e of d.purchaseEntries)
    if (e.cashPayment > 0)
      rows.push({
        date: e.receiptDate, documentNo: e.invoiceNo, particulars: `Purchase — ${e.supplierName}`,
        mode: e.paymentMode, accountId: Number(e.paymentAccountId ?? 1), amount: e.cashPayment, direction: 'Out',
      });
  for (const p of d.payments)
    rows.push({
      date: p.paymentDate, documentNo: p.paymentNo, particulars: `Payment — ${p.supplierName}`,
      mode: p.paymentMode, accountId: Number(p.paymentAccountId ?? 1), amount: p.amount, direction: 'Out',
    });
  for (const r of d.salesReturns)
    rows.push({
      date: r.returnDate, documentNo: r.returnNo, particulars: `Sales return — ${r.customerName}`,
      mode: r.paymentMode, accountId: Number(r.paymentAccountId ?? 1), amount: r.refundAmount, direction: 'Out',
    });
  for (const t of d.fundTransfers) {
    rows.push({
      date: t.transferDate, documentNo: t.transferNo, particulars: `Transfer to ${t.toAccountName}`,
      mode: t.fromMode, accountId: Number(t.fromAccountId ?? 1), amount: t.amount, direction: 'Out',
    });
    rows.push({
      date: t.transferDate, documentNo: t.transferNo, particulars: `Transfer from ${t.fromAccountName}`,
      mode: t.toMode, accountId: Number(t.toAccountId ?? 1), amount: t.amount, direction: 'In',
    });
  }

  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

function cashBalance(filter: SearchFilter): CashBookRow[] {
  const d = database();
  const movements = cashMovements().filter((m) => withinRange(m.date, undefined, filter.asOnDate));
  const accounts: CashBookRow[] = [
    ...d.cashAccounts.map((a) => ({
      mode: 'Cash' as PaymentMode, accountId: a.id, accountName: a.name,
      opening: a.openingBalance, inflow: 0, outflow: 0, balance: 0,
    })),
    ...d.bankAccounts.map((a) => ({
      mode: 'Bank' as PaymentMode, accountId: a.id, accountName: a.name,
      opening: a.openingBalance, inflow: 0, outflow: 0, balance: 0,
    })),
  ];

  for (const m of movements) {
    const account = accounts.find((a) => a.mode === m.mode && a.accountId === m.accountId);
    if (!account) continue;
    if (m.direction === 'In') account.inflow += m.amount;
    else account.outflow += m.amount;
  }

  return accounts
    .filter((a) => (filter.mode ? a.mode === filter.mode : true))
    .filter((a) => (filter.accountId ? a.accountId === Number(filter.accountId) : true))
    .map((a) => ({
      ...a,
      inflow: round2(a.inflow),
      outflow: round2(a.outflow),
      balance: round2(a.opening + a.inflow - a.outflow),
    }));
}

function cashLedger(filter: SearchFilter): CashLedgerRow[] {
  const d = database();
  let running = 0;
  return cashMovements()
    .filter((m) => (filter.mode ? m.mode === filter.mode : true))
    .filter((m) => (filter.accountId ? m.accountId === Number(filter.accountId) : true))
    .filter((m) => (filter.transactionType ? m.direction === filter.transactionType : true))
    .filter((m) => withinRange(m.date, filter.fromDate, filter.toDate))
    .filter((m) =>
      filter.search
        ? `${m.documentNo} ${m.particulars}`.toLowerCase().includes(filter.search.toLowerCase())
        : true,
    )
    .map((m) => {
      running += m.direction === 'In' ? m.amount : -m.amount;
      const accounts = m.mode === 'Cash' ? d.cashAccounts : d.bankAccounts;
      return {
        date: m.date,
        documentNo: m.documentNo,
        particulars: m.particulars,
        mode: m.mode,
        accountName: nameOf(accounts, m.accountId),
        transactionType: m.direction,
        amount: round2(m.amount),
        balance: round2(running),
      } satisfies CashLedgerRow;
    });
}

function customerBalances(filter: SearchFilter): PartyBalanceRow[] {
  const d = database();
  return d.customers
    .map((customer) => {
      const opening = d.customerOpenings
        .filter((o) => o.customerId === customer.id)
        .reduce((t, o) => t + (o.openingType === 'Dr' ? o.amount : -o.amount), 0);
      const debit = d.salesEntries
        .filter((s) => s.customerId === customer.id)
        .reduce((t, s) => t + (s.netAmount ?? 0), 0);
      const credit =
        d.salesEntries.filter((s) => s.customerId === customer.id).reduce((t, s) => t + s.receiveAmount, 0) +
        d.receipts.filter((r) => r.customerId === customer.id).reduce((t, r) => t + r.amount, 0) +
        d.salesReturns.filter((r) => r.customerId === customer.id).reduce((t, r) => t + (r.netAmount ?? 0), 0);
      return {
        partyId: customer.id,
        partyName: customer.customerName,
        contact: customer.contactNumber,
        opening: round2(opening),
        debit: round2(debit),
        credit: round2(credit),
        balance: round2(opening + debit - credit),
      } satisfies PartyBalanceRow;
    })
    .filter((row) =>
      filter.search ? row.partyName.toLowerCase().includes(filter.search.toLowerCase()) : true,
    )
    .sort((a, b) => b.balance - a.balance);
}

function supplierBalances(filter: SearchFilter): PartyBalanceRow[] {
  const d = database();
  return d.suppliers
    .map((supplier) => {
      const opening = supplier.openingType === 'Cr' ? supplier.openingBalance : -supplier.openingBalance;
      const credit = d.purchaseEntries
        .filter((p) => p.supplierId === supplier.id)
        .reduce((t, p) => t + (p.netAmount ?? 0), 0);
      const debit =
        d.purchaseEntries.filter((p) => p.supplierId === supplier.id).reduce((t, p) => t + p.cashPayment, 0) +
        d.payments.filter((p) => p.supplierId === supplier.id).reduce((t, p) => t + p.amount, 0) +
        d.purchaseReturns.filter((p) => p.supplierId === supplier.id).reduce((t, p) => t + (p.netAmount ?? 0), 0);
      return {
        partyId: supplier.id,
        partyName: supplier.supplierName,
        contact: supplier.mobileNumber,
        opening: round2(opening),
        debit: round2(debit),
        credit: round2(credit),
        balance: round2(opening + credit - debit),
      } satisfies PartyBalanceRow;
    })
    .filter((row) =>
      filter.search ? row.partyName.toLowerCase().includes(filter.search.toLowerCase()) : true,
    )
    .sort((a, b) => b.balance - a.balance);
}

function customerLedger(filter: SearchFilter): PartyLedgerRow[] {
  const d = database();
  const id = Number(filter.partyId);
  const rows: Omit<PartyLedgerRow, 'balance'>[] = [];

  for (const o of d.customerOpenings.filter((o) => o.customerId === id))
    rows.push({ date: o.openingDate, documentNo: 'OPENING', particulars: 'Opening balance', debit: o.openingType === 'Dr' ? o.amount : 0, credit: o.openingType === 'Cr' ? o.amount : 0 });
  for (const s of d.salesEntries.filter((s) => s.customerId === id)) {
    rows.push({ date: s.invoiceDate, documentNo: s.invoiceNo, particulars: `Sales invoice (${s.details.length} lines)`, debit: s.netAmount ?? 0, credit: 0 });
    if (s.receiveAmount > 0)
      rows.push({ date: s.invoiceDate, documentNo: s.invoiceNo, particulars: `Received at counter (${s.paymentMode})`, debit: 0, credit: s.receiveAmount });
  }
  for (const r of d.receipts.filter((r) => r.customerId === id))
    rows.push({ date: r.receiptDate, documentNo: r.receiptNo, particulars: `Receipt (${r.paymentMode})`, debit: 0, credit: r.amount });
  for (const r of d.salesReturns.filter((r) => r.customerId === id))
    rows.push({ date: r.returnDate, documentNo: r.returnNo, particulars: 'Sales return', debit: 0, credit: r.netAmount ?? 0 });

  let running = 0;
  return rows
    .filter((r) => withinRange(r.date, filter.fromDate, filter.toDate))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => {
      running += r.debit - r.credit;
      return { ...r, balance: round2(running) };
    });
}

function supplierLedger(filter: SearchFilter): PartyLedgerRow[] {
  const d = database();
  const id = Number(filter.partyId);
  const supplier = d.suppliers.find((s) => s.id === id);
  const rows: Omit<PartyLedgerRow, 'balance'>[] = [];

  if (supplier)
    rows.push({ date: supplier.openingDate, documentNo: 'OPENING', particulars: 'Opening balance', debit: supplier.openingType === 'Dr' ? supplier.openingBalance : 0, credit: supplier.openingType === 'Cr' ? supplier.openingBalance : 0 });
  for (const p of d.purchaseEntries.filter((p) => p.supplierId === id)) {
    rows.push({ date: p.receiptDate, documentNo: p.invoiceNo, particulars: `Purchase invoice (${p.details.length} lines)`, debit: 0, credit: p.netAmount ?? 0 });
    if (p.cashPayment > 0)
      rows.push({ date: p.receiptDate, documentNo: p.invoiceNo, particulars: `Paid at receipt (${p.paymentMode})`, debit: p.cashPayment, credit: 0 });
  }
  for (const p of d.payments.filter((p) => p.supplierId === id))
    rows.push({ date: p.paymentDate, documentNo: p.paymentNo, particulars: `Payment (${p.paymentMode})`, debit: p.amount, credit: 0 });
  for (const p of d.purchaseReturns.filter((p) => p.supplierId === id))
    rows.push({ date: p.returnDate, documentNo: p.returnNo, particulars: 'Purchase return', debit: p.netAmount ?? 0, credit: 0 });

  let running = 0;
  return rows
    .filter((r) => withinRange(r.date, filter.fromDate, filter.toDate))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => {
      running += r.credit - r.debit;
      return { ...r, balance: round2(running) };
    });
}

function outstandingSales(customerId: Id): OutstandingInvoice[] {
  return database()
    .salesEntries.filter((s) => s.customerId === Number(customerId) && (s.dueAmount ?? 0) > 0.5)
    .map((s) => ({
      documentId: s.id,
      documentNo: s.invoiceNo,
      documentDate: s.invoiceDate,
      netAmount: s.netAmount ?? 0,
      paidAmount: s.receiveAmount,
      dueAmount: s.dueAmount ?? 0,
    }))
    .sort((a, b) => a.documentDate.localeCompare(b.documentDate));
}

function outstandingPurchases(supplierId: Id): OutstandingInvoice[] {
  return database()
    .purchaseEntries.filter((p) => p.supplierId === Number(supplierId) && (p.dueAmount ?? 0) > 0.5)
    .map((p) => ({
      documentId: p.id,
      documentNo: p.invoiceNo,
      documentDate: p.receiptDate,
      netAmount: p.netAmount ?? 0,
      paidAmount: p.cashPayment,
      dueAmount: p.dueAmount ?? 0,
    }))
    .sort((a, b) => a.documentDate.localeCompare(b.documentDate));
}

function inWindow(filter: SearchFilter) {
  const from = filter.fromDate ?? addDays(today(), -30);
  const to = filter.toDate ?? today();
  return (entry: SalesEntry) => entry.invoiceDate >= from && entry.invoiceDate <= to;
}

function dailySales(filter: SearchFilter): DailySalesRow[] {
  const grouped = new Map<string, DailySalesRow>();
  for (const s of database().salesEntries.filter(inWindow(filter))) {
    const row = grouped.get(s.invoiceDate) ?? {
      date: s.invoiceDate, invoiceCount: 0, grossAmount: 0, discount: 0, netAmount: 0, received: 0, due: 0,
    };
    const discountValue =
      s.discountType === 'Percent' ? ((s.grossAmount ?? 0) * s.discount) / 100 : s.discount;
    row.invoiceCount += 1;
    row.grossAmount = round2(row.grossAmount + (s.grossAmount ?? 0));
    row.discount = round2(row.discount + discountValue);
    row.netAmount = round2(row.netAmount + (s.netAmount ?? 0));
    row.received = round2(row.received + s.receiveAmount);
    row.due = round2(row.due + (s.dueAmount ?? 0));
    grouped.set(s.invoiceDate, row);
  }
  return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function grossProfit(filter: SearchFilter): GrossProfitRow[] {
  const grouped = new Map<string, GrossProfitRow>();
  for (const s of database().salesEntries.filter(inWindow(filter))) {
    const row = grouped.get(s.invoiceDate) ?? {
      date: s.invoiceDate, salesAmount: 0, costAmount: 0, profit: 0, marginPercent: 0,
    };
    const sales = s.details.reduce((t, l) => t + l.salesPrice * l.quantity, 0);
    const cost = s.details.reduce((t, l) => t + (l.purchasePrice ?? 0) * l.quantity, 0);
    row.salesAmount = round2(row.salesAmount + sales);
    row.costAmount = round2(row.costAmount + cost);
    grouped.set(s.invoiceDate, row);
  }
  return [...grouped.values()]
    .map((row) => ({
      ...row,
      profit: round2(row.salesAmount - row.costAmount),
      marginPercent: row.salesAmount ? round2(((row.salesAmount - row.costAmount) / row.salesAmount) * 100) : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function topItems(filter: SearchFilter): TopItemRow[] {
  const grouped = new Map<number, TopItemRow>();
  for (const s of database().salesEntries.filter(inWindow(filter))) {
    for (const line of s.details) {
      const id = Number(line.itemId);
      const row = grouped.get(id) ?? {
        itemId: id, itemName: line.itemName ?? '', itemCode: line.itemCode ?? '', quantity: 0, amount: 0,
      };
      row.quantity += line.quantity;
      row.amount = round2(row.amount + line.salesPrice * line.quantity);
      grouped.set(id, row);
    }
  }
  const rankBy = filter.rankBy ?? 'Value';
  return [...grouped.values()]
    .sort((a, b) => (rankBy === 'Quantity' ? b.quantity - a.quantity : b.amount - a.amount))
    .slice(0, filter.top ?? 10);
}

function staffSales(filter: SearchFilter, by: 'employee' | 'referred'): StaffSalesRow[] {
  const d = database();
  const grouped = new Map<number, StaffSalesRow>();
  for (const s of d.salesEntries.filter(inWindow(filter))) {
    const id = Number(by === 'employee' ? s.byEmployeeId : s.byReferredId);
    if (!id) continue;
    const name =
      by === 'employee'
        ? d.employees.find((e) => e.id === id)?.employeeName ?? ''
        : nameOf(d.referreds, id);
    const row = grouped.get(id) ?? { id, name, invoiceCount: 0, amount: 0 };
    row.invoiceCount += 1;
    row.amount = round2(row.amount + (s.netAmount ?? 0));
    grouped.set(id, row);
  }
  return [...grouped.values()].sort((a, b) => b.amount - a.amount);
}

function menuTree(): MenuPermissionNode[] {
  const d = database();
  const build = (parentId: number | null): MenuPermissionNode[] =>
    d.menus
      .filter((m) => m.parentId === parentId)
      .sort((a, b) => a.serialNo - b.serialNo)
      .map((m) => ({
        menuId: m.id,
        menuName: m.menuName,
        isSelected: true,
        permissions: [...m.permissionsKey],
        children: build(m.id),
      }));
  return build(null);
}

/* ------------------------------------------------------------------ *
 * Request routing
 * ------------------------------------------------------------------ */
function bodyOf(req: HttpRequest<unknown>): Record<string, unknown> {
  const body = req.body;
  if (body instanceof FormData) {
    const result: Record<string, unknown> = {};
    body.forEach((value, key) => {
      const camel = key.charAt(0).toLowerCase() + key.slice(1);
      // A real server stores the upload and answers with a URL; an object URL
      // stands in for that here so the employee photo renders after a save.
      if (value instanceof File && camel === 'photoFile') {
        result['photoUrl'] = URL.createObjectURL(value);
        return;
      }
      result[camel] = value instanceof File ? value.name : value;
    });
    return result;
  }
  return (body as Record<string, unknown>) ?? {};
}

function collection(table: TableKey): Row[] {
  return database()[table] as unknown as Row[];
}

function handleCrud(
  resource: string,
  segments: string[],
  req: HttpRequest<unknown>,
): unknown | undefined {
  const table = TABLES[resource];
  if (!table) return undefined;
  const rows = collection(table);
  const body = bodyOf(req);

  // POST /X/Search
  if (req.method === 'POST' && segments[0] === 'Search') {
    const filter = body as SearchFilter;
    const dateField = DATE_FIELD[table];
    let result = [...rows];
    if (filter.search) {
      const needle = filter.search.toLowerCase();
      result = result.filter((row) => textOf(row).includes(needle));
    }
    if (dateField && (filter.fromDate || filter.toDate))
      result = result.filter((row) => withinRange(row[dateField], filter.fromDate, filter.toDate));
    if (filter.branchId) result = result.filter((row) => Number(row['branchId']) === Number(filter.branchId));
    if (filter.customerId) result = result.filter((row) => Number(row['customerId']) === Number(filter.customerId));
    if (filter.supplierId) result = result.filter((row) => Number(row['supplierId']) === Number(filter.supplierId));
    if (filter.hasDue) result = result.filter((row) => Number(row['dueAmount'] ?? 0) > 0.5);
    if (dateField)
      result.sort((a, b) => String(b[dateField]).localeCompare(String(a[dateField])) || b.id - a.id);
    return result.map((row) => decorate(table, row));
  }

  // GET /X/ByInvoiceNo/{no} and friends
  if (req.method === 'GET' && segments.length === 2 && segments[0].startsWith('By')) {
    const field = segments[0].replace(/^By/, '');
    const key = field.charAt(0).toLowerCase() + field.slice(1);
    const found = rows.find((row) => String(row[key]) === decodeURIComponent(segments[1]));
    if (!found) throw new Error('not-found');
    return decorate(table, found);
  }

  // POST /X  (create)
  if (req.method === 'POST' && segments.length === 0) {
    const row = { ...body, id: nextId(rows as Array<{ id: number }>) } as Row;
    const doc = DOC_PREFIX[table];
    if (doc && !row[doc.field]) {
      const dateField = DATE_FIELD[table];
      const date = String(row[dateField] ?? today()).slice(0, 10);
      const existing = rows.map((r) => String(r[doc.field] ?? ''));
      const sequence = nextDocNo(doc.prefix, existing, date);
      row[doc.field] = `${doc.prefix}${date.slice(2, 4)}${date.slice(5, 7)}${String(sequence).padStart(4, '0')}`;
    }
    row['postDate'] = new Date().toISOString();
    rows.unshift(row);
    return decorate(table, row);
  }

  const id = Number(segments[0]);
  const index = rows.findIndex((row) => row.id === id);

  if (req.method === 'GET' && segments.length === 1) {
    if (index < 0) throw new Error('not-found');
    return decorate(table, rows[index]);
  }

  if (req.method === 'PUT') {
    if (index < 0) throw new Error('not-found');
    // Sub-resource updates such as PUT /SalesEntry/{id}/CourierCondition
    const merged = { ...rows[index], ...body, id } as Row;
    merged['editDate'] = new Date().toISOString();
    rows[index] = merged;
    return decorate(table, merged);
  }

  if (req.method === 'DELETE') {
    if (index < 0) throw new Error('not-found');
    const [removed] = rows.splice(index, 1);
    return removed;
  }

  // POST /User/{id} — the collection documents "get by id" as a POST.
  if (req.method === 'POST' && segments.length === 1 && Number.isFinite(id)) {
    if (index < 0) throw new Error('not-found');
    return decorate(table, rows[index]);
  }

  return undefined;
}

function route(req: HttpRequest<unknown>): unknown {
  const path = new URL(req.url, location.origin).pathname.replace(/^.*\/p\//, '').replace(/^\/+/, '');
  const [resource, ...segments] = path.split('/').filter(Boolean);
  const body = bodyOf(req);
  const query = req.params;
  const d = database();

  switch (`${resource}/${segments[0] ?? ''}`) {
    case 'Authentication/Login': {
      const username = String(body['username'] ?? '');
      const password = String(body['password'] ?? '');
      if (!username || !password) throw new Error('bad-credentials');
      const user = d.users.find((u) => u.userName.toLowerCase() === username.toLowerCase());
      return {
        token: `mock.${btoa(username)}.${Date.now()}`,
        refreshToken: `refresh.${btoa(username)}`,
        expiresIn: 3600,
        userId: user?.id ?? 1,
        userName: user?.userName ?? username,
        displayName: user?.userName ?? username,
        roles: [user?.id === 1 ? 'Administrator' : 'Operator'],
      };
    }
    case 'Authentication/guest-token':
      return {
        token: `mock.guest.${Date.now()}`, refreshToken: 'refresh.guest', expiresIn: 1800,
        userId: 0, userName: 'guest', displayName: 'Guest', roles: ['Viewer'],
      };
    case 'Authentication/refresh-token':
      return { token: `mock.refreshed.${Date.now()}`, refreshToken: 'refresh.rotated' };
    case 'Authentication/logout':
      return { success: true };
    case 'Authentication/forgot-password':
      return { message: `A reset link was sent for ${query.get('userName') ?? 'the account'}.` };
    case 'Authentication/reset-password':
      return { message: 'Password reset.' };

    case 'Menu/GenerateTreeData':
      return menuTree();

    case 'Stock/Search':
      return computeStock(body as SearchFilter);
    case 'Stock/Ledger':
      return stockLedger(body as SearchFilter);

    case 'CashBook/Balance':
      return cashBalance(body as SearchFilter);
    case 'CashBook/Ledger':
      return cashLedger(body as SearchFilter);

    case 'PartyLedger/CustomerBalance':
      return customerBalances(body as SearchFilter);
    case 'PartyLedger/SupplierBalance':
      return supplierBalances(body as SearchFilter);
    case 'PartyLedger/CustomerLedger':
      return customerLedger(body as SearchFilter);
    case 'PartyLedger/SupplierLedger':
      return supplierLedger(body as SearchFilter);

    case 'Report/DailySales':
      return dailySales(body as SearchFilter);
    case 'Report/GrossProfit':
      return grossProfit(body as SearchFilter);
    case 'Report/TopItems':
      return topItems(body as SearchFilter);
    case 'Report/EmployeeSales':
      return staffSales(body as SearchFilter, 'employee');
    case 'Report/ReferredSales':
      return staffSales(body as SearchFilter, 'referred');

    case 'ContactMail/':
      return { message: 'Message queued.' };
    case 'T/':
      return { status: 'ok' };
    default:
      break;
  }

  if (resource === 'Receipt' && segments[0] === 'Outstanding') return outstandingSales(Number(segments[1]));
  if (resource === 'Payment' && segments[0] === 'Outstanding') return outstandingPurchases(Number(segments[1]));

  // PUT /SalesEntry/{id}/CourierCondition
  if (resource === 'SalesEntry' && segments.length === 2 && segments[1] === 'CourierCondition') {
    const entry = d.salesEntries.find((s) => s.id === Number(segments[0]));
    if (!entry) throw new Error('not-found');
    entry.courierCondition = Number(body['courierCondition'] ?? entry.courierCondition);
    return entry;
  }

  if (resource === 'Employee' && segments.length === 2 && segments[1] === 'Documents') {
    const employee = d.employees.find((e) => e.id === Number(segments[0]));
    if (!employee) throw new Error('not-found');
    employee.documents.push({
      id: employee.documents.length + 1,
      documentType: String(body['documentTypes'] ?? 'Document'),
      documentTitle: String(body['documentTitles'] ?? 'Untitled'),
      fileName: String(body['files'] ?? 'upload.pdf'),
    });
    return employee;
  }

  if (resource === 'ImageGallery' && req.method === 'GET' && !segments.length) return d.gallery;

  const handled = handleCrud(resource, segments, req);
  if (handled !== undefined) return handled;

  throw new Error('not-found');
}

/**
 * In-memory implementation of the POS API. Active only while
 * `environment.useMockBackend` is true; otherwise every request passes straight
 * through to the real server.
 */
export const mockBackendInterceptor: HttpInterceptorFn = (
  req,
  next,
): Observable<HttpEvent<unknown>> => {
  if (!environment.useMockBackend) return next(req);

  try {
    const data = route(req);
    return of(
      new HttpResponse({ status: 200, body: { data, success: true, message: 'OK' } }),
    ).pipe(delay(environment.mockLatency));
  } catch (error) {
    const reason = (error as Error).message;
    const status = reason === 'not-found' ? 404 : reason === 'bad-credentials' ? 401 : 400;
    return throwError(
      () =>
        new HttpErrorResponse({
          status,
          url: req.url,
          error: {
            message:
              status === 404
                ? 'Not found.'
                : status === 401
                  ? 'Username and password are required.'
                  : 'That request is not supported by the demo backend.',
          },
        }),
    ).pipe(delay(environment.mockLatency));
  }
};

/** Lets the UI reset the demo book (used by the settings screen). */
export function resetMockDatabase(): void {
  db = createDb();
}

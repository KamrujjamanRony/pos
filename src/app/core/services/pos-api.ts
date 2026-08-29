import { Service, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Api, CrudEndpoint } from './api';
import type {
  AppUser,
  CashAccount,
  CashBookRow,
  CashLedgerRow,
  Customer,
  CustomerOpening,
  DailySalesRow,
  Employee,
  FundTransfer,
  GalleryImage,
  GrossProfitRow,
  Id,
  Item,
  ItemOpening,
  MenuItem,
  MenuPermissionNode,
  NamedEntity,
  OutstandingInvoice,
  PartyBalanceRow,
  PartyLedgerRow,
  PaymentVoucher,
  PurchaseEntry,
  PurchaseReturn,
  Receipt,
  SalesEntry,
  SalesReturn,
  SearchFilter,
  StaffSalesRow,
  StockLedgerRow,
  StockRow,
  StockTransfer,
  Supplier,
} from '../models';

/**
 * One typed facade over every endpoint in the collection. CRUD resources are
 * `CrudEndpoint` instances; the read-only, computed endpoints (stock, cash book,
 * ledgers, reports) are explicit methods.
 */
@Service()
export class PosApi {
  private readonly api = inject(Api);

  /* Setup & masters ------------------------------------------------ */
  readonly branches = new CrudEndpoint<NamedEntity>(this.api, 'Branch');
  readonly couriers = new CrudEndpoint<NamedEntity>(this.api, 'CourierName');
  readonly departments = new CrudEndpoint<NamedEntity>(this.api, 'Department');
  readonly categories = new CrudEndpoint<NamedEntity>(this.api, 'Category');
  readonly units = new CrudEndpoint<NamedEntity>(this.api, 'Unit');
  readonly origins = new CrudEndpoint<NamedEntity>(this.api, 'Origin');
  readonly brands = new CrudEndpoint<NamedEntity>(this.api, 'Brand');
  readonly areas = new CrudEndpoint<NamedEntity>(this.api, 'Area');
  readonly referrals = new CrudEndpoint<NamedEntity>(this.api, 'Referred');

  /* Catalogue ------------------------------------------------------ */
  readonly items = new CrudEndpoint<Item>(this.api, 'ItemRegistration');
  readonly itemOpenings = new CrudEndpoint<ItemOpening>(this.api, 'ItemOpening');

  /* Parties -------------------------------------------------------- */
  readonly customers = new CrudEndpoint<Customer>(this.api, 'CustomerRegistration');
  readonly customerOpenings = new CrudEndpoint<CustomerOpening>(this.api, 'CustomerOpening');
  readonly suppliers = new CrudEndpoint<Supplier>(this.api, 'SupplierRegistration');

  /* Cash & bank ---------------------------------------------------- */
  readonly cashAccounts = new CrudEndpoint<CashAccount>(this.api, 'CashInHand');
  readonly bankAccounts = new CrudEndpoint<CashAccount>(this.api, 'CashAtBank');
  readonly fundTransfers = new CrudEndpoint<FundTransfer>(this.api, 'FundTransfer');

  /* Documents ------------------------------------------------------ */
  readonly sales = new CrudEndpoint<SalesEntry, SearchFilter>(this.api, 'SalesEntry');
  readonly salesReturns = new CrudEndpoint<SalesReturn, SearchFilter>(this.api, 'SalesReturn');
  readonly purchases = new CrudEndpoint<PurchaseEntry, SearchFilter>(this.api, 'PurchaseEntry');
  readonly purchaseReturns = new CrudEndpoint<PurchaseReturn, SearchFilter>(this.api, 'PurchaseReturn');
  readonly stockTransfers = new CrudEndpoint<StockTransfer, SearchFilter>(this.api, 'StockTransfer');
  readonly receipts = new CrudEndpoint<Receipt, SearchFilter>(this.api, 'Receipt');
  readonly payments = new CrudEndpoint<PaymentVoucher, SearchFilter>(this.api, 'Payment');

  /* People & media ------------------------------------------------- */
  readonly employees = new CrudEndpoint<Employee>(this.api, 'Employee');
  readonly gallery = new CrudEndpoint<GalleryImage>(this.api, 'ImageGallery');
  readonly menus = new CrudEndpoint<MenuItem>(this.api, 'Menu');
  readonly users = new CrudEndpoint<AppUser>(this.api, 'User');

  /* ---------------------------------------------------------------- *
   * Read-only, computed endpoints
   * ---------------------------------------------------------------- */
  stock(filter: SearchFilter = {}): Observable<StockRow[]> {
    return this.api.post<StockRow[]>('Stock/Search', filter);
  }

  stockLedger(filter: SearchFilter = {}): Observable<StockLedgerRow[]> {
    return this.api.post<StockLedgerRow[]>('Stock/Ledger', filter);
  }

  cashBalance(filter: SearchFilter = {}): Observable<CashBookRow[]> {
    return this.api.post<CashBookRow[]>('CashBook/Balance', filter);
  }

  cashLedger(filter: SearchFilter = {}): Observable<CashLedgerRow[]> {
    return this.api.post<CashLedgerRow[]>('CashBook/Ledger', filter);
  }

  customerBalances(filter: SearchFilter = {}): Observable<PartyBalanceRow[]> {
    return this.api.post<PartyBalanceRow[]>('PartyLedger/CustomerBalance', filter);
  }

  supplierBalances(filter: SearchFilter = {}): Observable<PartyBalanceRow[]> {
    return this.api.post<PartyBalanceRow[]>('PartyLedger/SupplierBalance', filter);
  }

  customerLedger(filter: SearchFilter): Observable<PartyLedgerRow[]> {
    return this.api.post<PartyLedgerRow[]>('PartyLedger/CustomerLedger', filter);
  }

  supplierLedger(filter: SearchFilter): Observable<PartyLedgerRow[]> {
    return this.api.post<PartyLedgerRow[]>('PartyLedger/SupplierLedger', filter);
  }

  outstandingSales(customerId: Id): Observable<OutstandingInvoice[]> {
    return this.api.get<OutstandingInvoice[]>(`Receipt/Outstanding/${customerId}`);
  }

  outstandingPurchases(supplierId: Id): Observable<OutstandingInvoice[]> {
    return this.api.get<OutstandingInvoice[]>(`Payment/Outstanding/${supplierId}`);
  }

  dailySales(filter: SearchFilter): Observable<DailySalesRow[]> {
    return this.api.post<DailySalesRow[]>('Report/DailySales', filter);
  }

  grossProfit(filter: SearchFilter): Observable<GrossProfitRow[]> {
    return this.api.post<GrossProfitRow[]>('Report/GrossProfit', filter);
  }

  topItems(filter: SearchFilter): Observable<import('../models').TopItemRow[]> {
    return this.api.post<import('../models').TopItemRow[]>('Report/TopItems', filter);
  }

  employeeSales(filter: SearchFilter): Observable<StaffSalesRow[]> {
    return this.api.post<StaffSalesRow[]>('Report/EmployeeSales', filter);
  }

  referredSales(filter: SearchFilter): Observable<StaffSalesRow[]> {
    return this.api.post<StaffSalesRow[]>('Report/ReferredSales', filter);
  }

  menuTree(userId: Id): Observable<MenuPermissionNode[]> {
    return this.api.get<MenuPermissionNode[]>('Menu/GenerateTreeData', { userId });
  }

  /** `PUT /SalesEntry/{id}/CourierCondition` — the courier board's only write. */
  updateCourierCondition(salesEntryId: Id, courierCondition: number): Observable<SalesEntry> {
    return this.api.put<SalesEntry>(`SalesEntry/${salesEntryId}/CourierCondition`, {
      courierCondition,
    });
  }

  contactMail(payload: { name: string; email: string; subject: string; message: string }) {
    return this.api.post('ContactMail', payload);
  }
}

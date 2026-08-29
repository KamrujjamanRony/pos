/**
 * Domain model for the POS API.
 *
 * Every shape here mirrors a request or response body documented in the
 * `POS API` Postman collection. Ids are `number` because the collection seeds
 * them as integers, while document numbers (invoice / receipt / transfer) are
 * server-generated strings such as `BLI26080001`.
 */

/** The API wraps most payloads; a few endpoints return the bare object. */
export interface ApiEnvelope<T> {
  data?: T;
  success?: boolean;
  message?: string;
}

export type Id = number;

export interface Audited {
  postBy?: string | null;
  postDate?: string | null;
  editBy?: string | null;
  editDate?: string | null;
}

/* ------------------------------------------------------------------ *
 * Authentication
 * ------------------------------------------------------------------ */
export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthTokens {
  token: string;
  refreshToken: string;
  expiresIn?: number;
  userId?: Id;
  userName?: string;
  displayName?: string;
  roles?: string[];
}

export interface SessionUser {
  id: Id;
  userName: string;
  displayName: string;
  role: string;
  branchId?: Id;
  avatarHue?: number;
}

/* ------------------------------------------------------------------ *
 * Menu & users
 * ------------------------------------------------------------------ */
export type PermissionKey = 'view' | 'create' | 'edit' | 'delete';

export interface MenuItem extends Audited {
  id: Id;
  menuName: string;
  parentId: Id | null;
  url: string;
  icon: string;
  serialNo: number;
  permissionsKey: PermissionKey[];
}

export interface MenuPermissionNode {
  menuId: Id;
  menuName?: string;
  isSelected: boolean;
  permissions: PermissionKey[];
  children: MenuPermissionNode[];
}

export interface AppUser extends Audited {
  id: Id;
  userName: string;
  password?: string;
  isActive: boolean;
  menuPermissions: MenuPermissionNode[];
}

/* ------------------------------------------------------------------ *
 * Simple "name only" masters. One shape covers nine endpoints:
 * Branch, CourierName, Department, Category, Unit, Origin, Brand,
 * Area and Referred.
 * ------------------------------------------------------------------ */
export interface NamedEntity extends Audited {
  id: Id;
  name: string;
}

/* ------------------------------------------------------------------ *
 * Items & stock
 * ------------------------------------------------------------------ */
export interface Item extends Audited {
  id: Id;
  code: string;
  name: string;
  model: string;
  categoryId: Id | null;
  unitId: Id | null;
  brandId: Id | null;
  originId: Id | null;
  purchasePrice: number;
  salesPrice: number;
  reorderQuantity: number;
  description: string;
  /** Denormalised for grids; the API returns these on Search. */
  categoryName?: string;
  unitName?: string;
  brandName?: string;
  originName?: string;
  stock?: number;
}

export interface ItemOpening extends Audited {
  id: Id;
  itemId: Id | null;
  branchId: Id | null;
  openingDate: string;
  quantity: number;
  rate: number;
  remarks: string;
  itemName?: string;
  branchName?: string;
}

export interface StockRow {
  itemId: Id;
  itemCode: string;
  itemName: string;
  branchId: Id;
  branchName: string;
  categoryName: string;
  opening: number;
  purchase: number;
  purchaseReturn: number;
  sales: number;
  salesReturn: number;
  transferIn: number;
  transferOut: number;
  balance: number;
  rate: number;
  value: number;
  reorderQuantity: number;
}

export interface StockLedgerRow {
  date: string;
  documentNo: string;
  documentType: string;
  itemId: Id;
  itemName: string;
  branchName: string;
  inQty: number;
  outQty: number;
  balance: number;
  remarks: string;
}

export interface StockTransferDetail {
  itemId: Id | null;
  quantity: number;
  remarks?: string;
  itemName?: string;
}

export interface StockTransfer extends Audited {
  id: Id;
  transferNo: string;
  transferDate: string;
  fromBranchId: Id | null;
  toBranchId: Id | null;
  details: StockTransferDetail[];
  remarks: string;
  fromBranchName?: string;
  toBranchName?: string;
  totalQuantity?: number;
}

/* ------------------------------------------------------------------ *
 * Parties
 * ------------------------------------------------------------------ */
export type OpeningType = 'Dr' | 'Cr';

export interface Customer extends Audited {
  id: Id;
  customerName: string;
  contactNumber: string;
  address: string;
  contactPerson: string;
  contactPersonMobileNo: string;
  areaId: Id | null;
  referredId: Id | null;
  areaName?: string;
  referredName?: string;
  balance?: number;
}

export interface CustomerOpening extends Audited {
  id: Id;
  customerId: Id | null;
  openingDate: string;
  openingType: OpeningType;
  amount: number;
  remarks: string;
  customerName?: string;
}

export interface Supplier extends Audited {
  id: Id;
  supplierName: string;
  mobileNumber: string;
  address: string;
  openingBalance: number;
  openingType: OpeningType;
  openingDate: string;
  balance?: number;
}

export interface PartyBalanceRow {
  partyId: Id;
  partyName: string;
  contact: string;
  opening: number;
  debit: number;
  credit: number;
  balance: number;
}

export interface PartyLedgerRow {
  date: string;
  documentNo: string;
  particulars: string;
  debit: number;
  credit: number;
  balance: number;
}

/* ------------------------------------------------------------------ *
 * Cash & bank
 * ------------------------------------------------------------------ */
export type PaymentMode = 'Cash' | 'Bank';

export interface CashAccount extends Audited {
  id: Id;
  name: string;
  openingBalance: number;
  openingDate: string;
  balance?: number;
}

export interface CashBookRow {
  mode: PaymentMode;
  accountId: Id;
  accountName: string;
  opening: number;
  inflow: number;
  outflow: number;
  balance: number;
}

export interface CashLedgerRow {
  date: string;
  documentNo: string;
  particulars: string;
  mode: PaymentMode;
  accountName: string;
  transactionType: 'In' | 'Out';
  amount: number;
  balance: number;
}

export interface FundTransfer extends Audited {
  id: Id;
  transferNo: string;
  transferDate: string;
  fromMode: PaymentMode;
  fromAccountId: Id | null;
  toMode: PaymentMode;
  toAccountId: Id | null;
  amount: number;
  referenceNo: string;
  remarks: string;
  fromAccountName?: string;
  toAccountName?: string;
}

/* ------------------------------------------------------------------ *
 * Purchase
 * ------------------------------------------------------------------ */
export interface PurchaseDetail {
  itemId: Id | null;
  purchasePrice: number;
  salesPrice: number;
  quantity: number;
  itemName?: string;
  itemCode?: string;
}

export interface PurchaseEntry extends Audited {
  id: Id;
  invoiceNo: string;
  receiptNo: string;
  receiptDate: string;
  branchId: Id | null;
  supplierId: Id | null;
  details: PurchaseDetail[];
  discount: number;
  cashPayment: number;
  paymentMode: PaymentMode;
  paymentAccountId: Id | null;
  remarks: string;
  supplierName?: string;
  branchName?: string;
  grossAmount?: number;
  netAmount?: number;
  dueAmount?: number;
}

export interface PurchaseReturn extends Audited {
  id: Id;
  returnNo: string;
  returnDate: string;
  branchId: Id | null;
  supplierId: Id | null;
  purchaseEntryId: Id | null;
  details: PurchaseDetail[];
  discount: number;
  cashReceive: number;
  paymentMode: PaymentMode;
  paymentAccountId: Id | null;
  remarks: string;
  supplierName?: string;
  netAmount?: number;
}

/* ------------------------------------------------------------------ *
 * Sales
 * ------------------------------------------------------------------ */
export type DiscountType = 'Percent' | 'Flat';

/** Courier lifecycle, as stored by `courierCondition` on a sales entry. */
export const COURIER_CONDITIONS = [
  { value: 1, label: 'Booked', tone: 'info' },
  { value: 2, label: 'In transit', tone: 'warn' },
  { value: 3, label: 'Delivered', tone: 'pos' },
  { value: 4, label: 'Returned', tone: 'neg' },
] as const;

export interface SalesDetail {
  itemId: Id | null;
  salesPrice: number;
  quantity: number;
  serialNo: string;
  itemName?: string;
  itemCode?: string;
  purchasePrice?: number;
}

export interface SalesEntry extends Audited {
  id: Id;
  invoiceNo: string;
  invoiceDate: string;
  branchId: Id | null;
  customerId: Id | null;
  byReferredId: Id | null;
  byEmployeeId: Id | null;
  courierNameId: Id | null;
  courierCost: number;
  courierCondition: number;
  details: SalesDetail[];
  discount: number;
  discountType: DiscountType;
  receiveAmount: number;
  paymentMode: PaymentMode;
  paymentAccountId: Id | null;
  remarks: string;
  customerName?: string;
  branchName?: string;
  employeeName?: string;
  referredName?: string;
  courierName?: string;
  grossAmount?: number;
  netAmount?: number;
  dueAmount?: number;
}

export interface SalesReturn extends Audited {
  id: Id;
  returnNo: string;
  returnDate: string;
  branchId: Id | null;
  customerId: Id | null;
  salesEntryId: Id | null;
  details: SalesDetail[];
  discount: number;
  refundAmount: number;
  paymentMode: PaymentMode;
  paymentAccountId: Id | null;
  remarks: string;
  customerName?: string;
  netAmount?: number;
}

/* ------------------------------------------------------------------ *
 * Receivable & payable
 * ------------------------------------------------------------------ */
export interface OutstandingInvoice {
  documentId: Id;
  documentNo: string;
  documentDate: string;
  netAmount: number;
  paidAmount: number;
  dueAmount: number;
}

export interface ReceiptDetail {
  salesEntryId: Id | null;
  amount: number;
  invoiceNo?: string;
}

export interface Receipt extends Audited {
  id: Id;
  receiptNo: string;
  receiptDate: string;
  customerId: Id | null;
  amount: number;
  paymentMode: PaymentMode;
  paymentAccountId: Id | null;
  details: ReceiptDetail[];
  referenceNo: string;
  remarks: string;
  customerName?: string;
}

export interface PaymentDetail {
  purchaseEntryId: Id | null;
  amount: number;
  invoiceNo?: string;
}

export interface PaymentVoucher extends Audited {
  id: Id;
  paymentNo: string;
  paymentDate: string;
  supplierId: Id | null;
  amount: number;
  paymentMode: PaymentMode;
  paymentAccountId: Id | null;
  details: PaymentDetail[];
  referenceNo: string;
  remarks: string;
  supplierName?: string;
}

/* ------------------------------------------------------------------ *
 * Employees & gallery
 * ------------------------------------------------------------------ */
export interface EmployeeDocument {
  id: Id;
  documentType: string;
  documentTitle: string;
  fileName: string;
}

export interface Employee extends Audited {
  id: Id;
  employeeCode: string;
  employeeName: string;
  fatherName: string;
  dateOfBirth: string;
  gender: string;
  bloodGroup: string;
  mobileNumber: string;
  email: string;
  nidNumber: string;
  presentAddress: string;
  branchId: Id | null;
  departmentId: Id | null;
  joiningDate: string;
  salary: number;
  isActive: boolean;
  photoUrl?: string;
  documents: EmployeeDocument[];
  branchName?: string;
  departmentName?: string;
}

export interface GalleryImage extends Audited {
  id: Id;
  type: string;
  description: string;
  imageUrl: string;
  fileName?: string;
}

/* ------------------------------------------------------------------ *
 * Reports
 * ------------------------------------------------------------------ */
export interface DailySalesRow {
  date: string;
  invoiceCount: number;
  grossAmount: number;
  discount: number;
  netAmount: number;
  received: number;
  due: number;
}

export interface GrossProfitRow {
  date: string;
  salesAmount: number;
  costAmount: number;
  profit: number;
  marginPercent: number;
}

export interface TopItemRow {
  itemId: Id;
  itemName: string;
  itemCode: string;
  quantity: number;
  amount: number;
}

export interface StaffSalesRow {
  id: Id;
  name: string;
  invoiceCount: number;
  amount: number;
}

/* ------------------------------------------------------------------ *
 * Query filters shared by the `Search` endpoints
 * ------------------------------------------------------------------ */
export interface SearchFilter {
  search?: string;
  fromDate?: string;
  toDate?: string;
  branchId?: Id | null;
  customerId?: Id | null;
  supplierId?: Id | null;
  itemId?: Id | null;
  accountId?: Id | null;
  mode?: PaymentMode | null;
  transactionType?: 'In' | 'Out' | null;
  asOnDate?: string;
  hasDue?: boolean;
  partyId?: Id | null;
  top?: number;
  rankBy?: 'Value' | 'Quantity';
}

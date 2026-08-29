/**
 * Seed data for the in-memory backend.
 *
 * It reproduces the entities and document-numbering scheme documented in the
 * Postman collection (`BLI26080001`, `PI26080001`, `RC26090001`, ...) so the UI
 * can be driven end-to-end before the real API is reachable. Generation is
 * deterministic: the same seed always produces the same books.
 */
import { addDays, isoDate, round2, today } from '../util/format';
import type {
  AppUser,
  CashAccount,
  Customer,
  CustomerOpening,
  Employee,
  FundTransfer,
  GalleryImage,
  Item,
  ItemOpening,
  MenuItem,
  NamedEntity,
  PaymentMode,
  PaymentVoucher,
  PurchaseEntry,
  PurchaseReturn,
  Receipt,
  SalesEntry,
  SalesReturn,
  StockTransfer,
  Supplier,
} from '../models';

/* ---------------------------------------------------------------- *
 * Deterministic pseudo-randomness
 * ---------------------------------------------------------------- */
let seed = 0x2f6e2b1;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];
const between = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const chance = (probability: number) => rand() < probability;

const named = (names: readonly string[]): NamedEntity[] =>
  names.map((name, index) => ({ id: index + 1, name, postBy: 'Aman' }));

/** `BLI` + 2-digit year + 2-digit month + 4-digit sequence. */
export function docNo(prefix: string, dateIso: string, sequence: number): string {
  const [year, month] = dateIso.split('-');
  return `${prefix}${year.slice(2)}${month}${String(sequence).padStart(4, '0')}`;
}

export interface MockDb {
  branches: NamedEntity[];
  departments: NamedEntity[];
  couriers: NamedEntity[];
  categories: NamedEntity[];
  units: NamedEntity[];
  origins: NamedEntity[];
  brands: NamedEntity[];
  areas: NamedEntity[];
  referreds: NamedEntity[];
  items: Item[];
  itemOpenings: ItemOpening[];
  customers: Customer[];
  customerOpenings: CustomerOpening[];
  suppliers: Supplier[];
  cashAccounts: CashAccount[];
  bankAccounts: CashAccount[];
  employees: Employee[];
  menus: MenuItem[];
  users: AppUser[];
  gallery: GalleryImage[];
  salesEntries: SalesEntry[];
  salesReturns: SalesReturn[];
  purchaseEntries: PurchaseEntry[];
  purchaseReturns: PurchaseReturn[];
  receipts: Receipt[];
  payments: PaymentVoucher[];
  stockTransfers: StockTransfer[];
  fundTransfers: FundTransfer[];
}

const CATALOGUE: Array<[string, string, string, number, number]> = [
  // [name, model, category, purchase, sales]
  ['Galaxy A15', 'SM-A155F', 'Mobile', 18000, 21000],
  ['Galaxy S24', 'SM-S921B', 'Mobile', 92000, 104500],
  ['Redmi Note 13', 'RN13-8/256', 'Mobile', 21500, 25500],
  ['iPhone 15', 'A3090', 'Mobile', 128000, 142000],
  ['Pixel 8a', 'GX7AS', 'Mobile', 61000, 69500],
  ['Realme C67', 'RMX3890', 'Mobile', 16200, 19400],
  ['Infinix Note 40', 'X6853', 'Mobile', 23400, 27900],
  ['Vivo Y28', 'V2354', 'Mobile', 19800, 23600],
  ['MacBook Air M3', 'MRXV3', 'Laptop', 148000, 165000],
  ['ThinkPad E14', '21JK', 'Laptop', 92000, 104000],
  ['IdeaPad Slim 3', '82XQ', 'Laptop', 58000, 66500],
  ['Inspiron 15', '3520', 'Laptop', 62000, 71000],
  ['Vivobook Go 15', 'E1504F', 'Laptop', 54000, 62500],
  ['iPad 10th Gen', 'MPQ13', 'Tablet', 46000, 53500],
  ['Galaxy Tab A9+', 'SM-X216', 'Tablet', 27500, 32500],
  ['Redmi Pad SE', '23073RPBFG', 'Tablet', 19500, 23800],
  ['AirPods Pro 2', 'MTJV3', 'Audio', 24500, 28900],
  ['Galaxy Buds FE', 'SM-R400', 'Audio', 7900, 9700],
  ['Sony WH-1000XM5', 'WH1000XM5', 'Audio', 32000, 37500],
  ['JBL Flip 6', 'JBLFLIP6', 'Audio', 12400, 14900],
  ['Anker Soundcore', 'A3102', 'Audio', 3400, 4500],
  ['Apple Watch SE', 'MRE03', 'Wearables', 27000, 31500],
  ['Galaxy Watch 6', 'SM-R930', 'Wearables', 24000, 28500],
  ['Amazfit GTS 4', 'A2168', 'Wearables', 14500, 17500],
  ['Mi Band 8', 'M2239B1', 'Wearables', 3900, 5200],
  ['65W GaN Charger', 'GAN65', 'Accessories', 1850, 2600],
  ['USB-C Cable 1.5m', 'CBL-C15', 'Accessories', 240, 450],
  ['Power Bank 20000', 'PB20K', 'Accessories', 2400, 3400],
  ['Tempered Glass', 'TG-UNI', 'Accessories', 90, 250],
  ['Wireless Mouse', 'WM-210', 'Accessories', 620, 1050],
  ['Mechanical Keyboard', 'MK-87', 'Accessories', 3200, 4400],
  ['Laptop Backpack', 'BP-15', 'Accessories', 1350, 2100],
  ['Type-C Hub 7in1', 'HUB-7C', 'Accessories', 1900, 2850],
  ['Memory Card 128GB', 'SDX128', 'Accessories', 1050, 1550],
  ['Bluetooth Speaker', 'BTS-30', 'Audio', 2600, 3600],
  ['Phone Stand Alloy', 'PS-AL1', 'Accessories', 320, 620],
];

const CUSTOMER_NAMES = [
  'Rahim Traders', 'Mawna Mobile Point', 'Sadia Electronics', 'Bismillah Store',
  'Nabila Enterprise', 'Hasan Telecom', 'City Gadget House', 'Karim & Sons',
  'Priyo Bazar', 'Sonali Mobile', 'Tanvir Computers', 'Green Valley Shop',
  'Rupali Traders', 'Meghna Digital', 'Alif Electronics', 'Padma Mobile Hub',
  'Shahjalal Store', 'Nadia Gadgets', 'Orion Retail', 'Bay Leaf Traders',
  'Rafi Enterprise', 'Sun Rise Mobile', 'Delta Tech Corner', 'Noor Communication',
  'Ashulia Gadget Zone',
];

const SUPPLIER_NAMES = [
  'Rahim Enterprise', 'Smart Technologies Ltd', 'Global Distribution BD', 'TechnoMart Import',
  'Excel Trading House', 'Unique Electronics', 'Prime Source BD', 'Dhaka Digital Supply',
  'Anchor Distribution', 'Silk Route Traders',
];

const EMPLOYEE_NAMES = [
  'Kamrul Hasan', 'Nusrat Jahan', 'Mahfuz Alam', 'Sabbir Ahmed', 'Farhana Akter',
  'Rakibul Islam', 'Tahmina Sultana', 'Jubayer Rahman', 'Sumaiya Haque', 'Imran Kabir',
  'Lamia Chowdhury', 'Arif Mahmud',
];

const AREA_NAMES = ['Gazipur', 'Uttara', 'Mirpur', 'Dhanmondi', 'Banani', 'Mawna', 'Tongi', 'Savar'];

function makeItems(categories: NamedEntity[], brands: NamedEntity[], origins: NamedEntity[]): Item[] {
  return CATALOGUE.map(([name, model, category, purchase, sales], index) => {
    const cat = categories.find((c) => c.name === category)!;
    const brand = pick(brands);
    const origin = pick(origins);
    return {
      id: index + 1,
      code: `ITM-${String(index + 1).padStart(3, '0')}`,
      name,
      model,
      categoryId: cat.id,
      unitId: 1,
      brandId: brand.id,
      originId: origin.id,
      purchasePrice: purchase,
      salesPrice: sales,
      reorderQuantity: between(3, 12),
      description: `${category} · ${model}`,
      categoryName: cat.name,
      unitName: 'Pcs',
      brandName: brand.name,
      originName: origin.name,
      postBy: 'Aman',
    } satisfies Item;
  });
}

export function createDb(): MockDb {
  seed = 0x2f6e2b1;

  const branches = named(['Main Outlet', 'Uttara Branch', 'Chattogram Depot']);
  const departments = named(['Sales', 'Accounts', 'Inventory', 'Support', 'Logistics']);
  const couriers = named(['Sundarban Courier', 'SA Paribahan', 'Pathao Courier', 'RedX', 'Steadfast']);
  const categories = named(['Mobile', 'Laptop', 'Tablet', 'Audio', 'Wearables', 'Accessories']);
  const units = named(['Pcs', 'Box', 'Set', 'Pair']);
  const origins = named(['China', 'Vietnam', 'India', 'South Korea', 'Bangladesh']);
  const brands = named(['Samsung', 'Apple', 'Xiaomi', 'Lenovo', 'Anker', 'Sony', 'Realme', 'Asus']);
  const areas = named(AREA_NAMES);
  const referreds = named(['Walk-in', 'Facebook Page', 'Existing Customer', 'Marketplace', 'Employee Referral']);

  const items = makeItems(categories, brands, origins);
  const start = addDays(today(), -89);

  const customers: Customer[] = CUSTOMER_NAMES.map((customerName, index) => ({
    id: index + 1,
    customerName,
    contactNumber: `017${between(10, 99)}-${between(100000, 999999)}`,
    address: `${between(1, 120)} ${pick(AREA_NAMES)} Road, Dhaka`,
    contactPerson: customerName.split(' ')[0],
    contactPersonMobileNo: `018${between(10, 99)}-${between(100000, 999999)}`,
    areaId: between(1, areas.length),
    referredId: between(1, referreds.length),
    areaName: areas[between(0, areas.length - 1)].name,
    referredName: referreds[between(0, referreds.length - 1)].name,
    postBy: 'Aman',
  }));

  const customerOpenings: CustomerOpening[] = customers
    .filter(() => chance(0.35))
    .map((customer, index) => ({
      id: index + 1,
      customerId: customer.id,
      openingDate: start,
      openingType: 'Dr',
      amount: between(3, 40) * 1000,
      remarks: 'Carried over from the previous book',
      customerName: customer.customerName,
      postBy: 'Aman',
    }));

  const suppliers: Supplier[] = SUPPLIER_NAMES.map((supplierName, index) => ({
    id: index + 1,
    supplierName,
    mobileNumber: `019${between(10, 99)}-${between(100000, 999999)}`,
    address: `${between(1, 60)} Import Avenue, Dhaka`,
    openingBalance: between(20, 180) * 1000,
    openingType: 'Cr',
    openingDate: start,
    postBy: 'Aman',
  }));

  const cashAccounts: CashAccount[] = [
    { id: 1, name: 'Main Cash', openingBalance: 250000, openingDate: start },
    { id: 2, name: 'Counter Float', openingBalance: 40000, openingDate: start },
  ];
  const bankAccounts: CashAccount[] = [
    { id: 1, name: 'City Bank — Current', openingBalance: 1250000, openingDate: start },
    { id: 2, name: 'BRAC Bank — Savings', openingBalance: 480000, openingDate: start },
  ];

  const employees: Employee[] = EMPLOYEE_NAMES.map((employeeName, index) => ({
    id: index + 1,
    employeeCode: `EMP-${String(index + 1).padStart(3, '0')}`,
    employeeName,
    fatherName: `${pick(['Abdul', 'Md.', 'Nurul', 'Shamsul'])} ${employeeName.split(' ').pop()}`,
    dateOfBirth: `19${between(85, 99)}-${String(between(1, 12)).padStart(2, '0')}-${String(between(1, 28)).padStart(2, '0')}`,
    gender: index % 3 === 1 ? 'Female' : 'Male',
    bloodGroup: pick(['A+', 'B+', 'O+', 'AB+', 'O-']),
    mobileNumber: `017${between(10, 99)}-${between(100000, 999999)}`,
    email: `${employeeName.split(' ')[0].toLowerCase()}@aurorapos.example`,
    nidNumber: String(between(1000000000, 1999999999)),
    presentAddress: `${pick(AREA_NAMES)}, Dhaka`,
    branchId: between(1, branches.length),
    departmentId: between(1, departments.length),
    joiningDate: addDays(start, -between(30, 900)),
    salary: between(18, 65) * 1000,
    isActive: chance(0.9),
    documents: [],
    postBy: 'Aman',
  }));

  const menus: MenuItem[] = [
    { id: 1, menuName: 'Dashboard', parentId: null, url: '/dashboard', icon: 'dashboard', serialNo: 1, permissionsKey: ['view'] },
    { id: 2, menuName: 'POS Terminal', parentId: null, url: '/pos', icon: 'cart', serialNo: 2, permissionsKey: ['view', 'create'] },
    { id: 3, menuName: 'Sales', parentId: null, url: '/sales', icon: 'receipt', serialNo: 3, permissionsKey: ['view', 'create', 'edit', 'delete'] },
    { id: 4, menuName: 'Sales Entry', parentId: 3, url: '/sales/invoices', icon: 'doc', serialNo: 1, permissionsKey: ['view', 'create', 'edit', 'delete'] },
    { id: 5, menuName: 'Sales Return', parentId: 3, url: '/sales/returns', icon: 'undo', serialNo: 2, permissionsKey: ['view', 'create', 'edit'] },
    { id: 6, menuName: 'Purchase', parentId: null, url: '/purchase', icon: 'truck', serialNo: 4, permissionsKey: ['view', 'create', 'edit', 'delete'] },
    { id: 7, menuName: 'Inventory', parentId: null, url: '/stock', icon: 'box', serialNo: 5, permissionsKey: ['view'] },
    { id: 8, menuName: 'Reports', parentId: null, url: '/reports', icon: 'chart', serialNo: 6, permissionsKey: ['view'] },
    { id: 9, menuName: 'Administration', parentId: null, url: '/admin', icon: 'shield', serialNo: 7, permissionsKey: ['view', 'create', 'edit', 'delete'] },
  ];

  const users: AppUser[] = [
    {
      id: 1,
      userName: 'Aman',
      isActive: true,
      postBy: 'system',
      menuPermissions: menus.map((menu) => ({
        menuId: menu.id,
        menuName: menu.menuName,
        isSelected: true,
        permissions: [...menu.permissionsKey],
        children: [],
      })),
    },
    ...['cashier01', 'storekeeper', 'accounts', 'auditor'].map((userName, index) => ({
      id: index + 2,
      userName,
      isActive: index !== 3,
      postBy: 'Aman',
      menuPermissions: menus.slice(0, 5).map((menu) => ({
        menuId: menu.id,
        menuName: menu.menuName,
        isSelected: index < 2,
        permissions: (index === 0 ? ['view', 'create'] : ['view']) as MenuItem['permissionsKey'],
        children: [],
      })),
    })),
  ];

  const gallery: GalleryImage[] = ['Banner', 'Promo', 'Storefront', 'Team', 'Product'].map(
    (type, index) => ({
      id: index + 1,
      type,
      description: `${type} artwork ${index + 1}`,
      imageUrl: '',
      postBy: 'Aman',
    }),
  );

  /* ---------------- Opening stock ---------------- */
  const itemOpenings: ItemOpening[] = [];
  let openingId = 1;
  for (const item of items) {
    for (const branch of branches) {
      if (branch.id > 1 && !chance(0.5)) continue;
      itemOpenings.push({
        id: openingId++,
        itemId: item.id,
        branchId: branch.id,
        openingDate: start,
        quantity: between(8, 60),
        rate: item.purchasePrice,
        remarks: 'Opening stock',
        itemName: item.name,
        branchName: branch.name,
        postBy: 'Aman',
      });
    }
  }

  /* ---------------- Documents over the last 90 days ---------------- */
  const salesEntries: SalesEntry[] = [];
  const purchaseEntries: PurchaseEntry[] = [];
  const salesReturns: SalesReturn[] = [];
  const purchaseReturns: PurchaseReturn[] = [];
  const receipts: Receipt[] = [];
  const payments: PaymentVoucher[] = [];
  const stockTransfers: StockTransfer[] = [];
  const fundTransfers: FundTransfer[] = [];

  const counters: Record<string, number> = {};
  const nextNo = (prefix: string, date: string) => {
    const key = `${prefix}${date.slice(0, 7)}`;
    counters[key] = (counters[key] ?? 0) + 1;
    return docNo(prefix, date, counters[key]);
  };

  let salesId = 1;
  let purchaseId = 1;
  let serialCounter = 1;

  for (let day = 0; day < 90; day++) {
    const date = addDays(start, day);
    const weekday = new Date(`${date}T00:00:00`).getDay();
    const busy = weekday !== 5; // Friday is the quiet day

    /* Purchases roughly twice a week. */
    if (chance(0.28)) {
      const supplier = pick(suppliers);
      const lines = Array.from({ length: between(1, 4) }, () => {
        const item = pick(items);
        return {
          itemId: item.id,
          purchasePrice: item.purchasePrice,
          salesPrice: item.salesPrice,
          quantity: between(4, 25),
          itemName: item.name,
          itemCode: item.code,
        };
      });
      const gross = round2(lines.reduce((t, l) => t + l.purchasePrice * l.quantity, 0));
      const discount = chance(0.3) ? round2(gross * 0.02) : 0;
      const net = round2(gross - discount);
      const paid = chance(0.55) ? net : round2(net * (between(20, 80) / 100));
      const mode: PaymentMode = chance(0.5) ? 'Cash' : 'Bank';
      purchaseEntries.push({
        id: purchaseId++,
        invoiceNo: nextNo('PI', date),
        receiptNo: `SUP-INV-${between(9000, 9999)}`,
        receiptDate: date,
        branchId: 1,
        supplierId: supplier.id,
        details: lines,
        discount,
        cashPayment: paid,
        paymentMode: mode,
        paymentAccountId: 1,
        remarks: 'Stock top-up',
        supplierName: supplier.supplierName,
        branchName: 'Main Outlet',
        grossAmount: gross,
        netAmount: net,
        dueAmount: round2(net - paid),
        postBy: 'Aman',
        postDate: `${date}T10:${String(between(10, 59)).padStart(2, '0')}:00`,
      });
    }

    /* Sales every day. */
    const invoices = busy ? between(2, 7) : between(0, 2);
    for (let n = 0; n < invoices; n++) {
      const customer = pick(customers);
      const employee = pick(employees);
      const branch = pick(branches);
      const lineCount = between(1, 3);
      const lines = Array.from({ length: lineCount }, () => {
        const item = pick(items);
        const quantity = between(1, 3);
        return {
          itemId: item.id,
          salesPrice: item.salesPrice,
          quantity,
          serialNo: `SN-${String(serialCounter++).padStart(5, '0')}`,
          itemName: item.name,
          itemCode: item.code,
          purchasePrice: item.purchasePrice,
        };
      });
      const gross = round2(lines.reduce((t, l) => t + l.salesPrice * l.quantity, 0));
      const usesPercent = chance(0.5);
      const discountInput = chance(0.45) ? (usesPercent ? between(2, 10) : between(1, 15) * 100) : 0;
      const discountValue = usesPercent ? round2((gross * discountInput) / 100) : discountInput;
      const courier = chance(0.35);
      const courierCost = courier ? between(60, 220) : 0;
      const net = round2(gross - discountValue + courierCost);
      const fullyPaid = chance(0.72);
      const received = fullyPaid ? net : round2(net * (between(20, 90) / 100));
      const mode: PaymentMode = chance(0.7) ? 'Cash' : 'Bank';

      salesEntries.push({
        id: salesId++,
        invoiceNo: nextNo('BLI', date),
        invoiceDate: date,
        branchId: branch.id,
        customerId: customer.id,
        byReferredId: customer.referredId,
        byEmployeeId: employee.id,
        courierNameId: courier ? pick(couriers).id : null,
        courierCost,
        courierCondition: courier ? between(1, 4) : 0,
        details: lines,
        discount: discountInput,
        discountType: usesPercent ? 'Percent' : 'Flat',
        receiveAmount: received,
        paymentMode: mode,
        paymentAccountId: 1,
        remarks: courier ? 'Courier delivery' : 'Counter sale',
        customerName: customer.customerName,
        branchName: branch.name,
        employeeName: employee.employeeName,
        referredName: customer.referredName,
        courierName: courier ? couriers[0].name : '',
        grossAmount: gross,
        netAmount: net,
        dueAmount: round2(net - received),
        postBy: 'Aman',
        postDate: `${date}T${String(between(9, 20)).padStart(2, '0')}:${String(between(0, 59)).padStart(2, '0')}:00`,
      });
    }

    if (chance(0.06)) {
      const source = salesEntries[between(0, Math.max(0, salesEntries.length - 1))];
      if (source) {
        const line = source.details[0];
        const net = round2(line.salesPrice * 1);
        salesReturns.push({
          id: salesReturns.length + 1,
          returnNo: nextNo('SR', date),
          returnDate: date,
          branchId: source.branchId,
          customerId: source.customerId,
          salesEntryId: source.id,
          details: [{ ...line, quantity: 1 }],
          discount: 0,
          refundAmount: net,
          paymentMode: 'Cash',
          paymentAccountId: 1,
          remarks: pick(['Customer changed mind', 'Wrong variant', 'Damaged on arrival']),
          customerName: source.customerName,
          netAmount: net,
          postBy: 'Aman',
        });
      }
    }

    if (chance(0.04) && purchaseEntries.length) {
      const source = purchaseEntries[between(0, purchaseEntries.length - 1)];
      const line = source.details[0];
      const net = round2(line.purchasePrice * 2);
      purchaseReturns.push({
        id: purchaseReturns.length + 1,
        returnNo: nextNo('PR', date),
        returnDate: date,
        branchId: source.branchId,
        supplierId: source.supplierId,
        purchaseEntryId: source.id,
        details: [{ ...line, quantity: 2 }],
        discount: 0,
        cashReceive: net,
        paymentMode: 'Cash',
        paymentAccountId: 1,
        remarks: 'Damaged units',
        supplierName: source.supplierName,
        netAmount: net,
        postBy: 'Aman',
      });
    }

    if (chance(0.12)) {
      const due = salesEntries.filter((s) => (s.dueAmount ?? 0) > 0);
      const target = due.length ? due[between(0, due.length - 1)] : null;
      if (target) {
        const amount = round2(Math.min(target.dueAmount ?? 0, between(2, 30) * 1000));
        receipts.push({
          id: receipts.length + 1,
          receiptNo: nextNo('RC', date),
          receiptDate: date,
          customerId: target.customerId,
          amount,
          paymentMode: chance(0.6) ? 'Cash' : 'Bank',
          paymentAccountId: 1,
          details: [{ salesEntryId: target.id, amount, invoiceNo: target.invoiceNo }],
          referenceNo: chance(0.4) ? `CHQ-${between(10000, 99999)}` : '',
          remarks: 'Part settlement',
          customerName: target.customerName,
          postBy: 'Aman',
        });
        target.dueAmount = round2((target.dueAmount ?? 0) - amount);
        target.receiveAmount = round2(target.receiveAmount + amount);
      }
    }

    if (chance(0.09)) {
      const due = purchaseEntries.filter((p) => (p.dueAmount ?? 0) > 0);
      const target = due.length ? due[between(0, due.length - 1)] : null;
      if (target) {
        const amount = round2(Math.min(target.dueAmount ?? 0, between(10, 90) * 1000));
        payments.push({
          id: payments.length + 1,
          paymentNo: nextNo('PY', date),
          paymentDate: date,
          supplierId: target.supplierId,
          amount,
          paymentMode: chance(0.5) ? 'Bank' : 'Cash',
          paymentAccountId: 1,
          details: [{ purchaseEntryId: target.id, amount, invoiceNo: target.invoiceNo }],
          referenceNo: `CHQ-${between(10000, 99999)}`,
          remarks: 'Supplier settlement',
          supplierName: target.supplierName,
          postBy: 'Aman',
        });
        target.dueAmount = round2((target.dueAmount ?? 0) - amount);
        target.cashPayment = round2(target.cashPayment + amount);
      }
    }

    if (chance(0.07)) {
      const item = pick(items);
      const quantity = between(2, 10);
      stockTransfers.push({
        id: stockTransfers.length + 1,
        transferNo: nextNo('ST', date),
        transferDate: date,
        fromBranchId: 1,
        toBranchId: between(2, branches.length),
        details: [{ itemId: item.id, quantity, remarks: 'Top-up', itemName: item.name }],
        remarks: 'Branch rebalancing',
        fromBranchName: branches[0].name,
        toBranchName: branches[1].name,
        totalQuantity: quantity,
        postBy: 'Aman',
      });
    }

    if (chance(0.08)) {
      const amount = between(20, 120) * 1000;
      fundTransfers.push({
        id: fundTransfers.length + 1,
        transferNo: nextNo('FT', date),
        transferDate: date,
        fromMode: 'Cash',
        fromAccountId: 1,
        toMode: 'Bank',
        toAccountId: 1,
        amount,
        referenceNo: `CHQ-${between(800000, 899999)}`,
        remarks: 'Day-end banking',
        fromAccountName: cashAccounts[0].name,
        toAccountName: bankAccounts[0].name,
        postBy: 'Aman',
      });
    }
  }

  return {
    branches,
    departments,
    couriers,
    categories,
    units,
    origins,
    brands,
    areas,
    referreds,
    items,
    itemOpenings,
    customers,
    customerOpenings,
    suppliers,
    cashAccounts,
    bankAccounts,
    employees,
    menus,
    users,
    gallery,
    salesEntries,
    salesReturns,
    purchaseEntries,
    purchaseReturns,
    receipts,
    payments,
    stockTransfers,
    fundTransfers,
  };
}

/** Highest id + 1 for an in-memory collection. */
export function nextId(rows: Array<{ id: number }>): number {
  return rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
}

/** Next document number for `prefix` given the documents already in the book. */
export function nextDocNo(prefix: string, existing: string[], date = today()): number {
  const stamp = `${prefix}${date.slice(2, 4)}${date.slice(5, 7)}`;
  const used = existing
    .filter((no) => no?.startsWith(stamp))
    .map((no) => Number(no.slice(stamp.length)) || 0);
  return Math.max(0, ...used) + 1;
}

export { isoDate };

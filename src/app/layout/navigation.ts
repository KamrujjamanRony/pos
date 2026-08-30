import type { IconName } from '../shared/ui/icon';

export interface NavLink {
  label: string;
  path: string;
  icon?: IconName;
  /** Shown as a small pill on the right of the row. */
  badge?: string;
}

export interface NavSection {
  label: string;
  icon: IconName;
  /** A section with a single destination links straight to it. */
  path?: string;
  links?: NavLink[];
}

/** The sidebar, grouped the way the API documentation groups its modules. */
export const NAVIGATION: NavSection[] = [
  { label: 'Dashboard', icon: 'dashboard', path: '/dashboard' },
  { label: 'POS Terminal', icon: 'zap', path: '/pos' },
  {
    // The four registers a new workspace fills in before it can trade. Category,
    // unit, origin and brand are edited inside Item registration, behind a passcode.
    label: 'Basic Setup',
    icon: 'layers',
    links: [
      { label: 'Item registration', path: '/catalogue/items' },
      { label: 'Supplier registration', path: '/suppliers' },
      { label: 'Customer registration', path: '/customers/list' },
      { label: 'Bank entry', path: '/cash/at-bank' },
    ],
  },
  {
    label: 'Sales',
    icon: 'receipt',
    links: [
      { label: 'Invoices', path: '/sales/invoices' },
      { label: 'New invoice', path: '/sales/invoices/new' },
      { label: 'Sales returns', path: '/sales/returns' },
      { label: 'Courier board', path: '/sales/courier' },
    ],
  },
  {
    label: 'Purchase',
    icon: 'truck',
    links: [
      { label: 'Purchase entries', path: '/purchase/entries' },
      { label: 'New purchase', path: '/purchase/entries/new' },
      { label: 'Purchase returns', path: '/purchase/returns' },
    ],
  },
  {
    label: 'Inventory',
    icon: 'box',
    links: [
      { label: 'Stock balance', path: '/inventory/stock' },
      { label: 'Stock ledger', path: '/inventory/ledger' },
      { label: 'Stock transfers', path: '/inventory/transfers' },
      { label: 'Opening stock', path: '/inventory/openings' },
    ],
  },
  { label: 'Customer openings', icon: 'users', path: '/customers/openings' },
  {
    label: 'Receivable & payable',
    icon: 'wallet',
    links: [
      { label: 'Receipts', path: '/finance/receipts' },
      { label: 'Payments', path: '/finance/payments' },
      { label: 'Customer ledger', path: '/finance/customer-ledger' },
      { label: 'Supplier ledger', path: '/finance/supplier-ledger' },
    ],
  },
  {
    label: 'Cash & bank',
    icon: 'bank',
    links: [
      { label: 'Cash book', path: '/cash/book' },
      { label: 'Cash in hand', path: '/cash/in-hand' },
      { label: 'Fund transfers', path: '/cash/transfers' },
    ],
  },
  {
    label: 'Reports',
    icon: 'chart',
    links: [
      { label: 'Daily sales', path: '/reports/daily-sales' },
      { label: 'Gross profit', path: '/reports/gross-profit' },
      { label: 'Top items', path: '/reports/top-items' },
      { label: 'Staff & referral', path: '/reports/staff' },
    ],
  },
  {
    label: 'People',
    icon: 'briefcase',
    links: [
      { label: 'Employees', path: '/people/employees' },
      { label: 'Departments', path: '/people/departments' },
    ],
  },
  {
    label: 'Administration',
    icon: 'shield',
    links: [
      { label: 'Branches', path: '/admin/branches' },
      { label: 'Couriers', path: '/admin/couriers' },
      { label: 'Users & access', path: '/admin/users' },
      { label: 'Menu registry', path: '/admin/menus' },
      { label: 'Image gallery', path: '/admin/gallery' },
      { label: 'Workspace settings', path: '/admin/settings' },
    ],
  },
];

export interface CommandEntry {
  label: string;
  path: string;
  group: string;
  icon: IconName;
}

/** Flattened index behind the ⌘K palette. */
export const COMMANDS: CommandEntry[] = NAVIGATION.flatMap((section) =>
  section.path
    ? [{ label: section.label, path: section.path, group: 'Go to', icon: section.icon }]
    : (section.links ?? []).map((link) => ({
        label: link.label,
        path: link.path,
        group: section.label,
        icon: section.icon,
      })),
);

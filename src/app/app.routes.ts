import { Route, Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/guards';
import type { MasterConfig } from './features/masters/master-page';

/** Builds one of the nine "name only" master routes from its configuration. */
function master(path: string, config: MasterConfig): Route {
  return {
    path,
    data: config,
    title: `${config.title} · SuperSoft POS`,
    loadComponent: () => import('./features/masters/master-page').then((m) => m.MasterPage),
  };
}

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Sign in · SuperSoft POS',
    loadComponent: () => import('./features/auth/login').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.AppShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Dashboard · SuperSoft POS',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.DashboardPage),
      },
      {
        path: 'pos',
        title: 'POS terminal · SuperSoft POS',
        loadComponent: () => import('./features/pos/pos-terminal').then((m) => m.PosTerminalPage),
      },
      {
        path: 'sales',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'invoices' },
          {
            path: 'invoices',
            title: 'Sales invoices · SuperSoft POS',
            loadComponent: () => import('./features/sales/sales-list').then((m) => m.SalesListPage),
          },
          {
            path: 'invoices/new',
            title: 'New invoice · SuperSoft POS',
            loadComponent: () => import('./features/sales/sales-form').then((m) => m.SalesFormPage),
          },
          {
            path: 'invoices/:id',
            title: 'Edit invoice · SuperSoft POS',
            loadComponent: () => import('./features/sales/sales-form').then((m) => m.SalesFormPage),
          },
          {
            path: 'returns',
            title: 'Sales returns · SuperSoft POS',
            loadComponent: () =>
              import('./features/sales/sales-returns').then((m) => m.SalesReturnsPage),
          },
          {
            path: 'courier',
            title: 'Courier board · SuperSoft POS',
            loadComponent: () =>
              import('./features/sales/courier-board').then((m) => m.CourierBoardPage),
          },
        ],
      },
      {
        path: 'purchase',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'entries' },
          {
            path: 'entries',
            title: 'Purchase entries · SuperSoft POS',
            loadComponent: () =>
              import('./features/purchase/purchase-list').then((m) => m.PurchaseListPage),
          },
          {
            path: 'entries/new',
            title: 'New purchase · SuperSoft POS',
            loadComponent: () =>
              import('./features/purchase/purchase-form').then((m) => m.PurchaseFormPage),
          },
          {
            path: 'entries/:id',
            title: 'Edit purchase · SuperSoft POS',
            loadComponent: () =>
              import('./features/purchase/purchase-form').then((m) => m.PurchaseFormPage),
          },
          {
            path: 'returns',
            title: 'Purchase returns · SuperSoft POS',
            loadComponent: () =>
              import('./features/purchase/purchase-returns').then((m) => m.PurchaseReturnsPage),
          },
        ],
      },
      {
        path: 'catalogue',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'items' },
          {
            path: 'items',
            title: 'Item registration · SuperSoft POS',
            loadComponent: () => import('./features/items/items').then((m) => m.ItemsPage),
          },
          // Category, unit, brand and origin have no route of their own: Item
          // registration edits them behind the setup passcode, and a standalone
          // page would be a way around it.
        ],
      },
      {
        path: 'inventory',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'stock' },
          {
            path: 'stock',
            title: 'Stock balance · SuperSoft POS',
            loadComponent: () =>
              import('./features/stock/stock-balance').then((m) => m.StockBalancePage),
          },
          {
            path: 'ledger',
            title: 'Stock ledger · SuperSoft POS',
            loadComponent: () =>
              import('./features/stock/stock-ledger').then((m) => m.StockLedgerPage),
          },
          {
            path: 'transfers',
            title: 'Stock transfers · SuperSoft POS',
            loadComponent: () =>
              import('./features/stock/stock-transfers').then((m) => m.StockTransfersPage),
          },
          {
            path: 'openings',
            title: 'Opening stock · SuperSoft POS',
            loadComponent: () =>
              import('./features/stock/item-openings').then((m) => m.ItemOpeningsPage),
          },
        ],
      },
      {
        path: 'suppliers',
        title: 'Supplier registration · SuperSoft POS',
        loadComponent: () => import('./features/suppliers/suppliers').then((m) => m.SuppliersPage),
      },
      {
        path: 'customers',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'list' },
          {
            path: 'list',
            title: 'Customer registration · SuperSoft POS',
            loadComponent: () =>
              import('./features/customers/customers').then((m) => m.CustomersPage),
          },
          {
            path: 'openings',
            title: 'Customer openings · SuperSoft POS',
            loadComponent: () =>
              import('./features/customers/customer-openings').then((m) => m.CustomerOpeningsPage),
          },
          // Area and referral source have no route of their own either:
          // Customer registration edits them behind the setup passcode.
        ],
      },
      {
        path: 'finance',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'receipts' },
          {
            path: 'receipts',
            title: 'Receipts · SuperSoft POS',
            loadComponent: () => import('./features/parties/receipts').then((m) => m.ReceiptsPage),
          },
          {
            path: 'payments',
            title: 'Payments · SuperSoft POS',
            loadComponent: () => import('./features/parties/payments').then((m) => m.PaymentsPage),
          },
          {
            path: 'customer-ledger',
            data: { kind: 'customer' },
            title: 'Customer ledger · SuperSoft POS',
            loadComponent: () =>
              import('./features/parties/party-ledger').then((m) => m.PartyLedgerPage),
          },
          {
            path: 'supplier-ledger',
            data: { kind: 'supplier' },
            title: 'Supplier ledger · SuperSoft POS',
            loadComponent: () =>
              import('./features/parties/party-ledger').then((m) => m.PartyLedgerPage),
          },
        ],
      },
      {
        path: 'cash',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'book' },
          {
            path: 'book',
            title: 'Cash book · SuperSoft POS',
            loadComponent: () =>
              import('./features/cash-bank/cash-book').then((m) => m.CashBookPage),
          },
          {
            path: 'in-hand',
            title: 'Cash in hand · SuperSoft POS',
            data: {
              mode: 'Cash',
              title: 'Cash in hand',
              singular: 'cash account',
              subtitle: 'Tills and petty-cash floats that documents can settle against.',
              icon: 'money',
            },
            loadComponent: () =>
              import('./features/cash-bank/cash-accounts').then((m) => m.CashAccountsPage),
          },
          {
            path: 'at-bank',
            title: 'Bank entry · SuperSoft POS',
            data: {
              mode: 'Bank',
              title: 'Bank entry',
              singular: 'bank account',
              subtitle: 'Bank accounts that receive takings and pay suppliers.',
              icon: 'bank',
            },
            loadComponent: () =>
              import('./features/cash-bank/cash-accounts').then((m) => m.CashAccountsPage),
          },
          {
            path: 'transfers',
            title: 'Fund transfers · SuperSoft POS',
            loadComponent: () =>
              import('./features/cash-bank/fund-transfers').then((m) => m.FundTransfersPage),
          },
        ],
      },
      {
        path: 'reports',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'daily-sales' },
          {
            path: 'daily-sales',
            title: 'Daily sales · SuperSoft POS',
            loadComponent: () =>
              import('./features/reports/daily-sales').then((m) => m.DailySalesReportPage),
          },
          {
            path: 'gross-profit',
            title: 'Gross profit · SuperSoft POS',
            loadComponent: () =>
              import('./features/reports/gross-profit').then((m) => m.GrossProfitReportPage),
          },
          {
            path: 'top-items',
            title: 'Top items · SuperSoft POS',
            loadComponent: () =>
              import('./features/reports/top-items').then((m) => m.TopItemsReportPage),
          },
          {
            path: 'staff',
            title: 'Staff & referral · SuperSoft POS',
            loadComponent: () =>
              import('./features/reports/staff-sales').then((m) => m.StaffSalesReportPage),
          },
        ],
      },
      {
        path: 'people',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'employees' },
          {
            path: 'employees',
            title: 'Employees · SuperSoft POS',
            loadComponent: () =>
              import('./features/employees/employees').then((m) => m.EmployeesPage),
          },
          master('departments', {
            resource: 'departments',
            title: 'Departments',
            singular: 'department',
            subtitle: 'Teams employees are assigned to.',
            icon: 'briefcase',
          }),
        ],
      },
      {
        path: 'admin',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'branches' },
          master('branches', {
            resource: 'branches',
            title: 'Branches',
            singular: 'branch',
            subtitle: 'Outlets that hold stock and raise documents.',
            icon: 'store',
          }),
          master('couriers', {
            resource: 'couriers',
            title: 'Couriers',
            singular: 'courier',
            subtitle: 'Delivery partners attached to sales invoices.',
            icon: 'truck',
          }),
          {
            path: 'users',
            title: 'Users & access · SuperSoft POS',
            loadComponent: () => import('./features/admin/users').then((m) => m.UsersPage),
          },
          {
            path: 'menus',
            title: 'Menu registry · SuperSoft POS',
            loadComponent: () => import('./features/admin/menus').then((m) => m.MenusPage),
          },
          {
            path: 'gallery',
            title: 'Image gallery · SuperSoft POS',
            loadComponent: () => import('./features/admin/gallery').then((m) => m.GalleryPage),
          },
          {
            path: 'settings',
            title: 'Workspace settings · SuperSoft POS',
            loadComponent: () => import('./features/admin/settings').then((m) => m.SettingsPage),
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];

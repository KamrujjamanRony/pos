# SuperSoft POS

A point-of-sale and back-office workspace for multi-branch retail, built on Angular 22
(standalone, zoneless, signals throughout) and Tailwind CSS v4. Every screen maps onto an
endpoint documented in the `POS API` Postman collection.

## Running it

```bash
npm install
npm start          # http://localhost:4200
npm run build      # production bundle
npm test           # vitest — mock-backend contract + screen smoke tests
```

### Demo mode

`src/environments/environment.ts` ships with `useMockBackend: true`. An HTTP interceptor
(`core/http/mock-backend.ts`) answers every documented route from a deterministic in-memory
book — 36 items, 25 customers, 10 suppliers, 3 branches and ~90 days of trading — so the whole
app is explorable without the server running. Sign in with **Aman / 123455.**, or with any
credentials, or take the guest token.

Point it at the real API by flipping two values:

```ts
apiBaseUrl: 'https://localhost:7057/p',
useMockBackend: false,
```

Nothing else changes: the mock only ever sits at the end of the interceptor chain.

## What is in it

| Area          | Screens                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Trading**   | POS terminal, sales invoices (+ editor), sales returns, courier board, purchase entries (+ editor), purchase returns                     |
| **Inventory** | Stock balance, stock ledger, stock transfers, opening stock                                                                              |
| **Catalogue** | Items, categories, units, brands, origins                                                                                                |
| **Parties**   | Customers, customer openings, areas, referral sources, suppliers                                                                         |
| **Money**     | Receipts, payments, customer ledger, supplier ledger, cash book, cash in hand, cash at bank, fund transfers                              |
| **Insight**   | Dashboard, daily sales, gross profit, top items, staff & referral performance                                                            |
| **Admin**     | Employees (multipart, with documents), departments, branches, couriers, users & access, menu registry, image gallery, workspace settings |

The **POS terminal** is the fast path: search or scan into the catalogue grid, click to add,
adjust quantities inline, pick a customer, discount by percent or flat amount, settle in cash or
bank, and post — with the invoice number coming straight back from the API.

## Architecture

```
src/app/
  core/
    models/       every request and response shape from the collection
    services/     Api (transport + envelope), PosApi (typed facade over all endpoints),
                  Lookups (session-cached master data), ListStore, Print, toast, theme, confirm
    auth/         session, guards
    http/         auth / progress / error interceptors, and the in-memory backend
    util/         formatting, dates, CSV export, the print/PDF engine
  layout/         shell, sidebar, topbar, ⌘K command palette
  shared/         the UI kit — table, modal, combobox, charts, stat tiles, filter bar…
  features/       one folder per module
```

Three things keep ~40 screens from turning into ~40 copies of the same file:

- **`CrudEndpoint`** captures the `POST /X`, `POST /X/Search`, `GET|PUT|DELETE /X/{id}` shape
  the API repeats for every resource.
- **`MasterPage`** is one component driven by route `data`, serving all nine "name only"
  endpoints (Branch, CourierName, Department, Category, Unit, Origin, Brand, Area, Referred).
  `CashAccountsPage` and `PartyLedgerPage` do the same trick for their two variants each.
- **`UiTable`** owns sorting, paging, loading, empty states and the row-action slot.

## Printing

Every screen can print, and every print is a PDF if you pick "Save as PDF" in the browser's own
dialog — no export server, no PDF library in the bundle.

- **Reports.** The printer button beside the CSV export on each filter bar prints exactly what is
  on screen: same rows, same filters, plus a letterhead, the filters that produced the rows, the
  headline figures and a totals line. The row shape is shared with the CSV export, so the two can
  never drift apart.
- **Documents.** Sales invoices, purchase entries, credit and debit notes, money receipts, payment
  vouchers, transfer challans and party statements each print as a proper document — parties,
  line items, a totals panel, the amount in words and signature lines. Invoice and purchase
  editors print what is on the form, marked as a proforma until it is posted.
- **Receipts.** The POS terminal prints an 80mm thermal receipt straight after a sale, or the same
  sale as an A4 invoice.

`core/util/print.ts` composes a standalone HTML document — its own stylesheet, `@page` box and
column alignment, nothing inherited from the app — and `PrintService` prints it from a hidden
iframe, so the app keeps its state and no popup is blocked. The letterhead (business name,
address, phone, email, footer note) is editable in **Workspace settings** and stored per browser.

## Design

Semantic colour tokens flip between light and dark on `.dark`, and Tailwind's `@theme` maps
them onto utilities, so components never name a raw colour. Motion is CSS keyframes plus the
Web Animations API — no animation package — and everything collapses under
`prefers-reduced-motion`.

Chart colours come from a categorical palette validated for colour-vision deficiency against
both surfaces (worst adjacent ΔE 9.1 light / 8.4 dark). Donut and meter values are always
direct-labelled, which is also the relief the light-mode contrast warning requires.

Accessibility is treated as a build constraint: visible focus rings, `aria-sort` on sortable
headers, labelled controls, native `<dialog>` for modals (so focus trapping and Escape come
from the platform), live regions for toasts, and no nested interactive elements.

## Testing

`npm test` runs three suites:

- **`core/http/mock-backend.spec.ts`** — the contract the UI depends on: login, master CRUD,
  invoice numbering and derived totals, stock reflecting a sale, the cash-book balance identity,
  outstanding-invoice filtering, report windowing, 404s.
- **`core/util/print.spec.ts`** — what a bad printed page would fail: escaped values, aligned
  number columns, a totals row under the right heading, the page box, and the amount in words.
- **`app.spec.ts`** — renders the heaviest screens and signs in end to end through Signal Forms.

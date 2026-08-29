import { describe, expect, it } from 'vitest';
import { amountInWords } from './format';
import {
  renderDocument,
  renderReceipt,
  renderReport,
  type PrintBrand,
  type PrintStamp,
} from './print';

const brand: PrintBrand = {
  name: 'Aurora Retail',
  address: '12 Gulshan Avenue, Dhaka',
  phone: '+880 1700 000000',
};

const stamp: PrintStamp = {
  printedBy: 'Aman',
  printedAt: new Date('2026-08-29T10:30:00'),
};

/**
 * Everything printable in the app is composed by these three functions, so the
 * checks here are the ones a bad page would fail: escaped values, aligned
 * numbers, a totals row that lines up with its columns, and a stamp.
 */
describe('print rendering', () => {
  it('lays out a report with a letterhead, filters and a totals row', () => {
    const html = renderReport(
      {
        title: 'Sales invoices',
        subtitle: '01 Aug 2026 — 29 Aug 2026',
        filters: [{ label: 'Settlement', value: 'All invoices' }],
        summary: [{ label: 'Net sales', value: '৳ 4,250.00' }],
        sections: [
          {
            rows: [
              { Invoice: 'INV-1', Customer: 'Rahim', Net: 1250.5 },
              { Invoice: 'INV-2', Customer: 'Karim', Net: 3000 },
            ],
            totals: { Net: 4250.5 },
          },
        ],
      },
      brand,
      stamp,
    );

    expect(html).toContain('<title>Sales invoices</title>');
    expect(html).toContain('Aurora Retail');
    expect(html).toContain('12 Gulshan Avenue, Dhaka');
    expect(html).toContain('01 Aug 2026 — 29 Aug 2026');
    expect(html).toContain('Settlement');

    // A money column keeps two decimals on every row, including whole values.
    expect(html).toContain('1,250.50');
    expect(html).toContain('3,000.00');

    // The totals row names itself in the first column and lands under `Net`.
    expect(html).toContain('<tfoot>');
    expect(html).toContain('>Total<');
    expect(html).toContain('4,250.50');

    // Numeric columns are right-aligned; text columns are not.
    expect(html).toContain('<th class="right num">Net</th>');
    expect(html).toContain('<th>Customer</th>');

    expect(html).toContain('Printed 29 Aug 2026, 10:30 by Aman');
  });

  it('escapes values rather than letting them become markup', () => {
    const html = renderReport(
      {
        title: 'Items',
        sections: [{ rows: [{ Name: '<script>alert("x")</script>', Code: "O'Brien & Co" }] }],
      },
      brand,
      stamp,
    );

    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('O&#39;Brien &amp; Co');
  });

  it('falls back to an empty-state line when a section has no rows', () => {
    const html = renderReport(
      {
        title: 'Receipts',
        sections: [{ rows: [], emptyMessage: 'No receipts in this window.' }],
      },
      brand,
      stamp,
    );

    expect(html).toContain('No receipts in this window.');
    expect(html).not.toContain('<tbody>');
  });

  it('switches the page box to landscape on request', () => {
    const portrait = renderReport({ title: 'A', sections: [{ rows: [] }] }, brand, stamp);
    const landscape = renderReport(
      { title: 'A', landscape: true, sections: [{ rows: [] }] },
      brand,
      stamp,
    );

    expect(portrait).toContain('size: A4 portrait');
    expect(landscape).toContain('size: A4 landscape');
  });

  it('renders a document with its parties, totals panel and signatures', () => {
    const html = renderDocument(
      {
        title: 'Sales invoice',
        documentNo: 'INV-000101',
        status: 'Due',
        parties: [{ heading: 'Billed to', lines: ['Rahim Traders', null, '  '] }],
        section: { rows: [{ Item: 'Kettle', Qty: 2, Amount: 900 }] },
        totals: [{ label: 'Net payable', value: '৳ 900.00', strong: true }],
        amountInWords: amountInWords(900),
        signatures: ['Received by', 'Authorised signature'],
      },
      brand,
      stamp,
    );

    expect(html).toContain('INV-000101');
    expect(html).toContain('<span class="status">Due</span>');
    expect(html).toContain('Billed to');
    expect(html).toContain('Rahim Traders');
    expect(html).toContain('nine hundred taka only');
    expect(html).toContain('Authorised signature');
    // Blank and null party lines are dropped rather than printed as gaps.
    const parties = html.slice(html.indexOf('<div class="parties">'), html.indexOf('<table'));
    expect(parties.match(/<p>/g)?.length).toBe(1);
  });

  it('renders an 80mm receipt with a quantity line per item', () => {
    const html = renderReceipt(
      {
        documentNo: 'INV-000101',
        meta: [{ label: 'Customer', value: 'Walk-in' }],
        lines: [{ name: 'Kettle', note: 'SN-9', quantity: 2, rate: 450, amount: 900 }],
        totals: [{ label: 'Net', value: '৳ 900.00', strong: true }],
      },
      brand,
      stamp,
    );

    expect(html).toContain('size: 80mm auto');
    expect(html).toContain('Aurora Retail');
    expect(html).toContain('Kettle');
    expect(html).toContain('SN-9');
    expect(html).toContain('2 &times;');
    expect(html).toContain('450.00');
    expect(html).toContain('Thank you for your purchase.');
  });
});

describe('amountInWords', () => {
  it('writes taka and poisha on the lakh/crore scale', () => {
    expect(amountInWords(0)).toBe('zero taka only');
    expect(amountInWords(45)).toBe('forty-five taka only');
    expect(amountInWords(1250.5)).toBe('one thousand two hundred fifty taka and fifty poisha only');
    expect(amountInWords(100000)).toBe('one lakh taka only');
    expect(amountInWords(12345678)).toBe(
      'one crore twenty-three lakh forty-five thousand six hundred seventy-eight taka only',
    );
    expect(amountInWords(-20)).toBe('minus twenty taka only');
  });
});

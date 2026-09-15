import { test, describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  calculateTenantBalance,
  allocatePayment,
  calculateDepositDisposition,
  calculateScheduleE,
  TransactionRecord
} from '../backend/ledger.js';

describe('Accounting Module - Ledger Mathematics', () => {
  it('calculates running tenant balance correctly', () => {
    const transactions: TransactionRecord[] = [
      {
        id: '1',
        tenant_id: 't1',
        transaction_type: 'charge',
        category: 'rent',
        amount_cents: 150000,
        transaction_date: 1000,
        description: 'September Rent',
        created_at: 1000,
        updated_at: 1000
      },
      {
        id: '2',
        tenant_id: 't1',
        transaction_type: 'charge',
        category: 'late_fee',
        amount_cents: 5000,
        transaction_date: 2000,
        description: 'Late Fee',
        created_at: 2000,
        updated_at: 2000
      },
      {
        id: '3',
        tenant_id: 't1',
        transaction_type: 'payment',
        category: 'rent',
        amount_cents: 100000,
        transaction_date: 3000,
        description: 'Partial Payment',
        created_at: 3000,
        updated_at: 3000
      }
    ];

    // Total Charges: 150000 + 5000 = 155000. Total Payments: 100000. Balance = 55000.
    const balance = calculateTenantBalance(transactions);
    assert.equal(balance, 55000);
  });

  it('allocates payments following strict priority waterfall: Late Fees -> Utilities -> Oldest Rent -> Current Rent', () => {
    const charges: TransactionRecord[] = [
      {
        id: 'ch-rent-aug',
        tenant_id: 't1',
        transaction_type: 'charge',
        category: 'rent',
        amount_cents: 120000,
        transaction_date: 1000, // Aug 1
        description: 'August Rent',
        created_at: 1000,
        updated_at: 1000
      },
      {
        id: 'ch-rent-sep',
        tenant_id: 't1',
        transaction_type: 'charge',
        category: 'rent',
        amount_cents: 120000,
        transaction_date: 2000, // Sep 1
        description: 'September Rent',
        created_at: 2000,
        updated_at: 2000
      },
      {
        id: 'ch-late',
        tenant_id: 't1',
        transaction_type: 'charge',
        category: 'late_fee',
        amount_cents: 5000,
        transaction_date: 1500, // Aug 6
        description: 'August Late Fee',
        created_at: 1500,
        updated_at: 1500
      },
      {
        id: 'ch-util',
        tenant_id: 't1',
        transaction_type: 'charge',
        category: 'utility_rebill',
        amount_cents: 8000,
        transaction_date: 1200,
        description: 'Water Rebill',
        created_at: 1200,
        updated_at: 1200
      }
    ];

    // Total debt: 120000 + 120000 + 5000 + 8000 = 253000 cents ($2,530.00).
    // Partial payment: $1,300.00 (130000 cents).
    // Expected allocation order:
    // 1. Late Fee: $50.00 (5000) -> 125000 remaining
    // 2. Utility: $80.00 (8000) -> 117000 remaining
    // 3. Oldest Rent (Aug): $1,170.00 of $1,200.00 (117000) -> 0 remaining
    // 4. Current Rent (Sep): $0.00 applied, $1,200.00 remaining

    const result = allocatePayment(charges, 130000);
    assert.equal(result.paymentAmountCents, 130000);
    assert.equal(result.allocatedCents, 130000);
    assert.equal(result.unallocatedCreditCents, 0);

    const lateAlloc = result.allocations.find((a) => a.chargeId === 'ch-late');
    assert.equal(lateAlloc?.appliedCents, 5000);
    assert.equal(lateAlloc?.remainingCents, 0);

    const utilAlloc = result.allocations.find((a) => a.chargeId === 'ch-util');
    assert.equal(utilAlloc?.appliedCents, 8000);
    assert.equal(utilAlloc?.remainingCents, 0);

    const augRentAlloc = result.allocations.find((a) => a.chargeId === 'ch-rent-aug');
    assert.equal(augRentAlloc?.appliedCents, 117000);
    assert.equal(augRentAlloc?.remainingCents, 3000);

    const sepRentAlloc = result.allocations.find((a) => a.chargeId === 'ch-rent-sep');
    assert.equal(sepRentAlloc?.appliedCents, 0);
    assert.equal(sepRentAlloc?.remainingCents, 120000);
  });

  it('calculates move-out deposit trust disposition with damage deductions', () => {
    // Deposit Held: $1,500.00 (150000)
    // Unpaid Rent: $300.00 (30000)
    // Damage Deductions: $450.00 (45000)
    // Expected Refund: $1,500 - $750 = $750.00 (75000)
    const result = calculateDepositDisposition(150000, 30000, 45000);
    assert.equal(result.depositHeldCents, 150000);
    assert.equal(result.totalDeductionsCents, 75000);
    assert.equal(result.finalRefundCents, 75000);
    assert.equal(result.tenantOwedCents, 0);
  });

  it('calculates IRS Schedule E Net Operating Income (NOI)', () => {
    const transactions: TransactionRecord[] = [
      { id: '1', tenant_id: 't1', transaction_type: 'payment', category: 'rent', amount_cents: 200000, transaction_date: 100, description: 'Rent', created_at: 100, updated_at: 100 },
      { id: '2', tenant_id: 't1', transaction_type: 'payment', category: 'pet_fee', amount_cents: 5000, transaction_date: 100, description: 'Pet Fee', created_at: 100, updated_at: 100 },
      { id: '3', tenant_id: 't1', transaction_type: 'expense', category: 'property_taxes', amount_cents: 35000, transaction_date: 200, description: 'Tax', created_at: 200, updated_at: 200 },
      { id: '4', tenant_id: 't1', transaction_type: 'expense', category: 'insurance', amount_cents: 15000, transaction_date: 200, description: 'Insurance', created_at: 200, updated_at: 200 },
      { id: '5', tenant_id: 't1', transaction_type: 'expense', category: 'repairs', amount_cents: 25000, transaction_date: 200, description: 'Repairs', created_at: 200, updated_at: 200 }
    ];

    const report = calculateScheduleE(transactions);
    assert.equal(report.totalIncomeCents, 205000);
    assert.equal(report.totalOperatingExpenseCents, 75000);
    assert.equal(report.netOperatingIncomeCents, 130000);
    assert.equal(report.incomeByCategory['rent'], 200000);
    assert.equal(report.expenseByCategory['repairs'], 25000);
  });
});

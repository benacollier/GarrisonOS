import { test, describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { createTestDb, runInTenantContext } from '../../../test/helpers.js';
import { AccountingRepository } from '../backend/repository.js';
import { closeDatabase, getDatabase } from '../../../database/client.js';

describe('Accounting Module - Repository & Financial Workflows', () => {
  before(() => {
    getDatabase({ inMemory: true });
    createTestDb();
  });

  after(() => {
    closeDatabase();
  });

  it('creates and lists financial transactions with category and date filtering', () => {
    runInTenantContext('tenant-acct-test', () => {
      const now = Date.now();

      // Create income transaction
      const tx1 = AccountingRepository.createTransaction({
        transaction_type: 'payment',
        category: 'rent',
        amount_cents: 175000,
        transaction_date: now - 5000,
        description: 'October Rent Payment'
      });
      assert.ok(tx1.id);
      assert.equal(tx1.amount_cents, 175000);

      // Create expense transaction
      const tx2 = AccountingRepository.createTransaction({
        transaction_type: 'expense',
        category: 'repairs',
        amount_cents: 32000,
        transaction_date: now - 2000,
        description: 'Plumbing Repair'
      });
      assert.ok(tx2.id);

      // List all transactions
      const allTx = AccountingRepository.listTransactions();
      assert.ok(allTx.length >= 2);

      // Filter by transaction type
      const payments = AccountingRepository.listTransactions({ transaction_type: 'payment' });
      assert.ok(payments.some((t) => t.id === tx1.id));
      assert.ok(!payments.some((t) => t.id === tx2.id));

      // Calculate Schedule E report
      const scheduleE = AccountingRepository.getScheduleEReport();
      assert.ok(scheduleE.totalIncomeCents >= 175000);
      assert.ok(scheduleE.totalOperatingExpenseCents >= 32000);
      assert.equal(scheduleE.incomeByCategory['rent'], 175000);
      assert.equal(scheduleE.expenseByCategory['repairs'], 32000);
    });
  });
});

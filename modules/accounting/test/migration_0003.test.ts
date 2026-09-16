import { test, describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { createTestDb, runInTenantContext } from '../../../test/helpers.js';
import { AccountingRepository } from '../backend/repository.js';
import { JournalService } from '../backend/journal.js';
import { closeDatabase, getDatabase } from '../../../database/client.js';

describe('Accounting Module - Migration 0003 & Backfill Verification', () => {
  before(() => {
    getDatabase({ inMemory: true });
    createTestDb();
  });

  after(() => {
    closeDatabase();
  });

  it('backfills historical single-entry transactions into balanced journal entries', () => {
    runInTenantContext('tenant-backfill-test', () => {
      const db = getDatabase();
      const now = Date.now();

      // Insert legacy single-entry transactions without journal_entry_id
      db.prepare(`
        INSERT INTO transactions (
          id, tenant_id, transaction_type, category, amount_cents,
          transaction_date, description, created_at, updated_at
        ) VALUES
          ('tx-legacy-1', 'tenant-backfill-test', 'charge', 'rent', 180000, ?, 'Monthly Rent Legacy', ?, ?),
          ('tx-legacy-2', 'tenant-backfill-test', 'payment', 'rent', 180000, ?, 'Rent Payment Legacy', ?, ?),
          ('tx-legacy-3', 'tenant-backfill-test', 'expense', 'repairs', 35000, ?, 'Plumbing Fix Legacy', ?, ?),
          ('tx-legacy-4', 'tenant-backfill-test', 'deposit_inflow', 'security_deposit', 180000, ?, 'Security Deposit Legacy', ?, ?)
      `).run(now - 10000, now - 10000, now - 10000,
             now - 8000, now - 8000, now - 8000,
             now - 5000, now - 5000, now - 5000,
             now - 2000, now - 2000, now - 2000);

      // Verify unmigrated transactions
      const beforeTxs = AccountingRepository.listTransactions();
      assert.ok(beforeTxs.some((t) => t.id === 'tx-legacy-1' && !t.journal_entry_id));

      // Run backfill
      const backfillResult = JournalService.backfillLegacyTransactions();
      assert.ok(backfillResult.migrated >= 4);

      // Verify all legacy transactions now link to valid journal entries
      const afterTxs = AccountingRepository.listTransactions();
      for (const tx of afterTxs) {
        if (tx.id.startsWith('tx-legacy-')) {
          assert.ok(tx.journal_entry_id, `Expected tx ${tx.id} to have journal_entry_id`);
          const je = JournalService.getEntryById(tx.journal_entry_id);
          assert.ok(je, `Expected journal entry ${tx.journal_entry_id} to exist`);
          assert.equal(je.total_debit_cents, je.total_credit_cents);
          assert.equal(je.total_debit_cents, tx.amount_cents);
        }
      }

      // Check Trial Balance on backfilled records
      const trialBalance = JournalService.getTrialBalance();
      assert.ok(trialBalance.isBalanced);
      assert.equal(trialBalance.totalDebitCents, trialBalance.totalCreditCents);

      // Re-running backfill is completely idempotent (0 migrated)
      const repeatResult = JournalService.backfillLegacyTransactions();
      assert.equal(repeatResult.migrated, 0);
    });
  });

  it('skips soft-deleted legacy transactions during backfill', () => {
    runInTenantContext('tenant-backfill-deleted-test', () => {
      const db = getDatabase();
      const now = Date.now();

      // Insert soft-deleted legacy transaction (deleted_at is set)
      db.prepare(`
        INSERT INTO transactions (
          id, tenant_id, transaction_type, category, amount_cents,
          transaction_date, description, created_at, updated_at, deleted_at
        ) VALUES ('tx-legacy-deleted', 'tenant-backfill-deleted-test', 'charge', 'rent', 120000, ?, 'Deleted Rent', ?, ?, ?)
      `).run(now - 1000, now - 1000, now - 1000, now);

      // Run backfill
      const backfillResult = JournalService.backfillLegacyTransactions();
      assert.equal(backfillResult.migrated, 0);

      const tx = db.prepare(`
        SELECT journal_entry_id FROM transactions WHERE id = 'tx-legacy-deleted'
      `).get() as { journal_entry_id: string | null };

      assert.equal(tx.journal_entry_id, null);
    });
  });
});


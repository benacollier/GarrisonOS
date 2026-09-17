import { test, describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { createTestDb, runInTenantContext } from '../../../test/helpers.js';
import { closeDatabase, getDatabase } from '../../../database/client.js';
import { AccountingRepository } from '../backend/repository.js';
import { ChartOfAccountsRepository } from '../backend/chart_of_accounts.js';
import { QuickBooksService } from '../backend/quickbooks.js';

describe('Accounting Module - QuickBooks Compatibility & Double-Entry GL', () => {
  before(() => {
    getDatabase({ inMemory: true });
    createTestDb();
  });

  after(() => {
    closeDatabase();
  });

  it('automatically seeds default Chart of Accounts for property management and IRS Schedule E', () => {
    runInTenantContext('tenant-qb-test', () => {
      const accounts = ChartOfAccountsRepository.listAccounts();
      assert.ok(accounts.length >= 20, 'Should seed at least 20 default accounts');

      const bank = ChartOfAccountsRepository.getAccountByMapping('operating_bank');
      assert.ok(bank);
      assert.equal(bank.account_number, '1010');
      assert.equal(bank.account_type, 'Bank');

      const rent = ChartOfAccountsRepository.getAccountByMapping('rent');
      assert.ok(rent);
      assert.equal(rent.account_number, '4010');
      assert.equal(rent.account_type, 'Income');

      const repairs = ChartOfAccountsRepository.getAccountByMapping('repairs');
      assert.ok(repairs);
      assert.equal(repairs.account_number, '5100');
      assert.equal(repairs.account_type, 'Expense');
    });
  });

  it('synthesizes balanced double-entry debits and credits for all transaction types', () => {
    runInTenantContext('tenant-qb-test', () => {
      const now = Date.now();

      // 1. Tenant rent charge
      const chargeTx = AccountingRepository.createTransaction({
        transaction_type: 'charge',
        category: 'rent',
        amount_cents: 220000,
        transaction_date: now - 3600000,
        description: 'Monthly Rent - Unit 201'
      });

      // 2. Tenant rent payment
      const paymentTx = AccountingRepository.createTransaction({
        transaction_type: 'payment',
        category: 'rent',
        amount_cents: 220000,
        transaction_date: now - 1800000,
        description: 'Rent Payment Check #104'
      });

      // 3. Operating expense (HVAC repair)
      const expenseTx = AccountingRepository.createTransaction({
        transaction_type: 'expense',
        category: 'repairs',
        amount_cents: 45000,
        transaction_date: now - 900000,
        description: 'HVAC Filter and Blower Service'
      });

      // 4. Security deposit escrow collected
      const depositTx = AccountingRepository.createTransaction({
        transaction_type: 'deposit_inflow',
        category: 'security_deposit',
        amount_cents: 220000,
        transaction_date: now - 500000,
        description: 'Security Deposit Escrow'
      });

      const txs = [chargeTx, paymentTx, expenseTx, depositTx];
      const journalEntries = QuickBooksService.generateJournalEntries(txs);

      assert.equal(journalEntries.length, 4);

      for (const entry of journalEntries) {
        const totalDebit = entry.lines.reduce((sum, l) => sum + l.debit_cents, 0);
        const totalCredit = entry.lines.reduce((sum, l) => sum + l.credit_cents, 0);
        assert.equal(
          totalDebit,
          totalCredit,
          `Journal entry ${entry.entry_id} must balance: Debit=${totalDebit}, Credit=${totalCredit}`
        );
      }
    });
  });

  it('generates valid QuickBooks Online (QBO) Journal CSV format', () => {
    runInTenantContext('tenant-qb-test', () => {
      const now = Date.now();
      const tx = AccountingRepository.createTransaction({
        transaction_type: 'payment',
        category: 'rent',
        amount_cents: 150000,
        transaction_date: now,
        description: 'Rent for Apt 4'
      });

      const entries = QuickBooksService.generateJournalEntries([tx]);
      const exportResult = QuickBooksService.exportQboJournalCsv(entries);

      assert.ok(exportResult.content.includes('JournalNo,JournalDate,AccountName,Debit,Credit,Description,Name,Class'));
      assert.ok(exportResult.content.includes('Operating Checking'));
      assert.ok(exportResult.content.includes('Accounts Receivable (Tenant Receivables)'));
      assert.equal(exportResult.totalDebitCents, 150000);
      assert.equal(exportResult.totalCreditCents, 150000);
    });
  });

  it('generates valid QuickBooks Desktop (IIF) format with TRNS/SPL blocks', () => {
    runInTenantContext('tenant-qb-test', () => {
      const now = Date.now();
      const tx = AccountingRepository.createTransaction({
        transaction_type: 'expense',
        category: 'repairs',
        amount_cents: 7500,
        transaction_date: now,
        description: 'Door lock replacement'
      });

      const entries = QuickBooksService.generateJournalEntries([tx]);
      const exportResult = QuickBooksService.exportDesktopIif(entries);

      assert.ok(exportResult.content.includes('!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tNAME\tCLASS\tAMOUNT\tDOCNUM\tMEMO\tCLEAR'));
      assert.ok(exportResult.content.includes('TRNS\t'));
      assert.ok(exportResult.content.includes('SPL\t'));
      assert.ok(exportResult.content.includes('ENDTRNS'));
      assert.equal(exportResult.totalDebitCents, 7500);
      assert.equal(exportResult.totalCreditCents, 7500);
    });
  });

  it('generates valid OFX/QBO Web Connect format for bank feeds', () => {
    runInTenantContext('tenant-qb-test', () => {
      const now = Date.now();
      const tx = AccountingRepository.createTransaction({
        transaction_type: 'payment',
        category: 'rent',
        amount_cents: 180000,
        transaction_date: now,
        description: 'Electronic Rent Inflow'
      });

      const exportResult = QuickBooksService.exportOfxWebConnect([tx]);

      assert.ok(exportResult.content.includes('<OFX>'));
      assert.ok(exportResult.content.includes('<BANKMSGSRSV1>'));
      assert.ok(exportResult.content.includes('<STMTTRN>'));
      assert.ok(exportResult.content.includes('<TRNTYPE>CREDIT</TRNTYPE>'));
      assert.ok(exportResult.content.includes('<TRNAMT>1800.00</TRNAMT>'));
    });
  });

  it('tracks export logs and flags transactions as exported', () => {
    runInTenantContext('tenant-qb-test', () => {
      const now = Date.now();
      const tx = AccountingRepository.createTransaction({
        transaction_type: 'payment',
        category: 'rent',
        amount_cents: 100000,
        transaction_date: now,
        description: 'Test Export Tracking'
      });

      const unexportedBefore = AccountingRepository.listTransactions({ qb_unexported_only: true });
      assert.ok(unexportedBefore.some((t) => t.id === tx.id));

      const entries = QuickBooksService.generateJournalEntries([tx]);
      const exportResult = QuickBooksService.exportQboJournalCsv(entries);
      QuickBooksService.recordExport('qbo_csv', exportResult);

      const unexportedAfter = AccountingRepository.listTransactions({ qb_unexported_only: true });
      assert.ok(!unexportedAfter.some((t) => t.id === tx.id), 'Exported transaction should be excluded');
    });
  });

  it('allows expense transactions without requiring unrelated accounts', () => {
    runInTenantContext('tenant-qb-expense-scope-test', () => {
      const db = getDatabase();
      const tenantId = 'tenant-qb-expense-scope-test';

      db.prepare(`
        UPDATE chart_of_accounts
        SET is_active = 0
        WHERE operator_id = ? AND category_mapping IN ('trust_bank', 'accounts_receivable', 'security_deposit')
      `).run(tenantId);

      assert.doesNotThrow(() => {
        AccountingRepository.createTransaction({
          transaction_type: 'expense',
          category: 'repairs',
          amount_cents: 37000,
          transaction_date: Date.now(),
          description: 'Expense uses only operating bank and expense account'
        });
      });
    });
  });

  it('skips deleted transactions even when they retain a stale journal_entry_id', () => {
    runInTenantContext('tenant-qb-deleted-test', () => {
      const now = Date.now();
      const tx = AccountingRepository.createTransaction({
        transaction_type: 'payment',
        category: 'rent',
        amount_cents: 125000,
        transaction_date: now,
        description: 'Deleted payment snapshot'
      });

      const deleted = AccountingRepository.deleteTransaction(tx.id);
      assert.equal(deleted, true);

      const entries = QuickBooksService.generateJournalEntries([tx]);
      assert.equal(entries.length, 0);
    });
  });

  it('returns empty journal entries array when given an empty transactions list', () => {
    runInTenantContext('tenant-qb-empty-test', () => {
      // When explicitly passing empty array (filtered query returned 0 results)
      const entries = QuickBooksService.generateJournalEntries([]);
      assert.equal(entries.length, 0);
    });
  });
});


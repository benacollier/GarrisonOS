import { Router } from '../../../api/router.js';
import { successResponse, errorResponse } from '../../../api/response.js';
import { AccountingRepository } from './repository.js';
import { generateMonthlyRentCharges } from './billing.js';
import { ChartOfAccountsRepository } from './chart_of_accounts.js';
import { QuickBooksService } from './quickbooks.js';
import { JournalService } from './journal.js';

export function registerRoutes(router: Router): void {
  // --- Rent Roll ---
  router.get('/api/v1/accounting/rent-roll', (_req, res) => {
    const rentRoll = AccountingRepository.getRentRoll();
    const totalScheduledRentCents = rentRoll.reduce((sum, r) => sum + r.monthly_rent_cents, 0);
    const totalDelinquencyCents = rentRoll.reduce((sum, r) => sum + Math.max(0, r.balance_cents), 0);

    successResponse(res, {
      rentRoll,
      summary: {
        totalUnits: rentRoll.length,
        totalScheduledRentCents,
        totalDelinquencyCents
      }
    });
  });

  // --- Schedule E Report ---
  router.get('/api/v1/accounting/schedule-e', (req, res) => {
    const year = req.query.year ? parseInt(req.query.year, 10) : new Date().getUTCFullYear();
    const propertyId = req.query.property_id || undefined;
    const report = AccountingRepository.getScheduleEReport({ year, property_id: propertyId });
    successResponse(res, { year, property_id: propertyId, report });
  });

  // --- Lease Balance & Ledger ---
  router.get('/api/v1/accounting/balance/:leaseId', (req, res) => {
    const balance = AccountingRepository.getLeaseBalance(req.params.leaseId!);
    const transactions = AccountingRepository.getLeaseTransactions(req.params.leaseId!);
    successResponse(res, { balance, transactions });
  });

  // --- Automated Recurring Rent Charges ---
  router.post('/api/v1/accounting/generate-rent-charges', (req, res) => {
    const targetMonth = req.body?.month; // e.g. "2026-09"
    const result = generateMonthlyRentCharges(targetMonth);
    successResponse(res, { result });
  });

  // --- Move-Out Deposit Disposition ---
  router.post('/api/v1/accounting/deposit-disposition', (req, res) => {
    const { lease_id, deductions } = req.body || {};
    if (!lease_id) {
      return errorResponse(res, 'VALIDATION_ERROR', 'lease_id is required', 400);
    }
    try {
      const result = AccountingRepository.processDepositDisposition(lease_id, deductions || []);
      successResponse(res, { result });
    } catch (err: any) {
      errorResponse(res, 'DISPOSITION_FAILED', err.message, 400);
    }
  });

  // --- Transactions CRUD ---
  router.get('/api/v1/accounting/transactions', (req, res) => {
    const transactions = AccountingRepository.listTransactions({
      lease_id: req.query.lease_id,
      property_id: req.query.property_id,
      unit_id: req.query.unit_id,
      transaction_type: req.query.transaction_type,
      category: req.query.category,
      start_date: req.query.start_date ? parseInt(req.query.start_date, 10) : undefined,
      end_date: req.query.end_date ? parseInt(req.query.end_date, 10) : undefined
    });
    successResponse(res, { transactions });
  });

  router.post('/api/v1/accounting/transactions', (req, res) => {
    const { transaction_type, category, amount_cents, description } = req.body || {};
    if (!transaction_type || !category || amount_cents === undefined || !description) {
      return errorResponse(res, 'VALIDATION_ERROR', 'transaction_type, category, amount_cents, and description are required', 400);
    }
    try {
      const transaction = AccountingRepository.createTransaction({
        transaction_type,
        category,
        amount_cents: parseInt(amount_cents, 10),
        transaction_date: req.body.transaction_date ? parseInt(req.body.transaction_date, 10) : Date.now(),
        description,
        payment_method: req.body.payment_method || null,
        reference_number: req.body.reference_number || null,
        property_id: req.body.property_id || null,
        unit_id: req.body.unit_id || null,
        lease_id: req.body.lease_id || null,
        payer_contact_id: req.body.payer_contact_id || null,
        payee_contact_id: req.body.payee_contact_id || null
      });
      successResponse(res, { transaction }, 201);
    } catch (err: any) {
      errorResponse(res, 'TRANSACTION_POST_FAILED', err.message, 400);
    }
  });

  router.get('/api/v1/accounting/transactions/:id', (req, res) => {
    const transaction = AccountingRepository.getTransactionById(req.params.id!);
    if (!transaction) {
      return errorResponse(res, 'NOT_FOUND', 'Transaction not found', 404);
    }
    successResponse(res, { transaction });
  });

  router.delete('/api/v1/accounting/transactions/:id', (req, res) => {
    const deleted = AccountingRepository.deleteTransaction(req.params.id!);
    if (!deleted) {
      return errorResponse(res, 'NOT_FOUND', 'Transaction not found', 404);
    }
    successResponse(res, { deleted: true });
  });

  // ==========================================
  // --- Native Double-Entry General Ledger ---
  // ==========================================

  // Trial Balance Report
  router.get('/api/v1/accounting/trial-balance', (req, res) => {
    const asOfDate = req.query.as_of_date ? parseInt(req.query.as_of_date, 10) : undefined;
    const propertyId = req.query.property_id || undefined;
    const trialBalance = JournalService.getTrialBalance(asOfDate, propertyId);
    successResponse(res, { trialBalance });
  });

  // List General Ledger Journal Entries
  router.get('/api/v1/accounting/journal-entries', (req, res) => {
    const { entries, total } = JournalService.listEntries({
      source_type: req.query.source_type,
      source_id: req.query.source_id,
      start_date: req.query.start_date ? parseInt(req.query.start_date, 10) : undefined,
      end_date: req.query.end_date ? parseInt(req.query.end_date, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit, 10) : 50,
      offset: req.query.offset ? parseInt(req.query.offset, 10) : 0
    });
    successResponse(res, { entries, total });
  });

  // Get Journal Entry by ID
  router.get('/api/v1/accounting/journal-entries/:id', (req, res) => {
    const entry = JournalService.getEntryById(req.params.id!);
    if (!entry) {
      return errorResponse(res, 'NOT_FOUND', 'Journal entry not found', 404);
    }
    successResponse(res, { entry });
  });

  // Post Manual Balanced Journal Entry
  router.post('/api/v1/accounting/journal-entries', (req, res) => {
    const { memo, source_type, lines, date_ms } = req.body || {};
    if (!memo || !lines || !Array.isArray(lines)) {
      return errorResponse(res, 'VALIDATION_ERROR', 'memo and lines array are required', 400);
    }

    try {
      const entry = JournalService.postEntry({
        memo,
        source_type: source_type || 'manual_journal',
        date_ms: date_ms ? parseInt(date_ms, 10) : Date.now(),
        lines
      });
      successResponse(res, { entry }, 201);
    } catch (err: any) {
      errorResponse(res, 'JOURNAL_POST_FAILED', err.message, 400);
    }
  });

  // Reverse a Journal Entry
  router.post('/api/v1/accounting/journal-entries/:id/reverse', (req, res) => {
    const reason = req.body?.reason || 'Reversal requested';
    try {
      const reversal = JournalService.reverseEntry(req.params.id!, reason);
      successResponse(res, { reversal });
    } catch (err: any) {
      errorResponse(res, 'REVERSAL_FAILED', err.message, 400);
    }
  });

  // Backfill Legacy Transactions into General Ledger
  router.post('/api/v1/accounting/backfill-ledger', (_req, res) => {
    try {
      const result = JournalService.backfillLegacyTransactions();
      successResponse(res, { result });
    } catch (err: any) {
      errorResponse(res, 'BACKFILL_FAILED', err.message, 500);
    }
  });

  // --- CSV Exports ---
  router.get('/api/v1/accounting/export/rent-roll.csv', (_req, res) => {
    const roll = AccountingRepository.getRentRoll();
    let csv = 'Property,Unit,Status,Tenant,Monthly Rent,Deposit Held,Outstanding Balance\n';
    for (const r of roll) {
      csv += `"${r.property_name}","${r.unit_number}","${r.status}","${r.tenant_name}",${(r.monthly_rent_cents / 100).toFixed(2)},${(r.deposit_held_cents / 100).toFixed(2)},${(r.balance_cents / 100).toFixed(2)}\n`;
    }
    res.writeHead(200, {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="rent-roll-${Date.now()}.csv"`
    });
    res.end(csv);
  });

  router.get('/api/v1/accounting/export/schedule-e.csv', (req, res) => {
    const year = req.query.year ? parseInt(req.query.year, 10) : new Date().getUTCFullYear();
    const report = AccountingRepository.getScheduleEReport({ year });
    let csv = `IRS Schedule E Summary - Year ${year}\n\n`;
    csv += 'Category Type,Line Item,Amount ($)\n';
    csv += 'INCOME\n';
    for (const [cat, cents] of Object.entries(report.incomeByCategory)) {
      csv += `Income,"${cat}",${(cents / 100).toFixed(2)}\n`;
    }
    csv += `Total Income,,${(report.totalIncomeCents / 100).toFixed(2)}\n\n`;
    csv += 'OPERATING EXPENSES\n';
    for (const [cat, cents] of Object.entries(report.expenseByCategory)) {
      csv += `Expense,"${cat}",${(cents / 100).toFixed(2)}\n`;
    }
    csv += `Total Expenses,,${(report.totalOperatingExpenseCents / 100).toFixed(2)}\n\n`;
    csv += `NET OPERATING INCOME (NOI),,${(report.netOperatingIncomeCents / 100).toFixed(2)}\n`;

    res.writeHead(200, {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="schedule-e-${year}-${Date.now()}.csv"`
    });
    res.end(csv);
  });

  router.get('/api/v1/accounting/export/ledger/:leaseId.csv', (req, res) => {
    const transactions = AccountingRepository.getLeaseTransactions(req.params.leaseId!);
    let csv = 'Date,Type,Category,Description,Amount ($),Running Balance ($)\n';
    let running = 0;
    for (const tx of transactions) {
      if (tx.transaction_type === 'charge' || tx.transaction_type === 'deposit_return' || tx.transaction_type === 'deposit_deduction') {
        running += tx.amount_cents;
      } else if (tx.transaction_type === 'payment' || tx.transaction_type === 'refund') {
        running -= tx.amount_cents;
      }
      const d = new Date(tx.transaction_date).toISOString().split('T')[0];
      csv += `"${d}","${tx.transaction_type}","${tx.category}","${tx.description.replace(/"/g, '""')}",${(tx.amount_cents / 100).toFixed(2)},${(running / 100).toFixed(2)}\n`;
    }
    res.writeHead(200, {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="ledger-${req.params.leaseId}-${Date.now()}.csv"`
    });
    res.end(csv);
  });

  // ==========================================
  // --- Chart of Accounts & QuickBooks Sync ---
  // ==========================================

  // List Chart of Accounts
  router.get('/api/v1/accounting/chart-of-accounts', (req, res) => {
    const includeInactive = req.query.include_inactive === 'true';
    const accounts = ChartOfAccountsRepository.listAccounts(includeInactive);
    successResponse(res, { accounts });
  });

  // Create new Account
  router.post('/api/v1/accounting/chart-of-accounts', (req, res) => {
    const { account_name, account_type, qb_account_type, account_number, category_mapping, description } = req.body || {};
    if (!account_name || !account_type || !qb_account_type) {
      return errorResponse(res, 'VALIDATION_ERROR', 'account_name, account_type, and qb_account_type are required', 400);
    }
    const account = ChartOfAccountsRepository.createAccount({
      account_name,
      account_type,
      qb_account_type,
      account_number,
      category_mapping,
      description
    });
    successResponse(res, { account }, 201);
  });

  // Update Account
  router.put('/api/v1/accounting/chart-of-accounts/:id', (req, res) => {
    const updated = ChartOfAccountsRepository.updateAccount(req.params.id!, req.body || {});
    if (!updated) {
      return errorResponse(res, 'NOT_FOUND', 'Chart of account item not found', 404);
    }
    successResponse(res, { account: updated });
  });

  // Preview QuickBooks Journal Entries before export
  router.get('/api/v1/accounting/quickbooks/preview', (req, res) => {
    const transactions = AccountingRepository.listTransactions({
      property_id: req.query.property_id,
      transaction_type: req.query.transaction_type,
      category: req.query.category,
      start_date: req.query.start_date ? parseInt(req.query.start_date, 10) : undefined,
      end_date: req.query.end_date ? parseInt(req.query.end_date, 10) : undefined,
      qb_unexported_only: req.query.unexported_only === 'true'
    });

    const entries = QuickBooksService.generateJournalEntries(transactions);
    const totalDebitCents = entries.reduce((sum, e) => sum + e.lines.reduce((lSum, l) => lSum + l.debit_cents, 0), 0);
    const totalCreditCents = entries.reduce((sum, e) => sum + e.lines.reduce((lSum, l) => lSum + l.credit_cents, 0), 0);

    successResponse(res, {
      entries,
      summary: {
        transactionCount: transactions.length,
        entryCount: entries.length,
        totalDebitCents,
        totalCreditCents,
        isBalanced: totalDebitCents === totalCreditCents
      }
    });
  });

  // Download QuickBooks Online (QBO) Journal CSV
  router.get('/api/v1/accounting/export/quickbooks/qbo-journal.csv', (req, res) => {
    const transactions = AccountingRepository.listTransactions({
      property_id: req.query.property_id,
      start_date: req.query.start_date ? parseInt(req.query.start_date, 10) : undefined,
      end_date: req.query.end_date ? parseInt(req.query.end_date, 10) : undefined,
      qb_unexported_only: req.query.unexported_only === 'true'
    });

    const entries = QuickBooksService.generateJournalEntries(transactions);
    const exportResult = QuickBooksService.exportQboJournalCsv(entries);

    if (req.query.mark_exported === 'true') {
      QuickBooksService.recordExport('qbo_csv', exportResult);
    }

    res.writeHead(200, {
      'Content-Type': exportResult.mimeType,
      'Content-Disposition': `attachment; filename="${exportResult.filename}"`
    });
    res.end(exportResult.content);
  });

  // Download QuickBooks Desktop IIF File
  router.get('/api/v1/accounting/export/quickbooks/desktop.iif', (req, res) => {
    const transactions = AccountingRepository.listTransactions({
      property_id: req.query.property_id,
      start_date: req.query.start_date ? parseInt(req.query.start_date, 10) : undefined,
      end_date: req.query.end_date ? parseInt(req.query.end_date, 10) : undefined,
      qb_unexported_only: req.query.unexported_only === 'true'
    });

    const entries = QuickBooksService.generateJournalEntries(transactions);
    const exportResult = QuickBooksService.exportDesktopIif(entries);

    if (req.query.mark_exported === 'true') {
      QuickBooksService.recordExport('iif', exportResult);
    }

    res.writeHead(200, {
      'Content-Type': exportResult.mimeType,
      'Content-Disposition': `attachment; filename="${exportResult.filename}"`
    });
    res.end(exportResult.content);
  });

  // Download Web Connect / QBO Banking File
  router.get('/api/v1/accounting/export/quickbooks/bank-feed.qbo', (req, res) => {
    const transactions = AccountingRepository.listTransactions({
      property_id: req.query.property_id,
      start_date: req.query.start_date ? parseInt(req.query.start_date, 10) : undefined,
      end_date: req.query.end_date ? parseInt(req.query.end_date, 10) : undefined,
      qb_unexported_only: req.query.unexported_only === 'true'
    });

    const exportResult = QuickBooksService.exportOfxWebConnect(transactions);

    if (req.query.mark_exported === 'true') {
      QuickBooksService.recordExport('ofx', exportResult);
    }

    res.writeHead(200, {
      'Content-Type': exportResult.mimeType,
      'Content-Disposition': `attachment; filename="${exportResult.filename}"`
    });
    res.end(exportResult.content);
  });
}

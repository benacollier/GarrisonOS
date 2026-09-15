import { Router } from '../../../api/router.js';
import { successResponse, errorResponse } from '../../../api/response.js';
import { AccountingRepository } from './repository.js';
import { generateMonthlyRentCharges } from './billing.js';

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
}

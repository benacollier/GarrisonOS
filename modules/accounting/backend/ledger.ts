export interface TransactionRecord {
  id: string;
  operator_id?: string;
  tenant_id?: string;
  transaction_type: 'charge' | 'payment' | 'expense' | 'refund' | 'deposit_inflow' | 'deposit_return' | 'deposit_deduction';
  category: string;
  amount_cents: number;
  transaction_date: number;
  description: string;
  payment_method?: string | null;
  reference_number?: string | null;
  property_id?: string | null;
  unit_id?: string | null;
  lease_id?: string | null;
  payer_contact_id?: string | null;
  payee_contact_id?: string | null;
  journal_entry_id?: string | null;
  created_at: number;
  updated_at: number;
  deleted_at?: number | null;
}

export interface JournalLineBalanceItem {
  account_type: string;
  debit_cents: number;
  credit_cents: number;
  contact_id?: string | null;
  property_id?: string | null;
  unit_id?: string | null;
}

export const INCOME_CATEGORIES = [
  'rent',
  'late_fee',
  'pet_fee',
  'utility_rebill',
  'security_deposit',
  'other_income'
] as const;

export const SCHEDULE_E_EXPENSE_CATEGORIES = [
  'advertising',
  'auto_travel',
  'cleaning_maintenance',
  'commissions',
  'insurance',
  'legal_professional',
  'management_fees',
  'mortgage_interest',
  'other_interest',
  'repairs',
  'supplies',
  'property_taxes',
  'utilities',
  'hoa_fees',
  'capital_improvement'
] as const;

/**
 * Calculate the running balance for a tenant lease ledger.
 * Positive = Tenant owes money; Negative = Tenant has a credit; 0 = Paid in full.
 */
export function calculateTenantBalance(transactions: TransactionRecord[]): number {
  let balanceCents = 0;

  for (const tx of transactions) {
    if (tx.deleted_at) continue;

    switch (tx.transaction_type) {
      case 'charge':
      case 'deposit_return':
      case 'deposit_deduction':
        balanceCents += tx.amount_cents;
        break;
      case 'payment':
      case 'refund':
        balanceCents -= tx.amount_cents;
        break;
      // deposit_inflow and property expenses do not alter the tenant rent ledger balance
      case 'deposit_inflow':
      case 'expense':
      default:
        break;
    }
  }

  return balanceCents;
}

/**
 * Calculate tenant receivable balance from double-entry journal lines.
 * AccountsReceivable normal balance: Debits increase receivable (charges), Credits decrease receivable (payments).
 */
export function calculateTenantBalanceFromJournalLines(lines: Array<{ debit_cents: number; credit_cents: number }>): number {
  return lines.reduce((bal, line) => bal + (line.debit_cents - line.credit_cents), 0);
}

export interface AllocatedCharge {
  chargeId: string;
  category: string;
  chargeAmountCents: number;
  appliedCents: number;
  remainingCents: number;
}

export interface PaymentAllocationResult {
  paymentAmountCents: number;
  allocatedCents: number;
  unallocatedCreditCents: number;
  allocations: AllocatedCharge[];
}

/**
 * Allocate a payment against unpaid charges using strict waterfall priority:
 * 1. Late Fees
 * 2. Utility Rebill / Other Charges
 * 3. Oldest Rent Charges
 * 4. Current Rent Charges
 */
export function allocatePayment(
  unpaidCharges: TransactionRecord[],
  paymentAmountCents: number
): PaymentAllocationResult {
  let remainingPayment = paymentAmountCents;
  const allocations: AllocatedCharge[] = [];

  // Sort charges by priority category, then by transaction date ascending
  const getCategoryPriority = (category: string): number => {
    if (category === 'late_fee') return 1;
    if (category === 'utility_rebill' || category === 'other_income') return 2;
    if (category === 'rent') return 3;
    return 4;
  };

  const sortedCharges = [...unpaidCharges]
    .filter((c) => c.transaction_type === 'charge' && !c.deleted_at)
    .sort((a, b) => {
      const pA = getCategoryPriority(a.category);
      const pB = getCategoryPriority(b.category);
      if (pA !== pB) return pA - pB;
      return a.transaction_date - b.transaction_date;
    });

  for (const charge of sortedCharges) {
    if (remainingPayment <= 0) {
      allocations.push({
        chargeId: charge.id,
        category: charge.category,
        chargeAmountCents: charge.amount_cents,
        appliedCents: 0,
        remainingCents: charge.amount_cents
      });
      continue;
    }

    const apply = Math.min(remainingPayment, charge.amount_cents);
    remainingPayment -= apply;

    allocations.push({
      chargeId: charge.id,
      category: charge.category,
      chargeAmountCents: charge.amount_cents,
      appliedCents: apply,
      remainingCents: charge.amount_cents - apply
    });
  }

  return {
    paymentAmountCents,
    allocatedCents: paymentAmountCents - remainingPayment,
    unallocatedCreditCents: remainingPayment,
    allocations
  };
}

export interface DepositDispositionResult {
  depositHeldCents: number;
  unpaidChargesCents: number;
  damageDeductionsCents: number;
  totalDeductionsCents: number;
  finalRefundCents: number;
  tenantOwedCents: number;
}

/**
 * Calculate move-out security deposit trust disposition.
 */
export function calculateDepositDisposition(
  depositHeldCents: number,
  unpaidChargesCents: number,
  damageDeductionsCents: number
): DepositDispositionResult {
  const totalDeductionsCents = unpaidChargesCents + damageDeductionsCents;
  const net = depositHeldCents - totalDeductionsCents;

  return {
    depositHeldCents,
    unpaidChargesCents,
    damageDeductionsCents,
    totalDeductionsCents,
    finalRefundCents: net > 0 ? net : 0,
    tenantOwedCents: net < 0 ? Math.abs(net) : 0
  };
}

export interface ScheduleEReport {
  totalIncomeCents: number;
  totalOperatingExpenseCents: number;
  netOperatingIncomeCents: number;
  incomeByCategory: Record<string, number>;
  expenseByCategory: Record<string, number>;
}

/**
 * Aggregate cash transactions for IRS Schedule E income, expense, and NOI reporting.
 */
export function calculateScheduleE(transactions: TransactionRecord[]): ScheduleEReport {
  let totalIncomeCents = 0;
  let totalOperatingExpenseCents = 0;

  const incomeByCategory: Record<string, number> = {};
  const expenseByCategory: Record<string, number> = {};

  for (const tx of transactions) {
    if (tx.deleted_at) continue;

    // Cash-basis income = payments received
    if (tx.transaction_type === 'payment') {
      totalIncomeCents += tx.amount_cents;
      incomeByCategory[tx.category] = (incomeByCategory[tx.category] || 0) + tx.amount_cents;
    }

    // Cash-basis operating expenses = expenses paid
    if (tx.transaction_type === 'expense') {
      totalOperatingExpenseCents += tx.amount_cents;
      expenseByCategory[tx.category] = (expenseByCategory[tx.category] || 0) + tx.amount_cents;
    }
  }

  return {
    totalIncomeCents,
    totalOperatingExpenseCents,
    netOperatingIncomeCents: totalIncomeCents - totalOperatingExpenseCents,
    incomeByCategory,
    expenseByCategory
  };
}

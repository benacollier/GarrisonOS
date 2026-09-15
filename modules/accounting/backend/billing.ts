import { getDatabase, withTransaction } from '../../../database/client.js';
import { RequestContext } from '../../../core/context.js';
import { generateUUIDv7 } from '../../../core/crypto.js';

export interface RecurringRentGenerationResult {
  month: string;
  leasesProcessed: number;
  chargesCreated: number;
  skippedExisting: number;
  totalChargesCents: number;
  createdTransactionIds: string[];
}

/**
 * Calculate mid-month prorated rent in integer cents.
 * Formula: floor( (monthlyRentCents / daysInMonth) * daysRemainingInclusive )
 */
export function calculateProratedRent(
  monthlyRentCents: number,
  year: number,
  monthIndex: number, // 0-based month (0 = Jan, 11 = Dec)
  startDay: number
): number {
  // Number of days in the specific month
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const daysRemaining = Math.max(1, daysInMonth - startDay + 1);
  return Math.floor((monthlyRentCents / daysInMonth) * daysRemaining);
}

/**
 * Automatically generate monthly recurring rent charges for active leases.
 * Idempotent execution using reference key pattern: rent_charge:{lease_id}:{YYYY_MM}
 */
export function generateMonthlyRentCharges(targetYearMonth?: string): RecurringRentGenerationResult {
  const tenantId = RequestContext.getTenantId();
  const db = getDatabase();

  let year: number;
  let monthIndex: number;

  if (targetYearMonth) {
    const [yStr, mStr] = targetYearMonth.split('-');
    year = parseInt(yStr || '', 10);
    monthIndex = parseInt(mStr || '', 10) - 1;
  } else {
    const now = new Date();
    year = now.getUTCFullYear();
    monthIndex = now.getUTCMonth();
  }

  const monthStr = (monthIndex + 1).toString().padStart(2, '0');
  const yyyyMm = `${year}-${monthStr}`;

  // Start and end timestamp of target month
  const monthStartMs = Date.UTC(year, monthIndex, 1, 0, 0, 0, 0);
  const monthEndMs = Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999);

  // Find all leases that are active during this target month
  const activeLeases = db.prepare(`
    SELECT
      l.id,
      l.unit_id,
      l.rent_amount_cents,
      l.start_date,
      l.end_date,
      l.rent_due_day,
      u.property_id
    FROM leases l
    JOIN units u ON l.unit_id = u.id AND u.deleted_at IS NULL
    WHERE l.tenant_id = ?
      AND l.status IN ('active', 'renewed', 'month_to_month', 'expiring')
      AND l.start_date <= ?
      AND l.end_date >= ?
      AND l.deleted_at IS NULL
  `).all(tenantId, monthEndMs, monthStartMs) as unknown as Array<{
    id: string;
    unit_id: string;
    property_id: string;
    rent_amount_cents: number;
    start_date: number;
    end_date: number;
    rent_due_day: number;
  }>;

  const result: RecurringRentGenerationResult = {
    month: yyyyMm,
    leasesProcessed: activeLeases.length,
    chargesCreated: 0,
    skippedExisting: 0,
    totalChargesCents: 0,
    createdTransactionIds: []
  };

  withTransaction((tx) => {
    for (const lease of activeLeases) {
      const idempotencyRef = `rent_charge:${lease.id}:${yyyyMm}`;

      // Check if charge already exists
      const existing = tx.prepare(`
        SELECT id FROM transactions
        WHERE tenant_id = ? AND lease_id = ? AND reference_number = ? AND deleted_at IS NULL
      `).get(tenantId, lease.id, idempotencyRef);

      if (existing) {
        result.skippedExisting += 1;
        continue;
      }

      // Check if lease starts mid-month during this target month
      const leaseStartDate = new Date(lease.start_date);
      const isStartMonth = leaseStartDate.getUTCFullYear() === year && leaseStartDate.getUTCMonth() === monthIndex;
      let chargeAmountCents = lease.rent_amount_cents;

      if (isStartMonth && leaseStartDate.getUTCDate() > 1) {
        chargeAmountCents = calculateProratedRent(
          lease.rent_amount_cents,
          year,
          monthIndex,
          leaseStartDate.getUTCDate()
        );
      }

      const txId = generateUUIDv7();
      const dueDay = Math.min(lease.rent_due_day || 1, 28);
      const chargeDateMs = Date.UTC(year, monthIndex, dueDay);

      tx.prepare(`
        INSERT INTO transactions (
          id, tenant_id, transaction_type, category, amount_cents,
          transaction_date, description, reference_number,
          property_id, unit_id, lease_id, created_at, updated_at
        ) VALUES (?, ?, 'charge', 'rent', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        txId,
        tenantId,
        chargeAmountCents,
        chargeDateMs,
        `Monthly Rent – ${yyyyMm}${isStartMonth && leaseStartDate.getUTCDate() > 1 ? ' (Prorated)' : ''}`,
        idempotencyRef,
        lease.property_id,
        lease.unit_id,
        lease.id,
        Date.now(),
        Date.now()
      );

      result.chargesCreated += 1;
      result.totalChargesCents += chargeAmountCents;
      result.createdTransactionIds.push(txId);
    }
  }, db);

  return result;
}

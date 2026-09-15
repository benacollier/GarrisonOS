<?php
// Accounting Module - Itemized Tenant Lease Ledger Detail
$leaseId = $_GET['lease_id'] ?? '';
if (!$leaseId) {
    header('Location: /accounting');
    exit;
}

$lease = null;
$balance = null;
$transactions = [];
$error = null;

try {
    $leaseRes = $api->get("/api/v1/leases/{$leaseId}");
    $lease = $leaseRes['data']['lease'] ?? null;

    $balRes = $api->get("/api/v1/accounting/balance/{$leaseId}");
    $balance = $balRes['data']['balance'] ?? null;
    $transactions = $balRes['data']['transactions'] ?? [];
} catch (Exception $e) {
    $error = $e->getMessage();
}

if (!$lease) {
    echo "<div class='alert alert-danger'>Lease not found.</div>";
    return;
}

$pageTitle = 'Tenant Ledger: Unit ' . htmlspecialchars($lease['unit_number'] ?? '');

// Handle Post Payment / Charge / Deposit Disposition
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    CSRF::validate();
    $action = $_POST['action'] ?? '';
    try {
        if ($action === 'post_payment') {
            $amountCents = (int)(round((float)($_POST['amount'] ?? 0) * 100));
            $api->post('/api/v1/accounting/transactions', [
                'transaction_type' => 'payment',
                'category' => $_POST['category'] ?? 'rent',
                'amount_cents' => $amountCents,
                'transaction_date' => strtotime($_POST['transaction_date'] ?? date('Y-m-d')) * 1000,
                'description' => $_POST['description'] ?? 'Rent Payment',
                'payment_method' => $_POST['payment_method'] ?? 'zelle',
                'reference_number' => $_POST['reference_number'] ?? null,
                'property_id' => $lease['property_id'] ?? null,
                'unit_id' => $lease['unit_id'] ?? null,
                'lease_id' => $leaseId
            ]);
            Flash::set('success', 'Payment recorded on ledger');
            header("Location: /accounting/ledger-detail?lease_id=" . urlencode($leaseId));
            exit;
        } elseif ($action === 'deposit_disposition') {
            $deductions = [];
            if (!empty($_POST['damage_description']) && !empty($_POST['damage_amount'])) {
                $deductions[] = [
                    'description' => $_POST['damage_description'],
                    'amount_cents' => (int)(round((float)$_POST['damage_amount'] * 100)),
                    'category' => 'repairs'
                ];
            }
            $api->post('/api/v1/accounting/deposit-disposition', [
                'lease_id' => $leaseId,
                'deductions' => $deductions
            ]);
            Flash::set('success', 'Security deposit trust disposition finalized');
            header("Location: /accounting/ledger-detail?lease_id=" . urlencode($leaseId));
            exit;
        }
    } catch (Exception $e) {
        $error = $e->getMessage();
    }
}
?>

<div class="page-header">
    <div>
        <a href="/leases/show?id=<?= urlencode($leaseId) ?>" class="text-muted">← Back to Lease Agreement</a>
        <h1 class="page-title">Tenant Ledger Statement</h1>
        <p class="page-subtitle">
            <?= htmlspecialchars($lease['property_name'] ?? 'Property') ?> – Unit <?= htmlspecialchars($lease['unit_number'] ?? '') ?>
        </p>
    </div>
    <div class="btn-group">
        <button class="btn btn-primary" onclick="document.getElementById('postPaymentModal').showModal()">+ Post Payment</button>
        <button class="btn btn-secondary" onclick="document.getElementById('depositDispModal').showModal()">Move-Out Disposition</button>
        <a href="/api/v1/accounting/export/ledger/<?= urlencode($leaseId) ?>.csv" class="btn btn-secondary" target="_blank">Export CSV</a>
    </div>
</div>

<div class="metrics-grid">
    <div class="card metric-card">
        <div class="metric-label">Current Ledger Balance</div>
        <div class="metric-value <?= ($balance['balanceCents'] ?? 0) > 0 ? 'text-danger' : 'text-success' ?>">
            $<?= number_format(($balance['balanceCents'] ?? 0) / 100, 2) ?>
        </div>
        <div class="metric-subtitle"><?= ($balance['balanceCents'] ?? 0) > 0 ? 'Amount owed by tenant' : 'Paid in full / credit' ?></div>
    </div>
    <div class="card metric-card">
        <div class="metric-label">Monthly Rent Rate</div>
        <div class="metric-value">$<?= number_format(($lease['rent_amount_cents'] ?? 0) / 100, 2) ?></div>
        <div class="metric-subtitle">Due on day <?= (int)($lease['rent_due_day'] ?? 1) ?></div>
    </div>
    <div class="card metric-card">
        <div class="metric-label">Security Deposit Held</div>
        <div class="metric-value">$<?= number_format(($lease['deposit_held_cents'] ?? 0) / 100, 2) ?></div>
        <div class="metric-subtitle">Trust account balance</div>
    </div>
</div>

<div class="card">
    <div class="card-header">
        <h2 class="card-title">Transaction History</h2>
    </div>
    <div class="table-responsive">
        <table class="data-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Payment Method</th>
                    <th>GL Entry</th>
                    <th>Charge</th>
                    <th>Payment</th>
                    <th>Running Balance</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($transactions)): ?>
                <tr>
                    <td colspan="9" class="text-center text-muted">No transactions on ledger.</td>
                </tr>
                <?php else: ?>
                <?php
                    $running = 0;
                    foreach ($transactions as $t):
                        $isCharge = in_array($t['transaction_type'], ['charge', 'deposit_return', 'deposit_deduction']);
                        $isPayment = in_array($t['transaction_type'], ['payment', 'refund']);
                        if ($isCharge) $running += $t['amount_cents'];
                        if ($isPayment) $running -= $t['amount_cents'];
                ?>
                <tr>
                    <td><?= date('M j, Y', (int)($t['transaction_date'] / 1000)) ?></td>
                    <td><span class="badge"><?= htmlspecialchars(ucwords(str_replace('_', ' ', $t['transaction_type']))) ?></span></td>
                    <td><?= htmlspecialchars(ucwords(str_replace('_', ' ', $t['category']))) ?></td>
                    <td><?= htmlspecialchars($t['description']) ?></td>
                    <td><?= $t['payment_method'] ? htmlspecialchars(strtoupper($t['payment_method'])) : '—' ?></td>
                    <td>
                        <?php if (!empty($t['journal_entry_id'])): ?>
                            <a href="/accounting/general-ledger" title="View in General Ledger"><code>GL Linked</code></a>
                        <?php else: ?>
                            <span class="text-muted">—</span>
                        <?php endif; ?>
                    </td>
                    <td><?= $isCharge ? '$' . number_format($t['amount_cents'] / 100, 2) : '—' ?></td>
                    <td><?= $isPayment ? '<span class="text-success font-bold">$' . number_format($t['amount_cents'] / 100, 2) . '</span>' : '—' ?></td>
                    <td><strong>$<?= number_format($running / 100, 2) ?></strong></td>
                </tr>
                <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>

<!-- Modal: Post Payment -->
<dialog id="postPaymentModal" class="modal">
    <form method="POST" action="/accounting/ledger-detail?lease_id=<?= urlencode($leaseId) ?>" class="modal-box">
        <?= CSRF::field() ?>
        <input type="hidden" name="action" value="post_payment">
        <div class="modal-header">
            <h3>Post Tenant Payment</h3>
            <button type="button" class="btn-close" onclick="document.getElementById('postPaymentModal').close()">✕</button>
        </div>
        <div class="modal-body">
            <div class="form-row">
                <div class="form-group col-6">
                    <label class="form-label" for="amount">Payment Amount ($) *</label>
                    <input class="form-input" type="number" id="amount" name="amount" step="0.01" required value="<?= number_format(max(0, ($balance['balanceCents'] ?? 0)) / 100, 2, '.', '') ?>">
                </div>
                <div class="form-group col-6">
                    <label class="form-label" for="payment_date">Payment Date *</label>
                    <input class="form-input" type="date" id="payment_date" name="transaction_date" required value="<?= date('Y-m-d') ?>">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group col-6">
                    <label class="form-label" for="payment_method">Payment Method *</label>
                    <select class="form-select" id="payment_method" name="payment_method" required>
                        <option value="zelle">Zelle</option>
                        <option value="ach">ACH / Bank Transfer</option>
                        <option value="check">Paper Check</option>
                        <option value="cash">Cash</option>
                        <option value="credit_card">Credit Card</option>
                        <option value="direct_deposit">Direct Deposit</option>
                    </select>
                </div>
                <div class="form-group col-6">
                    <label class="form-label" for="reference_number">Check # / Confirmation #</label>
                    <input class="form-input" type="text" id="reference_number" name="reference_number" placeholder="e.g. ZL-847291">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label" for="description">Description</label>
                <input class="form-input" type="text" id="description" name="description" value="Monthly Rent Payment">
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('postPaymentModal').close()">Cancel</button>
            <button type="submit" class="btn btn-primary">Record Payment</button>
        </div>
    </form>
</dialog>

<!-- Modal: Move-Out Deposit Disposition -->
<dialog id="depositDispModal" class="modal">
    <form method="POST" action="/accounting/ledger-detail?lease_id=<?= urlencode($leaseId) ?>" class="modal-box">
        <?= CSRF::field() ?>
        <input type="hidden" name="action" value="deposit_disposition">
        <div class="modal-header">
            <h3>Move-Out Security Deposit Disposition</h3>
            <button type="button" class="btn-close" onclick="document.getElementById('depositDispModal').close()">✕</button>
        </div>
        <div class="modal-body">
            <p><strong>Deposit Held in Trust:</strong> $<?= number_format(($lease['deposit_held_cents'] ?? 0) / 100, 2) ?></p>
            <p><strong>Unpaid Rent Balance:</strong> $<?= number_format(max(0, ($balance['balanceCents'] ?? 0)) / 100, 2) ?></p>
            <hr style="margin: 1rem 0; border: 0; border-top: 1px solid var(--border-color);">
            <div class="form-group">
                <label class="form-label" for="damage_description">Itemized Damage / Repair Deduction</label>
                <input class="form-input" type="text" id="damage_description" name="damage_description" placeholder="e.g. Carpet deep cleaning & wall patching">
            </div>
            <div class="form-group">
                <label class="form-label" for="damage_amount">Deduction Amount ($)</label>
                <input class="form-input" type="number" id="damage_amount" name="damage_amount" step="0.01" placeholder="0.00">
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('depositDispModal').close()">Cancel</button>
            <button type="submit" class="btn btn-danger">Finalize Disposition & Close Lease</button>
        </div>
    </form>
</dialog>


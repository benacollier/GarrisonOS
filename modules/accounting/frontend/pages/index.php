<?php
// Accounting Module - Ledger Transactions Index
$pageTitle = 'Accounting & Ledger';

$typeFilter = $_GET['type'] ?? '';
$categoryFilter = $_GET['category'] ?? '';
$transactions = [];
$properties = [];
$error = null;

try {
    $params = [];
    if ($typeFilter) $params['transaction_type'] = $typeFilter;
    if ($categoryFilter) $params['category'] = $categoryFilter;
    $url = '/api/v1/accounting/transactions' . (!empty($params) ? '?' . http_build_query($params) : '');
    $res = $api->get($url);
    $transactions = $res['data']['transactions'] ?? [];

    $propRes = $api->get('/api/v1/properties');
    $properties = $propRes['data']['properties'] ?? [];
} catch (Exception $e) {
    $error = $e->getMessage();
}

// Handle Record Transaction Submission
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'create_transaction') {
    CSRF::validate();
    try {
        $amountCents = (int)(round((float)($_POST['amount'] ?? 0) * 100));
        $txDate = strtotime($_POST['transaction_date'] ?? date('Y-m-d')) * 1000;

        $api->post('/api/v1/accounting/transactions', [
            'transaction_type' => $_POST['transaction_type'] ?? 'payment',
            'category' => $_POST['category'] ?? 'rent',
            'amount_cents' => $amountCents,
            'transaction_date' => $txDate,
            'description' => $_POST['description'] ?? '',
            'payment_method' => !empty($_POST['payment_method']) ? $_POST['payment_method'] : null,
            'reference_number' => !empty($_POST['reference_number']) ? $_POST['reference_number'] : null,
            'property_id' => !empty($_POST['property_id']) ? $_POST['property_id'] : null
        ]);

        Flash::set('success', 'Transaction successfully recorded');
        header('Location: /accounting');
        exit;
    } catch (Exception $e) {
        $error = $e->getMessage();
    }
}
?>

<div class="page-header">
    <div>
        <h1 class="page-title">Financial Ledger</h1>
        <p class="page-subtitle">Cash-basis income, expenses, and tenant transactions.</p>
    </div>
    <div class="btn-group">
        <button class="btn btn-primary" onclick="document.getElementById('addTxModal').showModal()">+ Record Transaction</button>
        <a href="/accounting/rent-roll" class="btn btn-secondary">Rent Roll</a>
        <a href="/accounting/schedule-e" class="btn btn-secondary">Schedule E</a>
    </div>
</div>

<!-- Filters Bar -->
<div class="filter-bar card">
    <div class="filter-pills">
        <a href="/accounting" class="filter-pill <?= !$typeFilter ? 'active' : '' ?>">All</a>
        <a href="/accounting?type=payment" class="filter-pill <?= $typeFilter === 'payment' ? 'active' : '' ?>">Payments</a>
        <a href="/accounting?type=charge" class="filter-pill <?= $typeFilter === 'charge' ? 'active' : '' ?>">Charges</a>
        <a href="/accounting?type=expense" class="filter-pill <?= $typeFilter === 'expense' ? 'active' : '' ?>">Expenses</a>
        <a href="/accounting?type=deposit_inflow" class="filter-pill <?= $typeFilter === 'deposit_inflow' ? 'active' : '' ?>">Deposits</a>
    </div>
</div>

<div class="card">
    <div class="table-responsive">
        <table class="data-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Payment Method</th>
                    <th>Amount</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($transactions)): ?>
                <tr>
                    <td colspan="6" class="text-center text-muted">No transactions matching criteria.</td>
                </tr>
                <?php else: ?>
                <?php foreach ($transactions as $t): ?>
                <tr>
                    <td><?= date('M j, Y', $t['transaction_date'] / 1000) ?></td>
                    <td>
                        <?php
                            $badgeClass = match ($t['transaction_type']) {
                                'payment' => 'badge-success',
                                'charge' => 'badge-warning',
                                'expense' => 'badge-danger',
                                default => 'badge-info'
                            };
                        ?>
                        <span class="badge <?= $badgeClass ?>"><?= htmlspecialchars(ucwords(str_replace('_', ' ', $t['transaction_type']))) ?></span>
                    </td>
                    <td><?= htmlspecialchars(ucwords(str_replace('_', ' ', $t['category']))) ?></td>
                    <td><?= htmlspecialchars($t['description']) ?></td>
                    <td><?= $t['payment_method'] ? htmlspecialchars(strtoupper($t['payment_method'])) : '—' ?></td>
                    <td>
                        <?php if ($t['transaction_type'] === 'payment' || $t['transaction_type'] === 'deposit_inflow'): ?>
                            <span class="text-success font-bold">+$<?= number_format($t['amount_cents'] / 100, 2) ?></span>
                        <?php elseif ($t['transaction_type'] === 'expense'): ?>
                            <span class="text-danger font-bold">-$<?= number_format($t['amount_cents'] / 100, 2) ?></span>
                        <?php else: ?>
                            <span class="font-bold">$<?= number_format($t['amount_cents'] / 100, 2) ?></span>
                        <?php endif; ?>
                    </td>
                </tr>
                <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>

<!-- Modal: Record Transaction -->
<dialog id="addTxModal" class="modal">
    <form method="POST" action="/accounting" class="modal-box">
        <?= CSRF::field() ?>
        <input type="hidden" name="action" value="create_transaction">
        <div class="modal-header">
            <h3>Record Transaction</h3>
            <button type="button" class="btn-close" onclick="document.getElementById('addTxModal').close()">✕</button>
        </div>
        <div class="modal-body">
            <div class="form-row">
                <div class="form-group col-6">
                    <label class="form-label" for="transaction_type">Type *</label>
                    <select class="form-select" id="transaction_type" name="transaction_type" required>
                        <option value="payment">Payment Received (Income)</option>
                        <option value="expense">Operating Expense (Outflow)</option>
                        <option value="charge">Charge Invoiced (Owed)</option>
                        <option value="deposit_inflow">Security Deposit Trust Inflow</option>
                    </select>
                </div>
                <div class="form-group col-6">
                    <label class="form-label" for="category">Category *</label>
                    <select class="form-select" id="category" name="category" required>
                        <optgroup label="Income">
                            <option value="rent">Rent</option>
                            <option value="late_fee">Late Fee</option>
                            <option value="pet_fee">Pet Fee</option>
                            <option value="utility_rebill">Utility Rebill</option>
                            <option value="security_deposit">Security Deposit</option>
                            <option value="other_income">Other Income</option>
                        </optgroup>
                        <optgroup label="Schedule E Expenses">
                            <option value="repairs">Repairs</option>
                            <option value="cleaning_maintenance">Cleaning & Maintenance</option>
                            <option value="utilities">Utilities</option>
                            <option value="property_taxes">Property Taxes</option>
                            <option value="insurance">Insurance</option>
                            <option value="management_fees">Management Fees</option>
                            <option value="mortgage_interest">Mortgage Interest</option>
                            <option value="supplies">Supplies</option>
                            <option value="legal_professional">Legal & Professional</option>
                            <option value="advertising">Advertising</option>
                            <option value="capital_improvement">Capital Improvement</option>
                        </optgroup>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group col-6">
                    <label class="form-label" for="amount">Amount ($) *</label>
                    <input class="form-input" type="number" id="amount" name="amount" step="0.01" required placeholder="0.00">
                </div>
                <div class="form-group col-6">
                    <label class="form-label" for="transaction_date">Date *</label>
                    <input class="form-input" type="date" id="transaction_date" name="transaction_date" required value="<?= date('Y-m-d') ?>">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label" for="description">Description *</label>
                <input class="form-input" type="text" id="description" name="description" required placeholder="e.g. September Rent Payment or Replaced Water Heater">
            </div>
            <div class="form-row">
                <div class="form-group col-6">
                    <label class="form-label" for="payment_method">Payment Method</label>
                    <select class="form-select" id="payment_method" name="payment_method">
                        <option value="">-- None / N/A --</option>
                        <option value="zelle">Zelle</option>
                        <option value="ach">ACH Transfer</option>
                        <option value="check">Paper Check</option>
                        <option value="cash">Cash</option>
                        <option value="credit_card">Credit Card</option>
                        <option value="direct_deposit">Direct Deposit</option>
                    </select>
                </div>
                <div class="form-group col-6">
                    <label class="form-label" for="reference_number">Ref # / Check #</label>
                    <input class="form-input" type="text" id="reference_number" name="reference_number" placeholder="e.g. #1048">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label" for="property_id">Associated Property</label>
                <select class="form-select" id="property_id" name="property_id">
                    <option value="">-- Portfolio Wide / None --</option>
                    <?php foreach ($properties as $p): ?>
                    <option value="<?= htmlspecialchars($p['id']) ?>"><?= htmlspecialchars($p['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('addTxModal').close()">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Transaction</button>
        </div>
    </form>
</dialog>


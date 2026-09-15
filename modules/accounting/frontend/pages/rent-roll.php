<?php
// Accounting Module - Portfolio Rent Roll
$pageTitle = 'Portfolio Rent Roll';

$rentRoll = [];
$summary = null;
$error = null;

try {
    $res = $api->get('/api/v1/accounting/rent-roll');
    $rentRoll = $res['data']['rentRoll'] ?? [];
    $summary = $res['data']['summary'] ?? null;
} catch (Exception $e) {
    $error = $e->getMessage();
}

// Handle Automated Rent Generation Trigger
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'generate_rent') {
    CSRF::validate();
    try {
        $genRes = $api->post('/api/v1/accounting/generate-rent-charges', [
            'month' => $_POST['target_month'] ?? date('Y-m')
        ]);
        $created = $genRes['data']['result']['chargesCreated'] ?? 0;
        Flash::set('success', "Generated {$created} rent charge(s) for the billing cycle");
        header('Location: /accounting/rent-roll');
        exit;
    } catch (Exception $e) {
        $error = $e->getMessage();
    }
}
?>

<div class="page-header">
    <div>
        <a href="/accounting" class="text-muted">← Back to Accounting</a>
        <h1 class="page-title">Portfolio Rent Roll</h1>
        <p class="page-subtitle">Itemized unit occupancy, monthly scheduled rent, and live tenant ledger balances.</p>
    </div>
    <div class="btn-group">
        <button class="btn btn-primary" onclick="document.getElementById('generateRentModal').showModal()">⚡ Run Monthly Billing</button>
        <a href="/api/v1/accounting/export/rent-roll.csv" class="btn btn-secondary" target="_blank">Export CSV</a>
    </div>
</div>

<?php if ($summary): ?>
<div class="metrics-grid">
    <div class="card metric-card">
        <div class="metric-label">Active Leases</div>
        <div class="metric-value"><?= (int)$summary['totalUnits'] ?></div>
    </div>
    <div class="card metric-card">
        <div class="metric-label">Scheduled Monthly Rent</div>
        <div class="metric-value text-success">$<?= number_format($summary['totalScheduledRentCents'] / 100, 2) ?></div>
    </div>
    <div class="card metric-card">
        <div class="metric-label">Total Outstanding Delinquency</div>
        <div class="metric-value <?= $summary['totalDelinquencyCents'] > 0 ? 'text-danger' : 'text-success' ?>">
            $<?= number_format($summary['totalDelinquencyCents'] / 100, 2) ?>
        </div>
    </div>
</div>
<?php endif; ?>

<div class="card">
    <div class="table-responsive">
        <table class="data-table">
            <thead>
                <tr>
                    <th>Property</th>
                    <th>Unit</th>
                    <th>Tenant</th>
                    <th>Status</th>
                    <th>Scheduled Rent</th>
                    <th>Deposit Held</th>
                    <th>Tenant Balance</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($rentRoll)): ?>
                <tr>
                    <td colspan="8" class="text-center text-muted">No active leases on rent roll.</td>
                </tr>
                <?php else: ?>
                <?php foreach ($rentRoll as $row): ?>
                <tr>
                    <td><strong><?= htmlspecialchars($row['property_name']) ?></strong></td>
                    <td>Unit <?= htmlspecialchars($row['unit_number']) ?></td>
                    <td><?= htmlspecialchars($row['tenant_name']) ?></td>
                    <td><span class="badge badge-success"><?= htmlspecialchars(ucfirst($row['status'])) ?></span></td>
                    <td>$<?= number_format($row['monthly_rent_cents'] / 100, 2) ?></td>
                    <td>$<?= number_format($row['deposit_held_cents'] / 100, 2) ?></td>
                    <td>
                        <?php if ($row['balance_cents'] > 0): ?>
                            <span class="text-danger font-bold">$<?= number_format($row['balance_cents'] / 100, 2) ?> Owed</span>
                        <?php elseif ($row['balance_cents'] < 0): ?>
                            <span class="text-success font-bold">$<?= number_format(abs($row['balance_cents']) / 100, 2) ?> Credit</span>
                        <?php else: ?>
                            <span class="text-muted">$0.00 Paid</span>
                        <?php endif; ?>
                    </td>
                    <td>
                        <a href="/accounting/ledger-detail?lease_id=<?= urlencode($row['lease_id']) ?>" class="btn btn-sm btn-secondary">Ledger</a>
                    </td>
                </tr>
                <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>

<!-- Modal: Run Monthly Billing -->
<dialog id="generateRentModal" class="modal">
    <form method="POST" action="/accounting/rent-roll" class="modal-box">
        <?= CSRF::field() ?>
        <input type="hidden" name="action" value="generate_rent">
        <div class="modal-header">
            <h3>Generate Monthly Rent Charges</h3>
            <button type="button" class="btn-close" onclick="document.getElementById('generateRentModal').close()">✕</button>
        </div>
        <div class="modal-body">
            <p>This will post monthly rent charges to the ledgers of all active leases for the selected billing month. Leases starting mid-month will have rent prorated automatically.</p>
            <div class="form-group" style="margin-top: 1rem;">
                <label class="form-label" for="target_month">Billing Month (YYYY-MM)</label>
                <input class="form-input" type="month" id="target_month" name="target_month" required value="<?= date('Y-m') ?>">
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('generateRentModal').close()">Cancel</button>
            <button type="submit" class="btn btn-primary">Generate Charges</button>
        </div>
    </form>
</dialog>

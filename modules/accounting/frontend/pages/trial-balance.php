<?php
// Accounting Module - Trial Balance Report
$pageTitle = 'Trial Balance';

$trialBalance = null;
$error = null;
$asOfDateInput = $_GET['as_of_date'] ?? date('Y-m-d');
$propertyIdInput = $_GET['property_id'] ?? '';

$asOfDateMs = strtotime($asOfDateInput . ' 23:59:59') * 1000;

try {
    $url = '/api/v1/accounting/trial-balance?as_of_date=' . $asOfDateMs;
    if (!empty($propertyIdInput)) {
        $url .= '&property_id=' . urlencode($propertyIdInput);
    }
    $res = $api->get($url);
    $trialBalance = $res['data']['trialBalance'] ?? null;
} catch (Exception $e) {
    $error = $e->getMessage();
}

$properties = [];
try {
    $propRes = $api->get('/api/v1/properties');
    $properties = $propRes['data']['properties'] ?? [];
} catch (Exception $e) {
    // Graceful fallback
}
?>

<div class="page-header">
    <div>
        <a href="/accounting" class="text-muted">← Back to Accounting</a>
        <h1 class="page-title">Trial Balance Report</h1>
        <p class="page-subtitle">Standard General Ledger verification report verifying that total debits equal total credits.</p>
    </div>
    <div class="actions">
        <a href="/accounting/general-ledger" class="btn btn-secondary">General Ledger View</a>
    </div>
</div>

<?php if ($error): ?>
    <div class="alert alert-danger" style="margin-bottom: var(--spacing-lg);">
        <?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?>
    </div>
<?php endif; ?>

<!-- Filter Bar -->
<div class="card" style="margin-bottom: var(--spacing-lg); padding: var(--spacing-md);">
    <form method="GET" action="/accounting/trial-balance" style="display: flex; gap: var(--spacing-md); align-items: flex-end; flex-wrap: wrap;">
        <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">As of Date</label>
            <input type="date" name="as_of_date" class="form-control" value="<?= htmlspecialchars($asOfDateInput, ENT_QUOTES, 'UTF-8') ?>">
        </div>
        <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Property Filter</label>
            <select name="property_id" class="form-control">
                <option value="">All Properties (Consolidated)</option>
                <?php foreach ($properties as $p): ?>
                    <option value="<?= htmlspecialchars($p['id'], ENT_QUOTES, 'UTF-8') ?>" <?= $propertyIdInput === $p['id'] ? 'selected' : '' ?>>
                        <?= htmlspecialchars($p['name'], ENT_QUOTES, 'UTF-8') ?>
                    </option>
                <?php endforeach; ?>
            </select>
        </div>
        <button type="submit" class="btn btn-primary">Filter</button>
        <a href="/accounting/trial-balance" class="btn btn-secondary">Reset</a>
    </form>
</div>

<!-- Ledger Status Banner -->
<?php if ($trialBalance): ?>
    <div class="card" style="margin-bottom: var(--spacing-lg); padding: var(--spacing-md); display: flex; justify-content: space-between; align-items: center;">
        <div>
            <span style="font-weight: 600; font-size: var(--font-size-base);">Ledger Invariant Status: </span>
            <?php if ($trialBalance['isBalanced']): ?>
                <span class="badge" style="background-color: var(--color-success, #10b981); color: white; padding: 4px 10px; border-radius: 4px;">Balanced (Zero-Sum Invariant Satisfied)</span>
            <?php else: ?>
                <span class="badge" style="background-color: var(--color-danger, #ef4444); color: white; padding: 4px 10px; border-radius: 4px;">Unbalanced Out-Of-Proof!</span>
            <?php endif; ?>
        </div>
        <div style="font-size: var(--font-size-sm); color: var(--color-text-muted);">
            Report generated for <strong><?= htmlspecialchars($asOfDateInput, ENT_QUOTES, 'UTF-8') ?></strong>
        </div>
    </div>

    <!-- Trial Balance Table -->
    <div class="card">
        <div class="table-responsive">
            <table class="table">
                <thead>
                    <tr>
                        <th style="width: 100px;">Account #</th>
                        <th>Account Name</th>
                        <th>Type</th>
                        <th style="text-align: right;">Total Debits</th>
                        <th style="text-align: right;">Total Credits</th>
                        <th style="text-align: right;">Net Balance</th>
                    </tr>
                </thead>
                <tbody>
                    <?php
                    $accounts = $trialBalance['accounts'] ?? [];
                    if (empty($accounts)):
                    ?>
                        <tr>
                            <td colspan="6" style="text-align: center; color: var(--color-text-muted); padding: var(--spacing-xl);">
                                No General Ledger entries found for this period.
                            </td>
                        </tr>
                    <?php else: ?>
                        <?php foreach ($accounts as $acc): ?>
                            <?php if ($acc['total_debit_cents'] === 0 && $acc['total_credit_cents'] === 0) continue; ?>
                            <tr>
                                <td><code><?= htmlspecialchars($acc['account_number'] ?? '—', ENT_QUOTES, 'UTF-8') ?></code></td>
                                <td style="font-weight: 500;"><?= htmlspecialchars($acc['account_name'], ENT_QUOTES, 'UTF-8') ?></td>
                                <td><span class="badge"><?= htmlspecialchars($acc['account_type'], ENT_QUOTES, 'UTF-8') ?></span></td>
                                <td style="text-align: right; font-family: monospace;">
                                    <?= $acc['total_debit_cents'] > 0 ? '$' . number_format($acc['total_debit_cents'] / 100, 2) : '—' ?>
                                </td>
                                <td style="text-align: right; font-family: monospace;">
                                    <?= $acc['total_credit_cents'] > 0 ? '$' . number_format($acc['total_credit_cents'] / 100, 2) : '—' ?>
                                </td>
                                <td style="text-align: right; font-weight: 600; font-family: monospace;">
                                    <?= '$' . number_format($acc['net_balance_cents'] / 100, 2) ?>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
                <tfoot>
                    <tr style="font-weight: 700; border-top: 2px solid var(--color-border);">
                        <td colspan="3" style="text-align: right;">Totals & Invariant Proof:</td>
                        <td style="text-align: right; font-family: monospace; font-size: var(--font-size-base);">
                            $<?= number_format(($trialBalance['totalDebitCents'] ?? 0) / 100, 2) ?>
                        </td>
                        <td style="text-align: right; font-family: monospace; font-size: var(--font-size-base);">
                            $<?= number_format(($trialBalance['totalCreditCents'] ?? 0) / 100, 2) ?>
                        </td>
                        <td style="text-align: right; font-family: monospace;">
                            <?php
                            $diff = abs(($trialBalance['totalDebitCents'] ?? 0) - ($trialBalance['totalCreditCents'] ?? 0));
                            if ($diff === 0): ?>
                                <span style="color: var(--color-success, #10b981);">$0.00 (In Balance)</span>
                            <?php else: ?>
                                <span style="color: var(--color-danger, #ef4444);">Out of Balance: $<?= number_format($diff / 100, 2) ?></span>
                            <?php endif; ?>
                        </td>
                    </tr>
                </tfoot>
            </table>
        </div>
    </div>
<?php endif; ?>


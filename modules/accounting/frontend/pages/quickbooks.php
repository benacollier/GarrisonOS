<?php
// Accounting Module - QuickBooks Integration & Export Center
$pageTitle = 'QuickBooks Integration & GL Export';

$error = null;
$preview = null;
$properties = [];
$summary = null;

// Query parameters for preview
$propertyId = $_GET['property_id'] ?? '';
$unexportedOnly = isset($_GET['unexported_only']) ? ($_GET['unexported_only'] === '1') : true;
$startDate = $_GET['start_date'] ?? '';
$endDate = $_GET['end_date'] ?? '';

try {
    // Fetch property list for filtering
    $propRes = $api->get('/api/v1/properties');
    $properties = $propRes['data']['properties'] ?? [];

    // Build preview query
    $queryParams = [];
    if (!empty($propertyId)) $queryParams['property_id'] = $propertyId;
    if ($unexportedOnly) $queryParams['unexported_only'] = 'true';
    if (!empty($startDate)) $queryParams['start_date'] = strtotime($startDate) * 1000;
    if (!empty($endDate)) $queryParams['end_date'] = strtotime($endDate . ' 23:59:59') * 1000;

    $previewRes = $api->get('/api/v1/accounting/quickbooks/preview?' . http_build_query($queryParams));
    $preview = $previewRes['data']['entries'] ?? [];
    $summary = $previewRes['data']['summary'] ?? null;
} catch (Exception $e) {
    $error = $e->getMessage();
}
?>

<div class="page-header">
    <div>
        <a href="/accounting" class="text-muted">← Back to Accounting</a>
        <h1 class="page-title">QuickBooks Integration & GL Export</h1>
        <p class="page-subtitle">Export balanced double-entry general ledger transactions to QuickBooks Online and QuickBooks Desktop.</p>
    </div>
    <div class="btn-group">
        <a href="/accounting/chart-of-accounts" class="btn btn-secondary">Manage Chart of Accounts</a>
    </div>
</div>

<?php if ($error): ?>
    <div class="alert alert-danger" style="margin-bottom: 1.5rem;">
        <strong>Error:</strong> <?= htmlspecialchars($error, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>
    </div>
<?php endif; ?>

<!-- Export Action Bar -->
<div class="card" style="margin-bottom: 2rem;">
    <div class="card-header">
        <h3 style="margin: 0; font-size: 1.1rem;">QuickBooks Export Profiles</h3>
    </div>
    <div class="card-body">
        <p class="text-muted" style="margin-bottom: 1.25rem;">
            Export transactions synthesized directly into double-entry debits and credits matching your Chart of Accounts and QuickBooks Classes.
        </p>
        <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
            <?php
            $exportQuery = http_build_query([
                'property_id' => $propertyId,
                'unexported_only' => $unexportedOnly ? 'true' : 'false',
                'start_date' => !empty($startDate) ? strtotime($startDate) * 1000 : null,
                'end_date' => !empty($endDate) ? strtotime($endDate . ' 23:59:59') * 1000 : null,
                'mark_exported' => 'true'
            ]);
            ?>
            <a href="/api/v1/accounting/export/quickbooks/qbo-journal.csv?<?= htmlspecialchars($exportQuery, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>" class="btn btn-primary" target="_blank">
                📥 Export QuickBooks Online (QBO) Journal CSV
            </a>
            <a href="/api/v1/accounting/export/quickbooks/desktop.iif?<?= htmlspecialchars($exportQuery, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>" class="btn btn-secondary" target="_blank">
                📥 Export QuickBooks Desktop (IIF)
            </a>
            <a href="/api/v1/accounting/export/quickbooks/bank-feed.qbo?<?= htmlspecialchars($exportQuery, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>" class="btn btn-secondary" target="_blank">
                📥 Export Web Connect Bank Feed (.QBO)
            </a>
        </div>
    </div>
</div>

<!-- Filter Bar -->
<div class="card" style="margin-bottom: 1.5rem;">
    <form method="GET" action="/accounting/quickbooks" style="display: flex; gap: 1rem; align-items: flex-end; flex-wrap: wrap; padding: 1rem;">
        <div class="form-group" style="margin: 0; min-width: 200px;">
            <label class="form-label">Filter Property (Class)</label>
            <select name="property_id" class="form-control">
                <option value="">All Properties</option>
                <?php foreach ($properties as $prop): ?>
                    <option value="<?= htmlspecialchars($prop['id'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>" <?= $propertyId === $prop['id'] ? 'selected' : '' ?>>
                        <?= htmlspecialchars($prop['name'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>
                    </option>
                <?php endforeach; ?>
            </select>
        </div>

        <div class="form-group" style="margin: 0;">
            <label class="form-label">Start Date</label>
            <input type="date" name="start_date" class="form-control" value="<?= htmlspecialchars($startDate, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>">
        </div>

        <div class="form-group" style="margin: 0;">
            <label class="form-label">End Date</label>
            <input type="date" name="end_date" class="form-control" value="<?= htmlspecialchars($endDate, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>">
        </div>

        <div class="form-group" style="margin: 0; display: flex; align-items: center; gap: 0.5rem; height: 38px;">
            <input type="checkbox" id="unexported_only" name="unexported_only" value="1" <?= $unexportedOnly ? 'checked' : '' ?>>
            <label for="unexported_only" style="margin: 0; cursor: pointer;">Unexported only</label>
        </div>

        <button type="submit" class="btn btn-secondary">Apply Filter</button>
        <a href="/accounting/quickbooks" class="btn btn-text">Reset</a>
    </form>
</div>

<!-- Metrics / Balance Verification -->
<?php if ($summary): ?>
<div class="metrics-grid" style="margin-bottom: 1.5rem;">
    <div class="card metric-card">
        <div class="metric-label">Transactions in Batch</div>
        <div class="metric-value"><?= (int)$summary['transactionCount'] ?></div>
    </div>
    <div class="card metric-card">
        <div class="metric-label">Synthesized Journal Entries</div>
        <div class="metric-value"><?= (int)$summary['entryCount'] ?></div>
    </div>
    <div class="card metric-card">
        <div class="metric-label">Total Debits</div>
        <div class="metric-value text-success">$<?= number_format($summary['totalDebitCents'] / 100, 2) ?></div>
    </div>
    <div class="card metric-card">
        <div class="metric-label">Total Credits</div>
        <div class="metric-value text-success">$<?= number_format($summary['totalCreditCents'] / 100, 2) ?></div>
    </div>
    <div class="card metric-card">
        <div class="metric-label">Balanced Check</div>
        <div class="metric-value <?= $summary['isBalanced'] ? 'text-success' : 'text-danger' ?>">
            <?= $summary['isBalanced'] ? '✓ Balanced (100%)' : '⚠ Out of Balance' ?>
        </div>
    </div>
</div>
<?php endif; ?>

<!-- Journal Entries Preview Table -->
<div class="card">
    <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; font-size: 1.1rem;">General Ledger Batch Preview</h3>
        <span class="badge badge-info"><?= count($preview) ?> Journal Entries Ready</span>
    </div>
    <div class="table-responsive">
        <table class="table">
            <thead>
                <tr>
                    <th>Date / Ref</th>
                    <th>Account & Number</th>
                    <th>Class (Property)</th>
                    <th>Name (Customer / Vendor)</th>
                    <th>Description</th>
                    <th style="text-align: right;">Debit ($)</th>
                    <th style="text-align: right;">Credit ($)</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($preview)): ?>
                    <tr>
                        <td colspan="7" class="text-center text-muted" style="padding: 2.5rem;">
                            No unexported accounting transactions match the selected filter.
                        </td>
                    </tr>
                <?php else: ?>
                    <?php foreach ($preview as $entry): ?>
                        <?php
                        $lines = $entry['lines'] ?? [];
                        $dateStr = date('Y-m-d', $entry['date_ms'] / 1000);
                        ?>
                        <?php foreach ($lines as $idx => $line): ?>
                            <tr style="<?= $idx === 0 ? 'border-top: 2px solid var(--border-color);' : '' ?>">
                                <td>
                                    <?php if ($idx === 0): ?>
                                        <strong><?= htmlspecialchars($dateStr, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></strong><br>
                                        <small class="text-muted"><?= htmlspecialchars($entry['reference_number'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></small>
                                    <?php endif; ?>
                                </td>
                                <td>
                                    <strong><?= htmlspecialchars($line['account_number'] ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></strong>
                                    <?= htmlspecialchars($line['account_name'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>
                                    <br><small class="text-muted"><?= htmlspecialchars($line['account_type'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></small>
                                </td>
                                <td>
                                    <span class="badge badge-secondary"><?= htmlspecialchars($line['class_name'] ?: 'General', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></span>
                                </td>
                                <td>
                                    <?= htmlspecialchars($line['entity_name'] ?: '-', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>
                                </td>
                                <td>
                                    <?= htmlspecialchars($line['description'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>
                                </td>
                                <td style="text-align: right; font-family: monospace;">
                                    <?= $line['debit_cents'] > 0 ? '$' . number_format($line['debit_cents'] / 100, 2) : '-' ?>
                                </td>
                                <td style="text-align: right; font-family: monospace;">
                                    <?= $line['credit_cents'] > 0 ? '$' . number_format($line['credit_cents'] / 100, 2) : '-' ?>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>

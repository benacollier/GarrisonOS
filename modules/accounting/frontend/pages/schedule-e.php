<?php
// Accounting Module - IRS Schedule E Tax Report
$pageTitle = 'IRS Schedule E Tax Summary';

$selectedYear = isset($_GET['year']) ? (int)$_GET['year'] : (int)date('Y');
$selectedProperty = $_GET['property_id'] ?? '';

$report = null;
$properties = [];
$error = null;

try {
    $params = ['year' => $selectedYear];
    if ($selectedProperty) $params['property_id'] = $selectedProperty;

    $url = '/api/v1/accounting/schedule-e?' . http_build_query($params);
    $res = $api->get($url);
    $report = $res['data']['report'] ?? null;

    $propRes = $api->get('/api/v1/properties');
    $properties = $propRes['data']['properties'] ?? [];
} catch (Exception $e) {
    $error = $e->getMessage();
}
?>

<div class="page-header">
    <div>
        <a href="/accounting" class="text-muted">← Back to Accounting</a>
        <h1 class="page-title">IRS Schedule E Tax Summary (<?= $selectedYear ?>)</h1>
        <p class="page-subtitle">Cash-basis net operating income, rental income, and categorized operating expenses.</p>
    </div>
    <div class="btn-group">
        <a href="/api/v1/accounting/export/schedule-e.csv?year=<?= $selectedYear ?>" class="btn btn-secondary" target="_blank">Export Schedule E CSV</a>
    </div>
</div>

<!-- Year & Property Filter -->
<div class="filter-bar card">
    <form method="GET" action="/accounting/schedule-e" style="display:flex; gap:1rem; align-items:center; flex-wrap:wrap;">
        <div class="form-group" style="margin-bottom:0;">
            <label class="form-label" style="display:inline-block; margin-right:0.5rem;" for="year">Tax Year:</label>
            <select class="form-select form-input-sm" id="year" name="year" onchange="this.form.submit()">
                <?php for ($y = (int)date('Y'); $y >= (int)date('Y') - 5; $y--): ?>
                    <option value="<?= $y ?>" <?= $y === $selectedYear ? 'selected' : '' ?>><?= $y ?></option>
                <?php endfor; ?>
            </select>
        </div>
        <div class="form-group" style="margin-bottom:0;">
            <label class="form-label" style="display:inline-block; margin-right:0.5rem;" for="property_id">Property:</label>
            <select class="form-select form-input-sm" id="property_id" name="property_id" onchange="this.form.submit()">
                <option value="">-- All Properties Combined --</option>
                <?php foreach ($properties as $p): ?>
                    <option value="<?= htmlspecialchars($p['id']) ?>" <?= $selectedProperty === $p['id'] ? 'selected' : '' ?>><?= htmlspecialchars($p['name']) ?></option>
                <?php endforeach; ?>
            </select>
        </div>
    </form>
</div>

<?php if ($report): ?>
<div class="metrics-grid">
    <div class="card metric-card">
        <div class="metric-label">Total Rental Income</div>
        <div class="metric-value text-success">$<?= number_format($report['totalIncomeCents'] / 100, 2) ?></div>
        <div class="metric-subtitle">Cash collected in <?= $selectedYear ?></div>
    </div>
    <div class="card metric-card">
        <div class="metric-label">Operating Expenses</div>
        <div class="metric-value text-danger">$<?= number_format($report['totalOperatingExpenseCents'] / 100, 2) ?></div>
        <div class="metric-subtitle">Deductible operating costs</div>
    </div>
    <div class="card metric-card">
        <div class="metric-label">Net Operating Income (NOI)</div>
        <div class="metric-value <?= $report['netOperatingIncomeCents'] >= 0 ? 'text-success' : 'text-danger' ?>">
            $<?= number_format($report['netOperatingIncomeCents'] / 100, 2) ?>
        </div>
        <div class="metric-subtitle">Pre-tax cash flow</div>
    </div>
</div>

<div class="grid-2-col">
    <!-- Income Breakdown -->
    <div class="card">
        <div class="card-header">
            <h2 class="card-title">Income Sources</h2>
        </div>
        <div class="table-responsive">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Category</th>
                        <th class="text-right">Total ($)</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($report['incomeByCategory'])): ?>
                    <tr>
                        <td colspan="2" class="text-center text-muted">No income recorded for this period.</td>
                    </tr>
                    <?php else: ?>
                    <?php foreach ($report['incomeByCategory'] as $cat => $cents): ?>
                    <tr>
                        <td><?= htmlspecialchars(ucwords(str_replace('_', ' ', $cat))) ?></td>
                        <td class="text-right font-bold text-success">$<?= number_format($cents / 100, 2) ?></td>
                    </tr>
                    <?php endforeach; ?>
                    <tr style="border-top: 2px solid var(--border-color);">
                        <td><strong>Total Income</strong></td>
                        <td class="text-right font-bold text-success"><strong>$<?= number_format($report['totalIncomeCents'] / 100, 2) ?></strong></td>
                    </tr>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>

    <!-- Expense Breakdown -->
    <div class="card">
        <div class="card-header">
            <h2 class="card-title">IRS Schedule E Expense Categories</h2>
        </div>
        <div class="table-responsive">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Line Item Category</th>
                        <th class="text-right">Total ($)</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($report['expenseByCategory'])): ?>
                    <tr>
                        <td colspan="2" class="text-center text-muted">No expenses recorded for this period.</td>
                    </tr>
                    <?php else: ?>
                    <?php foreach ($report['expenseByCategory'] as $cat => $cents): ?>
                    <tr>
                        <td><?= htmlspecialchars(ucwords(str_replace('_', ' ', $cat))) ?></td>
                        <td class="text-right font-bold text-danger">$<?= number_format($cents / 100, 2) ?></td>
                    </tr>
                    <?php endforeach; ?>
                    <tr style="border-top: 2px solid var(--border-color);">
                        <td><strong>Total Operating Expenses</strong></td>
                        <td class="text-right font-bold text-danger"><strong>$<?= number_format($report['totalOperatingExpenseCents'] / 100, 2) ?></strong></td>
                    </tr>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>
<?php endif; ?>

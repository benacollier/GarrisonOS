<?php
$pageTitle = 'Executive Dashboard';

$dashboardCards = HookRegistry::getDashboardCards($api);
$recentTransactions = [];
$openWorkOrders = [];

try {
    $batch = $api->batch([
        '/api/v1/accounting/transactions?limit=5',
        '/api/v1/maintenance/work-orders?status=open'
    ]);
    $txRes = $batch['/api/v1/accounting/transactions?limit=5'] ?? [];
    $recentTransactions = array_slice($txRes['data']['transactions'] ?? [], 0, 5);

    $woRes = $batch['/api/v1/maintenance/work-orders?status=open'] ?? [];
    $openWorkOrders = array_slice($woRes['data']['workOrders'] ?? [], 0, 5);
} catch (Exception $e) {
    // Graceful error display
}
?>

<div class="page-header">
    <div>
        <h1 class="page-title">Portfolio Overview</h1>
        <p class="page-subtitle">Real-time occupancy, financial health, and operational status.</p>
    </div>
    <div class="btn-group">
        <a href="/accounting/rent-roll" class="btn btn-secondary">Rent Roll</a>
        <a href="/maintenance" class="btn btn-primary">+ Maintenance Ticket</a>
    </div>
</div>

<!-- Dynamic Hook Dashboard Cards -->
<div class="metrics-grid">
    <?php if (empty($dashboardCards)): ?>
        <div class="card metric-card">
            <div class="metric-label">System Status</div>
            <div class="metric-value text-success">Active</div>
            <div class="metric-subtitle">GarrisonOS Core Engine online</div>
        </div>
    <?php else: ?>
        <?php foreach ($dashboardCards as $card): ?>
            <div class="card metric-card">
                <div class="metric-label"><?= htmlspecialchars((string)$card['title'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></div>
                <div class="metric-value"><?= htmlspecialchars((string)$card['value'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></div>
                <?php if (!empty($card['subtitle'])): ?>
                    <div class="metric-subtitle"><?= htmlspecialchars((string)$card['subtitle'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></div>
                <?php endif; ?>
            </div>
        <?php endforeach; ?>
    <?php endif; ?>
</div>

<div class="grid-2-col">
    <!-- Recent Financial Activity -->
    <div class="card">
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
            <h2 class="card-title">Recent Cash Activity</h2>
            <a href="/accounting" class="btn btn-sm btn-secondary">View All</a>
        </div>
        <div class="table-responsive">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Description</th>
                        <th>Amount</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($recentTransactions)): ?>
                    <tr>
                        <td colspan="4" class="text-center text-muted">No recent transactions recorded.</td>
                    </tr>
                    <?php else: ?>
                    <?php foreach ($recentTransactions as $tx): ?>
                    <tr>
                        <td><?= date('M j', (int)($tx['transaction_date'] / 1000)) ?></td>
                        <td><span class="badge"><?= htmlspecialchars(ucfirst((string)$tx['transaction_type']), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></span></td>
                        <td><?= htmlspecialchars((string)$tx['description'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></td>
                        <td>
                            <?php if ($tx['transaction_type'] === 'payment'): ?>
                                <span class="text-success font-bold">+$<?= number_format($tx['amount_cents'] / 100, 2) ?></span>
                            <?php elseif ($tx['transaction_type'] === 'expense'): ?>
                                <span class="text-danger font-bold">-$<?= number_format($tx['amount_cents'] / 100, 2) ?></span>
                            <?php else: ?>
                                <span>$<?= number_format($tx['amount_cents'] / 100, 2) ?></span>
                            <?php endif; ?>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>

    <!-- Active Work Orders -->
    <div class="card">
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
            <h2 class="card-title">Pending Repairs</h2>
            <a href="/maintenance" class="btn btn-sm btn-secondary">View All</a>
        </div>
        <div class="table-responsive">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Issue</th>
                        <th>Property</th>
                        <th>Priority</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($openWorkOrders)): ?>
                    <tr>
                        <td colspan="4" class="text-center text-muted">No open work orders pending.</td>
                    </tr>
                    <?php else: ?>
                    <?php foreach ($openWorkOrders as $wo): ?>
                    <tr>
                        <td><strong><?= htmlspecialchars((string)$wo['title'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></strong></td>
                        <td><?= htmlspecialchars((string)$wo['property_name'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></td>
                        <td>
                            <span class="badge badge-<?= $wo['priority'] === 'emergency' ? 'danger' : 'warning' ?>">
                                <?= htmlspecialchars(ucfirst((string)$wo['priority']), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>
                            </span>
                        </td>
                        <td><a href="/maintenance/show?id=<?= urlencode((string)$wo['id']) ?>" class="btn btn-sm btn-secondary">Review</a></td>
                    </tr>
                    <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>

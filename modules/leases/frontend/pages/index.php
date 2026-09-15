<?php
// Leases Module - Index Page
$pageTitle = 'Lease Agreements';

$statusFilter = $_GET['status'] ?? '';
$leases = [];
$properties = [];
$contacts = [];
$error = null;

try {
    $params = [];
    if ($statusFilter) $params['status'] = $statusFilter;
    $url = '/api/v1/leases' . (!empty($params) ? '?' . http_build_query($params) : '');
    $res = $api->get($url);
    $leases = $res['data']['leases'] ?? [];

    $propRes = $api->get('/api/v1/properties/units');
    $units = $propRes['data']['units'] ?? [];

    $contRes = $api->get('/api/v1/contacts?type=tenant');
    $contacts = $contRes['data']['contacts'] ?? [];
} catch (Exception $e) {
    $error = $e->getMessage();
}

// Handle Add Lease
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'create_lease') {
    CSRF::validate();
    try {
        $startDate = strtotime($_POST['start_date'] ?? '') * 1000;
        $endDate = strtotime($_POST['end_date'] ?? '') * 1000;
        $rentCents = (int)(round((float)($_POST['rent_amount'] ?? 0) * 100));
        $depositCents = (int)(round((float)($_POST['security_deposit'] ?? 0) * 100));

        $contactsPayload = [];
        if (!empty($_POST['contact_id'])) {
            $contactsPayload[] = [
                'contact_id' => $_POST['contact_id'],
                'role' => 'primary_tenant',
                'is_financially_responsible' => true
            ];
        }

        $api->post('/api/v1/leases', [
            'unit_id' => $_POST['unit_id'] ?? '',
            'status' => $_POST['status'] ?? 'active',
            'start_date' => $startDate,
            'end_date' => $endDate,
            'rent_amount_cents' => $rentCents,
            'security_deposit_cents' => $depositCents,
            'deposit_held_cents' => $depositCents,
            'rent_due_day' => (int)($_POST['rent_due_day'] ?? 1),
            'late_fee_grace_days' => (int)($_POST['late_fee_grace_days'] ?? 5),
            'late_fee_amount_cents' => (int)(round((float)($_POST['late_fee_amount'] ?? 50) * 100)),
            'contacts' => $contactsPayload
        ]);

        Flash::set('success', 'Lease agreement created successfully');
        header('Location: /leases');
        exit;
    } catch (Exception $e) {
        $error = $e->getMessage();
    }
}
?>

<div class="page-header">
    <div>
        <h1 class="page-title">Lease Agreements</h1>
        <p class="page-subtitle">Track lease contracts, rent amounts, terms, and occupants.</p>
    </div>
    <button class="btn btn-primary" onclick="document.getElementById('addLeaseModal').showModal()">+ New Lease</button>
</div>

<!-- Filters Bar -->
<div class="filter-bar card">
    <div class="filter-pills">
        <a href="/leases" class="filter-pill <?= !$statusFilter ? 'active' : '' ?>">All</a>
        <a href="/leases?status=active" class="filter-pill <?= $statusFilter === 'active' ? 'active' : '' ?>">Active</a>
        <a href="/leases?status=draft" class="filter-pill <?= $statusFilter === 'draft' ? 'active' : '' ?>">Draft</a>
        <a href="/leases?status=month_to_month" class="filter-pill <?= $statusFilter === 'month_to_month' ? 'active' : '' ?>">Month-to-Month</a>
        <a href="/leases?status=expiring" class="filter-pill <?= $statusFilter === 'expiring' ? 'active' : '' ?>">Expiring</a>
        <a href="/leases?status=terminated" class="filter-pill <?= $statusFilter === 'terminated' ? 'active' : '' ?>">Terminated</a>
    </div>
</div>

<div class="card">
    <div class="table-responsive">
        <table class="data-table">
            <thead>
                <tr>
                    <th>Property / Unit</th>
                    <th>Status</th>
                    <th>Term Dates</th>
                    <th>Monthly Rent</th>
                    <th>Deposit Held</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($leases)): ?>
                <tr>
                    <td colspan="6" class="text-center text-muted">No leases matching the selected criteria.</td>
                </tr>
                <?php else: ?>
                <?php foreach ($leases as $l): ?>
                <tr>
                    <td>
                        <strong><a href="/leases/show?id=<?= urlencode($l['id']) ?>"><?= htmlspecialchars($l['property_name'] ?? 'Property') ?></a></strong>
                        <div class="text-muted text-sm">Unit <?= htmlspecialchars($l['unit_number'] ?? '—') ?></div>
                    </td>
                    <td>
                        <?php
                            $statusClass = match ($l['status']) {
                                'active' => 'badge-success',
                                'expiring' => 'badge-warning',
                                'terminated' => 'badge-danger',
                                default => 'badge-info'
                            };
                        ?>
                        <span class="badge <?= $statusClass ?>"><?= htmlspecialchars(ucwords(str_replace('_', ' ', $l['status']))) ?></span>
                    </td>
                    <td>
                        <?= date('M j, Y', $l['start_date'] / 1000) ?> – <?= date('M j, Y', $l['end_date'] / 1000) ?>
                    </td>
                    <td><strong>$<?= number_format($l['rent_amount_cents'] / 100, 2) ?></strong>/mo</td>
                    <td>$<?= number_format($l['deposit_held_cents'] / 100, 2) ?></td>
                    <td>
                        <a href="/leases/show?id=<?= urlencode($l['id']) ?>" class="btn btn-sm btn-secondary">View Details</a>
                    </td>
                </tr>
                <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>

<!-- Modal: New Lease -->
<dialog id="addLeaseModal" class="modal">
    <form method="POST" action="/leases" class="modal-box">
        <?= CSRF::field() ?>
        <input type="hidden" name="action" value="create_lease">
        <div class="modal-header">
            <h3>Create Lease Agreement</h3>
            <button type="button" class="btn-close" onclick="document.getElementById('addLeaseModal').close()">✕</button>
        </div>
        <div class="modal-body">
            <div class="form-row">
                <div class="form-group col-6">
                    <label class="form-label" for="unit_id">Select Unit *</label>
                    <select class="form-select" id="unit_id" name="unit_id" required>
                        <option value="">-- Choose Unit --</option>
                        <?php foreach ($units as $u): ?>
                        <option value="<?= htmlspecialchars($u['id']) ?>">Unit <?= htmlspecialchars($u['unit_number']) ?> (<?= htmlspecialchars($u['status']) ?>)</option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="form-group col-6">
                    <label class="form-label" for="contact_id">Primary Tenant</label>
                    <select class="form-select" id="contact_id" name="contact_id">
                        <option value="">-- Select Contact --</option>
                        <?php foreach ($contacts as $c): ?>
                        <option value="<?= htmlspecialchars($c['id']) ?>"><?= htmlspecialchars($c['last_name'] . ', ' . $c['first_name']) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group col-6">
                    <label class="form-label" for="start_date">Start Date *</label>
                    <input class="form-input" type="date" id="start_date" name="start_date" required value="<?= date('Y-m-01') ?>">
                </div>
                <div class="form-group col-6">
                    <label class="form-label" for="end_date">End Date *</label>
                    <input class="form-input" type="date" id="end_date" name="end_date" required value="<?= date('Y-m-t', strtotime('+11 months')) ?>">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group col-6">
                    <label class="form-label" for="rent_amount">Monthly Rent ($) *</label>
                    <input class="form-input" type="number" id="rent_amount" name="rent_amount" step="0.01" required placeholder="1500.00">
                </div>
                <div class="form-group col-6">
                    <label class="form-label" for="security_deposit">Security Deposit ($)</label>
                    <input class="form-input" type="number" id="security_deposit" name="security_deposit" step="0.01" placeholder="1500.00">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group col-4">
                    <label class="form-label" for="rent_due_day">Rent Due Day</label>
                    <input class="form-input" type="number" id="rent_due_day" name="rent_due_day" value="1" min="1" max="28">
                </div>
                <div class="form-group col-4">
                    <label class="form-label" for="late_fee_grace_days">Grace Days</label>
                    <input class="form-input" type="number" id="late_fee_grace_days" name="late_fee_grace_days" value="5">
                </div>
                <div class="form-group col-4">
                    <label class="form-label" for="late_fee_amount">Late Fee ($)</label>
                    <input class="form-input" type="number" id="late_fee_amount" name="late_fee_amount" value="50.00" step="0.01">
                </div>
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('addLeaseModal').close()">Cancel</button>
            <button type="submit" class="btn btn-primary">Create Agreement</button>
        </div>
    </form>
</dialog>


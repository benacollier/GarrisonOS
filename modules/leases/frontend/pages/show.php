<?php
// Leases Module - Lease Detail View & Signatories
$id = $_GET['id'] ?? '';
if (!$id) {
    header('Location: /leases');
    exit;
}

$lease = null;
$contacts = [];
$error = null;

try {
    $res = $api->get("/api/v1/leases/{$id}");
    $lease = $res['data']['lease'] ?? null;

    $contRes = $api->get('/api/v1/contacts');
    $contacts = $contRes['data']['contacts'] ?? [];
} catch (Exception $e) {
    $error = $e->getMessage();
}

if (!$lease) {
    echo "<div class='alert alert-danger'>Lease agreement not found.</div>";
    return;
}

$pageTitle = 'Lease Agreement: Unit ' . htmlspecialchars($lease['unit_number'] ?? '');

// Handle State Transitions and Adding Signatories
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    CSRF::validate();
    $action = $_POST['action'] ?? '';
    try {
        if ($action === 'activate_lease') {
            $api->post("/api/v1/leases/{$id}/activate", []);
            Flash::set('success', 'Lease activated successfully');
            header("Location: /leases/show?id=" . urlencode($id));
            exit;
        } elseif ($action === 'terminate_lease') {
            $api->post("/api/v1/leases/{$id}/terminate", []);
            Flash::set('success', 'Lease terminated');
            header("Location: /leases/show?id=" . urlencode($id));
            exit;
        } elseif ($action === 'add_signatory') {
            $api->post("/api/v1/leases/{$id}/contacts", [
                'contact_id' => $_POST['contact_id'] ?? '',
                'role' => $_POST['role'] ?? 'occupant',
                'is_financially_responsible' => isset($_POST['is_financially_responsible'])
            ]);
            Flash::set('success', 'Signatory added');
            header("Location: /leases/show?id=" . urlencode($id));
            exit;
        }
    } catch (Exception $e) {
        $error = $e->getMessage();
    }
}
?>

<div class="page-header">
    <div>
        <a href="/leases" class="text-muted">← Back to Leases</a>
        <h1 class="page-title"><?= htmlspecialchars($lease['property_name'] ?? 'Property') ?> – Unit <?= htmlspecialchars($lease['unit_number'] ?? '') ?></h1>
        <p class="page-subtitle">
            Status: <span class="badge badge-success"><?= htmlspecialchars(ucfirst($lease['status'])) ?></span> •
            Term: <?= date('M j, Y', $lease['start_date'] / 1000) ?> to <?= date('M j, Y', $lease['end_date'] / 1000) ?>
        </p>
    </div>
    <div class="btn-group">
        <a href="/accounting/ledger-detail?lease_id=<?= urlencode($id) ?>" class="btn btn-secondary">Tenant Ledger</a>
        <?php if ($lease['status'] === 'draft'): ?>
            <form method="POST" action="/leases/show?id=<?= urlencode($id) ?>" style="display:inline;">
                <?= CSRF::field() ?>
                <input type="hidden" name="action" value="activate_lease">
                <button type="submit" class="btn btn-primary">Activate Lease</button>
            </form>
        <?php elseif ($lease['status'] === 'active' || $lease['status'] === 'month_to_month'): ?>
            <form method="POST" action="/leases/show?id=<?= urlencode($id) ?>" style="display:inline;">
                <?= CSRF::field() ?>
                <input type="hidden" name="action" value="terminate_lease">
                <button type="submit" class="btn btn-danger" onclick="return confirm('Terminate this lease?')">Terminate Lease</button>
            </form>
        <?php endif; ?>
    </div>
</div>

<div class="grid-2-col">
    <div class="card">
        <div class="card-header">
            <h2 class="card-title">Financial Terms</h2>
        </div>
        <div class="detail-list">
            <div class="detail-item">
                <span class="detail-label">Monthly Rent</span>
                <span class="detail-value"><strong>$<?= number_format($lease['rent_amount_cents'] / 100, 2) ?></strong></span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Security Deposit Required</span>
                <span class="detail-value">$<?= number_format($lease['security_deposit_cents'] / 100, 2) ?></span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Deposit Held in Trust</span>
                <span class="detail-value">$<?= number_format($lease['deposit_held_cents'] / 100, 2) ?></span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Rent Due Day</span>
                <span class="detail-value">Day <?= (int)$lease['rent_due_day'] ?> of each month</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Late Fee Policy</span>
                <span class="detail-value">$<?= number_format($lease['late_fee_amount_cents'] / 100, 2) ?> after <?= (int)$lease['late_fee_grace_days'] ?> grace days</span>
            </div>
        </div>
    </div>

    <div class="card">
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
            <h2 class="card-title">Tenants & Occupants</h2>
            <button class="btn btn-sm btn-secondary" onclick="document.getElementById('addSignatoryModal').showModal()">+ Add Person</button>
        </div>
        <div class="table-responsive">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Role</th>
                        <th>Phone</th>
                        <th>Financial</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($lease['contacts'])): ?>
                    <tr>
                        <td colspan="4" class="text-center text-muted">No occupants assigned yet.</td>
                    </tr>
                    <?php else: ?>
                    <?php foreach ($lease['contacts'] as $sc): ?>
                    <tr>
                        <td><strong><a href="/contacts/show?id=<?= urlencode($sc['contact_id']) ?>"><?= htmlspecialchars($sc['last_name'] . ', ' . $sc['first_name']) ?></a></strong></td>
                        <td><span class="badge"><?= htmlspecialchars(ucwords(str_replace('_', ' ', $sc['role']))) ?></span></td>
                        <td><?= htmlspecialchars($sc['phone'] ?? '—') ?></td>
                        <td><?= $sc['is_financially_responsible'] ? '<span class="badge badge-success">Yes</span>' : '<span class="badge">No</span>' ?></td>
                    </tr>
                    <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>

<!-- Modal: Add Signatory -->
<dialog id="addSignatoryModal" class="modal">
    <form method="POST" action="/leases/show?id=<?= urlencode($id) ?>" class="modal-box">
        <?= CSRF::field() ?>
        <input type="hidden" name="action" value="add_signatory">
        <div class="modal-header">
            <h3>Add Person to Lease</h3>
            <button type="button" class="btn-close" onclick="document.getElementById('addSignatoryModal').close()">✕</button>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label class="form-label" for="signatory_contact_id">Select Contact *</label>
                <select class="form-select" id="signatory_contact_id" name="contact_id" required>
                    <option value="">-- Choose Contact --</option>
                    <?php foreach ($contacts as $c): ?>
                    <option value="<?= htmlspecialchars($c['id']) ?>"><?= htmlspecialchars($c['last_name'] . ', ' . $c['first_name']) ?> (<?= htmlspecialchars($c['contact_type']) ?>)</option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label" for="signatory_role">Role on Lease *</label>
                <select class="form-select" id="signatory_role" name="role" required>
                    <option value="primary_tenant">Primary Tenant</option>
                    <option value="co_tenant">Co-Tenant</option>
                    <option value="guarantor">Guarantor</option>
                    <option value="occupant">Occupant (Non-Signer)</option>
                </select>
            </div>
            <div class="form-group" style="display:flex; align-items:center; gap: 0.5rem;">
                <input type="checkbox" id="is_financially_responsible" name="is_financially_responsible" value="1" checked>
                <label for="is_financially_responsible">Financially Responsible for Rent</label>
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('addSignatoryModal').close()">Cancel</button>
            <button type="submit" class="btn btn-primary">Add to Agreement</button>
        </div>
    </form>
</dialog>


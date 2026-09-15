<?php
// Maintenance Module - Work Order Details & Workflow
$id = $_GET['id'] ?? '';
if (!$id) {
    header('Location: /maintenance');
    exit;
}

$workOrder = null;
$vendors = [];
$error = null;

try {
    $res = $api->get("/api/v1/maintenance/work-orders/{$id}");
    $workOrder = $res['data']['workOrder'] ?? null;

    $vendRes = $api->get('/api/v1/contacts?type=vendor');
    $vendors = $vendRes['data']['contacts'] ?? [];
} catch (Exception $e) {
    $error = $e->getMessage();
}

if (!$workOrder) {
    echo "<div class='alert alert-danger'>Work order not found.</div>";
    return;
}

$pageTitle = 'Work Order #' . substr($workOrder['id'], 0, 8);

// Handle Workflow Updates and Completion
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    CSRF::validate();
    $action = $_POST['action'] ?? '';
    try {
        if ($action === 'update_status') {
            $api->put("/api/v1/maintenance/work-orders/{$id}", [
                'status' => $_POST['status'] ?? 'open',
                'vendor_contact_id' => !empty($_POST['vendor_contact_id']) ? $_POST['vendor_contact_id'] : null
            ]);
            Flash::set('success', 'Work order status updated');
            header("Location: /maintenance/show?id=" . urlencode($id));
            exit;
        } elseif ($action === 'complete_order') {
            $costCents = (int)(round((float)($_POST['actual_cost'] ?? 0) * 100));
            $api->post("/api/v1/maintenance/work-orders/{$id}/complete", [
                'actual_cost_cents' => $costCents
            ]);
            Flash::set('success', 'Work order marked completed and expense recorded');
            header("Location: /maintenance/show?id=" . urlencode($id));
            exit;
        }
    } catch (Exception $e) {
        $error = $e->getMessage();
    }
}
?>

<div class="page-header">
    <div>
        <a href="/maintenance" class="text-muted">← Back to Work Orders</a>
        <h1 class="page-title"><?= htmlspecialchars($workOrder['title']) ?></h1>
        <p class="page-subtitle">
            Ticket #<?= substr($workOrder['id'], 0, 8) ?> •
            <?= htmlspecialchars($workOrder['property_name'] ?? 'Property') ?>
            <?php if (!empty($workOrder['unit_number'])): ?>
                (Unit <?= htmlspecialchars($workOrder['unit_number']) ?>)
            <?php endif; ?>
        </p>
    </div>
    <div class="btn-group">
        <?php if ($workOrder['status'] !== 'completed'): ?>
            <button class="btn btn-primary" onclick="document.getElementById('completeOrderModal').showModal()">✓ Complete & Record Cost</button>
        <?php else: ?>
            <span class="badge badge-success" style="padding: 0.5rem 1rem; font-size: 1rem;">Completed</span>
        <?php endif; ?>
    </div>
</div>

<div class="grid-2-col">
    <div class="card">
        <div class="card-header">
            <h2 class="card-title">Issue Details</h2>
        </div>
        <div class="detail-list">
            <div class="detail-item">
                <span class="detail-label">Status</span>
                <span class="detail-value">
                    <span class="badge badge-<?= $workOrder['status'] === 'completed' ? 'success' : 'info' ?>">
                        <?= htmlspecialchars(ucwords(str_replace('_', ' ', $workOrder['status']))) ?>
                    </span>
                </span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Priority</span>
                <span class="detail-value">
                    <span class="badge badge-<?= $workOrder['priority'] === 'emergency' ? 'danger' : 'info' ?>">
                        <?= htmlspecialchars(ucfirst($workOrder['priority'])) ?>
                    </span>
                </span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Trade / Category</span>
                <span class="detail-value"><?= htmlspecialchars(ucfirst($workOrder['category'])) ?></span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Permission to Enter</span>
                <span class="detail-value"><?= $workOrder['permission_to_enter'] ? 'Yes – Granted' : 'No – Requires Appointment' ?></span>
            </div>
            <?php if (!empty($workOrder['entry_instructions'])): ?>
            <div class="detail-item">
                <span class="detail-label">Entry Instructions</span>
                <span class="detail-value"><?= htmlspecialchars($workOrder['entry_instructions']) ?></span>
            </div>
            <?php endif; ?>
            <div class="detail-item">
                <span class="detail-label">Estimated Cost</span>
                <span class="detail-value">$<?= number_format($workOrder['estimated_cost_cents'] / 100, 2) ?></span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Actual Final Cost</span>
                <span class="detail-value font-bold text-danger">$<?= number_format($workOrder['actual_cost_cents'] / 100, 2) ?></span>
            </div>
        </div>
        <div style="margin-top: 1.5rem;">
            <strong>Description / Notes:</strong>
            <p style="margin-top: 0.5rem; line-height: 1.5;"><?= nl2br(htmlspecialchars($workOrder['description'])) ?></p>
        </div>
    </div>

    <div class="card">
        <div class="card-header">
            <h2 class="card-title">Dispatch & Workflow</h2>
        </div>
        <form method="POST" action="/maintenance/show?id=<?= urlencode($id) ?>">
            <?= CSRF::field() ?>
            <input type="hidden" name="action" value="update_status">
            <div class="form-group">
                <label class="form-label" for="status">Update Status</label>
                <select class="form-select" id="status" name="status">
                    <option value="open" <?= $workOrder['status'] === 'open' ? 'selected' : '' ?>>Open</option>
                    <option value="assigned" <?= $workOrder['status'] === 'assigned' ? 'selected' : '' ?>>Assigned to Vendor</option>
                    <option value="in_progress" <?= $workOrder['status'] === 'in_progress' ? 'selected' : '' ?>>In Progress</option>
                    <option value="on_hold" <?= $workOrder['status'] === 'on_hold' ? 'selected' : '' ?>>On Hold / Awaiting Parts</option>
                    <option value="completed" <?= $workOrder['status'] === 'completed' ? 'selected' : '' ?>>Completed</option>
                    <option value="cancelled" <?= $workOrder['status'] === 'cancelled' ? 'selected' : '' ?>>Cancelled</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label" for="vendor_contact_id">Assigned Vendor</label>
                <select class="form-select" id="vendor_contact_id" name="vendor_contact_id">
                    <option value="">-- None / Self Managed --</option>
                    <?php foreach ($vendors as $v): ?>
                    <option value="<?= htmlspecialchars($v['id']) ?>" <?= ($workOrder['vendor_contact_id'] ?? '') === $v['id'] ? 'selected' : '' ?>>
                        <?= htmlspecialchars($v['last_name'] . ', ' . $v['first_name']) ?>
                        <?= !empty($v['company_name']) ? ' (' . htmlspecialchars($v['company_name']) . ')' : '' ?>
                    </option>
                    <?php endforeach; ?>
                </select>
            </div>
            <button type="submit" class="btn btn-secondary">Update Status</button>
        </form>
    </div>
</div>

<!-- Modal: Complete Work Order -->
<dialog id="completeOrderModal" class="modal">
    <form method="POST" action="/maintenance/show?id=<?= urlencode($id) ?>" class="modal-box">
        <?= CSRF::field() ?>
        <input type="hidden" name="action" value="complete_order">
        <div class="modal-header">
            <h3>Complete Maintenance Work Order</h3>
            <button type="button" class="btn-close" onclick="document.getElementById('completeOrderModal').close()">✕</button>
        </div>
        <div class="modal-body">
            <p>Marking this work order as complete will record a repair operating expense under Schedule E in the property ledger if an actual cost is provided.</p>
            <div class="form-group" style="margin-top: 1rem;">
                <label class="form-label" for="actual_cost">Actual Invoice / Repair Cost ($) *</label>
                <input class="form-input" type="number" id="actual_cost" name="actual_cost" step="0.01" required value="<?= number_format($workOrder['estimated_cost_cents'] / 100, 2, '.', '') ?>">
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('completeOrderModal').close()">Cancel</button>
            <button type="submit" class="btn btn-primary">Complete & Post Expense</button>
        </div>
    </form>
</dialog>


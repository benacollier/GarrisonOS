<?php
// Properties Module - Property Detail & Units Matrix
$id = $_GET['id'] ?? '';
if (!$id) {
    header('Location: /properties');
    exit;
}

$property = null;
$units = [];
$error = null;

try {
    $res = $api->get("/api/v1/properties/{$id}");
    $property = $res['data']['property'] ?? null;
    $units = $res['data']['units'] ?? [];
} catch (Exception $e) {
    $error = $e->getMessage();
}

if (!$property) {
    echo "<div class='alert alert-danger'>Property not found.</div>";
    return;
}

$pageTitle = htmlspecialchars($property['name']);

// Handle Adding a Unit
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'create_unit') {
    CSRF::validate();
    try {
        $api->post('/api/v1/properties/units', [
            'property_id' => $id,
            'unit_number' => $_POST['unit_number'] ?? '',
            'status' => $_POST['status'] ?? 'vacant',
            'bedrooms' => (int)($_POST['bedrooms'] ?? 1),
            'bathrooms' => (float)($_POST['bathrooms'] ?? 1.0),
            'square_feet' => !empty($_POST['square_feet']) ? (int)$_POST['square_feet'] : null,
            'market_rent_cents' => (int)(round((float)($_POST['market_rent'] ?? 0) * 100)),
            'target_deposit_cents' => (int)(round((float)($_POST['target_deposit'] ?? 0) * 100))
        ]);
        Flash::set('success', 'Unit added successfully');
        header("Location: /properties/show?id=" . urlencode($id));
        exit;
    } catch (Exception $e) {
        $error = $e->getMessage();
    }
}
?>

<div class="page-header">
    <div>
        <a href="/properties" class="text-muted">← Back to Properties</a>
        <h1 class="page-title"><?= htmlspecialchars($property['name']) ?></h1>
        <p class="page-subtitle">
            <?= htmlspecialchars($property['address_line1']) ?>,
            <?= htmlspecialchars($property['city']) ?>, <?= htmlspecialchars($property['state']) ?> <?= htmlspecialchars($property['postal_code']) ?>
            • <span class="badge"><?= htmlspecialchars(ucwords(str_replace('_', ' ', $property['property_type']))) ?></span>
        </p>
    </div>
    <button class="btn btn-primary" onclick="document.getElementById('addUnitModal').showModal()">+ Add Unit</button>
</div>

<div class="card">
    <div class="card-header">
        <h2 class="card-title">Rentable Units (<?= count($units) ?>)</h2>
    </div>
    <div class="table-responsive">
        <table class="data-table">
            <thead>
                <tr>
                    <th>Unit #</th>
                    <th>Status</th>
                    <th>Bed / Bath</th>
                    <th>Sq Ft</th>
                    <th>Market Rent</th>
                    <th>Deposit</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($units)): ?>
                <tr>
                    <td colspan="6" class="text-center text-muted">No units configured for this property. Add a unit above.</td>
                </tr>
                <?php else: ?>
                <?php foreach ($units as $u): ?>
                <tr>
                    <td><strong>Unit <?= htmlspecialchars($u['unit_number']) ?></strong></td>
                    <td>
                        <?php
                            $statusClass = match ($u['status']) {
                                'occupied' => 'badge-success',
                                'vacant' => 'badge-warning',
                                'turnover', 'maintenance_hold' => 'badge-danger',
                                default => 'badge-info'
                            };
                        ?>
                        <span class="badge <?= $statusClass ?>"><?= htmlspecialchars(ucwords(str_replace('_', ' ', $u['status']))) ?></span>
                    </td>
                    <td><?= (int)$u['bedrooms'] ?> bd / <?= number_format($u['bathrooms'], 1) ?> ba</td>
                    <td><?= $u['square_feet'] ? number_format($u['square_feet']) . ' sqft' : '—' ?></td>
                    <td><strong>$<?= number_format($u['market_rent_cents'] / 100, 2) ?></strong>/mo</td>
                    <td>$<?= number_format(($u['target_deposit_cents'] ?? 0) / 100, 2) ?></td>
                </tr>
                <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>

<!-- Modal: Add Unit -->
<dialog id="addUnitModal" class="modal">
    <form method="POST" action="/properties/show?id=<?= urlencode($id) ?>" class="modal-box">
        <?= CSRF::field() ?>
        <input type="hidden" name="action" value="create_unit">
        <div class="modal-header">
            <h3>Add Unit to <?= htmlspecialchars($property['name']) ?></h3>
            <button type="button" class="btn-close" onclick="document.getElementById('addUnitModal').close()">✕</button>
        </div>
        <div class="modal-body">
            <div class="form-row">
                <div class="form-group col-6">
                    <label class="form-label" for="unit_number">Unit Number / Identifier *</label>
                    <input class="form-input" type="text" id="unit_number" name="unit_number" required placeholder="e.g. 101, A, Main">
                </div>
                <div class="form-group col-6">
                    <label class="form-label" for="status">Status</label>
                    <select class="form-select" id="status" name="status">
                        <option value="vacant">Vacant</option>
                        <option value="occupied">Occupied</option>
                        <option value="notice_given">Notice Given</option>
                        <option value="turnover">Turnover</option>
                        <option value="maintenance_hold">Maintenance Hold</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group col-4">
                    <label class="form-label" for="bedrooms">Bedrooms</label>
                    <input class="form-input" type="number" id="bedrooms" name="bedrooms" value="1" min="0" required>
                </div>
                <div class="form-group col-4">
                    <label class="form-label" for="bathrooms">Bathrooms</label>
                    <input class="form-input" type="number" id="bathrooms" name="bathrooms" value="1.0" step="0.5" min="0" required>
                </div>
                <div class="form-group col-4">
                    <label class="form-label" for="square_feet">Square Feet</label>
                    <input class="form-input" type="number" id="square_feet" name="square_feet" placeholder="e.g. 850">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group col-6">
                    <label class="form-label" for="market_rent">Market Monthly Rent ($) *</label>
                    <input class="form-input" type="number" id="market_rent" name="market_rent" step="0.01" required placeholder="1450.00">
                </div>
                <div class="form-group col-6">
                    <label class="form-label" for="target_deposit">Security Deposit Target ($)</label>
                    <input class="form-input" type="number" id="target_deposit" name="target_deposit" step="0.01" placeholder="1450.00">
                </div>
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('addUnitModal').close()">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Unit</button>
        </div>
    </form>
</dialog>


<?php
// Properties Module - Index Page (List Properties & Portfolios)
$pageTitle = 'Properties & Portfolios';

$error = null;
$properties = [];
$portfolios = [];
$metrics = null;

try {
    $propRes = $api->get('/api/v1/properties');
    $properties = $propRes['data']['properties'] ?? [];

    $portRes = $api->get('/api/v1/properties/portfolios');
    $portfolios = $portRes['data']['portfolios'] ?? [];

    $metricRes = $api->get('/api/v1/properties/metrics/occupancy');
    $metrics = $metricRes['data']['metrics'] ?? null;
} catch (Exception $e) {
    $error = $e->getMessage();
}

// Handle Form Submissions (Add Property)
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'create_property') {
    CSRF::validate();
    try {
        $api->post('/api/v1/properties', [
            'name' => $_POST['name'] ?? '',
            'property_type' => $_POST['property_type'] ?? 'single_family',
            'address_line1' => $_POST['address_line1'] ?? '',
            'city' => $_POST['city'] ?? '',
            'state' => $_POST['state'] ?? '',
            'postal_code' => $_POST['postal_code'] ?? '',
            'portfolio_id' => !empty($_POST['portfolio_id']) ? $_POST['portfolio_id'] : null,
            'year_built' => !empty($_POST['year_built']) ? (int)$_POST['year_built'] : null
        ]);
        Flash::set('success', 'Property successfully added');
        header('Location: /properties');
        exit;
    } catch (Exception $e) {
        $error = $e->getMessage();
    }
}
?>

<div class="page-header">
    <div>
        <h1 class="page-title">Properties</h1>
        <p class="page-subtitle">Manage physical buildings, residential units, and legal portfolios.</p>
    </div>
    <button class="btn btn-primary" onclick="document.getElementById('addPropertyModal').showModal()">+ Add Property</button>
</div>

<?php if ($metrics): ?>
<div class="metrics-grid">
    <div class="card metric-card">
        <div class="metric-label">Total Units</div>
        <div class="metric-value"><?= (int)$metrics['totalUnits'] ?></div>
    </div>
    <div class="card metric-card">
        <div class="metric-label">Occupancy Rate</div>
        <div class="metric-value"><?= number_format($metrics['occupancyRatePercentage'], 1) ?>%</div>
        <div class="metric-subtitle"><?= (int)$metrics['occupiedUnits'] ?> occupied / <?= (int)$metrics['vacantUnits'] ?> vacant</div>
    </div>
    <div class="card metric-card">
        <div class="metric-label">Total Market Rent</div>
        <div class="metric-value">$<?= number_format($metrics['totalMarketRentCents'] / 100, 2) ?></div>
        <div class="metric-subtitle">Monthly potential rent roll</div>
    </div>
</div>
<?php endif; ?>

<div class="card">
    <div class="card-header">
        <h2 class="card-title">All Properties (<?= count($properties) ?>)</h2>
    </div>
    <div class="table-responsive">
        <table class="data-table">
            <thead>
                <tr>
                    <th>Property Name</th>
                    <th>Type</th>
                    <th>Address</th>
                    <th>City, State</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($properties)): ?>
                <tr>
                    <td colspan="5" class="text-center text-muted">No properties found. Add your first property above.</td>
                </tr>
                <?php else: ?>
                <?php foreach ($properties as $prop): ?>
                <tr>
                    <td><strong><a href="/properties/show?id=<?= urlencode($prop['id']) ?>"><?= htmlspecialchars($prop['name']) ?></a></strong></td>
                    <td><span class="badge"><?= htmlspecialchars(ucwords(str_replace('_', ' ', $prop['property_type']))) ?></span></td>
                    <td><?= htmlspecialchars($prop['address_line1']) ?></td>
                    <td><?= htmlspecialchars($prop['city'] . ', ' . $prop['state'] . ' ' . $prop['postal_code']) ?></td>
                    <td>
                        <a href="/properties/show?id=<?= urlencode($prop['id']) ?>" class="btn btn-sm btn-secondary">View Units</a>
                    </td>
                </tr>
                <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>

<!-- Modal: Add Property -->
<dialog id="addPropertyModal" class="modal">
    <form method="POST" action="/properties" class="modal-box">
        <?= CSRF::field() ?>
        <input type="hidden" name="action" value="create_property">
        <div class="modal-header">
            <h3>Add New Property</h3>
            <button type="button" class="btn-close" onclick="document.getElementById('addPropertyModal').close()">✕</button>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label class="form-label" for="name">Property Name *</label>
                <input class="form-input" type="text" id="name" name="name" required placeholder="e.g. Maple Heights Duplex">
            </div>
            <div class="form-group">
                <label class="form-label" for="property_type">Property Type *</label>
                <select class="form-select" id="property_type" name="property_type" required>
                    <option value="single_family">Single Family</option>
                    <option value="multi_family">Multi Family</option>
                    <option value="condo">Condo</option>
                    <option value="townhouse">Townhouse</option>
                    <option value="commercial">Commercial</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label" for="address_line1">Street Address *</label>
                <input class="form-input" type="text" id="address_line1" name="address_line1" required placeholder="e.g. 1044 Elm Street">
            </div>
            <div class="form-row">
                <div class="form-group col-6">
                    <label class="form-label" for="city">City *</label>
                    <input class="form-input" type="text" id="city" name="city" required placeholder="Springfield">
                </div>
                <div class="form-group col-3">
                    <label class="form-label" for="state">State *</label>
                    <input class="form-input" type="text" id="state" name="state" required placeholder="IL" maxlength="2">
                </div>
                <div class="form-group col-3">
                    <label class="form-label" for="postal_code">Zip Code *</label>
                    <input class="form-input" type="text" id="postal_code" name="postal_code" required placeholder="62701">
                </div>
            </div>
            <?php if (!empty($portfolios)): ?>
            <div class="form-group">
                <label class="form-label" for="portfolio_id">Portfolio / Entity</label>
                <select class="form-select" id="portfolio_id" name="portfolio_id">
                    <option value="">-- No Portfolio Assigned --</option>
                    <?php foreach ($portfolios as $port): ?>
                    <option value="<?= htmlspecialchars($port['id']) ?>"><?= htmlspecialchars($port['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <?php endif; ?>
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('addPropertyModal').close()">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Property</button>
        </div>
    </form>
</dialog>

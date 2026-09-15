<?php
// Properties Module - Edit Property Page
$id = $_GET['id'] ?? '';
if (!$id) {
    header('Location: /properties');
    exit;
}

$property = null;
$portfolios = [];
$error = null;

try {
    $res = $api->get("/api/v1/properties/{$id}");
    $property = $res['data']['property'] ?? null;

    $portRes = $api->get('/api/v1/properties/portfolios');
    $portfolios = $portRes['data']['portfolios'] ?? [];
} catch (Exception $e) {
    $error = $e->getMessage();
}

if (!$property) {
    echo "<div class='alert alert-danger'>Property not found.</div>";
    return;
}

$pageTitle = 'Edit ' . htmlspecialchars($property['name']);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    CSRF::validate();
    try {
        $api->put("/api/v1/properties/{$id}", [
            'name' => $_POST['name'] ?? '',
            'property_type' => $_POST['property_type'] ?? 'single_family',
            'address_line1' => $_POST['address_line1'] ?? '',
            'city' => $_POST['city'] ?? '',
            'state' => $_POST['state'] ?? '',
            'postal_code' => $_POST['postal_code'] ?? '',
            'portfolio_id' => !empty($_POST['portfolio_id']) ? $_POST['portfolio_id'] : null,
            'year_built' => !empty($_POST['year_built']) ? (int)$_POST['year_built'] : null
        ]);
        Flash::set('success', 'Property updated successfully');
        header("Location: /properties/show?id=" . urlencode($id));
        exit;
    } catch (Exception $e) {
        $error = $e->getMessage();
    }
}
?>

<div class="page-header">
    <div>
        <a href="/properties/show?id=<?= urlencode($id) ?>" class="text-muted">← Back to Property</a>
        <h1 class="page-title">Edit Property</h1>
    </div>
</div>

<div class="card" style="max-width: 680px;">
    <form method="POST" action="/properties/edit?id=<?= urlencode($id) ?>">
        <?= CSRF::field() ?>
        <div class="form-group">
            <label class="form-label" for="name">Property Name *</label>
            <input class="form-input" type="text" id="name" name="name" required value="<?= htmlspecialchars($property['name']) ?>">
        </div>
        <div class="form-group">
            <label class="form-label" for="property_type">Property Type *</label>
            <select class="form-select" id="property_type" name="property_type" required>
                <?php
                    $types = ['single_family', 'multi_family', 'condo', 'townhouse', 'commercial'];
                    foreach ($types as $t):
                ?>
                <option value="<?= $t ?>" <?= $property['property_type'] === $t ? 'selected' : '' ?>>
                    <?= ucwords(str_replace('_', ' ', $t)) ?>
                </option>
                <?php endforeach; ?>
            </select>
        </div>
        <div class="form-group">
            <label class="form-label" for="address_line1">Street Address *</label>
            <input class="form-input" type="text" id="address_line1" name="address_line1" required value="<?= htmlspecialchars($property['address_line1']) ?>">
        </div>
        <div class="form-row">
            <div class="form-group col-6">
                <label class="form-label" for="city">City *</label>
                <input class="form-input" type="text" id="city" name="city" required value="<?= htmlspecialchars($property['city']) ?>">
            </div>
            <div class="form-group col-3">
                <label class="form-label" for="state">State *</label>
                <input class="form-input" type="text" id="state" name="state" required value="<?= htmlspecialchars($property['state']) ?>" maxlength="2">
            </div>
            <div class="form-group col-3">
                <label class="form-label" for="postal_code">Zip Code *</label>
                <input class="form-input" type="text" id="postal_code" name="postal_code" required value="<?= htmlspecialchars($property['postal_code']) ?>">
            </div>
        </div>
        <?php if (!empty($portfolios)): ?>
        <div class="form-group">
            <label class="form-label" for="portfolio_id">Portfolio / Entity</label>
            <select class="form-select" id="portfolio_id" name="portfolio_id">
                <option value="">-- No Portfolio Assigned --</option>
                <?php foreach ($portfolios as $port): ?>
                <option value="<?= htmlspecialchars($port['id']) ?>" <?= ($property['portfolio_id'] ?? '') === $port['id'] ? 'selected' : '' ?>>
                    <?= htmlspecialchars($port['name']) ?>
                </option>
                <?php endforeach; ?>
            </select>
        </div>
        <?php endif; ?>
        <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
            <button type="submit" class="btn btn-primary">Save Changes</button>
            <a href="/properties/show?id=<?= urlencode($id) ?>" class="btn btn-secondary">Cancel</a>
        </div>
    </form>
</div>

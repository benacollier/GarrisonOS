<?php
// Contacts Module - Directory Index
$pageTitle = 'Contacts Directory';

$typeFilter = $_GET['type'] ?? '';
$searchQuery = $_GET['q'] ?? '';
$contacts = [];
$error = null;

try {
    $params = [];
    if ($typeFilter) $params['contact_type'] = $typeFilter;
    if ($searchQuery) $params['q'] = $searchQuery;

    $url = '/api/v1/contacts' . (!empty($params) ? '?' . http_build_query($params) : '');
    $res = $api->get($url);
    $contacts = $res['data']['contacts'] ?? [];
} catch (Exception $e) {
    $error = $e->getMessage();
}

// Handle Add Contact Form
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'create_contact') {
    CSRF::validate();
    try {
        $api->post('/api/v1/contacts', [
            'contact_type' => $_POST['contact_type'] ?? 'tenant',
            'first_name' => $_POST['first_name'] ?? '',
            'last_name' => $_POST['last_name'] ?? '',
            'company_name' => $_POST['company_name'] ?? null,
            'email' => $_POST['email'] ?? null,
            'phone' => $_POST['phone'] ?? null,
            'secondary_phone' => $_POST['secondary_phone'] ?? null,
            'vendor_specialty' => $_POST['vendor_specialty'] ?? null,
            'notes' => $_POST['notes'] ?? null
        ]);
        Flash::set('success', 'Contact created successfully');
        header('Location: /contacts');
        exit;
    } catch (Exception $e) {
        $error = $e->getMessage();
    }
}
?>

<div class="page-header">
    <div>
        <h1 class="page-title">Contacts Directory</h1>
        <p class="page-subtitle">Tenants, owners, vendors, and emergency contacts.</p>
    </div>
    <button class="btn btn-primary" onclick="document.getElementById('addContactModal').showModal()">+ Add Contact</button>
</div>

<!-- Filters Bar -->
<div class="filter-bar card">
    <div class="filter-pills">
        <a href="/contacts" class="filter-pill <?= !$typeFilter ? 'active' : '' ?>">All</a>
        <a href="/contacts?type=tenant" class="filter-pill <?= $typeFilter === 'tenant' ? 'active' : '' ?>">Tenants</a>
        <a href="/contacts?type=owner" class="filter-pill <?= $typeFilter === 'owner' ? 'active' : '' ?>">Owners</a>
        <a href="/contacts?type=vendor" class="filter-pill <?= $typeFilter === 'vendor' ? 'active' : '' ?>">Vendors</a>
        <a href="/contacts?type=guarantor" class="filter-pill <?= $typeFilter === 'guarantor' ? 'active' : '' ?>">Guarantors</a>
    </div>
    <form method="GET" action="/contacts" class="search-form">
        <?php if ($typeFilter): ?>
            <input type="hidden" name="type" value="<?= htmlspecialchars($typeFilter) ?>">
        <?php endif; ?>
        <input class="form-input form-input-sm" type="search" name="q" value="<?= htmlspecialchars($searchQuery) ?>" placeholder="Search name, phone, email...">
        <button type="submit" class="btn btn-sm btn-secondary">Search</button>
    </form>
</div>

<div class="card">
    <div class="table-responsive">
        <table class="data-table">
            <thead>
                <tr>
                    <th>Name / Organization</th>
                    <th>Type</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Details</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($contacts)): ?>
                <tr>
                    <td colspan="5" class="text-center text-muted">No contacts found.</td>
                </tr>
                <?php else: ?>
                <?php foreach ($contacts as $c): ?>
                <tr>
                    <td>
                        <strong><a href="/contacts/show?id=<?= urlencode($c['id']) ?>"><?= htmlspecialchars($c['last_name'] . ', ' . $c['first_name']) ?></a></strong>
                        <?php if (!empty($c['company_name'])): ?>
                            <div class="text-muted text-sm"><?= htmlspecialchars($c['company_name']) ?></div>
                        <?php endif; ?>
                    </td>
                    <td>
                        <span class="badge"><?= htmlspecialchars(ucfirst($c['contact_type'])) ?></span>
                    </td>
                    <td><?= !empty($c['email']) ? '<a href="mailto:' . htmlspecialchars($c['email']) . '">' . htmlspecialchars($c['email']) . '</a>' : '—' ?></td>
                    <td><?= !empty($c['phone']) ? htmlspecialchars($c['phone']) : '—' ?></td>
                    <td>
                        <?php if (!empty($c['vendor_specialty'])): ?>
                            <span class="badge badge-info"><?= htmlspecialchars($c['vendor_specialty']) ?></span>
                        <?php endif; ?>
                        <a href="/contacts/show?id=<?= urlencode($c['id']) ?>" class="btn btn-sm btn-secondary">View</a>
                    </td>
                </tr>
                <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>

<!-- Modal: Add Contact -->
<dialog id="addContactModal" class="modal">
    <form method="POST" action="/contacts" class="modal-box">
        <?= CSRF::field() ?>
        <input type="hidden" name="action" value="create_contact">
        <div class="modal-header">
            <h3>Add New Contact</h3>
            <button type="button" class="btn-close" onclick="document.getElementById('addContactModal').close()">✕</button>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label class="form-label" for="contact_type">Contact Type *</label>
                <select class="form-select" id="contact_type" name="contact_type" required>
                    <option value="tenant">Tenant</option>
                    <option value="owner">Property Owner</option>
                    <option value="vendor">Vendor / Contractor</option>
                    <option value="guarantor">Guarantor / Co-Signer</option>
                    <option value="prospect">Prospect</option>
                    <option value="emergency">Emergency Contact</option>
                </select>
            </div>
            <div class="form-row">
                <div class="form-group col-6">
                    <label class="form-label" for="first_name">First Name *</label>
                    <input class="form-input" type="text" id="first_name" name="first_name" required placeholder="Jane">
                </div>
                <div class="form-group col-6">
                    <label class="form-label" for="last_name">Last Name *</label>
                    <input class="form-input" type="text" id="last_name" name="last_name" required placeholder="Doe">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label" for="company_name">Company Name</label>
                <input class="form-input" type="text" id="company_name" name="company_name" placeholder="e.g. Apex Plumbing LLC">
            </div>
            <div class="form-row">
                <div class="form-group col-6">
                    <label class="form-label" for="email">Email</label>
                    <input class="form-input" type="email" id="email" name="email" placeholder="jane@example.com">
                </div>
                <div class="form-group col-6">
                    <label class="form-label" for="phone">Primary Phone</label>
                    <input class="form-input" type="tel" id="phone" name="phone" placeholder="(555) 234-5678">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label" for="vendor_specialty">Vendor Specialty (if applicable)</label>
                <input class="form-input" type="text" id="vendor_specialty" name="vendor_specialty" placeholder="e.g. HVAC, Roofing, Electrician">
            </div>
            <div class="form-group">
                <label class="form-label" for="notes">Notes</label>
                <textarea class="form-input" id="notes" name="notes" rows="2"></textarea>
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('addContactModal').close()">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Contact</button>
        </div>
    </form>
</dialog>

<?php
// Maintenance Module - Work Orders Index
$pageTitle = 'Maintenance & Repairs';

$statusFilter = $_GET['status'] ?? '';
$priorityFilter = $_GET['priority'] ?? '';
$workOrders = [];
$properties = [];
$vendors = [];
$metrics = null;
$error = null;

try {
    $params = [];
    if ($statusFilter) $params['status'] = $statusFilter;
    if ($priorityFilter) $params['priority'] = $priorityFilter;

    $url = '/api/v1/maintenance/work-orders' . (!empty($params) ? '?' . http_build_query($params) : '');
    $res = $api->get($url);
    $workOrders = $res['data']['workOrders'] ?? [];

    $metricRes = $api->get('/api/v1/maintenance/metrics');
    $metrics = $metricRes['data']['metrics'] ?? null;

    $propRes = $api->get('/api/v1/properties');
    $properties = $propRes['data']['properties'] ?? [];

    $vendRes = $api->get('/api/v1/contacts?type=vendor');
    $vendors = $vendRes['data']['contacts'] ?? [];
} catch (Exception $e) {
    $error = $e->getMessage();
}

// Handle Add Work Order Form
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'create_work_order') {
    CSRF::validate();
    try {
        $api->post('/api/v1/maintenance/work-orders', [
            'property_id' => $_POST['property_id'] ?? '',
            'title' => $_POST['title'] ?? '',
            'description' => $_POST['description'] ?? '',
            'priority' => $_POST['priority'] ?? 'medium',
            'category' => $_POST['category'] ?? 'other',
            'vendor_contact_id' => !empty($_POST['vendor_contact_id']) ? $_POST['vendor_contact_id'] : null,
            'permission_to_enter' => isset($_POST['permission_to_enter']),
            'entry_instructions' => $_POST['entry_instructions'] ?? null,
            'estimated_cost_cents' => (int)(round((float)($_POST['estimated_cost'] ?? 0) * 100))
        ]);

        Flash::set('success', 'Work order created successfully');
        header('Location: /maintenance');
        exit;
    } catch (Exception $e) {
        $error = $e->getMessage();
    }
}
?>

<div class="page-header">
    <div>
        <h1 class="page-title">Work Orders & Repairs</h1>
        <p class="page-subtitle">Track repair tickets, dispatch vendors, and record maintenance expenses.</p>
    </div>
    <button class="btn btn-primary" onclick="document.getElementById('addWorkOrderModal').showModal()">+ New Work Order</button>
</div>

<?php if ($metrics): ?>
<div class="metrics-grid">
    <div class="card metric-card">
        <div class="metric-label">Open Tickets</div>
        <div class="metric-value"><?= (int)$metrics['openWorkOrders'] ?></div>
    </div>
    <div class="card metric-card">
        <div class="metric-label">Emergency Repairs</div>
        <div class="metric-value <?= $metrics['emergencyWorkOrders'] > 0 ? 'text-danger' : 'text-success' ?>">
            <?= (int)$metrics['emergencyWorkOrders'] ?>
        </div>
        <div class="metric-subtitle"><?= $metrics['emergencyWorkOrders'] > 0 ? 'Requires immediate dispatch' : 'No active emergencies' ?></div>
    </div>
    <div class="card metric-card">
        <div class="metric-label">Repairs In Progress</div>
        <div class="metric-value"><?= (int)$metrics['inProgressWorkOrders'] ?></div>
    </div>
    <div class="card metric-card">
        <div class="metric-label">Completed (30d)</div>
        <div class="metric-value text-success"><?= (int)$metrics['completedLast30Days'] ?></div>
    </div>
</div>
<?php endif; ?>

<!-- Filter Pills -->
<div class="filter-bar card">
    <div class="filter-pills">
        <a href="/maintenance" class="filter-pill <?= !$statusFilter ? 'active' : '' ?>">All Statuses</a>
        <a href="/maintenance?status=open" class="filter-pill <?= $statusFilter === 'open' ? 'active' : '' ?>">Open</a>
        <a href="/maintenance?status=in_progress" class="filter-pill <?= $statusFilter === 'in_progress' ? 'active' : '' ?>">In Progress</a>
        <a href="/maintenance?status=completed" class="filter-pill <?= $statusFilter === 'completed' ? 'active' : '' ?>">Completed</a>
    </div>
</div>

<div class="card">
    <div class="table-responsive">
        <table class="data-table">
            <thead>
                <tr>
                    <th>Ticket / Title</th>
                    <th>Property / Unit</th>
                    <th>Priority</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Assigned Vendor</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($workOrders)): ?>
                <tr>
                    <td colspan="7" class="text-center text-muted">No work orders matching the selected filters.</td>
                </tr>
                <?php else: ?>
                <?php foreach ($workOrders as $wo): ?>
                <tr>
                    <td>
                        <strong><a href="/maintenance/show?id=<?= urlencode($wo['id']) ?>"><?= htmlspecialchars($wo['title']) ?></a></strong>
                        <div class="text-muted text-sm">#<?= substr($wo['id'], 0, 8) ?> • <?= date('M j, Y', (int)($wo['created_at'] / 1000)) ?></div>
                    </td>
                    <td>
                        <?= htmlspecialchars($wo['property_name']) ?>
                        <?php if (!empty($wo['unit_number'])): ?>
                            • Unit <?= htmlspecialchars($wo['unit_number']) ?>
                        <?php endif; ?>
                    </td>
                    <td>
                        <?php
                            $prioClass = match ($wo['priority']) {
                                'emergency' => 'badge-danger',
                                'high' => 'badge-warning',
                                'medium' => 'badge-info',
                                default => 'badge'
                            };
                        ?>
                        <span class="badge <?= $prioClass ?>"><?= htmlspecialchars(ucfirst($wo['priority'])) ?></span>
                    </td>
                    <td><span class="badge"><?= htmlspecialchars(ucfirst($wo['category'])) ?></span></td>
                    <td>
                        <?php
                            $statusClass = match ($wo['status']) {
                                'completed' => 'badge-success',
                                'in_progress' => 'badge-info',
                                'open', 'assigned' => 'badge-warning',
                                default => 'badge'
                            };
                        ?>
                        <span class="badge <?= $statusClass ?>"><?= htmlspecialchars(ucwords(str_replace('_', ' ', $wo['status']))) ?></span>
                    </td>
                    <td><?= !empty($wo['vendor_name']) ? htmlspecialchars($wo['vendor_name']) : '<span class="text-muted">Unassigned</span>' ?></td>
                    <td>
                        <a href="/maintenance/show?id=<?= urlencode($wo['id']) ?>" class="btn btn-sm btn-secondary">Manage</a>
                    </td>
                </tr>
                <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>

<!-- Modal: New Work Order -->
<dialog id="addWorkOrderModal" class="modal">
    <form method="POST" action="/maintenance" class="modal-box">
        <?= CSRF::field() ?>
        <input type="hidden" name="action" value="create_work_order">
        <div class="modal-header">
            <h3>Create Maintenance Work Order</h3>
            <button type="button" class="btn-close" onclick="document.getElementById('addWorkOrderModal').close()">✕</button>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label class="form-label" for="wo_property_id">Property *</label>
                <select class="form-select" id="wo_property_id" name="property_id" required>
                    <option value="">-- Choose Property --</option>
                    <?php foreach ($properties as $p): ?>
                    <option value="<?= htmlspecialchars($p['id']) ?>"><?= htmlspecialchars($p['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label" for="title">Title / Issue Summary *</label>
                <input class="form-input" type="text" id="title" name="title" required placeholder="e.g. Kitchen sink leaking under cabinet">
            </div>
            <div class="form-group">
                <label class="form-label" for="description">Detailed Description *</label>
                <textarea class="form-input" id="description" name="description" rows="3" required placeholder="Describe issue location, tenant report, and symptoms..."></textarea>
            </div>
            <div class="form-row">
                <div class="form-group col-6">
                    <label class="form-label" for="priority">Priority *</label>
                    <select class="form-select" id="priority" name="priority" required>
                        <option value="low">Low</option>
                        <option value="medium" selected>Medium</option>
                        <option value="high">High</option>
                        <option value="emergency">Emergency</option>
                    </select>
                </div>
                <div class="form-group col-6">
                    <label class="form-label" for="category">Trade / Category *</label>
                    <select class="form-select" id="category" name="category" required>
                        <option value="plumbing">Plumbing</option>
                        <option value="electrical">Electrical</option>
                        <option value="hvac">HVAC / Heating / AC</option>
                        <option value="appliance">Appliance</option>
                        <option value="structural">Structural / Roof / Windows</option>
                        <option value="cosmetic">Cosmetic / Paint / Drywall</option>
                        <option value="pest">Pest Control</option>
                        <option value="other">Other</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group col-6">
                    <label class="form-label" for="vendor_contact_id">Assign Vendor</label>
                    <select class="form-select" id="vendor_contact_id" name="vendor_contact_id">
                        <option value="">-- None / Self Managed --</option>
                        <?php foreach ($vendors as $v): ?>
                        <option value="<?= htmlspecialchars($v['id']) ?>">
                            <?= htmlspecialchars($v['last_name'] . ', ' . $v['first_name']) ?>
                            <?= !empty($v['company_name']) ? ' (' . htmlspecialchars($v['company_name']) . ')' : '' ?>
                        </option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="form-group col-6">
                    <label class="form-label" for="estimated_cost">Estimated Cost ($)</label>
                    <input class="form-input" type="number" id="estimated_cost" name="estimated_cost" step="0.01" placeholder="0.00">
                </div>
            </div>
            <div class="form-group" style="display:flex; align-items:center; gap:0.5rem;">
                <input type="checkbox" id="permission_to_enter" name="permission_to_enter" value="1" checked>
                <label for="permission_to_enter">Tenant Granted Permission to Enter</label>
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('addWorkOrderModal').close()">Cancel</button>
            <button type="submit" class="btn btn-primary">Create Work Order</button>
        </div>
    </form>
</dialog>


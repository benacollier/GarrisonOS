<?php
// Accounting Module - Chart of Accounts Management
$pageTitle = 'Chart of Accounts';

$accounts = [];
$error = null;
$success = null;

// Handle account creation or updates
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    CSRF::validate();
    $action = $_POST['action'] ?? '';

    try {
        if ($action === 'create_account') {
            $api->post('/api/v1/accounting/chart-of-accounts', [
                'account_number' => !empty($_POST['account_number']) ? trim($_POST['account_number']) : null,
                'account_name' => trim($_POST['account_name'] ?? ''),
                'account_type' => $_POST['account_type'] ?? 'Expense',
                'qb_account_type' => $_POST['qb_account_type'] ?? $_POST['account_type'] ?? 'Expense',
                'category_mapping' => !empty($_POST['category_mapping']) ? trim($_POST['category_mapping']) : null,
                'description' => !empty($_POST['description']) ? trim($_POST['description']) : null
            ]);
            Flash::set('success', 'Chart of accounts entry created successfully');
            header('Location: /accounting/chart-of-accounts');
            exit;
        } elseif ($action === 'update_account') {
            $accountId = $_POST['account_id'] ?? '';
            $api->put('/api/v1/accounting/chart-of-accounts/' . urlencode($accountId), [
                'account_number' => !empty($_POST['account_number']) ? trim($_POST['account_number']) : null,
                'account_name' => trim($_POST['account_name'] ?? ''),
                'account_type' => $_POST['account_type'] ?? 'Expense',
                'qb_account_type' => $_POST['qb_account_type'] ?? 'Expense',
                'category_mapping' => !empty($_POST['category_mapping']) ? trim($_POST['category_mapping']) : null,
                'description' => !empty($_POST['description']) ? trim($_POST['description']) : null,
                'is_active' => isset($_POST['is_active']) ? 1 : 0
            ]);
            Flash::set('success', 'Account updated successfully');
            header('Location: /accounting/chart-of-accounts');
            exit;
        }
    } catch (Exception $e) {
        $error = $e->getMessage();
    }
}

try {
    $res = $api->get('/api/v1/accounting/chart-of-accounts?include_inactive=true');
    $accounts = $res['data']['accounts'] ?? [];
} catch (Exception $e) {
    $error = $e->getMessage();
}
?>

<div class="page-header">
    <div>
        <a href="/accounting" class="text-muted">← Back to Accounting</a>
        <h1 class="page-title">Chart of Accounts</h1>
        <p class="page-subtitle">Configure general ledger accounts and map GarrisonOS categories to QuickBooks account structures.</p>
    </div>
    <div class="btn-group">
        <a href="/accounting/quickbooks" class="btn btn-secondary">QuickBooks Export</a>
        <button class="btn btn-primary" onclick="document.getElementById('newAccountModal').showModal()">+ Add GL Account</button>
    </div>
</div>

<?php if ($error): ?>
    <div class="alert alert-danger" style="margin-bottom: 1.5rem;">
        <strong>Error:</strong> <?= htmlspecialchars($error, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>
    </div>
<?php endif; ?>

<div class="card">
    <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; font-size: 1.1rem;">General Ledger Accounts (<?= count($accounts) ?>)</h3>
        <span class="badge badge-info">Standard Real Estate & Schedule E COA</span>
    </div>
    <div class="table-responsive">
        <table class="table">
            <thead>
                <tr>
                    <th style="width: 120px;">Account #</th>
                    <th>Account Name</th>
                    <th>Account Type</th>
                    <th>QuickBooks Type</th>
                    <th>GarrisonOS Category Mapping</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($accounts)): ?>
                    <tr>
                        <td colspan="6" class="text-center text-muted" style="padding: 2.5rem;">
                            No chart of accounts loaded.
                        </td>
                    </tr>
                <?php else: ?>
                    <?php foreach ($accounts as $acc): ?>
                        <tr>
                            <td style="font-family: monospace; font-weight: bold;">
                                <?= htmlspecialchars($acc['account_number'] ?? '-', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>
                            </td>
                            <td>
                                <strong><?= htmlspecialchars($acc['account_name'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></strong>
                                <?php if (!empty($acc['description'])): ?>
                                    <br><small class="text-muted"><?= htmlspecialchars($acc['description'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></small>
                                <?php endif; ?>
                            </td>
                            <td>
                                <span class="badge badge-secondary"><?= htmlspecialchars($acc['account_type'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></span>
                            </td>
                            <td>
                                <span class="badge badge-secondary"><?= htmlspecialchars($acc['qb_account_type'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></span>
                            </td>
                            <td>
                                <?php if (!empty($acc['category_mapping'])): ?>
                                    <code><?= htmlspecialchars($acc['category_mapping'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></code>
                                <?php else: ?>
                                    <span class="text-muted">-</span>
                                <?php endif; ?>
                            </td>
                            <td>
                                <span class="badge <?= $acc['is_active'] ? 'badge-success' : 'badge-danger' ?>">
                                    <?= $acc['is_active'] ? 'Active' : 'Inactive' ?>
                                </span>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>

<!-- Add Account Modal -->
<dialog id="newAccountModal" class="modal">
    <div class="modal-box">
        <h3 class="modal-title">Add Chart of Accounts Item</h3>
        <form method="POST" action="/accounting/chart-of-accounts">
            <?= CSRF::field() ?>
            <input type="hidden" name="action" value="create_account">

            <div class="form-group">
                <label class="form-label">Account Number</label>
                <input type="text" name="account_number" class="form-control" placeholder="e.g. 5150">
            </div>

            <div class="form-group">
                <label class="form-label">Account Name *</label>
                <input type="text" name="account_name" class="form-control" required placeholder="e.g. Landscaping & Snow Removal">
            </div>

            <div class="form-group">
                <label class="form-label">Account Type *</label>
                <select name="account_type" class="form-control" required>
                    <option value="Expense">Expense</option>
                    <option value="Income">Income</option>
                    <option value="Bank">Bank</option>
                    <option value="AccountsReceivable">Accounts Receivable</option>
                    <option value="OtherCurrentAsset">Other Current Asset</option>
                    <option value="AccountsPayable">Accounts Payable</option>
                    <option value="OtherCurrentLiability">Other Current Liability</option>
                    <option value="Equity">Equity</option>
                </select>
            </div>

            <div class="form-group">
                <label class="form-label">QuickBooks Account Type *</label>
                <select name="qb_account_type" class="form-control" required>
                    <option value="Expense">Expense</option>
                    <option value="Income">Income</option>
                    <option value="Bank">Bank</option>
                    <option value="AccountsReceivable">Accounts Receivable</option>
                    <option value="OtherCurrentAsset">Other Current Asset</option>
                    <option value="FixedAsset">Fixed Asset</option>
                    <option value="AccountsPayable">Accounts Payable</option>
                    <option value="OtherCurrentLiability">Other Current Liability</option>
                    <option value="Equity">Equity</option>
                </select>
            </div>

            <div class="form-group">
                <label class="form-label">GarrisonOS Category Mapping (Optional)</label>
                <input type="text" name="category_mapping" class="form-control" placeholder="e.g. cleaning_maintenance, repairs, rent">
            </div>

            <div class="form-group">
                <label class="form-label">Description (Optional)</label>
                <textarea name="description" class="form-control" rows="2" placeholder="Brief note on when this account is debited or credited"></textarea>
            </div>

            <div class="modal-actions">
                <button type="button" class="btn btn-text" onclick="document.getElementById('newAccountModal').close()">Cancel</button>
                <button type="submit" class="btn btn-primary">Save Account</button>
            </div>
        </form>
    </div>
</dialog>


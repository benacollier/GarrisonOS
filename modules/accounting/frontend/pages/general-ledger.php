<?php
// Accounting Module - General Ledger View
$pageTitle = 'General Ledger';

$entries = [];
$total = 0;
$error = null;
$success = null;

// Handle manual journal entry creation or reversal
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    CSRF::validate();
    $action = $_POST['action'] ?? '';

    try {
        if ($action === 'reverse_entry') {
            $entryId = $_POST['entry_id'] ?? '';
            $reason = trim($_POST['reason'] ?? 'Reversal requested via GL interface');
            $api->post('/api/v1/accounting/journal-entries/' . urlencode($entryId) . '/reverse', [
                'reason' => $reason
            ]);
            Flash::set('success', 'Journal entry reversed successfully.');
            header('Location: /accounting/general-ledger');
            exit;
        } elseif ($action === 'backfill_legacy') {
            $api->post('/api/v1/accounting/backfill-ledger', []);
            Flash::set('success', 'Historical transactions successfully backfilled into General Ledger.');
            header('Location: /accounting/general-ledger');
            exit;
        }
    } catch (Exception $e) {
        $error = $e->getMessage();
    }
}

$page = isset($_GET['page']) && is_numeric($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
$perPage = 50;
$offset = ($page - 1) * $perPage;

try {
    $res = $api->get('/api/v1/accounting/journal-entries?limit=' . $perPage . '&offset=' . $offset);
    $entries = $res['data']['entries'] ?? [];
    $total = $res['data']['total'] ?? 0;
    $totalPages = max(1, (int)ceil($total / $perPage));

    if ($page > $totalPages) {
        header('Location: /accounting/general-ledger?page=' . $totalPages);
        exit;
    }
} catch (Exception $e) {
    $error = $e->getMessage();
    $totalPages = 1;
}
?>

<div class="page-header">
    <div>
        <a href="/accounting" class="text-muted">← Back to Accounting</a>
        <h1 class="page-title">General Ledger</h1>
        <p class="page-subtitle">Native immutable double-entry journal entries, audit trail, and line allocations.</p>
    </div>
    <div class="actions" style="display: flex; gap: var(--spacing-sm);">
        <form method="POST" action="/accounting/general-ledger" style="display: inline;">
            <?= CSRF::field() ?>
            <input type="hidden" name="action" value="backfill_legacy">
            <button type="submit" class="btn btn-secondary" title="Ensure all legacy transactions have double-entry counterparts">
                Sync / Backfill Ledger
            </button>
        </form>
        <a href="/accounting/trial-balance" class="btn btn-primary">Trial Balance</a>
    </div>
</div>

<?php if ($error): ?>
    <div class="alert alert-danger" style="margin-bottom: var(--spacing-lg);">
        <?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?>
    </div>
<?php endif; ?>

<div class="card">
    <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; padding: var(--spacing-md);">
        <h3 style="margin: 0;">Journal Entries (<?= count($entries) ?> of <?= $total ?> total)</h3>
    </div>
    <div class="table-responsive">
        <table class="table">
            <thead>
                <tr>
                    <th style="width: 100px;">Entry #</th>
                    <th style="width: 120px;">Date</th>
                    <th style="width: 140px;">Source</th>
                    <th>Memo / Description</th>
                    <th style="text-align: right; width: 130px;">Debits</th>
                    <th style="text-align: right; width: 130px;">Credits</th>
                    <th style="width: 140px; text-align: center;">Status</th>
                    <th style="width: 120px; text-align: right;">Actions</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($entries)): ?>
                    <tr>
                        <td colspan="8" style="text-align: center; color: var(--color-text-muted); padding: var(--spacing-xl);">
                            No journal entries recorded. Post transactions or click "Sync / Backfill Ledger" to import single-entry transactions.
                        </td>
                    </tr>
                <?php else: ?>
                    <?php foreach ($entries as $entry): ?>
                        <tr style="background-color: var(--color-surface-subtle, rgba(0,0,0,0.02)); font-weight: 600;">
                            <td><code>#<?= htmlspecialchars((string)$entry['entry_number'], ENT_QUOTES, 'UTF-8') ?></code></td>
                            <td><?= date('Y-m-d', $entry['date_ms'] / 1000) ?></td>
                            <td><span class="badge"><?= htmlspecialchars($entry['source_type'], ENT_QUOTES, 'UTF-8') ?></span></td>
                            <td><?= htmlspecialchars($entry['memo'], ENT_QUOTES, 'UTF-8') ?></td>
                            <td style="text-align: right; font-family: monospace;">$<?= number_format(($entry['total_debit_cents'] ?? 0) / 100, 2) ?></td>
                            <td style="text-align: right; font-family: monospace;">$<?= number_format(($entry['total_credit_cents'] ?? 0) / 100, 2) ?></td>
                            <td style="text-align: center;">
                                <?php if (!empty($entry['reversed_by_entry_id'])): ?>
                                    <span class="badge" style="background-color: var(--color-danger, #ef4444); color: white;">Reversed</span>
                                <?php elseif ($entry['source_type'] === 'reversal'): ?>
                                    <span class="badge" style="background-color: var(--color-warning, #f59e0b); color: white;">Reversal Entry</span>
                                <?php else: ?>
                                    <span class="badge" style="background-color: var(--color-success, #10b981); color: white;">Posted</span>
                                <?php endif; ?>
                            </td>
                            <td style="text-align: right;">
                                <?php if (empty($entry['reversed_by_entry_id']) && $entry['source_type'] !== 'reversal'): ?>
                                    <form method="POST" action="/accounting/general-ledger" style="display: inline;" onsubmit="return confirm('Reverse Entry #<?= $entry['entry_number'] ?>? An exact opposite journal entry will be posted.');">
                                        <?= CSRF::field() ?>
                                        <input type="hidden" name="action" value="reverse_entry">
                                        <input type="hidden" name="entry_id" value="<?= htmlspecialchars($entry['id'], ENT_QUOTES, 'UTF-8') ?>">
                                        <button type="submit" class="btn btn-sm btn-outline-danger">Reverse</button>
                                    </form>
                                <?php else: ?>
                                    <span style="color: var(--color-text-muted); font-size: var(--font-size-xs);">Locked</span>
                                <?php endif; ?>
                            </td>
                        </tr>
                        <!-- Indented Journal Lines -->
                        <?php if (!empty($entry['lines'])): ?>
                            <?php foreach ($entry['lines'] as $line): ?>
                                <tr style="font-size: var(--font-size-sm); color: var(--color-text-muted);">
                                    <td></td>
                                    <td colspan="3" style="padding-left: var(--spacing-xl);">
                                        <code><?= htmlspecialchars($line['account_number'] ?? '—', ENT_QUOTES, 'UTF-8') ?></code>
                                        <strong style="color: var(--color-text);"><?= htmlspecialchars($line['account_name'] ?? 'Account', ENT_QUOTES, 'UTF-8') ?></strong>
                                        <?php if (!empty($line['description'])): ?>
                                            — <span style="font-style: italic;"><?= htmlspecialchars($line['description'], ENT_QUOTES, 'UTF-8') ?></span>
                                        <?php endif; ?>
                                    </td>
                                    <td style="text-align: right; font-family: monospace;">
                                        <?= $line['debit_cents'] > 0 ? '$' . number_format($line['debit_cents'] / 100, 2) : '' ?>
                                    </td>
                                    <td style="text-align: right; font-family: monospace;">
                                        <?= $line['credit_cents'] > 0 ? '$' . number_format($line['credit_cents'] / 100, 2) : '' ?>
                                    </td>
                                    <td colspan="2"></td>
                                </tr>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
    <?php if ($totalPages > 1): ?>
        <div class="card-footer" style="display: flex; justify-content: space-between; align-items: center; padding: var(--spacing-md); border-top: 1px solid var(--color-border);">
            <div style="font-size: var(--font-size-sm); color: var(--color-text-muted);">
                Page <?= $page ?> of <?= $totalPages ?> (showing <?= count($entries) ?> of <?= $total ?> entries)
            </div>
            <div style="display: flex; gap: var(--spacing-xs);">
                <?php if ($page > 1): ?>
                    <a href="/accounting/general-ledger?page=<?= $page - 1 ?>" class="btn btn-sm btn-secondary">← Previous</a>
                <?php endif; ?>
                <?php if ($page < $totalPages): ?>
                    <a href="/accounting/general-ledger?page=<?= $page + 1 ?>" class="btn btn-sm btn-secondary">Next →</a>
                <?php endif; ?>
            </div>
        </div>
    <?php endif; ?>
</div>

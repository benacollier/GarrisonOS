<?php
/**
 * Backup Module Management UI
 */

$flashMessage = '';
$flashError = '';

// Handle POST actions: trigger backup, verify, delete
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    
    if ($action === 'create') {
        $type = $_POST['backup_type'] ?? 'tenant_data';
        try {
            $api->post('/api/v1/backups', ['type' => $type]);
            $flashMessage = 'Backup created successfully.';
        } catch (Exception $e) {
            $flashError = 'Failed to create backup: ' . $e->getMessage();
        }
    } elseif ($action === 'verify') {
        $backupId = $_POST['backup_id'] ?? '';
        if ($backupId) {
            try {
                $res = $api->post("/api/v1/backups/{$backupId}/verify", []);
                $isValid = $res['data']['valid'] ?? false;
                if ($isValid) {
                    $flashMessage = 'Backup integrity verified: SHA-256 matches.';
                } else {
                    $flashError = 'Integrity verification failed! Checksum mismatch or file missing.';
                }
            } catch (Exception $e) {
                $flashError = 'Verification error: ' . $e->getMessage();
            }
        }
    } elseif ($action === 'delete') {
        $backupId = $_POST['backup_id'] ?? '';
        if ($backupId) {
            try {
                $api->delete("/api/v1/backups/{$backupId}");
                $flashMessage = 'Backup record and archive removed.';
            } catch (Exception $e) {
                $flashError = 'Failed to delete backup: ' . $e->getMessage();
            }
        }
    }
}

// Fetch list of backups
$backups = [];
$totalBackups = 0;
try {
    $res = $api->get('/api/v1/backups');
    $backups = $res['data']['items'] ?? [];
    $totalBackups = $res['data']['total'] ?? 0;
} catch (Exception $e) {
    $flashError = 'Could not load backups list.';
}
?>

<div class="module-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
    <div>
        <h1 style="margin: 0; font-size: 1.75rem;">Backup & Disaster Recovery</h1>
        <p style="margin: 0.25rem 0 0; color: var(--color-text-muted, #666);">
            Create point-in-time snapshots, verify checksums, and export tenant archives.
        </p>
    </div>
</div>

<?php if ($flashMessage): ?>
    <div style="background: #e6f4ea; color: #137333; padding: 0.75rem 1rem; border-radius: 4px; margin-bottom: 1rem;">
        <?= htmlspecialchars($flashMessage, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>
    </div>
<?php endif; ?>

<?php if ($flashError): ?>
    <div style="background: #fce8e6; color: #c5221f; padding: 0.75rem 1rem; border-radius: 4px; margin-bottom: 1rem;">
        <?= htmlspecialchars($flashError, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>
    </div>
<?php endif; ?>

<div class="card" style="background: var(--color-surface, #fff); padding: 1.5rem; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 2rem;">
    <h2 style="margin-top: 0; font-size: 1.25rem;">Create New Backup</h2>
    <form method="POST" action="/backup" style="display: flex; gap: 1rem; align-items: flex-end; flex-wrap: wrap;">
        <input type="hidden" name="csrf_token" value="<?= htmlspecialchars(CSRF::getToken(), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>">
        <input type="hidden" name="action" value="create">

        <div style="display: flex; flex-direction: column; gap: 0.25rem;">
            <label for="backup_type" style="font-weight: 500; font-size: 0.9rem;">Backup Type</label>
            <select id="backup_type" name="backup_type" style="padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px;">
                <option value="tenant_data">Tenant Data Export (.json.gz)</option>
                <option value="full_system">Full System Database Snapshot (.sqlite.gz)</option>
            </select>
        </div>

        <button type="submit" style="padding: 0.5rem 1.25rem; background: var(--color-primary, #0056b3); color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">
            Trigger Backup Now
        </button>
    </form>
</div>

<div class="card" style="background: var(--color-surface, #fff); padding: 1.5rem; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="margin-top: 0; font-size: 1.25rem; margin-bottom: 1rem;">Available Backups (<?= count($backups) ?>)</h2>

    <?php if (empty($backups)): ?>
        <p style="color: var(--color-text-muted, #777); font-style: italic;">No backups found. Trigger one above to establish a baseline.</p>
    <?php else: ?>
        <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.95rem;">
                <thead>
                    <tr style="border-bottom: 2px solid #eee;">
                        <th style="padding: 0.75rem 0.5rem;">Date (UTC)</th>
                        <th style="padding: 0.75rem 0.5rem;">Type</th>
                        <th style="padding: 0.75rem 0.5rem;">Filename</th>
                        <th style="padding: 0.75rem 0.5rem;">Size</th>
                        <th style="padding: 0.75rem 0.5rem;">Status</th>
                        <th style="padding: 0.75rem 0.5rem;">SHA-256 Checksum</th>
                        <th style="padding: 0.75rem 0.5rem; text-align: right;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($backups as $b): ?>
                        <tr style="border-bottom: 1px solid #f0f0f0;">
                            <td style="padding: 0.75rem 0.5rem;">
                                <?= htmlspecialchars(gmdate('Y-m-d H:i:s', (int)($b['created_at'] / 1000)), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>
                            </td>
                            <td style="padding: 0.75rem 0.5rem;">
                                <span style="display: inline-block; padding: 0.2rem 0.5rem; background: #e8eaed; border-radius: 3px; font-size: 0.8rem;">
                                    <?= htmlspecialchars($b['backup_type'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>
                                </span>
                            </td>
                            <td style="padding: 0.75rem 0.5rem; font-family: monospace;">
                                <?= htmlspecialchars($b['filename'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>
                            </td>
                            <td style="padding: 0.75rem 0.5rem;">
                                <?= number_format($b['file_size_bytes'] / 1024, 1) ?> KB
                            </td>
                            <td style="padding: 0.75rem 0.5rem;">
                                <?php
                                    $statusColor = '#137333'; // green
                                    if ($b['status'] === 'pending') $statusColor = '#e37400';
                                    if ($b['status'] === 'failed') $statusColor = '#c5221f';
                                ?>
                                <span style="color: <?= $statusColor ?>; font-weight: 500;">
                                    <?= htmlspecialchars(ucfirst($b['status']), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>
                                </span>
                            </td>
                            <td style="padding: 0.75rem 0.5rem; font-family: monospace; font-size: 0.8rem;" title="<?= htmlspecialchars($b['checksum_sha256'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>">
                                <?= htmlspecialchars(substr($b['checksum_sha256'], 0, 12) . '...', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>
                            </td>
                            <td style="padding: 0.75rem 0.5rem; text-align: right; display: flex; gap: 0.5rem; justify-content: flex-end;">
                                <?php if ($b['status'] === 'completed'): ?>
                                    <a href="/api/v1/backups/<?= urlencode($b['id']) ?>/download" 
                                       style="padding: 0.25rem 0.5rem; background: #f1f3f4; border: 1px solid #dadce0; border-radius: 4px; text-decoration: none; color: #202124; font-size: 0.85rem;"
                                       download>
                                        Download
                                    </a>

                                    <form method="POST" action="/backup" style="display: inline;">
                                        <input type="hidden" name="csrf_token" value="<?= htmlspecialchars(CSRF::getToken(), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>">
                                        <input type="hidden" name="action" value="verify">
                                        <input type="hidden" name="backup_id" value="<?= htmlspecialchars($b['id'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>">
                                        <button type="submit" style="padding: 0.25rem 0.5rem; background: #f1f3f4; border: 1px solid #dadce0; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">
                                            Verify
                                        </button>
                                    </form>
                                <?php endif; ?>

                                <form method="POST" action="/backup" style="display: inline;" onsubmit="return confirm('Permanently remove this backup archive?');">
                                    <input type="hidden" name="csrf_token" value="<?= htmlspecialchars(CSRF::getToken(), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>">
                                    <input type="hidden" name="action" value="delete">
                                    <input type="hidden" name="backup_id" value="<?= htmlspecialchars($b['id'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>">
                                    <button type="submit" style="padding: 0.25rem 0.5rem; background: #fce8e6; color: #c5221f; border: 1px solid #fad2cf; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">
                                        Delete
                                    </button>
                                </form>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    <?php endif; ?>
</div>


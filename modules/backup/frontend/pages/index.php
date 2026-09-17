<?php
/**
 * Backup Module Management UI
 */

$flashMessage = '';
$flashError = '';

// Handle POST actions: trigger backup, verify, delete, restore
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
    } elseif ($action === 'restore') {
        $backupId = $_POST['backup_id'] ?? '';
        $mode = $_POST['restore_mode'] ?? 'clean_slate';
        if ($backupId) {
            try {
                $res = $api->post("/api/v1/backups/{$backupId}/restore", ['mode' => $mode]);
                $flashMessage = $res['data']['message'] ?? "Tenant data restored successfully ({$mode}).";
            } catch (Exception $e) {
                $flashError = 'Failed to restore backup: ' . $e->getMessage();
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
    } elseif ($action === 'trigger_backup') {
        try {
            $api->post('/api/v1/backups/scheduler/trigger', []);
            $flashMessage = 'Automated backup job triggered successfully.';
        } catch (Exception $e) {
            $flashError = 'Failed to trigger backup job: ' . $e->getMessage();
        }
    } elseif ($action === 'trigger_vacuum') {
        try {
            $res = $api->post('/api/v1/backups/scheduler/trigger', ['action' => 'vacuum']);
            $flashMessage = 'Database maintenance routine (WAL checkpoint & VACUUM) executed successfully.';
        } catch (Exception $e) {
            $flashError = 'Failed to run database maintenance: ' . $e->getMessage();
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

// Fetch scheduler daemon status
$scheduler = [];
try {
    $scheduleRes = $api->get('/api/v1/backups/scheduler/status');
    $scheduler = $scheduleRes['data']['scheduler'] ?? [];
} catch (Exception $e) {
    // Non-blocking if scheduler status is temporarily unavailable
}
?>

<div class="module-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
    <div>
        <h1 style="margin: 0; font-size: 1.75rem;">Backup & Disaster Recovery</h1>
        <p style="margin: 0.25rem 0 0; color: var(--color-text-muted, #666);">
            Create point-in-time snapshots, verify checksums, manage automated maintenance, and restore tenant archives.
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

<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
    <!-- Create Backup Card -->
    <div class="card" style="background: var(--color-surface, #fff); padding: 1.5rem; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <h2 style="margin-top: 0; font-size: 1.25rem;">Create New Backup</h2>
        <form method="POST" action="/backup" style="display: flex; flex-direction: column; gap: 1rem;">
            <?= CSRF::field() ?>
            <input type="hidden" name="action" value="create">

            <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                <label for="backup_type" style="font-weight: 500; font-size: 0.9rem;">Backup Type</label>
                <select id="backup_type" name="backup_type" style="padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px;">
                    <option value="tenant_data">Tenant Data Export (.json.gz)</option>
                    <option value="full_system">Full System Database Snapshot (.sqlite.gz)</option>
                </select>
            </div>

            <button type="submit" style="padding: 0.5rem 1.25rem; background: var(--color-primary, #0056b3); color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: 500; align-self: flex-start;">
                Trigger Backup Now
            </button>
        </form>
    </div>

    <!-- Daemon & Maintenance Card -->
    <div class="card" style="background: var(--color-surface, #fff); padding: 1.5rem; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <h2 style="margin-top: 0; font-size: 1.25rem; display: flex; justify-content: space-between; align-items: center;">
            <span>Automation & Maintenance</span>
            <?php if (!empty($scheduler['enabled'])): ?>
                <span style="font-size: 0.75rem; background: #e6f4ea; color: #137333; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 600;">DAEMON ACTIVE</span>
            <?php else: ?>
                <span style="font-size: 0.75rem; background: #f1f3f4; color: #5f6368; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 600;">MANUAL ONLY</span>
            <?php endif; ?>
        </h2>

        <div style="font-size: 0.85rem; color: var(--color-text-muted, #555); margin-bottom: 1rem; line-height: 1.6;">
            <div><strong>Backup Interval:</strong> Every <?= htmlspecialchars((string)($scheduler['intervalHours'] ?? 24), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?> hours</div>
            <div><strong>Vacuum Interval:</strong> Every <?= htmlspecialchars((string)($scheduler['vacuumIntervalHours'] ?? 168), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?> hours</div>
            <div><strong>Retention Policy:</strong> <?= htmlspecialchars((string)($scheduler['retentionDays'] ?? 30), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?> days</div>
            <?php if (!empty($scheduler['nextScheduledBackupAt'])): ?>
                <div><strong>Next Scheduled Backup:</strong> <?= htmlspecialchars(gmdate('Y-m-d H:i:s', (int)($scheduler['nextScheduledBackupAt'] / 1000)), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?> UTC</div>
            <?php endif; ?>
            <?php if (!empty($scheduler['maintenanceInProgress'])): ?>
                <div style="color: #e37400; font-weight: 600; margin-top: 0.25rem;">
                    Maintenance actively running: <?= htmlspecialchars(ucfirst((string)$scheduler['maintenanceInProgress']), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>
                </div>
            <?php endif; ?>
        </div>

        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
            <!-- Trigger On-Demand Scheduled Backup -->
            <form method="POST" action="/backup" style="margin: 0;">
                <?= CSRF::field() ?>
                <input type="hidden" name="action" value="trigger_backup">
                <button type="submit" style="padding: 0.4rem 0.8rem; background: #f1f3f4; color: #3c4043; border: 1px solid #dadce0; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">
                    Run Automated Job
                </button>
            </form>

            <!-- Trigger On-Demand Database Vacuum -->
            <form method="POST" action="/backup" style="margin: 0;">
                <?= CSRF::field() ?>
                <input type="hidden" name="action" value="trigger_vacuum">
                <button type="submit" style="padding: 0.4rem 0.8rem; background: #e8f0fe; color: #1a73e8; border: 1px solid #dadce0; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">
                    Run Vacuum Routine
                </button>
            </form>
        </div>
    </div>
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
                            <td style="padding: 0.75rem 0.5rem; text-align: right; display: flex; gap: 0.5rem; justify-content: flex-end; align-items: center;">
                                <?php if ($b['status'] === 'completed'): ?>
                                    <a href="/api/v1/backups/<?= urlencode($b['id']) ?>/download" 
                                       style="padding: 0.25rem 0.5rem; background: #f1f3f4; border: 1px solid #dadce0; border-radius: 4px; text-decoration: none; color: #202124; font-size: 0.85rem;"
                                       download>
                                        Download
                                    </a>

                                    <form method="POST" action="/backup" style="display: inline;">
                                        <?= CSRF::field() ?>
                                        <input type="hidden" name="action" value="verify">
                                        <input type="hidden" name="backup_id" value="<?= htmlspecialchars($b['id'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>">
                                        <button type="submit" style="padding: 0.25rem 0.5rem; background: #f1f3f4; border: 1px solid #dadce0; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">
                                            Verify
                                        </button>
                                    </form>

                                    <?php if ($b['backup_type'] === 'tenant_data'): ?>
                                        <!-- Restore Trigger with Modal / Prompt Selection -->
                                        <button type="button" 
                                                onclick="openRestoreModal('<?= htmlspecialchars($b['id'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>', '<?= htmlspecialchars($b['filename'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>')"
                                                style="padding: 0.25rem 0.5rem; background: #e8f0fe; color: #1a73e8; border: 1px solid #d2e3fc; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: 500;">
                                            Restore...
                                        </button>
                                    <?php endif; ?>
                                <?php endif; ?>

                                <form method="POST" action="/backup" style="display: inline;" onsubmit="return confirm('Permanently remove this backup archive?');">
                                    <?= CSRF::field() ?>
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

<!-- Restore Modal Dialog -->
<div id="restoreModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center;">
    <div style="background: #fff; width: 100%; max-width: 480px; padding: 1.5rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
        <h3 style="margin-top: 0; margin-bottom: 0.5rem;">Restore Tenant Data</h3>
        <p style="font-size: 0.9rem; color: #555; margin-bottom: 1.25rem;">
            Restoring from <strong id="modalBackupFilename">archive</strong>. Choose how you want existing tenant data handled:
        </p>

        <form method="POST" action="/backup" id="restoreForm">
            <?= CSRF::field() ?>
            <input type="hidden" name="action" value="restore">
            <input type="hidden" name="backup_id" id="modalBackupId" value="">

            <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem;">
                <label style="display: flex; gap: 0.75rem; align-items: flex-start; cursor: pointer; padding: 0.5rem; border: 1px solid #eee; border-radius: 4px;">
                    <input type="radio" name="restore_mode" value="clean_slate" checked style="margin-top: 0.25rem;">
                    <div>
                        <strong style="display: block; font-size: 0.95rem;">Clean-Slate (Replace)</strong>
                        <span style="font-size: 0.85rem; color: #666;">
                            Clears existing tenant records in the backed-up tables before inserting the snapshot. Recommended for rollback to a prior point in time.
                        </span>
                    </div>
                </label>

                <label style="display: flex; gap: 0.75rem; align-items: flex-start; cursor: pointer; padding: 0.5rem; border: 1px solid #eee; border-radius: 4px;">
                    <input type="radio" name="restore_mode" value="merge" style="margin-top: 0.25rem;">
                    <div>
                        <strong style="display: block; font-size: 0.95rem;">Merge / Upsert</strong>
                        <span style="font-size: 0.85rem; color: #666;">
                            Inserts or updates records matching IDs from the backup, but preserves any new records created since the backup.
                        </span>
                    </div>
                </label>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
                <button type="button" onclick="closeRestoreModal()" style="padding: 0.5rem 1rem; border: 1px solid #ccc; background: #fff; border-radius: 4px; cursor: pointer;">
                    Cancel
                </button>
                <button type="submit" style="padding: 0.5rem 1rem; background: #1a73e8; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">
                    Confirm & Restore
                </button>
            </div>
        </form>
    </div>
</div>

<script>
function openRestoreModal(backupId, filename) {
    document.getElementById('modalBackupId').value = backupId;
    document.getElementById('modalBackupFilename').innerText = filename;
    const modal = document.getElementById('restoreModal');
    modal.style.display = 'flex';
}

function closeRestoreModal() {
    const modal = document.getElementById('restoreModal');
    modal.style.display = 'none';
}
</script>

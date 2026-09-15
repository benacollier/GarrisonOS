<?php
$pageTitle = 'First-Launch Setup';

$error = null;
$success = null;

// Determine system configuration status and whether backup module is enabled
$isConfigured = false;
$backupModuleEnabled = false;

try {
    $statusRes = $api->get('/api/v1/system/status');
    $isConfigured = !empty($statusRes['data']['is_configured']);
    $backupModuleEnabled = !empty($statusRes['data']['backup_module_enabled']);
} catch (Exception $e) {
    // If engine is unreachable or error, let form attempt or display error
    $error = 'Unable to check system status: ' . $e->getMessage();
}

if ($isConfigured) {
    header('Location: /login');
    exit;
}

$activeTab = $_GET['tab'] ?? 'fresh';
if (!in_array($activeTab, ['fresh', 'restore'], true)) {
    $activeTab = 'fresh';
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    CSRF::validate();
    $formAction = $_POST['form_action'] ?? 'fresh';

    if ($formAction === 'restore') {
        $activeTab = 'restore';
        if (empty($_FILES['backup_file']['tmp_name']) || !is_uploaded_file($_FILES['backup_file']['tmp_name'])) {
            $error = 'Please select a valid backup archive to upload.';
        } else {
            $uploadedPath = $_FILES['backup_file']['tmp_name'];
            $origName = basename($_FILES['backup_file']['name'] ?? 'backup.sqlite.gz');
            $fileData = file_get_contents($uploadedPath);

            if ($fileData === false || strlen($fileData) === 0) {
                $error = 'The uploaded backup file is empty or unreadable.';
            } else {
                try {
                    $base64 = base64_encode($fileData);
                    $res = $api->post('/api/v1/system/restore', [
                        'backup_data' => $base64,
                        'filename' => $origName
                    ]);

                    Flash::set('success', 'Database successfully restored! You may now sign in with your credentials.');
                    header('Location: /login');
                    exit;
                } catch (Exception $e) {
                    $error = $e->getMessage();
                }
            }
        }
    } else {
        $activeTab = 'fresh';
        $orgName = trim($_POST['organization_name'] ?? '');
        $firstName = trim($_POST['first_name'] ?? '');
        $lastName = trim($_POST['last_name'] ?? '');
        $email = trim($_POST['email'] ?? '');
        $password = $_POST['password'] ?? '';
        $passwordConfirm = $_POST['password_confirm'] ?? '';
        $seedDemoData = !empty($_POST['seed_demo_data']);

        if (empty($orgName) || empty($firstName) || empty($lastName) || empty($email) || empty($password)) {
            $error = 'All fields are required.';
        } elseif ($password !== $passwordConfirm) {
            $error = 'Passwords do not match.';
        } elseif (strlen($password) < 8) {
            $error = 'Password must be at least 8 characters in length.';
        } else {
            try {
                $res = $api->post('/api/v1/system/setup', [
                    'organization_name' => $orgName,
                    'first_name' => $firstName,
                    'last_name' => $lastName,
                    'email' => $email,
                    'password' => $password,
                    'seed_demo_data' => $seedDemoData
                ]);

                $token = $res['data']['token'];
                $user = $res['data']['user'];

                Auth::login($user, $token);
                Flash::set('success', "Welcome to GarrisonOS, {$user['first_name']}! Your organization has been initialized.");
                header('Location: /dashboard');
                exit;
            } catch (Exception $e) {
                $error = $e->getMessage();
            }
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>First-Launch Setup – GarrisonOS</title>
    <link rel="stylesheet" href="/public/css/style.css">
</head>
<body style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background-color: #0f172a; padding: 2rem 1rem;">
    <div class="card" style="width: 100%; max-width: 540px; padding: 2.5rem; box-shadow: var(--shadow-lg);">
        <div style="text-align: center; margin-bottom: 1.75rem;">
            <h1 style="font-size: 1.85rem; font-weight: 800; color: var(--text-main); letter-spacing: -0.02em;">🏰 GarrisonOS</h1>
            <p style="color: var(--text-muted); font-size: 0.95rem; margin-top: 0.25rem;">Initial Platform Setup & Onboarding</p>
        </div>

        <?php if ($backupModuleEnabled): ?>
            <div style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem;">
                <a href="/setup?tab=fresh" class="btn <?= $activeTab === 'fresh' ? 'btn-primary' : 'btn-secondary' ?>" style="flex: 1; text-align: center; text-decoration: none;">
                    New Setup
                </a>
                <a href="/setup?tab=restore" class="btn <?= $activeTab === 'restore' ? 'btn-primary' : 'btn-secondary' ?>" style="flex: 1; text-align: center; text-decoration: none;">
                    Restore from Backup
                </a>
            </div>
        <?php endif; ?>

        <?php if ($error): ?>
            <div class="alert alert-danger" style="margin-bottom: 1.5rem;">
                <?= htmlspecialchars($error, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>
            </div>
        <?php endif; ?>

        <?php if ($activeTab === 'restore' && $backupModuleEnabled): ?>
            <!-- Restore from Backup Form -->
            <form method="POST" action="/setup" enctype="multipart/form-data">
                <?= CSRF::field() ?>
                <input type="hidden" name="form_action" value="restore">

                <div style="margin-bottom: 1.5rem;">
                    <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 0.5rem;">Restore from Previous Backup</h3>
                    <p style="font-size: 0.875rem; color: var(--text-muted); line-height: 1.4;">
                        Upload a GarrisonOS SQLite snapshot (<code>.sqlite</code> or <code>.sqlite.gz</code>) to restore your database, accounts, and portfolio settings.
                    </p>
                </div>

                <div class="form-group" style="margin-bottom: 1.5rem;">
                    <label class="form-label" for="backup_file">Backup Archive File</label>
                    <input class="form-input" type="file" id="backup_file" name="backup_file" required accept=".sqlite,.gz,.json">
                </div>

                <button type="submit" class="btn btn-primary" style="width: 100%; padding: 0.75rem; font-size: 1rem;">
                    Restore Platform & Database
                </button>
            </form>
        <?php else: ?>
            <!-- Fresh Organization Setup Form -->
            <form method="POST" action="/setup">
                <?= CSRF::field() ?>
                <input type="hidden" name="form_action" value="fresh">

                <div style="margin-bottom: 1.25rem;">
                    <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 0.25rem;">Organization Profile</h3>
                    <p style="font-size: 0.85rem; color: var(--text-muted);">The primary entity or property management company name.</p>
                </div>

                <div class="form-group">
                    <label class="form-label" for="organization_name">Organization / Company Name</label>
                    <input class="form-input" type="text" id="organization_name" name="organization_name" required placeholder="e.g. Blue Ridge Property Management" value="<?= htmlspecialchars($_POST['organization_name'] ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>">
                </div>

                <div style="margin: 1.5rem 0 1rem 0; border-top: 1px solid var(--border-color); padding-top: 1.25rem;">
                    <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 0.25rem;">Administrator Credentials</h3>
                    <p style="font-size: 0.85rem; color: var(--text-muted);">Your master owner login account for GarrisonOS.</p>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div class="form-group">
                        <label class="form-label" for="first_name">First Name</label>
                        <input class="form-input" type="text" id="first_name" name="first_name" required placeholder="Jane" value="<?= htmlspecialchars($_POST['first_name'] ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>">
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="last_name">Last Name</label>
                        <input class="form-input" type="text" id="last_name" name="last_name" required placeholder="Doe" value="<?= htmlspecialchars($_POST['last_name'] ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>">
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label" for="email">Admin Email (Login Username)</label>
                    <input class="form-input" type="email" id="email" name="email" required placeholder="jane@example.com" value="<?= htmlspecialchars($_POST['email'] ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>">
                </div>

                <div class="form-group">
                    <label class="form-label" for="password">Password (min 8 characters)</label>
                    <input class="form-input" type="password" id="password" name="password" required placeholder="••••••••••••" minlength="8">
                </div>

                <div class="form-group">
                    <label class="form-label" for="password_confirm">Confirm Password</label>
                    <input class="form-input" type="password" id="password_confirm" name="password_confirm" required placeholder="••••••••••••" minlength="8">
                </div>

                <div class="form-group" style="margin-top: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                    <input type="checkbox" id="seed_demo_data" name="seed_demo_data" value="1" <?= !empty($_POST['seed_demo_data']) ? 'checked' : '' ?> style="width: 1.1rem; height: 1.1rem; cursor: pointer;">
                    <label for="seed_demo_data" style="font-size: 0.875rem; color: var(--text-main); cursor: pointer;">
                        Seed sample properties, units, and chart of accounts (Demo Data)
                    </label>
                </div>

                <button type="submit" class="btn btn-primary" style="width: 100%; padding: 0.75rem; font-size: 1rem; margin-top: 1.5rem;">
                    Complete Setup & Launch Dashboard
                </button>
            </form>
        <?php endif; ?>
    </div>
</body>
</html>


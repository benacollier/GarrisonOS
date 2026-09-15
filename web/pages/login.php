<?php
$pageTitle = 'Sign In';

$error = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    CSRF::validate();
    $email = trim($_POST['email'] ?? '');
    $password = $_POST['password'] ?? '';
    $tenantId = trim($_POST['tenant_id'] ?? '');

    try {
        $res = $api->post('/api/v1/auth/login', [
            'email' => $email,
            'password' => $password,
            'tenant_id' => !empty($tenantId) ? $tenantId : null
        ]);

        $token = $res['data']['token'];
        $user = $res['data']['user'];

        Auth::login($user, $token);
        Flash::set('success', "Welcome back, {$user['first_name']}!");
        header('Location: /dashboard');
        exit;
    } catch (Exception $e) {
        $error = $e->getMessage();
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sign In – GarrisonOS</title>
    <link rel="stylesheet" href="/public/css/style.css">
</head>
<body style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background-color: #0f172a;">
    <div class="card" style="width: 100%; max-width: 420px; padding: 2.5rem; box-shadow: var(--shadow-lg);">
        <div style="text-align: center; margin-bottom: 2rem;">
            <h1 style="font-size: 1.75rem; font-weight: 800; color: var(--text-main); letter-spacing: -0.02em;">🏰 GarrisonOS</h1>
            <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.25rem;">Zero-dependency Property Management</p>
        </div>

        <?php if ($error): ?>
            <div class="alert alert-danger" style="margin-bottom: 1.5rem;">
                <?= htmlspecialchars($error) ?>
            </div>
        <?php endif; ?>

        <form method="POST" action="/login">
            <?= CSRF::field() ?>
            <div class="form-group">
                <label class="form-label" for="email">Email Address</label>
                <input class="form-input" type="email" id="email" name="email" required placeholder="operator@garrisonos.local" value="<?= htmlspecialchars($_POST['email'] ?? '') ?>">
            </div>

            <div class="form-group">
                <label class="form-label" for="password">Password</label>
                <input class="form-input" type="password" id="password" name="password" required placeholder="••••••••••••">
            </div>

            <div class="form-group">
                <label class="form-label" for="tenant_id">Tenant ID / Account (Optional)</label>
                <input class="form-input" type="text" id="tenant_id" name="tenant_id" placeholder="e.g. tenant-demo" value="<?= htmlspecialchars($_POST['tenant_id'] ?? '') ?>">
            </div>

            <button type="submit" class="btn btn-primary" style="width: 100%; padding: 0.75rem; font-size: 1rem; margin-top: 1rem;">
                Sign In to Platform
            </button>
        </form>
    </div>
</body>
</html>

<?php

// Serve static assets directly when running with PHP's built-in web server
if (php_sapi_name() === 'cli-server') {
    $requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    $targetFile = __DIR__ . $requestPath;
    if ($requestPath !== '/' && is_file($targetFile)) {
        return false;
    }
}

// Secure session cookie hygiene and initialization
if (session_status() === PHP_SESSION_NONE) {
    ini_set('session.cookie_httponly', '1');
    ini_set('session.use_strict_mode', '1');
    $isHttps = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    if ($isHttps) {
        ini_set('session.cookie_secure', '1');
    }
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'domain' => '',
        'secure' => $isHttps,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

require_once __DIR__ . '/lib/csrf.php';
require_once __DIR__ . '/lib/auth.php';
require_once __DIR__ . '/lib/api.php';
require_once __DIR__ . '/lib/hooks.php';

$api = new ApiClient();
HookRegistry::loadModuleHooks(__DIR__ . '/..');

$requestUri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$path = trim($requestUri, '/');

// System Configuration Check (First-Launch Setup Detection)
$isConfigured = true;
try {
    $statusRes = $api->get('/api/v1/system/status');
    $isConfigured = !empty($statusRes['data']['is_configured']);
} catch (Exception $e) {
    // If status check fails, assume configured to avoid blocking normal auth
}

if (!$isConfigured && $path !== 'setup') {
    header('Location: /setup');
    exit;
}

if ($path === 'setup') {
    if ($isConfigured) {
        header('Location: /login');
        exit;
    }
    require __DIR__ . '/pages/setup.php';
    exit;
}

// Static / Authentication Routing
if ($path === 'login') {
    require __DIR__ . '/pages/login.php';
    exit;
}

if ($path === 'logout') {
    Auth::logout();
    header('Location: /login');
    exit;
}

// Redirect unauthenticated requests to login
if (!Auth::check()) {
    header('Location: /login');
    exit;
}

// Enforce CSRF token verification on state-modifying requests
if (in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['POST', 'PUT', 'DELETE', 'PATCH']) && $path !== 'login') {
    CSRF::validate();
}

// Route Resolution
$targetPageFile = null;
$pageTitle = 'GarrisonOS';

if ($path === '' || $path === 'dashboard') {
    $targetPageFile = __DIR__ . '/pages/dashboard.php';
} else {
    $parts = explode('/', $path);
    $module = $parts[0] ?? '';
    $action = $parts[1] ?? 'index';

    if ($module === 'backups') {
        $module = 'backup';
    }

    $modulePage = __DIR__ . "/../modules/{$module}/frontend/pages/{$action}.php";
    if (file_exists($modulePage)) {
        $targetPageFile = $modulePage;
    } else {
        $targetPageFile = __DIR__ . '/pages/404.php';
    }
}

// Render Page within Layout
ob_start();
try {
    require $targetPageFile;
} catch (ApiException $e) {
    ob_clean();
    $errorMessage = $e->getMessage();
    $errorCode = $e->getErrorCode();
    require __DIR__ . '/pages/error.php';
} catch (Throwable $e) {
    ob_clean();
    $errorMessage = 'An unexpected error occurred. Please try again.';
    $errorCode = 'SYSTEM_ERROR';
    require __DIR__ . '/pages/error.php';
}
$pageContent = ob_get_clean();

require __DIR__ . '/templates/layout.php';

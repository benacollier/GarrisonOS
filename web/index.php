<?php

if (session_status() === PHP_SESSION_NONE) {
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

// Route Resolution
$targetPageFile = null;
$pageTitle = 'GarrisonOS';

if ($path === '' || $path === 'dashboard') {
    $targetPageFile = __DIR__ . '/pages/dashboard.php';
} else {
    $parts = explode('/', $path);
    $module = $parts[0] ?? '';
    $action = $parts[1] ?? 'index';

    $modulePage = __DIR__ . "/../modules/{$module}/frontend/pages/{$action}.php";
    if (file_exists($modulePage)) {
        $targetPageFile = $modulePage;
    } else {
        $targetPageFile = __DIR__ . '/pages/404.php';
    }
}

// Render Page within Layout
ob_start();
require $targetPageFile;
$pageContent = ob_get_clean();

require __DIR__ . '/templates/layout.php';


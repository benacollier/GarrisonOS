# Frontend Presentation Layer Guide

GarrisonOS presentation layer is engineered in native PHP 8.2+ with semantic HTML5 and vanilla CSS Custom Properties.

---

## 1. Zero-Framework Philosophy

* **No CSS Preprocessors**: Standard CSS Custom Properties (`web/public/css/variables.css`, `web/public/css/style.css`) provide theming, spacing tokens, and typography.
* **No Client JS Frameworks**: Dynamic components (such as modals and drawers) utilize native HTML `<dialog>` and standard browser APIs.
* **No Composer Packages**: Relies exclusively on PHP's standard cURL, PDO, and session modules.

---

## 2. Dynamic Slot & Hook System

Modules inject navigation links, dashboard metrics, and detail tabs using `frontend/hooks.php`:

```php
<?php
// Example modules/properties/frontend/hooks.php
use GarrisonOS\Hooks;

Hooks::registerNav([
    'label' => 'Properties',
    'url'   => '/properties',
    'icon'  => 'building',
    'order' => 10
]);

Hooks::registerDashboardMetric(function($api) {
    $stats = $api->get('/api/v1/properties/occupancy-stats');
    return [
        'title' => 'Occupancy Rate',
        'value' => $stats['occupancy_rate'] . '%',
        'sub'   => $stats['occupied_units'] . ' of ' . $stats['total_units'] . ' units'
    ];
});
```

---

## 3. Session & CSRF Security

### Session Cookie Hygiene & Hardening
Production PHP configurations (`php.ini` or front controller) must enforce strict cookie hygiene:
```ini
session.cookie_httponly = 1
session.cookie_secure = 1
session.cookie_samesite = "Strict"
session.use_strict_mode = 1
```

### CSRF Protection
Every state-modifying form in PHP must include the CSRF token:

```html
<form method="POST" action="/properties/create">
    <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($_SESSION['csrf_token'] ?? '') ?>">
    <!-- Inputs -->
    <button type="submit" class="btn btn-primary">Save Property</button>
</form>
```
The front controller (`web/index.php`) automatically verifies `csrf_token` on all `POST`, `PUT`, and `DELETE` requests before dispatching to page templates.


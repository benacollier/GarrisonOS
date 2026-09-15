<?php
$currentUri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$navItems = HookRegistry::getNavigation();
?>
<aside class="sidebar">
    <div class="sidebar-header">
        <a href="/dashboard">🏰 GarrisonOS</a>
    </div>
    <nav class="sidebar-nav">
        <a href="/dashboard" class="nav-link <?= $currentUri === '/' || $currentUri === '/dashboard' ? 'active' : '' ?>">
            <span>📊</span> Dashboard
        </a>
        <?php foreach ($navItems as $nav): ?>
            <?php
                $isActive = str_starts_with($currentUri, $nav['route']);
                $iconMap = [
                    'building' => '🏢',
                    'users' => '👥',
                    'file-text' => '📄',
                    'dollar-sign' => '💵',
                    'list' => '📋',
                    'file-bar-chart' => '📈',
                    'tool' => '🔧'
                ];
                $icon = $iconMap[$nav['icon'] ?? ''] ?? '📁';
            ?>
            <a href="<?= htmlspecialchars($nav['route']) ?>" class="nav-link <?= $isActive ? 'active' : '' ?>">
                <span><?= $icon ?></span> <?= htmlspecialchars($nav['label']) ?>
            </a>
        <?php endforeach; ?>
    </nav>
    <div class="sidebar-footer">
        <small>GarrisonOS v1.0.0 (Open Source)</small>
    </div>
</aside>


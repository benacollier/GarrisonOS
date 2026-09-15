<?php
$user = Auth::user();
$tenantId = Auth::tenantId();
?>
<header class="topbar">
    <div class="tenant-selector">
        <span>🏢 <strong><?= htmlspecialchars($tenantId) ?></strong></span>
    </div>
    <div class="user-profile">
        <?php if ($user): ?>
            <span><?= htmlspecialchars($user['first_name'] . ' ' . $user['last_name']) ?> (<?= htmlspecialchars($user['role']) ?>)</span>
            <a href="/logout" class="btn btn-sm btn-secondary">Sign Out</a>
        <?php else: ?>
            <a href="/login" class="btn btn-sm btn-primary">Sign In</a>
        <?php endif; ?>
    </div>
</header>


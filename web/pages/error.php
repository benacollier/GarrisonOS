<?php
$pageTitle = 'Service Notice';
$errorMessage = $errorMessage ?? 'An unexpected error occurred while communicating with the GarrisonOS core engine.';
$errorCode = $errorCode ?? 'ERROR';
?>
<div class="card" style="text-align: center; padding: 4rem 2rem; max-width: 640px; margin: 2rem auto;">
    <div style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
    <h2 class="card-title" style="margin-bottom: 1rem;">Service Notice</h2>
    <p class="text-muted" style="margin-bottom: 1.5rem; line-height: 1.6;"><?= htmlspecialchars((string)$errorMessage, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></p>
    <div style="margin-bottom: 2rem;">
        <span class="badge" style="font-family: monospace; font-size: 0.85rem; padding: 0.35rem 0.75rem;"><?= htmlspecialchars((string)$errorCode, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></span>
    </div>
    <div class="btn-group" style="justify-content: center;">
        <a href="/dashboard" class="btn btn-secondary">Return to Dashboard</a>
        <button onclick="window.location.reload()" class="btn btn-primary">Retry Request</button>
    </div>
</div>

<?php
// Contacts Module - Contact Detail Page
$id = $_GET['id'] ?? '';
if (!$id) {
    header('Location: /contacts');
    exit;
}

$contact = null;
$error = null;

try {
    $res = $api->get("/api/v1/contacts/{$id}");
    $contact = $res['data']['contact'] ?? null;
} catch (Exception $e) {
    $error = $e->getMessage();
}

if (!$contact) {
    echo "<div class='alert alert-danger'>Contact not found.</div>";
    return;
}

$pageTitle = htmlspecialchars($contact['first_name'] . ' ' . $contact['last_name']);
?>

<div class="page-header">
    <div>
        <a href="/contacts" class="text-muted">← Back to Contacts</a>
        <h1 class="page-title"><?= htmlspecialchars($contact['first_name'] . ' ' . $contact['last_name']) ?></h1>
        <p class="page-subtitle">
            <span class="badge"><?= htmlspecialchars(ucfirst($contact['contact_type'])) ?></span>
            <?php if (!empty($contact['company_name'])): ?>
                • <?= htmlspecialchars($contact['company_name']) ?>
            <?php endif; ?>
        </p>
    </div>
</div>

<div class="grid-2-col">
    <div class="card">
        <div class="card-header">
            <h2 class="card-title">Contact Information</h2>
        </div>
        <div class="detail-list">
            <div class="detail-item">
                <span class="detail-label">Full Name</span>
                <span class="detail-value"><?= htmlspecialchars($contact['first_name'] . ' ' . $contact['last_name']) ?></span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Contact Type</span>
                <span class="detail-value"><?= htmlspecialchars(ucfirst($contact['contact_type'])) ?></span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Email</span>
                <span class="detail-value"><?= !empty($contact['email']) ? '<a href="mailto:' . htmlspecialchars($contact['email']) . '">' . htmlspecialchars($contact['email']) . '</a>' : '—' ?></span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Primary Phone</span>
                <span class="detail-value"><?= !empty($contact['phone']) ? htmlspecialchars($contact['phone']) : '—' ?></span>
            </div>
            <?php if (!empty($contact['secondary_phone'])): ?>
            <div class="detail-item">
                <span class="detail-label">Secondary Phone</span>
                <span class="detail-value"><?= htmlspecialchars($contact['secondary_phone']) ?></span>
            </div>
            <?php endif; ?>
            <?php if (!empty($contact['vendor_specialty'])): ?>
            <div class="detail-item">
                <span class="detail-label">Specialty</span>
                <span class="detail-value"><?= htmlspecialchars($contact['vendor_specialty']) ?></span>
            </div>
            <?php endif; ?>
        </div>
    </div>

    <div class="card">
        <div class="card-header">
            <h2 class="card-title">Notes & Background</h2>
        </div>
        <div class="card-body">
            <?php if (!empty($contact['notes'])): ?>
                <p><?= nl2br(htmlspecialchars($contact['notes'])) ?></p>
            <?php else: ?>
                <p class="text-muted">No notes recorded for this contact.</p>
            <?php endif; ?>
        </div>
    </div>
</div>


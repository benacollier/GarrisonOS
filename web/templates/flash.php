<?php
$messages = Flash::get();
if (!empty($messages)):
    foreach ($messages as $msg):
        $typeClass = match ($msg['type']) {
            'success' => 'alert-success',
            'error', 'danger' => 'alert-danger',
            'warning' => 'alert-warning',
            default => 'alert-info'
        };
?>
    <div class="alert <?= $typeClass ?>">
        <?= htmlspecialchars($msg['message']) ?>
    </div>
<?php
    endforeach;
endif;
?>

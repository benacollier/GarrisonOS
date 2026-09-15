<?php
// Backup Module Hook Registrations

HookRegistry::registerNavigation([
    'label' => 'Backups',
    'route' => '/backup',
    'icon' => 'archive',
    'order' => 90,
    'section' => 'system'
]);

HookRegistry::registerDashboardCard(function ($api) {
    try {
        $res = $api->get('/api/v1/backups?limit=1');
        $items = $res['data']['items'] ?? [];
        $latest = !empty($items) ? $items[0] : null;

        if ($latest) {
            $createdAgo = round((time() - ($latest['created_at'] / 1000)) / 3600, 1);
            $sizeMb = round($latest['file_size_bytes'] / (1024 * 1024), 2);
            $status = $latest['status'];

            return [
                'id' => 'backup_status',
                'title' => 'System Backup',
                'value' => ucfirst($status),
                'subtitle' => "Last: {$createdAgo} hrs ago ({$sizeMb} MB)",
                'order' => 90
            ];
        }

        return [
            'id' => 'backup_status',
            'title' => 'System Backup',
            'value' => 'None',
            'subtitle' => 'No backups on record',
            'order' => 90
        ];
    } catch (Exception $e) {
        return null;
    }
});


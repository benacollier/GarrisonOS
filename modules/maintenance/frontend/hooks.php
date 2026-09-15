<?php
// Maintenance Module Hook Registrations

HookRegistry::registerNavigation([
    'label' => 'Maintenance',
    'route' => '/maintenance',
    'icon' => 'tool',
    'order' => 50,
    'section' => 'operations'
]);

HookRegistry::registerDashboardCard(function ($api) {
    try {
        $res = $api->get('/api/v1/maintenance/metrics');
        $metrics = $res['data']['metrics'] ?? [];
        $openOrders = $metrics['openWorkOrders'] ?? 0;
        $emergencies = $metrics['emergencyWorkOrders'] ?? 0;

        return [
            'id' => 'maintenance_metric',
            'title' => 'Open Work Orders',
            'value' => (string)$openOrders,
            'subtitle' => $emergencies > 0 ? "{$emergencies} emergency repairs pending" : 'All priority levels normal',
            'order' => 30
        ];
    } catch (Exception $e) {
        return null;
    }
});


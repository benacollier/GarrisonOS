<?php
// Properties Module Hook Registrations

HookRegistry::registerNavigation([
    'label' => 'Properties',
    'route' => '/properties',
    'icon' => 'building',
    'order' => 10,
    'section' => 'portfolio'
]);

HookRegistry::registerDashboardCard(function ($api) {
    try {
        $res = $api->get('/api/v1/properties/metrics/occupancy');
        $metrics = $res['data']['metrics'] ?? [];
        $occupancyRate = $metrics['occupancyRatePercentage'] ?? 0;
        $totalUnits = $metrics['totalUnits'] ?? 0;
        $occupiedUnits = $metrics['occupiedUnits'] ?? 0;

        return [
            'id' => 'occupancy_metric',
            'title' => 'Portfolio Occupancy',
            'value' => number_format($occupancyRate, 1) . '%',
            'subtitle' => "{$occupiedUnits} of {$totalUnits} units occupied",
            'order' => 10
        ];
    } catch (Exception $e) {
        return null;
    }
});

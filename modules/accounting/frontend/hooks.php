<?php
// Accounting Module Hook Registrations

HookRegistry::registerNavigation([
    'label' => 'Accounting',
    'route' => '/accounting',
    'icon' => 'dollar-sign',
    'order' => 40,
    'section' => 'financial'
]);

HookRegistry::registerNavigation([
    'label' => 'Rent Roll',
    'route' => '/accounting/rent-roll',
    'icon' => 'list',
    'order' => 41,
    'section' => 'financial'
]);

HookRegistry::registerNavigation([
    'label' => 'Schedule E Tax',
    'route' => '/accounting/schedule-e',
    'icon' => 'file-bar-chart',
    'order' => 42,
    'section' => 'financial'
]);

HookRegistry::registerNavigation([
    'label' => 'QuickBooks Sync',
    'route' => '/accounting/quickbooks',
    'icon' => 'refresh-cw',
    'order' => 43,
    'section' => 'financial'
]);

HookRegistry::registerNavigation([
    'label' => 'Chart of Accounts',
    'route' => '/accounting/chart-of-accounts',
    'icon' => 'book-open',
    'order' => 44,
    'section' => 'financial'
]);

HookRegistry::registerDashboardCard(function ($api) {
    try {
        $res = $api->get('/api/v1/accounting/rent-roll');
        $summary = $res['data']['summary'] ?? [];
        $delinquencyCents = $summary['totalDelinquencyCents'] ?? 0;
        $scheduledCents = $summary['totalScheduledRentCents'] ?? 0;

        return [
            'id' => 'delinquency_metric',
            'title' => 'Delinquent Balance',
            'value' => '$' . number_format($delinquencyCents / 100, 2),
            'subtitle' => 'Against $' . number_format($scheduledCents / 100, 2) . ' total monthly roll',
            'order' => 20
        ];
    } catch (Exception $e) {
        return null;
    }
});


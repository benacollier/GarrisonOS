<?php

class HookRegistry {
    private static array $navigation = [];
    private static array $dashboardCards = [];

    public static function registerNavigation(array $item): void {
        self::$navigation[] = $item;
    }

    public static function getNavigation(): array {
        $nav = self::$navigation;
        usort($nav, function ($a, $b) {
            return ($a['order'] ?? 100) <=> ($b['order'] ?? 100);
        });
        return $nav;
    }

    public static function registerDashboardCard(string $path, callable $callback): void {
        self::$dashboardCards[] = ['path' => $path, 'callback' => $callback];
    }

    public static function getDashboardCards(ApiClient $api): array {
        $cards = [];
        $paths = array_map(static fn (array $card): string => $card['path'], self::$dashboardCards);
        try {
            $responses = $api->batch($paths);
        } catch (Exception $e) {
            return $cards;
        }
        foreach (self::$dashboardCards as $card) {
            try {
                $dashboardCard = ($card['callback'])($responses[$card['path']] ?? null);
                if ($dashboardCard && is_array($dashboardCard)) {
                    $cards[] = $dashboardCard;
                }
            } catch (Exception $e) {
                // Ignore individual card failures
            }
        }
        usort($cards, function ($a, $b) {
            return ($a['order'] ?? 100) <=> ($b['order'] ?? 100);
        });
        return $cards;
    }

    public static function loadModuleHooks(string $baseDir): void {
        $modulesDir = rtrim($baseDir, '/\\') . '/modules';
        if (!is_dir($modulesDir)) return;

        $modules = scandir($modulesDir);
        foreach ($modules as $mod) {
            if ($mod === '.' || $mod === '..') continue;
            $hookFile = "{$modulesDir}/{$mod}/frontend/hooks.php";
            if (file_exists($hookFile)) {
                require_once $hookFile;
            }
        }
    }
}

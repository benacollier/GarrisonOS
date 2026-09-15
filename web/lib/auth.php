<?php

class Flash {
    public static function set(string $type, string $message): void {
        $_SESSION['flash_messages'][] = [
            'type' => $type,
            'message' => $message
        ];
    }

    public static function get(): array {
        $messages = $_SESSION['flash_messages'] ?? [];
        unset($_SESSION['flash_messages']);
        return $messages;
    }
}

class Auth {
    public static function check(): bool {
        return !empty($_SESSION['auth_token']) && !empty($_SESSION['user']);
    }

    public static function user(): ?array {
        return $_SESSION['user'] ?? null;
    }

    public static function token(): ?string {
        return $_SESSION['auth_token'] ?? null;
    }

    public static function tenantId(): string {
        return $_SESSION['tenant_id'] ?? ($_SESSION['user']['tenant_id'] ?? 'tenant-demo');
    }

    public static function setTenantId(string $tenantId): void {
        $_SESSION['tenant_id'] = $tenantId;
    }

    public static function login(array $user, string $token): void {
        $_SESSION['user'] = $user;
        $_SESSION['auth_token'] = $token;
        $_SESSION['tenant_id'] = $user['tenant_id'];
    }

    public static function logout(): void {
        unset($_SESSION['user']);
        unset($_SESSION['auth_token']);
        unset($_SESSION['tenant_id']);
        session_regenerate_id(true);
    }
}

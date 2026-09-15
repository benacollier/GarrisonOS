<?php

class ApiException extends Exception {
    private string $errorCode;
    private array $details;

    public function __construct(string $message, string $errorCode = 'API_ERROR', int $statusCode = 400, array $details = []) {
        parent::__construct($message, $statusCode);
        $this->errorCode = $errorCode;
        $this->details = $details;
    }

    public function getErrorCode(): string {
        return $this->errorCode;
    }

    public function getDetails(): array {
        return $this->details;
    }
}

class ApiClient {
    private string $baseUrl;

    public function __construct(string $baseUrl = 'http://127.0.0.1:3000') {
        $this->baseUrl = rtrim($baseUrl, '/');
    }

    public function request(string $method, string $path, ?array $data = null): array {
        $url = $this->baseUrl . (str_starts_with($path, '/') ? $path : '/' . $path);
        $ch = curl_init();

        $headers = [
            'Accept: application/json',
            'X-Tenant-ID: ' . Auth::tenantId()
        ];

        if (Auth::check()) {
            $headers[] = 'Authorization: Bearer ' . Auth::token();
            $user = Auth::user();
            if (!empty($user['id'])) {
                $headers[] = 'X-User-ID: ' . $user['id'];
            }
        }

        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, strtoupper($method));
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);

        if ($data !== null && in_array(strtoupper($method), ['POST', 'PUT', 'PATCH'])) {
            $json = json_encode($data);
            $headers[] = 'Content-Type: application/json';
            $headers[] = 'Content-Length: ' . strlen($json);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
        }

        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            throw new ApiException("Failed to connect to GarrisonOS Engine at {$this->baseUrl}: {$curlError}", 'CONNECTION_ERROR', 503);
        }

        $decoded = json_decode($response, true);
        if (!is_array($decoded)) {
            throw new ApiException("Invalid JSON response from server (HTTP {$httpCode}): {$response}", 'INVALID_RESPONSE', $httpCode);
        }

        if (empty($decoded['success'])) {
            $err = $decoded['error'] ?? [];
            $msg = $err['message'] ?? "API Request Failed with status {$httpCode}";
            $code = $err['code'] ?? 'API_ERROR';
            $details = $err['details'] ?? [];
            throw new ApiException($msg, $code, $httpCode, $details);
        }

        return $decoded;
    }

    public function get(string $path, array $params = []): array {
        if (!empty($params)) {
            $path .= (str_contains($path, '?') ? '&' : '?') . http_build_query($params);
        }
        return $this->request('GET', $path);
    }

    public function post(string $path, array $data = []): array {
        return $this->request('POST', $path, $data);
    }

    public function put(string $path, array $data = []): array {
        return $this->request('PUT', $path, $data);
    }

    public function delete(string $path): array {
        return $this->request('DELETE', $path);
    }
}


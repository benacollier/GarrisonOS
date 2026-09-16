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

    public function __construct(?string $baseUrl = null) {
        if ($baseUrl !== null && $baseUrl !== '') {
            $this->baseUrl = rtrim($baseUrl, '/');
        } elseif (!empty($_SERVER['API_URL'])) {
            $this->baseUrl = rtrim((string)$_SERVER['API_URL'], '/');
        } elseif (($envApi = getenv('API_URL')) !== false && $envApi !== '') {
            $this->baseUrl = rtrim($envApi, '/');
        } elseif (($envPort = getenv('PORT')) !== false && $envPort !== '') {
            $this->baseUrl = 'http://127.0.0.1:' . $envPort;
        } elseif (!empty($_SERVER['PORT'])) {
            $this->baseUrl = 'http://127.0.0.1:' . $_SERVER['PORT'];
        } else {
            $this->baseUrl = 'http://127.0.0.1:3000';
        }
    }

    public function request(string $method, string $path, ?array $data = null): array {
        $url = $this->baseUrl . (str_starts_with($path, '/') ? $path : '/' . $path);
        $methodUpper = strtoupper($method);

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

        $body = null;
        if ($data !== null && in_array($methodUpper, ['POST', 'PUT', 'PATCH'])) {
            $body = json_encode($data);
            $headers[] = 'Content-Type: application/json';
            $headers[] = 'Content-Length: ' . strlen($body);
        }

        $response = false;
        $httpCode = 0;
        $transportError = '';

        if (function_exists('curl_init')) {
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $methodUpper);
            curl_setopt($ch, CURLOPT_TIMEOUT, 10);

            if ($body !== null) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
            }

            curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $transportError = curl_error($ch);
            if (PHP_VERSION_ID < 80500) {
                curl_close($ch);
            } else {
                unset($ch);
            }
        } else {
            $opts = [
                'http' => [
                    'method' => $methodUpper,
                    'header' => implode("\r\n", $headers) . "\r\n",
                    'timeout' => 10,
                    'ignore_errors' => true
                ]
            ];
            if ($body !== null) {
                $opts['http']['content'] = $body;
            }
            $context = stream_context_create($opts);
            $fp = @fopen($url, 'r', false, $context);
            if ($fp) {
                $meta = stream_get_meta_data($fp);
                $response = stream_get_contents($fp);
                fclose($fp);
                if (isset($meta['wrapper_data']) && is_array($meta['wrapper_data'])) {
                    foreach ($meta['wrapper_data'] as $headerLine) {
                        if (preg_match('#^HTTP/\S+\s+(\d+)#', $headerLine, $matches)) {
                            $httpCode = (int)$matches[1];
                        }
                    }
                }
            } else {
                $lastErr = error_get_last();
                $transportError = $lastErr['message'] ?? 'Failed to open stream';
            }
        }

        if ($response === false) {
            throw new ApiException("Failed to connect to GarrisonOS Engine at {$this->baseUrl}: {$transportError}", 'CONNECTION_ERROR', 503);
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

    /**
     * Execute multiple read-only API requests in one round trip.
     *
     * @param array<int, string> $paths
     * @return array<string, array<string, mixed>> Responses include an explicit `ok` flag.
     */
    public function batch(array $paths): array {
        if (count($paths) !== count(array_unique($paths))) {
            throw new InvalidArgumentException('Batch paths must be unique');
        }
        $response = $this->post('/api/v1/batch', [
            'requests' => array_map(
                static fn (string $path): array => ['method' => 'GET', 'path' => $path],
                $paths
            )
        ]);
        $responses = $response['data']['responses'] ?? [];
        $result = [];
        foreach ($responses as $item) {
            if (is_array($item) && isset($item['path'])) {
                $item['ok'] = ($item['success'] ?? false) === true
                    && isset($item['status'])
                    && is_int($item['status'])
                    && $item['status'] >= 200
                    && $item['status'] < 300;
                $result[(string)$item['path']] = $item;
            }
        }
        return $result;
    }
}

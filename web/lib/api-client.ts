import http from 'node:http';
import https from 'node:https';

/**
 * Exception raised when an internal API request encounters an HTTP error or protocol failure.
 */
export class ApiException extends Error {
  /**
   * Creates an ApiException instance.
   *
   * @param message - Human-readable error description.
   * @param errorCode - Machine-readable error code string.
   * @param statusCode - HTTP status code.
   * @param details - Optional error details or validation violations.
   */
  constructor(
    message: string,
    public readonly errorCode: string = 'API_ERROR',
    public readonly statusCode: number = 400,
    public readonly details: unknown = null
  ) {
    super(message);
    this.name = 'ApiException';
  }
}

/**
 * Configuration options for initializing an ApiClient instance.
 */
export interface ApiClientOptions {
  /**
   * Base URL of the core engine HTTP service.
   */
  baseUrl?: string;

  /**
   * Operator isolation ID forwarded in X-Operator-ID header.
   */
  operatorId?: string;

  /**
   * Bearer authentication token.
   */
  authToken?: string | null;

  /**
   * Authenticated user ID forwarded in X-User-ID header.
   */
  userId?: string | null;
}

/**
 * HTTP client for communicating natively with the internal GarrisonOS Core Engine API.
 * Forwards operator and user context headers with loopback security checks.
 */
export class ApiClient {
  private baseUrl: string;
  private operatorId: string;
  private authToken: string | null;
  private userId: string | null;

  /**
   * Initializes a new ApiClient instance.
   *
   * @param options - Optional client configuration options.
   */
  constructor(options?: ApiClientOptions) {
    const port = process.env['PORT'] || '3000';
    const host = process.env['HOST'] || '127.0.0.1';
    this.baseUrl = (options?.baseUrl || process.env['API_URL'] || `http://${host}:${port}`).replace(/\/$/, '');
    this.operatorId = options?.operatorId || 'operator-demo';
    this.authToken = options?.authToken ?? null;
    this.userId = options?.userId ?? null;
  }

  /**
   * Dispatches an HTTP request to the internal API and deserializes the JSON response envelope.
   *
   * @typeParam T - Expected response envelope or data type.
   * @param method - HTTP verb ('GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH').
   * @param path - Relative API endpoint path.
   * @param data - Optional JSON serializable body payload.
   * @returns Deserialized API response.
   * @throws ApiException if request fails or non-2xx status code returned.
   */
  public async request<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    data?: unknown
  ): Promise<T> {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(this.baseUrl + cleanPath);
    const isHttps = url.protocol === 'https:';
    const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';

    if (this.authToken && url.protocol === 'http:' && !isLoopback) {
      throw new ApiException('Refusing to send authentication over non-loopback HTTP', 'INSECURE_TRANSPORT', 400);
    }

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'X-Operator-ID': this.operatorId
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    if (this.userId) {
      headers['X-User-ID'] = this.userId;
    }

    let bodyData: string | undefined;
    if (data !== undefined && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      bodyData = JSON.stringify(data);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = String(Buffer.byteLength(bodyData));
    }

    return new Promise((resolve, reject) => {
      const req = (isHttps ? https : http).request(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          method,
          headers,
          timeout: 15000
        },
        (res) => {
          let chunks = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            chunks += chunk;
          });
          res.on('end', () => {
            let parsed: any;
            try {
              parsed = chunks ? JSON.parse(chunks) : {};
            } catch {
              parsed = { success: false, error: { message: chunks || 'Invalid response from server' } };
            }

            const statusCode = res.statusCode || 500;
            if (statusCode >= 200 && statusCode < 300) {
              resolve(parsed);
            } else {
              const errMsg = parsed?.error?.message || `API request failed with status ${statusCode}`;
              const errCode = parsed?.error?.code || 'API_ERROR';
              const details = parsed?.error?.details || null;
              reject(new ApiException(errMsg, errCode, statusCode, details));
            }
          });
        }
      );

      req.on('error', (err) => {
        reject(new ApiException(`API communication error: ${err.message}`, 'NETWORK_ERROR', 503));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new ApiException('API request timed out', 'TIMEOUT', 504));
      });

      if (bodyData) {
        req.write(bodyData);
      }
      req.end();
    });
  }

  /**
   * Dispatches an HTTP GET request to the internal API.
   *
   * @typeParam T - Expected response payload type.
   * @param path - Relative API endpoint path.
   * @returns Deserialized API response.
   */
  public get<T = any>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  /**
   * Dispatches an HTTP POST request to the internal API.
   *
   * @typeParam T - Expected response payload type.
   * @param path - Relative API endpoint path.
   * @param data - Optional request body payload.
   * @returns Deserialized API response.
   */
  public post<T = any>(path: string, data?: unknown): Promise<T> {
    return this.request<T>('POST', path, data);
  }

  /**
   * Dispatches an HTTP PUT request to the internal API.
   *
   * @typeParam T - Expected response payload type.
   * @param path - Relative API endpoint path.
   * @param data - Optional request body payload.
   * @returns Deserialized API response.
   */
  public put<T = any>(path: string, data?: unknown): Promise<T> {
    return this.request<T>('PUT', path, data);
  }

  /**
   * Dispatches an HTTP DELETE request to the internal API.
   *
   * @typeParam T - Expected response payload type.
   * @param path - Relative API endpoint path.
   * @param data - Optional request body payload.
   * @returns Deserialized API response.
   */
  public delete<T = any>(path: string, data?: unknown): Promise<T> {
    return this.request<T>('DELETE', path, data);
  }

  /**
   * Dispatches a batch aggregation request for multiple GET endpoints.
   *
   * @param paths - Array of relative GET endpoint paths.
   * @returns Map of endpoint paths to API responses.
   */
  public async batch(paths: string[]): Promise<Record<string, any>> {
    if (paths.length === 0) return {};
    const res = await this.post('/api/v1/batch', { requests: paths });
    return res?.data?.responses || {};
  }
}

import { aiConfig } from './ai-config-service';
import { logger } from '@/lib/logging/logger';
import { AiError } from './ai-response';

const isServer = typeof window === 'undefined';

// Dynamic imports for server-side only modules
let https: typeof import('node:https') | undefined;
let http: typeof import('node:http') | undefined;
let fs: typeof import('node:fs') | undefined;
let zlib: typeof import('node:zlib') | undefined;
let HttpsProxyAgent: any;

if (isServer) {
  https = require('node:https');
  http = require('node:http');
  fs = require('node:fs');
  zlib = require('node:zlib');
  HttpsProxyAgent = require('https-proxy-agent').HttpsProxyAgent;
}

export type HttpFetchErrorKind = 'dns' | 'tls' | 'timeout' | 'http' | 'other';

export class HttpFetchError extends Error {
  constructor(
    message: string,
    public readonly kind: HttpFetchErrorKind,
    public readonly status?: number,
    public readonly url?: string,
  ) {
    super(message);
    this.name = 'HttpFetchError';
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;

/**
 * Classify a low-level Node request error into a stable kind
 * so callers can branch deterministically (crawl_failed vs tls_blocked).
 */
function classifyRequestError(err: NodeJS.ErrnoException, url: string): HttpFetchError {
  const code = err.code || '';
  const msg = err.message || String(err);

  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ECONNREFUSED' || code === 'EHOSTUNREACH') {
    return new HttpFetchError(`DNS/connect failure: ${msg}`, 'dns', undefined, url);
  }
  if (
    code === 'CERT_HAS_EXPIRED' ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' ||
    /SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|CERT_HAS_EXPIRED/i.test(msg)
  ) {
    return new HttpFetchError(`TLS failure: ${msg}`, 'tls', undefined, url);
  }
  if (code === 'ETIMEDOUT' || /timed out/i.test(msg)) {
    return new HttpFetchError(`Timeout: ${msg}`, 'timeout', undefined, url);
  }
  return new HttpFetchError(msg, 'other', undefined, url);
}

/**
 * Build the request agent once per top-level call and reuse across redirect hops
 * so TLS/CA/proxy settings are preserved end-to-end.
 */
function buildAgent(): any {
  if (!isServer || !https) return null;
  const agentOptions: any = {
    rejectUnauthorized: !aiConfig.allowInsecureTls,
  };

  if (aiConfig.caBundlePath && fs) {
    try {
      if (fs.existsSync(aiConfig.caBundlePath)) {
        agentOptions.ca = fs.readFileSync(aiConfig.caBundlePath);
      }
    } catch {
      // non-fatal; fall through with default CAs
    }
  }

  if (aiConfig.proxyUrl && HttpsProxyAgent) {
    return new HttpsProxyAgent(aiConfig.proxyUrl, agentOptions);
  }
  return new https.Agent(agentOptions);
}

/**
 * Specialized HTTP Client for AI Providers and external discovery.
 * Handles corporate complexities: Authenticated Proxies, Custom CAs, and Dev-only TLS bypass.
 */
export class AiHttpClient {
  /**
   * Performs a JSON POST request with robust connectivity support.
   */
  static async post<T>(url: string, headers: Record<string, string>, body: any): Promise<T> {
    if (!isServer || !https) {
      throw new Error('AiHttpClient.post is only available on the server');
    }
    const parsedUrl = new URL(url);
    const options: any = {
      method: 'POST',
      timeout: DEFAULT_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const agentOptions: any = {
      rejectUnauthorized: !aiConfig.allowInsecureTls,
    };

    if (aiConfig.caBundlePath) {
      try {
        if (fs.existsSync(aiConfig.caBundlePath)) {
          agentOptions.ca = fs.readFileSync(aiConfig.caBundlePath);
          logger.info("ai:http:ca-loaded", { path: aiConfig.caBundlePath });
        } else {
          logger.warn("ai:http:ca-missing", { path: aiConfig.caBundlePath });
        }
      } catch (err) {
        logger.error("ai:http:ca-load-failed", {
          path: aiConfig.caBundlePath,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    if (aiConfig.proxyUrl) {
      const safeProxy = aiConfig.proxyUrl.replace(/:[^:@]+@/, ":****@");
      logger.info("ai:http:using-proxy", { proxy: safeProxy });
      options.agent = new HttpsProxyAgent(aiConfig.proxyUrl, agentOptions);
    } else {
      options.agent = new https.Agent(agentOptions);
    }

    return new Promise((resolve, reject) => {
      if (!isServer || !https || !http) {
        reject(new Error('AiHttpClient is only available on the server'));
        return;
      }
      const req = (parsedUrl.protocol === 'https:' ? https : http).request(url, options, (res: any) => {
        let responseData = '';
        res.on('data', (chunk: any) => {
          responseData += chunk;
        });

        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(responseData) as T);
            } catch {
              reject(new AiError("Failed to parse AI response JSON", "PARSE_ERROR"));
            }
          } else {
            let errorMessage = res.statusMessage || `Status ${res.statusCode}`;
            try {
              const parsed = JSON.parse(responseData);
              errorMessage = parsed.error?.message || parsed.message || errorMessage;
            } catch {
              // Not JSON, use status message
            }
            reject(new AiError(`${errorMessage}`, "API_ERROR", res.statusCode));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error('Request timed out'));
      });

      req.on('error', (err: any) => {
        if (err.message?.includes('SELF_SIGNED_CERT_IN_CHAIN')) {
          logger.error("ai:http:ssl-error", {
            detail: "Self-signed certificate detected in chain. Use AI_CA_BUNDLE_PATH or (in dev only) AI_INSECURE_TLS=true."
          });
        }
        reject(err);
      });

      req.write(JSON.stringify(body));
      req.end();
    });
  }

  /**
   * Performs a robust GET request for external discovery.
   * Follows up to 5 redirects (301/302/303/307/308) and preserves TLS/CA/proxy settings
   * across the chain. Classifies transport failures into a stable HttpFetchError.kind
   * so callers can distinguish DNS vs TLS vs timeout vs non-2xx.
   */
  static async get(
    url: string,
    headers: Record<string, string> = {},
    opts: { timeoutMs?: number } = {},
  ): Promise<string> {
    if (!isServer) throw new Error('AiHttpClient.get is only available on the server');
    const agent = buildAgent();
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const r = await this.getWithRedirectsResolved(url, headers, agent, 0, timeoutMs, []);
    return r.body;
  }

  /**
   * Advanced GET for when full response metadata is needed (Content-Type, Encoding, etc).
   */
  static async getFull(
    url: string,
    headers: Record<string, string> = {},
    opts: { timeoutMs?: number } = {},
  ): Promise<{ body: string; contentType: string; contentEncoding?: string; statusCode: number; finalUrl: string }> {
    if (!isServer) throw new Error('AiHttpClient.getFull is only available on the server');
    const agent = buildAgent();
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const r = await this.getWithRedirectsResolved(url, headers, agent, 0, timeoutMs, []);
    return {
      body: r.body,
      contentType: r.contentType,
      contentEncoding: r.contentEncoding,
      statusCode: r.statusCode,
      finalUrl: r.finalUrl,
    };
  }

  /**
   * Same as {@link get} but returns redirect chain and final URL for crawl telemetry.
   */
  static async getWithTrace(
    url: string,
    headers: Record<string, string> = {},
    opts: { timeoutMs?: number } = {},
  ): Promise<{
    body: string;
    statusCode: number;
    finalUrl: string;
    /** URLs followed before the successful final response (empty if no redirects). */
    redirectChain: string[];
  }> {
    if (!isServer) throw new Error('AiHttpClient.getWithTrace is only available on the server');
    const agent = buildAgent();
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const r = await this.getWithRedirectsResolved(url, headers, agent, 0, timeoutMs, []);
    return {
      body: r.body,
      statusCode: r.statusCode,
      finalUrl: r.finalUrl,
      redirectChain: r.visitedUrls.length > 1 ? r.visitedUrls.slice(0, -1) : [],
    };
  }

  private static getWithRedirectsResolved(
    url: string,
    headers: Record<string, string>,
    agent: any,
    depth: number,
    timeoutMs: number,
    visited: string[],
  ): Promise<{ 
    body: string; 
    contentType: string; 
    contentEncoding?: string; 
    statusCode: number; 
    finalUrl: string; 
    visitedUrls: string[] 
  }> {
    if (!isServer || !https || !http || !zlib) {
      return Promise.reject(new Error('AiHttpClient is only available on the server'));
    }
    const parsedUrl = new URL(url);
    const options: any = {
      method: 'GET',
      timeout: timeoutMs,
      agent,
      headers: {
        'Accept-Encoding': 'gzip, deflate, br',
        ...headers,
      },
    };

    const nextVisited = [...visited, url];

    return new Promise((resolve, reject) => {
      const req = (parsedUrl.protocol === 'https:' ? https! : http!).request(url, options, (res: any) => {
        const status = res.statusCode ?? 0;

        // Handle redirects transparently.
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume(); // drain
          if (depth >= MAX_REDIRECTS) {
            reject(new HttpFetchError(`Too many redirects (>${MAX_REDIRECTS})`, 'http', status, url));
            return;
          }
          let nextUrl: string;
          try {
            nextUrl = new URL(res.headers.location, url).toString();
          } catch {
            reject(new HttpFetchError(`Invalid redirect target: ${res.headers.location}`, 'http', status, url));
            return;
          }
          logger.info("ai:http:redirect", { from: url, to: nextUrl, status, depth });
          this.getWithRedirectsResolved(nextUrl, headers, agent, depth + 1, timeoutMs, nextVisited).then(
            resolve,
            reject,
          );
          return;
        }

        const contentType = res.headers['content-type'] || 'application/octet-stream';
        const contentEncoding = res.headers['content-encoding'];

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        res.on('end', () => {
          try {
            let buffer = Buffer.concat(chunks);

            // Decompress if needed
            if (contentEncoding === 'gzip') {
              buffer = zlib!.gunzipSync(buffer);
            } else if (contentEncoding === 'deflate') {
              buffer = zlib!.inflateSync(buffer);
            } else if (contentEncoding === 'br') {
              buffer = zlib!.brotliDecompressSync(buffer);
            }

            // Decode with charset
            const charsetMatch = contentType.match(/charset=([^;]+)/i);
            const charset = charsetMatch ? charsetMatch[1] : 'utf-8';
            
            let body: string;
            try {
              const decoder = new TextDecoder(charset, { fatal: true });
              body = decoder.decode(buffer);
            } catch (decodeErr) {
              // Fallback to utf-8 if specified charset fails
              const decoder = new TextDecoder('utf-8', { fatal: false });
              body = decoder.decode(buffer);
            }

            if (status >= 200 && status < 300) {
              resolve({
                body,
                contentType,
                contentEncoding,
                statusCode: status,
                finalUrl: url,
                visitedUrls: nextVisited,
              });
            } else {
              reject(
                new HttpFetchError(`Status ${status} ${res.statusMessage ?? ''}`.trim(), 'http', status, url),
              );
            }
          } catch (processErr) {
            reject(new HttpFetchError(`Failed to process response: ${String(processErr)}`, 'other', status, url));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy(new HttpFetchError(`Request timed out after ${timeoutMs}ms`, 'timeout', undefined, url));
      });

      req.on('error', (err: any) => {
        if (err instanceof HttpFetchError) {
          reject(err);
          return;
        }
        reject(classifyRequestError(err as NodeJS.ErrnoException, url));
      });

      req.end();
    });
  }
}

import type { Env, ApiKeySession } from '../types';
import { handleAuthConnect, handleAuthDisconnect } from './api/auth';
import { handleVerifyConnectionGet } from './api/verifyConnection';
import { handleDeviceDetailGet } from './api/deviceDetail';
import { handleSchedulerGet, handleSchedulerPost } from './api/scheduler';
import { handleExportLimitGet, handleExportLimitPost } from './api/exportLimit';
import { handleImportLimitGet, handleImportLimitPost } from './api/importLimit';
import { decryptSession } from './crypto';

// The Worker sets this cookie after a successful /api/auth/connect call.
// Value is AES-256-GCM encrypted JSON: { api_key, sn }
// __Host- prefix enforces: HttpOnly, Secure, Path=/, no Domain attribute.
const SESSION_COOKIE = '__Host-foxess_session';

export async function handleFetch(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method.toUpperCase();

  // Preflight
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  // --- Public routes ---
  if (pathname === '/api/auth/connect' && method === 'POST') {
    return handleAuthConnect(request, env);
  }
  if (pathname === '/api/auth/disconnect' && method === 'POST') {
    return handleAuthDisconnect();
  }

  // --- Protected API routes ---
  if (pathname.startsWith('/api/')) {
    const session = await parseSession(request, env);

    if (!session) {
      return Response.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (pathname === '/api/verify-connection' && method === 'GET') {
      return handleVerifyConnectionGet(env, session);
    } else if (pathname === '/api/device-detail' && method === 'GET') {
      return handleDeviceDetailGet(env, session);
    } else if (pathname === '/api/scheduler') {
      if (method === 'GET')       return handleSchedulerGet(env, session);
      else if (method === 'POST') return handleSchedulerPost(request, env, session);
      else return Response.json({ ok: false, error: 'Method not allowed' }, { status: 405 });
    } else if (pathname === '/api/export-limit') {
      if (method === 'GET')       return handleExportLimitGet(env, session);
      else if (method === 'POST') return handleExportLimitPost(request, env, session);
      else return Response.json({ ok: false, error: 'Method not allowed' }, { status: 405 });
    } else if (pathname === '/api/import-limit') {
      if (method === 'GET')       return handleImportLimitGet(env, session);
      else if (method === 'POST') return handleImportLimitPost(request, env, session);
      else return Response.json({ ok: false, error: 'Method not allowed' }, { status: 405 });
    } else {
      return Response.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
  }

  // --- Static assets ---
  return env.ASSETS.fetch(request);
}

// ---------------------------------------------------------------------------
// Cookie parsing
// ---------------------------------------------------------------------------

function getCookieValue(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k.trim() === name) return rest.join('=').trim();
  }
  return null;
}

/**
 * Decrypt and validate the session cookie.
 * Returns null if the cookie is absent, malformed, or decryption fails.
 */
async function parseSession(
  request: Request,
  env: Env,
): Promise<ApiKeySession | null> {
  const token = getCookieValue(request, SESSION_COOKIE);
  if (!token) return null;

  const payload = await decryptSession<Record<string, unknown>>(
    env.COOKIE_ENCRYPTION_KEY,
    token,
  );
  if (!payload) return null;
  if (typeof payload.api_key !== 'string' || typeof payload.sn !== 'string') return null;

  return { api_key: payload.api_key, sn: payload.sn };
}

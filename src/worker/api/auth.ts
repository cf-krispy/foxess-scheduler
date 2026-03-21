/**
 * POST /api/auth/connect    — verify credentials, set encrypted HttpOnly cookie
 * POST /api/auth/disconnect — clear the session cookie
 */

import type { Env, ApiKeySession, ApiResult } from '../../types';
import { foxessPost } from '../foxess/client';
import { encryptSession } from '../crypto';

const SESSION_COOKIE   = '__Host-foxess_session';
const REAL_QUERY_PATH  = '/op/v1/device/real/query';
const VERIFY_VARIABLES = ['SoC', 'batTemperature', 'currentFault', 'loadsPower'];

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

function sessionCookieHeader(value: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

// ---------------------------------------------------------------------------
// POST /api/auth/connect
// ---------------------------------------------------------------------------

export async function handleAuthConnect(
  request: Request,
  env: Env,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: 'Invalid JSON body' } satisfies ApiResult,
      { status: 400 },
    );
  }

  const b       = body as Record<string, unknown>;
  const api_key = typeof b.api_key === 'string' ? b.api_key.trim()          : '';
  const sn      = typeof b.sn      === 'string' ? b.sn.trim().toUpperCase() : '';

  if (!api_key) {
    return Response.json(
      { ok: false, error: 'api_key is required' } satisfies ApiResult,
      { status: 400 },
    );
  }
  if (!sn) {
    return Response.json(
      { ok: false, error: 'sn is required' } satisfies ApiResult,
      { status: 400 },
    );
  }

  // Verify credentials against the FoxESS API before issuing any cookie.
  let result;
  try {
    result = await foxessPost<unknown[]>(REAL_QUERY_PATH, api_key, {
      sns:       [sn],
      variables: VERIFY_VARIABLES,
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: `FoxESS request failed: ${(err as Error).message}` } satisfies ApiResult,
      { status: 502 },
    );
  }

  if (result.errno !== 0 || !result.result) {
    return Response.json(
      { ok: false, error: `FoxESS error ${result.errno}: ${result.msg}` } satisfies ApiResult,
      { status: 502 },
    );
  }

  const devices = result.result as unknown[];
  if (devices.length === 0) {
    return Response.json(
      { ok: false, error: 'No device found for that serial number' } satisfies ApiResult,
      { status: 404 },
    );
  }

  // Credentials verified — encrypt the session and set an HttpOnly cookie.
  // The browser never sees the raw api_key; it only ever holds an opaque token.
  const session: ApiKeySession = { api_key, sn };
  const token  = await encryptSession(env.COOKIE_ENCRYPTION_KEY, session);
  const cookie = sessionCookieHeader(token, 60 * 60 * 24 * 365); // 1 year

  return Response.json(
    { ok: true, data: null } satisfies ApiResult<null>,
    { headers: { 'Set-Cookie': cookie } },
  );
}

// ---------------------------------------------------------------------------
// POST /api/auth/disconnect
// ---------------------------------------------------------------------------

export async function handleAuthDisconnect(): Promise<Response> {
  // Overwrite the session cookie with an empty value and Max-Age=0 to expire it.
  const cookie = sessionCookieHeader('', 0);
  return Response.json(
    { ok: true, data: null } satisfies ApiResult<null>,
    { headers: { 'Set-Cookie': cookie } },
  );
}

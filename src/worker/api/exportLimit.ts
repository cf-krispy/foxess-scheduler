/// <reference types="@cloudflare/workers-types" />
import type { Env, ApiKeySession, ApiResult } from '../../types';
import { foxessPost } from '../foxess/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExportLimitResult {
  value: number; // current export limit in watts
}

interface FoxessSettingGetResult {
  key:   string;
  value: string; // FoxESS returns the value as a string
}

// ---------------------------------------------------------------------------
// GET /api/export-limit — read current export limit from the inverter
// ---------------------------------------------------------------------------

export async function handleExportLimitGet(
  _env: Env,
  session: ApiKeySession,
): Promise<Response> {
  try {
    const res = await foxessPost<FoxessSettingGetResult>(
      '/op/v0/device/setting/get',
      session.api_key,
      { sn: session.sn, key: 'ExportLimit' },
    );

    if (res.errno !== 0 || !res.result) {
      return Response.json(
        { ok: false, error: `FoxESS error ${res.errno}: ${res.msg}` } satisfies ApiResult,
        { status: 502 },
      );
    }

    const value = parseInt(res.result.value, 10);
    if (isNaN(value)) {
      return Response.json(
        { ok: false, error: `Unexpected value from FoxESS: "${res.result.value}"` } satisfies ApiResult,
        { status: 502 },
      );
    }

    return Response.json({ ok: true, data: { value } } satisfies ApiResult<ExportLimitResult>);
  } catch (err) {
    return Response.json(
      { ok: false, error: `FoxESS request failed: ${(err as Error).message}` } satisfies ApiResult,
      { status: 502 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/export-limit — write export limit to the inverter
// Body: { value: number }   (watts, 0–30000)
// ---------------------------------------------------------------------------

export async function handleExportLimitPost(
  request: Request,
  _env: Env,
  session: ApiKeySession,
): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json(
      { ok: false, error: 'Invalid JSON body' } satisfies ApiResult,
      { status: 400 },
    );
  }

  const b = body as Record<string, unknown>;
  const raw = b.value;

  if (raw === undefined || raw === null) {
    return Response.json(
      { ok: false, error: 'Body must include "value"' } satisfies ApiResult,
      { status: 400 },
    );
  }

  const value = Number(raw);
  if (isNaN(value) || !Number.isInteger(value) || value < 0 || value > 30000) {
    return Response.json(
      { ok: false, error: '"value" must be an integer 0–30000 (watts)' } satisfies ApiResult,
      { status: 400 },
    );
  }

  try {
    const res = await foxessPost(
      '/op/v0/device/setting/set',
      session.api_key,
      { sn: session.sn, key: 'ExportLimit', value: String(value) },
    );

    if (res.errno !== 0) {
      return Response.json(
        { ok: false, error: `FoxESS error ${res.errno}: ${res.msg}` } satisfies ApiResult,
        { status: 502 },
      );
    }

    return Response.json({ ok: true, data: null } satisfies ApiResult<null>);
  } catch (err) {
    return Response.json(
      { ok: false, error: `FoxESS request failed: ${(err as Error).message}` } satisfies ApiResult,
      { status: 502 },
    );
  }
}

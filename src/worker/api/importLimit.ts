/// <reference types="@cloudflare/workers-types" />
import type { Env, ApiKeySession, ApiResult } from '../../types';
import { foxessPost } from '../foxess/client';

// ---------------------------------------------------------------------------
// Types — FoxESS peakShaving/get response shape
// ---------------------------------------------------------------------------

interface PeakShavingParam {
  unit:      string;
  precision: number;
  range:     { min: number; max: number };
  value:     string; // numeric string in the param's native unit
}

interface PeakShavingResult {
  soc:         PeakShavingParam; // % — required by set endpoint, preserved on write
  importLimit: PeakShavingParam; // kW
}

interface ImportLimitResult {
  value: number; // watts (converted from kW for UI consistency with exportLimit)
}

// ---------------------------------------------------------------------------
// GET /api/import-limit — read current import limit from the inverter
// Converts kW → W (×1000) so the UI unit matches exportLimit.
// ---------------------------------------------------------------------------

export async function handleImportLimitGet(
  _env: Env,
  session: ApiKeySession,
): Promise<Response> {
  try {
    const res = await foxessPost<PeakShavingResult>(
      '/op/v0/device/peakShaving/get',
      session.api_key,
      { sn: session.sn },
    );

    if (res.errno !== 0 || !res.result) {
      return Response.json(
        { ok: false, error: `FoxESS error ${res.errno}: ${res.msg}` } satisfies ApiResult,
        { status: 502 },
      );
    }

    const raw = parseFloat(res.result.importLimit.value);
    if (isNaN(raw)) {
      return Response.json(
        { ok: false, error: `Unexpected importLimit value from FoxESS: "${res.result.importLimit.value}"` } satisfies ApiResult,
        { status: 502 },
      );
    }

    // kW → W, rounded to the nearest watt
    const value = Math.round(raw * 1000);
    return Response.json({ ok: true, data: { value } } satisfies ApiResult<ImportLimitResult>);
  } catch (err) {
    return Response.json(
      { ok: false, error: `FoxESS request failed: ${(err as Error).message}` } satisfies ApiResult,
      { status: 502 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/import-limit — write import limit to the inverter
// Body: { value: number }   (watts, 0–100000)
//
// The peakShaving/set endpoint requires both soc and importLimit, so we
// read the current soc value first and preserve it in the write.
// ---------------------------------------------------------------------------

export async function handleImportLimitPost(
  request: Request,
  _env: Env,
  session: ApiKeySession,
): Promise<Response> {
  // Parse and validate request body
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
  if (isNaN(value) || !Number.isInteger(value) || value < 0 || value > 100000) {
    return Response.json(
      { ok: false, error: '"value" must be an integer 0–100000 (watts)' } satisfies ApiResult,
      { status: 400 },
    );
  }

  try {
    // Read current soc value — the set endpoint requires both fields
    const current = await foxessPost<PeakShavingResult>(
      '/op/v0/device/peakShaving/get',
      session.api_key,
      { sn: session.sn },
    );

    if (current.errno !== 0 || !current.result) {
      return Response.json(
        { ok: false, error: `Could not read current settings: FoxESS error ${current.errno}: ${current.msg}` } satisfies ApiResult,
        { status: 502 },
      );
    }

    const currentSoc    = current.result.soc.value;
    const importLimitKw = (value / 1000).toFixed(3); // W → kW string (e.g. "5.000")

    const res = await foxessPost(
      '/op/v0/device/peakShaving/set',
      session.api_key,
      { sn: session.sn, soc: currentSoc, importLimit: importLimitKw },
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

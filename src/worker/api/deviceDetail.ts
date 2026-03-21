import type { Env, ApiKeySession, DeviceDetail, ApiResult } from '../../types';
import { foxessGet } from '../foxess/client';

interface FoxessDeviceDetailResult {
  deviceType: string;
  masterVersion: string;
  batteryList?: Array<{ type: string; model: string }>;
}

/**
 * GET /api/device-detail
 *
 * Always fetches live from FoxESS — no KV cache.
 * Session is injected by the router middleware.
 */
export async function handleDeviceDetailGet(
  _env: Env,
  session: ApiKeySession,
): Promise<Response> {
  let apiResult;
  try {
    apiResult = await foxessGet<FoxessDeviceDetailResult>(
      '/op/v1/device/detail',
      session.api_key,
      { sn: session.sn },
    );
  } catch (err) {
    return Response.json(
      { ok: false, error: `FoxESS request failed: ${(err as Error).message}` } satisfies ApiResult,
      { status: 502 },
    );
  }

  if (apiResult.errno !== 0 || !apiResult.result) {
    return Response.json(
      { ok: false, error: `FoxESS error ${apiResult.errno}: ${apiResult.msg}` } satisfies ApiResult,
      { status: 502 },
    );
  }

  const r = apiResult.result;

  // Find the BCU battery entry (main battery module controller)
  const bcuBattery = r.batteryList?.find(b => b.type === 'bcu') ?? null;

  const detail: DeviceDetail = {
    deviceType:    r.deviceType    ?? '',
    masterVersion: r.masterVersion ?? '',
    batteryModel:  bcuBattery?.model ?? null,
  };

  return Response.json({ ok: true, data: detail } satisfies ApiResult<DeviceDetail>);
}

import type { Env, ApiKeySession, ApiResult } from '../../types';
import { foxessPost } from '../foxess/client';

const REAL_QUERY_PATH = '/op/v1/device/real/query';

const VERIFY_VARIABLES = ['SoC', 'batTemperature', 'currentFault', 'loadsPower'];

interface RealQueryDatum {
  unit?: string;
  name?: string;
  variable: string;
  value: unknown;
}

interface RealQueryDevice {
  datas: RealQueryDatum[];
  time: string;
  deviceSN: string;
}

export interface VerifyConnectionResult {
  time: string;
  deviceSN: string;
  soc: number | null;
  batTemperature: number | null;
  currentFault: string; // empty string = no fault
  loadsPower: number | null;
}

/**
 * GET /api/verify-connection
 *
 * Queries live inverter telemetry to confirm the API key session is valid.
 * Session is injected by the router middleware.
 */
export async function handleVerifyConnectionGet(
  _env: Env,
  session: ApiKeySession,
): Promise<Response> {
  let foxessResult;
  try {
    foxessResult = await foxessPost<RealQueryDevice[]>(REAL_QUERY_PATH, session.api_key, {
      sns:       [session.sn],
      variables: VERIFY_VARIABLES,
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: `FoxCloud request failed: ${(err as Error).message}` } satisfies ApiResult,
      { status: 502 },
    );
  }

  if (foxessResult.errno !== 0 || !foxessResult.result) {
    return Response.json(
      { ok: false, error: `FoxCloud error ${foxessResult.errno}: ${foxessResult.msg}` } satisfies ApiResult,
      { status: 502 },
    );
  }

  const device = foxessResult.result[0];
  if (!device) {
    return Response.json(
      { ok: false, error: 'No device data returned by FoxCloud' } satisfies ApiResult,
      { status: 502 },
    );
  }

  const datas = device.datas ?? [];

  // Variable names in the response sometimes have a _1 suffix (e.g. SoC_1).
  function findValue(key: string): unknown {
    const entry = datas.find(d => d.variable === key || d.variable.startsWith(key + '_'));
    return entry?.value ?? null;
  }

  const result: VerifyConnectionResult = {
    time:           device.time ?? '',
    deviceSN:       device.deviceSN ?? session.sn,
    soc:            findValue('SoC') as number | null,
    batTemperature: findValue('batTemperature') as number | null,
    currentFault:   String(findValue('currentFault') ?? '').trim(),
    loadsPower:     findValue('loadsPower') as number | null,
  };

  return Response.json({ ok: true, data: result } satisfies ApiResult<VerifyConnectionResult>);
}

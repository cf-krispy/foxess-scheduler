/// <reference types="@cloudflare/workers-types" />
import type {
  Env, ApiKeySession, SchedulerConfig, SchedulerGroup, ExtraParam, WorkMode, ApiResult,
} from '../../types';
import { foxessPost } from '../foxess/client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_WORK_MODES: WorkMode[] = [
  'SelfUse', 'ForceCharge', 'ForceDischarge', 'Feedin', 'Backup',
];

// extraParam field bounds (from /op/v3/device/scheduler/get properties block)
const EXTRA_PARAM_BOUNDS: Record<keyof ExtraParam, { min: number; max: number }> = {
  exportLimit:   { min: 0,      max: 30000  },
  importLimit:   { min: 0,      max: 30000  },
  pvLimit:       { min: 0,      max: 22500  },
  minSocOnGrid:  { min: 10,     max: 100    },
  maxSoc:        { min: 10,     max: 100    },
  fdSoc:         { min: 10,     max: 100    },
  fdPwr:         { min: 0,      max: 60000  },
  reactivePower: { min: -12000, max: 12000  },
};

// ---------------------------------------------------------------------------
// Overlap detection (same [start, end) semantics as the client-side logic)
// ---------------------------------------------------------------------------

function isInWindow(
  totalMins: number,
  startH: number, startM: number,
  endH: number,   endM: number,
): boolean {
  const start = startH * 60 + startM;
  const end   = endH   * 60 + endM;
  if (start === end) return false;
  if (start < end) return totalMins >= start && totalMins < end;
  return totalMins >= start || totalMins < end;
}

function groupsOverlap(a: SchedulerGroup, b: SchedulerGroup): boolean {
  const aStart = a.startHour * 60 + a.startMinute;
  const bStart = b.startHour * 60 + b.startMinute;
  return (
    isInWindow(bStart, a.startHour, a.startMinute, a.endHour, a.endMinute) ||
    isInWindow(aStart, b.startHour, b.startMinute, b.endHour, b.endMinute)
  );
}

// ---------------------------------------------------------------------------
// GET /api/scheduler — read current schedule from the inverter
// ---------------------------------------------------------------------------

export async function handleSchedulerGet(
  _env: Env,
  session: ApiKeySession,
): Promise<Response> {
  try {
    const res = await foxessPost<SchedulerConfig>(
      '/op/v3/device/scheduler/get',
      session.api_key,
      { deviceSN: session.sn },
    );

    if (res.errno !== 0 || !res.result) {
      return Response.json(
        { ok: false, error: `FoxESS error ${res.errno}: ${res.msg}` } satisfies ApiResult,
        { status: 502 },
      );
    }

    return Response.json({ ok: true, data: res.result } satisfies ApiResult<SchedulerConfig>);
  } catch (err) {
    return Response.json(
      { ok: false, error: `FoxESS request failed: ${(err as Error).message}` } satisfies ApiResult,
      { status: 502 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/scheduler — write groups to the inverter
// ---------------------------------------------------------------------------

export async function handleSchedulerPost(
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

  if (!Array.isArray(b.groups)) {
    return Response.json(
      { ok: false, error: 'Body must include a "groups" array' } satisfies ApiResult,
      { status: 400 },
    );
  }

  // Validate each group
  const groups: SchedulerGroup[] = [];

  for (let i = 0; i < b.groups.length; i++) {
    const g = b.groups[i] as Record<string, unknown>;

    if (!VALID_WORK_MODES.includes(g.workMode as WorkMode)) {
      return Response.json(
        { ok: false, error: `Group ${i}: invalid workMode "${g.workMode}"` } satisfies ApiResult,
        { status: 400 },
      );
    }

    const startHour   = Number(g.startHour);
    const startMinute = Number(g.startMinute);
    const endHour     = Number(g.endHour);
    const endMinute   = Number(g.endMinute);

    if (isNaN(startHour)   || startHour   < 0 || startHour   > 23)
      return Response.json({ ok: false, error: `Group ${i}: startHour must be 0–23` }   satisfies ApiResult, { status: 400 });
    if (isNaN(startMinute) || startMinute < 0 || startMinute > 59)
      return Response.json({ ok: false, error: `Group ${i}: startMinute must be 0–59` } satisfies ApiResult, { status: 400 });
    if (isNaN(endHour)     || endHour     < 0 || endHour     > 23)
      return Response.json({ ok: false, error: `Group ${i}: endHour must be 0–23` }     satisfies ApiResult, { status: 400 });
    if (isNaN(endMinute)   || endMinute   < 0 || endMinute   > 59)
      return Response.json({ ok: false, error: `Group ${i}: endMinute must be 0–59` }   satisfies ApiResult, { status: 400 });

    // Validate extraParam
    const ep = (g.extraParam ?? {}) as Record<string, unknown>;
    const extraParam = {} as ExtraParam;

    for (const [field, bounds] of Object.entries(EXTRA_PARAM_BOUNDS)) {
      const v = Number(ep[field]);
      if (isNaN(v) || !Number.isInteger(v) || v < bounds.min || v > bounds.max) {
        return Response.json(
          {
            ok: false,
            error: `Group ${i}: ${field} must be ${bounds.min}–${bounds.max} (got ${ep[field]})`,
          } satisfies ApiResult,
          { status: 400 },
        );
      }
      (extraParam as unknown as Record<string, number>)[field] = v;
    }

    groups.push({ startHour, startMinute, endHour, endMinute, workMode: g.workMode as WorkMode, extraParam });
  }

  // Conflict check — skip the default (0:00–23:59) group
  const isDefault = (g: SchedulerGroup) =>
    g.startHour === 0 && g.startMinute === 0 && g.endHour === 23 && g.endMinute === 59;

  for (let i = 0; i < groups.length; i++) {
    if (isDefault(groups[i])) continue;
    for (let j = i + 1; j < groups.length; j++) {
      if (isDefault(groups[j])) continue;
      if (groupsOverlap(groups[i], groups[j])) {
        return Response.json(
          {
            ok: false,
            error: `Groups ${i} and ${j} have overlapping time windows`,
          } satisfies ApiResult,
          { status: 400 },
        );
      }
    }
  }

  // Forward to FoxESS — note: field is "deviceSN" not "sn" on this endpoint
  try {
    const res = await foxessPost(
      '/op/v3/device/scheduler/enable',
      session.api_key,
      { deviceSN: session.sn, groups },
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

/// <reference types="@cloudflare/workers-types" />

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface DeviceDetail {
  deviceType: string;
  masterVersion: string;
  batteryModel: string | null;
}

// ---------------------------------------------------------------------------
// FoxESS native scheduler
// ---------------------------------------------------------------------------

export type WorkMode =
  | 'SelfUse'
  | 'ForceCharge'
  | 'ForceDischarge'
  | 'Feedin'
  | 'Backup';

export interface ExtraParam {
  exportLimit:   number;  // W,    0–30000
  importLimit:   number;  // W,    0–30000
  pvLimit:       number;  // W,    0–22500
  minSocOnGrid:  number;  // %,   10–100
  maxSoc:        number;  // %,   10–100
  fdSoc:         number;  // %,   10–100  (target SoC for ForceCharge/ForceDischarge)
  fdPwr:         number;  // W,    0–60000 (max charge/discharge power)
  reactivePower: number;  // Var, -12000–12000
}

export interface SchedulerGroup {
  startHour:   number;   // 0–23
  startMinute: number;   // 0–59
  endHour:     number;   // 0–23
  endMinute:   number;   // 0–59
  workMode:    WorkMode;
  extraParam:  ExtraParam;
}

export interface SchedulerConfig {
  enable:        0 | 1;  // read from GET; not sent on POST
  maxGroupCount: number; // inverter ceiling, read-only
  groups:        SchedulerGroup[];
}

// ---------------------------------------------------------------------------
// FoxESS API
// ---------------------------------------------------------------------------

export interface FoxessApiResponse<T = unknown> {
  errno: number;
  msg: string;
  result?: T;
}

// ---------------------------------------------------------------------------
// API key session — stored encrypted in the __Host-foxess_session cookie.
// The Worker encrypts/decrypts using COOKIE_ENCRYPTION_KEY (AES-256-GCM).
// The browser never sees the raw API key.
// ---------------------------------------------------------------------------

export interface ApiKeySession {
  api_key: string; // FoxESS developer portal API key
  sn:      string; // inverter serial number
}

// ---------------------------------------------------------------------------
// Worker environment bindings (matches wrangler.jsonc)
// ---------------------------------------------------------------------------

export interface Env {
  ASSETS:                  Fetcher;
  COOKIE_ENCRYPTION_KEY:   string;   // wrangler secret — AES-256-GCM session key
}

// ---------------------------------------------------------------------------
// API response envelope used by all /api/* routes
// ---------------------------------------------------------------------------

export type ApiResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

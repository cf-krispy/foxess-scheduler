/// <reference types="@cloudflare/workers-types" />
import type { Env } from '../types';
import { handleFetch } from './router';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handleFetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;

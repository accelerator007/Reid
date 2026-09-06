// The edge only decides which paths render the application shell. That decision
// comes from src/routes.ts, the same manifest the browser app resolves against,
// so the two can no longer drift.
import { isAppShellPath, legacyRedirects, normalizePath } from './routes'

type WorkerEnvironment = {
  ASSETS: { fetch(request: Request): Promise<Response> }
  SUPABASE_FUNCTIONS_URL?: string
  REID_REMINDER_CRON_TOKEN?: string
}

type WorkerExecutionContext = { waitUntil(promise: Promise<unknown>): void }
type WorkerScheduledController = { scheduledTime: number; cron: string }

export default {
  async fetch(request: Request, env: WorkerEnvironment): Promise<Response> {
    const url = new URL(request.url)

    const redirect = legacyRedirects[normalizePath(url.pathname)]
    if (redirect) return Response.redirect(new URL(redirect, url), 301)

    const canRenderApp = request.method === 'GET' || request.method === 'HEAD'
    if (canRenderApp && isAppShellPath(url.pathname)) {
      const indexUrl = new URL('/', url)
      return env.ASSETS.fetch(new Request(indexUrl, request))
    }

    return env.ASSETS.fetch(request)
  },
  async scheduled(_controller: WorkerScheduledController, env: WorkerEnvironment, context: WorkerExecutionContext) {
    if (!env.SUPABASE_FUNCTIONS_URL || !env.REID_REMINDER_CRON_TOKEN) return
    context.waitUntil(fetch(`${env.SUPABASE_FUNCTIONS_URL}/reminder-dispatch`, {
      method: 'POST',
      headers: { 'x-reid-cron-token': env.REID_REMINDER_CRON_TOKEN },
    }))
  },
}

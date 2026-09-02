const appRoutes = new Set(['/login', '/apply', '/profile', '/dashboard', '/privacy'])

type WorkerEnvironment = {
  ASSETS: { fetch(request: Request): Promise<Response> }
}

export default {
  async fetch(request: Request, env: WorkerEnvironment): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/privacy.html') {
      return Response.redirect(new URL('/privacy', url), 301)
    }

    const canRenderApp = request.method === 'GET' || request.method === 'HEAD'

    if (canRenderApp && appRoutes.has(url.pathname)) {
      const indexUrl = new URL('/', url)
      return env.ASSETS.fetch(new Request(indexUrl, request))
    }

    return env.ASSETS.fetch(request)
  },
}

import { describe, expect, it, vi } from 'vitest'
import worker from './worker'

function createAssets() {
  return {
    fetch: vi.fn(async (request: Request) => {
      const path = new URL(request.url).pathname
      if (path === '/') return new Response('<main>Reid</main>', { status: 200 })
      if (path === '/dashboard') {
        return Response.redirect('https://reidpro.com/', 307)
      }
      return new Response('Not found', { status: 404 })
    }),
  }
}

describe('Cloudflare application routing', () => {
  it('serves the app shell without changing a known route', async () => {
    const assets = createAssets()
    const response = await worker.fetch(
      new Request('https://reidpro.com/dashboard'),
      { ASSETS: assets },
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Reid')
    expect(assets.fetch).toHaveBeenLastCalledWith(
      expect.objectContaining({ url: 'https://reidpro.com/' }),
    )
  })

  it('keeps unknown routes as real 404 responses', async () => {
    const response = await worker.fetch(
      new Request('https://reidpro.com/not-a-real-page'),
      { ASSETS: createAssets() },
    )

    expect(response.status).toBe(404)
  })

  it('serves the employee workspace through the app shell', async () => {
    const response = await worker.fetch(
      new Request('https://reidpro.com/workspace'),
      { ASSETS: createAssets() },
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Reid')
  })

  it('redirects the legacy privacy URL to the canonical route', async () => {
    const response = await worker.fetch(
      new Request('https://reidpro.com/privacy.html'),
      { ASSETS: createAssets() },
    )

    expect(response.status).toBe(301)
    expect(response.headers.get('location')).toBe('https://reidpro.com/privacy')
  })
})

const UPSTREAM = 'https://studio.genlayer.com/api'

export default async function handler(request, response) {
  if (request.method === 'OPTIONS') {
    response.setHeader('Allow', 'POST, OPTIONS')
    return response.status(204).end()
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST, OPTIONS')
    return response.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof request.body === 'string'
        ? request.body
        : JSON.stringify(request.body ?? {}),
    })
    const body = await upstream.text()
    response.status(upstream.status)
    response.setHeader('content-type', upstream.headers.get('content-type') || 'application/json')
    response.setHeader('cache-control', 'no-store')
    return response.send(body)
  } catch (error) {
    return response.status(502).json({
      error: 'StudioNet RPC proxy failed',
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}

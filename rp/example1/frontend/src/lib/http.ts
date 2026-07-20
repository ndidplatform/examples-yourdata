const BASE_URL = import.meta.env.VITE_API_BASE_URL || `${window.location.protocol}//${window.location.hostname}:9000`
const DEV = import.meta.env.DEV

export async function post<T>(path: string, body: unknown): Promise<T> {
  const url = `${BASE_URL}${path}`
  if (DEV) console.log(`[http] POST ${url}`, body)
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText)
    if (DEV) console.error(`[http] POST ${url} → ${response.status}`, text)
    throw new Error(`HTTP ${response.status}: ${text}`)
  }
  const data = await response.json() as T
  if (DEV) console.log(`[http] POST ${url} → 200`, data)
  return data
}

export async function get<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}`
  if (DEV) console.log(`[http] GET ${url}`)
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText)
    if (DEV) console.error(`[http] GET ${url} → ${response.status}`, text)
    throw new Error(`HTTP ${response.status}: ${text}`)
  }
  const data = await response.json() as T
  if (DEV) console.log(`[http] GET ${url} → 200`, data)
  return data
}

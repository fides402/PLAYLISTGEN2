import type { Track } from "./types"

// Compact per-track representation to keep URLs short
type SharedTrack = {
  i: number    // id
  t: string    // title
  a: string    // artist
  l?: string   // album
  c?: string   // cover UUID (extracted from Tidal CDN URL)
  y?: number   // year
}

/**
 * Extract the UUID path from a Tidal CDN cover URL.
 * URL format: https://resources.tidal.com/images/UUID_WITH_SLASHES/640x640.jpg
 * Returns the UUID string with hyphens.
 */
function extractCoverId(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  // Match the path segments between /images/ and /WxH.jpg
  const match = url.match(/resources\.tidal\.com\/images\/([\da-f]+(?:\/[\da-f]+)+)\/\d+x\d+/i)
  if (!match) return undefined
  return match[1].replace(/\//g, "-")
}

function buildCoverFromId(id: string | undefined): string | null {
  if (!id) return null
  return `https://resources.tidal.com/images/${id.replace(/-/g, "/")}/640x640.jpg`
}

/** Encode a playlist into a URL-safe base64url token. */
export function encodePlaylist(tracks: Track[]): string {
  const compact: SharedTrack[] = tracks.map((t) => {
    const s: SharedTrack = { i: t.id, t: t.title, a: t.artist }
    if (t.album) s.l = t.album
    const c = extractCoverId(t.coverUrl)
    if (c) s.c = c
    if (t.year) s.y = t.year
    return s
  })
  const json = JSON.stringify(compact)
  // btoa is available in browsers and Node.js 16+.
  // We intentionally avoid Buffer.toString("base64url") because the browser
  // Buffer polyfill bundled by Next.js does NOT support the "base64url" encoding,
  // causing silent corruption of the token.
  const b64 = typeof btoa !== "undefined"
    ? btoa(unescape(encodeURIComponent(json)))
    : Buffer.from(json, "utf-8").toString("base64")
  // Convert standard base64 → base64url (URL-safe, no padding)
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

/** Decode a share token back into a Track array. Returns null on error. */
export function decodePlaylist(token: string): Track[] | null {
  try {
    // Convert base64url back to standard base64 (add padding if needed)
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/")
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4)

    let json: string
    if (typeof atob !== "undefined") {
      json = decodeURIComponent(escape(atob(padded)))
    } else {
      json = Buffer.from(padded, "base64").toString("utf-8")
    }

    const compact = JSON.parse(json) as SharedTrack[]
    if (!Array.isArray(compact) || compact.length === 0) return null
    return compact.map((s) => ({
      id: s.i,
      title: s.t,
      artist: s.a,
      album: s.l ?? "",
      coverUrl: buildCoverFromId(s.c),
      year: s.y,
    }))
  } catch {
    return null
  }
}

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
  // Node.js (server / API routes)
  if (typeof Buffer !== "undefined") {
    return Buffer.from(json).toString("base64url")
  }
  // Browser fallback
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")
}

/** Decode a share token back into a Track array. Returns null on error. */
export function decodePlaylist(token: string): Track[] | null {
  try {
    let json: string
    if (typeof Buffer !== "undefined") {
      json = Buffer.from(token, "base64url").toString("utf-8")
    } else {
      const b64 = token.replace(/-/g, "+").replace(/_/g, "/")
      json = decodeURIComponent(escape(atob(b64)))
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

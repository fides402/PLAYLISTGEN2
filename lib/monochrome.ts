import type { Track } from "./types"

const MONO_URL =
  process.env.MONOCHROME_API_URL || "https://api.monochrome.tf"

// Skip interludes, skits, jingles — anything under 90 seconds
const MIN_DURATION_SECS = 90

function buildCoverUrl(cover: string | null | undefined): string | null {
  if (!cover) return null
  // Tidal cover UUIDs use hyphens; the CDN path uses forward slashes
  return `https://resources.tidal.com/images/${cover.replace(/-/g, "/")}/640x640.jpg`
}

// Normalize any track shape returned by Monochrome into our Track type
export function normalizeTrack(item: Record<string, unknown>): Track | null {
  if (!item?.id || typeof item.id !== "number") return null

  const artistObj = item.artist as Record<string, unknown> | undefined
  const artistsArr = item.artists as Record<string, unknown>[] | undefined
  const albumObj = item.album as Record<string, unknown> | undefined

  const artist =
    (artistObj?.name as string) ||
    (artistsArr?.[0]?.name as string) ||
    (item.artistName as string) ||
    "Unknown Artist"

  const cover =
    (albumObj?.cover as string) ||
    (albumObj?.coverArt as string) ||
    (item.coverArt as string) ||
    null

  return {
    id: item.id as number,
    title: (item.title as string) || "Unknown Title",
    artist,
    album: (albumObj?.title as string) || "",
    duration: item.duration as number | undefined,
    audioQuality: item.audioQuality as string | undefined,
    coverUrl: buildCoverUrl(cover),
  }
}

function extractItems(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== "object") return []
  const d = data as Record<string, unknown>
  // Handle multiple possible response shapes
  return (
    (d.items as Record<string, unknown>[]) ||
    ((d.data as Record<string, unknown>)?.items as Record<string, unknown>[]) ||
    ((d.tracks as Record<string, unknown>)?.items as Record<string, unknown>[]) ||
    ((d.artists as Record<string, unknown>)?.items as Record<string, unknown>[]) ||
    []
  )
}

function isLongEnough(t: Track): boolean {
  return !t.duration || t.duration >= MIN_DURATION_SECS
}

export async function searchTracks(query: string): Promise<Track[]> {
  try {
    const res = await fetch(
      `${MONO_URL}/search/?s=${encodeURIComponent(query)}`,
      { next: { revalidate: 300 } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return extractItems(data)
      .map(normalizeTrack)
      .filter((t): t is Track => !!t && isLongEnough(t))
  } catch {
    return []
  }
}

/**
 * Find tracks BY a specific artist.
 * Using ?s= (track search) which reliably returns tracks by the queried artist.
 */
export async function searchArtist(name: string): Promise<Track[]> {
  try {
    const res = await fetch(
      `${MONO_URL}/search/?s=${encodeURIComponent(name)}`,
      { next: { revalidate: 300 } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return extractItems(data)
      .map(normalizeTrack)
      .filter((t): t is Track => !!t && isLongEnough(t))
  } catch {
    return []
  }
}

/**
 * Search by "Artist Album" — more precise than artist name alone.
 * Falls back to artist-only search if no album provided.
 * Discogs gives us specific album titles so we can target exact records.
 */
export async function searchAlbum(artist: string, album: string): Promise<Track[]> {
  if (!album) return searchArtist(artist)
  try {
    const query = `${artist} ${album}`.trim()
    const res = await fetch(
      `${MONO_URL}/search/?s=${encodeURIComponent(query)}`,
      { next: { revalidate: 300 } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return extractItems(data)
      .map(normalizeTrack)
      .filter((t): t is Track => !!t && isLongEnough(t))
  } catch {
    return []
  }
}

export async function getRecommendations(id: number): Promise<Track[]> {
  try {
    const res = await fetch(`${MONO_URL}/recommendations/?id=${id}`)
    if (!res.ok) return []
    const data = await res.json()
    // Recommendations wrap each entry as { track: {...} }
    const rawItems = extractItems(data)
    const tracks = rawItems.map((item) => {
      const track =
        (item.track as Record<string, unknown>) ?? item
      return normalizeTrack(track)
    })
    return tracks.filter((t): t is Track => !!t && isLongEnough(t))
  } catch {
    return []
  }
}

export interface StreamResult {
  type: "direct" | "dash"
  url?: string
  manifest?: string
  mimeType?: string
}

export async function getStreamManifest(
  id: number,
  quality = "HIGH"
): Promise<StreamResult | null> {
  try {
    const res = await fetch(`${MONO_URL}/track/?id=${id}&quality=${quality}`)
    if (!res.ok) return null
    const raw = await res.json()
    // Monochrome wraps all responses in { version, data: {...} }
    const data = (raw as Record<string, unknown>).data ?? raw

    const { manifestMimeType, manifest } = data as {
      manifestMimeType: string
      manifest: string
    }
    if (!manifest) return null

    const decoded = Buffer.from(manifest, "base64").toString("utf-8")

    if (manifestMimeType === "application/vnd.tidal.bts") {
      const json = JSON.parse(decoded) as { urls: string[]; mimeType?: string }
      const url = json.urls?.[0]
      if (!url) return null
      return { type: "direct", url, mimeType: json.mimeType || "audio/mp4" }
    }

    if (manifestMimeType === "application/dash+xml") {
      return { type: "dash", manifest: decoded }
    }

    return null
  } catch {
    return null
  }
}

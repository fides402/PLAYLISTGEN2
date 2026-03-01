const MB_BASE = "https://musicbrainz.org/ws/2"
const USER_AGENT = "HiFiMoodApp/1.0 (https://github.com/fides402/PLAYLISTGEN2)"

async function mbGet<T>(path: string): Promise<T | null> {
  try {
    const sep = path.includes("?") ? "&" : "?"
    const url = `${MB_BASE}${path}${sep}fmt=json`
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      next: { revalidate: 86400 }, // cache 24h — MB data changes slowly
    })
    if (!res.ok) return null
    return res.json() as Promise<T>
  } catch {
    return null
  }
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

interface MBArtistSearch {
  artists: Array<{ id: string; name: string; score: number }>
}

interface MBArtistRelation {
  type: string
  direction: string
  artist?: { id: string; name: string }
}

interface MBArtistDetail {
  id: string
  name: string
  relations?: MBArtistRelation[]
}

// Relationship types useful for music discovery
const DISCOVERY_TYPES = new Set([
  "collaboration",
  "member of band",
  "influenced by",
  "supporting musician",
  "conductor",
  "arranger",
  "producer",
  "tribute",
  "remix artist",
])

/**
 * Find related artists via MusicBrainz relationship graph.
 * Makes exactly 2 API calls (search + detail) with a 1.1s delay to respect rate limit.
 * Returns artist names: collaborators, band members, influences, producers.
 */
export async function findRelatedArtists(artistName: string): Promise<string[]> {
  // 1. Find the artist's MBID
  const search = await mbGet<MBArtistSearch>(
    `/artist/?query=${encodeURIComponent(artistName)}&limit=3`
  )
  if (!search?.artists?.length) return []

  const mbid = search.artists[0].id

  // Respect MusicBrainz 1 req/sec rate limit
  await sleep(1100)

  // 2. Get their relationships
  const detail = await mbGet<MBArtistDetail>(`/artist/${mbid}?inc=artist-rels`)
  if (!detail?.relations?.length) return []

  const seen = new Set<string>([artistName.toLowerCase()])
  const related: string[] = []

  for (const rel of detail.relations) {
    if (!rel.artist) continue
    const name = rel.artist.name
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    if (DISCOVERY_TYPES.has(rel.type)) {
      seen.add(key)
      related.push(name)
    }
  }

  return related.slice(0, 15)
}

/**
 * Find a recording's MBID and its associated artists (for "mix from track").
 * Returns collaborating artist names found on that specific recording.
 */
export async function findRecordingCollaborators(
  title: string,
  artist: string
): Promise<string[]> {
  const query = `"${title}" AND artist:"${artist}"`
  const search = await mbGet<{
    recordings?: Array<{
      "artist-credit"?: Array<{ artist?: { name: string } }>
    }>
  }>(`/recording/?query=${encodeURIComponent(query)}&limit=5`)

  if (!search?.recordings?.length) return []

  const seen = new Set<string>([artist.toLowerCase()])
  const collaborators: string[] = []

  for (const rec of search.recordings.slice(0, 3)) {
    for (const credit of rec["artist-credit"] ?? []) {
      const name = credit.artist?.name
      if (!name) continue
      const key = name.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        collaborators.push(name)
      }
    }
  }

  return collaborators
}

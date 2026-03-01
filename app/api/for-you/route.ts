import { NextRequest, NextResponse } from "next/server"
import { getRecommendations, searchAlbum } from "@/lib/monochrome"
import { getDiscogsFingerprint, getArtistsByDiscogParams } from "@/lib/discogs"
import type { Track } from "@/lib/types"

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const likedIds = (searchParams.get("liked") ?? "")
    .split(",").map(Number).filter(Boolean)

  // Artist names of liked tracks (for Discogs fingerprinting)
  const likedArtists = (searchParams.get("artists") ?? "")
    .split("||").map((s) => s.trim()).filter(Boolean)

  const seenIds = new Set(
    (searchParams.get("seen") ?? "").split(",").map(Number).filter(Boolean)
  )

  if (likedIds.length === 0) return NextResponse.json([])

  const seen = new Set(seenIds)
  for (const id of likedIds) seen.add(id)

  const out: Track[] = []

  function addTrack(t: Track) {
    if (!seen.has(t.id)) {
      seen.add(t.id)
      out.push(t)
    }
  }

  // TRACK 1: Tidal recommendations seeded from liked tracks (up to 5 random seeds)
  const seeds = [...likedIds].sort(() => Math.random() - 0.5).slice(0, 5)
  const tidalBatches = await Promise.all(seeds.map((id) => getRecommendations(id)))
  for (const tracks of tidalBatches) {
    for (const t of tracks) addTrack(t)
  }

  // TRACK 2: Discogs fingerprint → targeted Discogs search → Monochrome album search
  // Pick up to 3 random liked artists and fingerprint them in parallel
  if (likedArtists.length > 0) {
    const artistsToFingerprint = shuffle([...likedArtists]).slice(0, 3)
    const fingerprints = await Promise.all(
      artistsToFingerprint.map((a) => getDiscogsFingerprint(a))
    )

    // For each valid fingerprint, query Discogs for similar artists
    const discogsSearches = fingerprints
      .filter((fp): fp is NonNullable<typeof fp> => fp !== null)
      .map((fp) =>
        getArtistsByDiscogParams({
          style:     fp.style,
          country:   fp.country,
          yearStart: fp.yearStart,
          yearEnd:   fp.yearEnd,
        })
      )

    const discogsResults = await Promise.all(discogsSearches)

    // Flatten, dedup artists, and search each on Monochrome
    const seenArtists = new Set<string>()
    const releasesToSearch: { artist: string; album: string }[] = []

    for (const releases of discogsResults) {
      for (const r of releases) {
        const key = r.artist.toLowerCase()
        if (!seenArtists.has(key)) {
          seenArtists.add(key)
          releasesToSearch.push(r)
        }
      }
    }

    const monoSearches = await Promise.allSettled(
      releasesToSearch.slice(0, 20).map((r) => searchAlbum(r.artist, r.album))
    )

    for (let i = 0; i < monoSearches.length; i++) {
      const r = monoSearches[i]
      if (r.status !== "fulfilled") continue
      // Take up to 2 tracks per artist to keep variety
      let added = 0
      for (const t of shuffle(r.value)) {
        if (added >= 2) break
        addTrack(t)
        added++
      }
    }
  }

  return NextResponse.json(shuffle(out).slice(0, 40))
}

import { NextRequest, NextResponse } from "next/server"
import { searchArtist, searchAlbum } from "@/lib/monochrome"
import { getArtistsByGenreAndMood } from "@/lib/discogs"
import { ALL_GENRES, MOODS } from "@/lib/types"
import type { Track, Mood } from "@/lib/types"

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ─── Stock / library-music filter ──────────────────────────────────────────
// These patterns appear almost exclusively in royalty-free / stock music.
// Real releases from Discogs are used as the seed, so tracks whose artist
// doesn't closely match the Discogs seed name are likely filler results.
const STOCK_ARTIST_PATTERNS = [
  /chill(?: out| lounge| music| zone| vibes| hop)?/i,
  /lounge(?: music| bar| café| café)?/i,
  /music (?:bar|café|academy|lab|center|centre|club|collection|project)/i,
  /relaxing(?: music)?/i,
  /study(?: music| time| music group)?/i,
  /yoga(?: music)?/i,
  /spa(?: music)?/i,
  /meditation(?: music)?/i,
  /sleep(?: music)?/i,
  /background(?: music)?/i,
  /workout(?: music)?/i,
  /dinner(?: music)?/i,
  /coffee(?: music| shop| jazz)?/i,
  /piano covers/i,
  /guitar covers/i,
  /healing(?: music)?/i,
  /instrumental music/i,
  /smooth jazz (?:club|radio|collective|orchestra|band)/i,
  /jazz (?:club|bar|lounge|radio|academy)/i,
  /(?:latin|salsa|bossa) (?:dance group|music bar|lounge)/i,
  /all stars?$/i,
  /bgm/i,
  /exam study/i,
  /pilates|zumba|aerobic/i,
]

function isStockArtist(name: string): boolean {
  return STOCK_ARTIST_PATTERNS.some((re) => re.test(name))
}

/**
 * From Monochrome results for a Discogs artist, keep only tracks
 * whose artist field approximately matches the seed (to avoid
 * Monochrome returning unrelated stock compilations).
 */
function filterByArtistMatch(tracks: Track[], seedArtist: string): Track[] {
  const seed = seedArtist.toLowerCase().trim()
  return tracks.filter((t) => {
    const a = t.artist.toLowerCase()
    // Accept if at least one word of the seed (≥4 chars) appears in the track artist
    const words = seed.split(/\s+/).filter((w) => w.length >= 4)
    return words.length === 0 || words.some((w) => a.includes(w))
  })
}

export async function GET(req: NextRequest) {
  const mood = (req.nextUrl.searchParams.get("mood") || "chill") as Mood
  const excludedParam = req.nextUrl.searchParams.get("excluded") || ""
  const excluded = excludedParam ? excludedParam.split(",") : []
  const seenParam = req.nextUrl.searchParams.get("seen") || ""
  const seenIds = new Set<number>(
    seenParam ? seenParam.split(",").map(Number).filter(Boolean) : []
  )
  const likedParam = req.nextUrl.searchParams.get("liked") || ""
  const likedArtists = likedParam ? likedParam.split(",").filter(Boolean) : []

  // Only genres the user DIDN'T exclude
  const includedGenres = (ALL_GENRES as readonly string[]).filter(
    (g) => !excluded.includes(g)
  )

  const tracks: Track[] = []
  const usedIds = new Set<number>()

  function addUnique(items: Track[], limit = 3) {
    // Shuffle so we don't always pick the same top tracks from Monochrome
    const pool = shuffle([...items])
    let added = 0
    for (const t of pool) {
      if (tracks.length >= 30 || added >= limit) break
      if (!t.id || usedIds.has(t.id)) continue
      if (seenIds.has(t.id)) continue   // skip already-heard tracks
      if (isStockArtist(t.artist)) continue
      usedIds.add(t.id)
      tracks.push(t)
      added++
    }
  }

  // ─── STEP 0: Liked artists (preferences memory) ────────────────────────────
  // Always include some tracks from artists the user has liked before
  if (likedArtists.length > 0) {
    const pick = shuffle([...likedArtists]).slice(0, 6)
    const likedSearches = await Promise.allSettled(pick.map((a) => searchArtist(a)))
    for (let i = 0; i < likedSearches.length; i++) {
      const r = likedSearches[i]
      if (r.status !== "fulfilled") continue
      const matched = filterByArtistMatch(r.value, pick[i])
      addUnique(matched, 2)
    }
  }

  // ─── PRIMARY: Discogs → Monochrome album search ────────────────────────────
  const discogsReleases = await getArtistsByGenreAndMood(includedGenres, mood)
  const realReleases = discogsReleases.filter((r) => !isStockArtist(r.artist))

  const artistSearches = await Promise.allSettled(
    realReleases.slice(0, 25).map((r) => searchAlbum(r.artist, r.album))
  )

  for (let i = 0; i < artistSearches.length; i++) {
    const r = artistSearches[i]
    if (r.status !== "fulfilled") continue
    const seedName = realReleases[i].artist
    const matched = filterByArtistMatch(r.value, seedName)
    addUnique(matched, 3)
  }

  return NextResponse.json(shuffle(tracks).slice(0, 30))
}

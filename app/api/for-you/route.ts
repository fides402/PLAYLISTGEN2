import { NextRequest, NextResponse } from "next/server"
import { getRecommendations, searchAlbum } from "@/lib/monochrome"
import { getDiscogsFingerprint, getArtistsByDiscogParams } from "@/lib/discogs"
import { rankTracks, type TrackWithMeta } from "@/lib/ranker"
import { deriveUserProfile, deserializeProfile, type UserProfileStore, type SerializedUserProfile } from "@/lib/userProfile"
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

  const userId = searchParams.get("userId") || "anonymous"

  if (likedIds.length === 0) return NextResponse.json([])

  // Recupera profilo utente per personalizzazione
  let userProfile = undefined
  const profileParam = searchParams.get("profile")
  if (profileParam) {
    try {
      const decoded = JSON.parse(Buffer.from(profileParam, "base64").toString("utf-8")) as SerializedUserProfile
      userProfile = deserializeProfile(decoded)
    } catch { /* ignora */ }
  }
  const feedbackParam = searchParams.get("feedback")
  if (!userProfile && feedbackParam) {
    try {
      const store = JSON.parse(Buffer.from(feedbackParam, "base64").toString("utf-8")) as UserProfileStore
      userProfile = deriveUserProfile(userId, store)
    } catch { /* ignora */ }
  }

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
  if (likedArtists.length > 0) {
    const artistsToFingerprint = shuffle([...likedArtists]).slice(0, 3)
    const fingerprints = await Promise.all(
      artistsToFingerprint.map((a) => getDiscogsFingerprint(a))
    )
    const discogsSearches = fingerprints
      .filter((fp): fp is NonNullable<typeof fp> => fp !== null)
      .map((fp) =>
        getArtistsByDiscogParams({
          style: fp.style,
          country: fp.country,
          yearStart: fp.yearStart,
          yearEnd: fp.yearEnd,
        })
      )
    const discogsResults = await Promise.all(discogsSearches)
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
      let added = 0
      for (const t of shuffle(r.value)) {
        if (added >= 2) break
        addTrack(t)
        added++
      }
    }
  }

  // ─── Rerank con rarityScore + personalizzazione (F2 + F4) ─────────────────
  const tracksWithMeta: TrackWithMeta[] = out.map((t) => ({
    ...t,
    popularity: undefined,
    bpm: undefined,
  }))

  // Deriva constraints dal profilo utente se disponibile
  const constraints = userProfile?.preferredBpmRange
    ? { bpmMin: userProfile.preferredBpmRange[0], bpmMax: userProfile.preferredBpmRange[1] }
    : {}

  const ranked = rankTracks(tracksWithMeta, constraints, userProfile)

  return NextResponse.json(ranked.slice(0, 40))
}

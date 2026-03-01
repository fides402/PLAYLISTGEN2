import { NextRequest, NextResponse } from "next/server"
import {
  getArtistsByDiscogParams,
  getArtistsByGenreAndMood,
  getArtistsByLabel,
} from "@/lib/discogs"
import { searchArtist, searchAlbum } from "@/lib/monochrome"
import { ALL_GENRES } from "@/lib/types"
import type { Track, Mood } from "@/lib/types"

const GROQ_KEY = process.env.GROQ_API_KEY

// Discogs genre taxonomy values
const DISCOGS_GENRES = [
  "Jazz", "Electronic", "Hip Hop", "Rock", "Funk / Soul",
  "Classical", "Blues", "Folk, World, & Country", "Pop", "Reggae", "Latin",
]

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const STOCK_ARTIST_PATTERNS = [
  /chill(?: out| lounge| music| zone| vibes| hop)?/i,
  /lounge(?: music| bar| café)?/i,
  /relaxing(?: music)?/i,
  /study(?: music| time| music group)?/i,
  /yoga(?: music)?/i,
  /spa(?: music)?/i,
  /meditation(?: music)?/i,
  /sleep(?: music)?/i,
  /background(?: music)?/i,
  /workout(?: music)?/i,
  /smooth jazz (?:club|radio|collective)/i,
  /jazz (?:club|bar|lounge|academy)/i,
  /all stars?$/i,
  /bgm/i,
  /exam study/i,
  /instrumental music/i,
]

function isStockArtist(name: string): boolean {
  return STOCK_ARTIST_PATTERNS.some((re) => re.test(name))
}

function filterByArtistMatch(tracks: Track[], seedArtist: string): Track[] {
  const seed = seedArtist.toLowerCase().trim()
  // Keep words ≥ 3 chars (avoids stop-words like "a", "of", "de" while keeping
  // names like "Jay", "Big", etc.)
  const words = seed.split(/\s+/).filter((w) => w.length >= 3)
  if (words.length === 0) return tracks
  return tracks.filter((t) => {
    const a = t.artist.toLowerCase()
    // ALL seed words must appear in the artist string — prevents "some word"
    // coincidence matches (e.g. "James" matching "James Brown" when seed is
    // "Kendrick Lamar" just because "lamar" appears in another field)
    return words.every((w) => a.includes(w))
  })
}

interface GroqAlbum {
  artist: string
  album: string
}

interface GroqResult {
  albums: GroqAlbum[]       // Specific albums → Step 0 (highest precision)
  artists: string[]          // Broader artist search → Step 1
  deep_cuts: string[]        // Obscure artists → Step 2
  labels: string[]           // Cult labels → Step 3
  discogs: {
    genre?: string
    style?: string
    country?: string
    year_start?: string
    year_end?: string
  }
  fallback_genres: string[]
  mood: Mood
}

async function queryGroq(userQuery: string): Promise<GroqResult> {
  const prompt = `You are a music curation expert and Discogs specialist. Your goal is to identify music with PRECISELY the right sonic aesthetic, tempo, and era for the user's request.

The user wants to hear: "${userQuery}"

Respond with a JSON object ONLY (no markdown, no explanation):

{
  "albums": [{"artist": "...", "album": "..."}],
  "artists": ["..."],
  "deep_cuts": ["..."],
  "labels": ["..."],
  "discogs": {"genre": "...", "style": "...", "country": "...", "year_start": "YYYY", "year_end": "YYYY"},
  "fallback_genres": ["..."],
  "mood": "..."
}

FIELD RULES:

"albums" (MOST IMPORTANT — 10-15 entries):
  - List SPECIFIC albums (artist + album title) that PRECISELY match the request.
  - If the request mentions a year range (e.g. "2021-2026", "ultimi 5 anni", "dal 2020"): ONLY include albums released within that range. Do NOT include albums outside the range even from the same artist.
  - If the request mentions specific artists or "in the style of X": include their albums that best represent that style, plus albums by artists with IDENTICAL sonic aesthetic.
  - If the request is about tempo/mood (e.g. "lento e distensivo", "energico", "malinconico"): choose albums whose ENTIRE sonic character matches — don't pick an energetic album from a chill artist just because you know that artist.
  - For "sounds like X / stile di X": dig into what makes X unique — production style, BPM range, sample sources, instrumental palette — and find albums sharing THOSE specific traits.

"artists" (5-8 entries):
  - Additional artists NOT already covered by albums for broader discovery.
  - Must share the same tempo, energy, and production aesthetic as the request.
  - For year-specific requests: artists PRIMARILY known for work in that era.

"deep_cuts" (6-10 entries):
  - Underground, cult, or regional artists with the EXACT SAME sonic signature.
  - Not just same genre — same vibe, same tempo, same production philosophy.
  - Session musicians with solo careers, regional acts, one-album wonders.

"labels" (4-8 entries):
  - Record labels associated with this specific sound/scene/era.
  - Examples: ECM, Blue Note (jazz); Warp, Kompakt (electronic); Def Jam, Interscope (hip hop); Rough Trade, 4AD (indie); Sub Pop (grunge/indie); Tommy Boy, Priority (90s rap); Top Dawg Ent, Dreamville (2010s rap); etc.

"discogs.genre": one of: ${DISCOGS_GENRES.join(", ")}
"discogs.style": the most SPECIFIC Discogs subgenre/style. Encode tempo/energy here:
  - Slow/relaxing → Downtempo, Ambient, Dub, Drone, Slowcore, Bossa Nova
  - Fast/energetic → Drum n Bass, Hard Techno, Punk, Gabber, Speed Metal
  - Mid-tempo underground hip hop → Boom Bap, Abstract, Conscious, Jazz-Rap
  - Modern trap → Trap, Crunk, Mumble Rap
  - West Coast smooth → G-Funk, Jazzy Rap, Neo Soul (rap-adjacent)
"discogs.country": omit unless request specifies geography
"discogs.year_start"/"year_end": use EXACT years if request specifies range; otherwise decade bounds
"fallback_genres": from: ${(ALL_GENRES as readonly string[]).join(", ")}
"mood": STRICTLY based on tempo and energy of the request:
  chill = BPM 60-90, relaxed, atmospheric, mellow, "distensivo", "rilassato", "slow"
  melancholic = BPM 55-80, emotional, introspective, dark, "malinconico", "triste"
  focus = BPM 90-115, instrumental or minimal, non-distracting, good for concentration
  upbeat = BPM 100-130, positive, feel-good, fun
  energetic = BPM 120-160+, intense, hype, aggressive, "energico", "carico"

STYLE-MATCHING EXAMPLES:
- "stile di Alchemist" → grimy NY underground, soul/jazz samples, dusty drums, 80-95 BPM, dark atmosphere → albums: Griselda, Boldy James, Mach-Hommy, Conway, Westside Gunn, Roc Marciano
- "stile di Larry June" → smooth West Coast, jazzy, laid-back, organic samples, positive vibes → albums: Larry June, Kaytranada-adjacent, Jay Worthy, Cardo Got Wings, Sango
- "lento e distensivo" → mood=chill, style=Downtempo or Ambient, ONLY mellow/slow albums
- "rap americano 2021-2026" → ONLY albums from 2021-2026, trap or boom bap or whatever style dominates, NOT albums from 2018-2020

CONCRETE EXAMPLES:
- "jazz italiano anni 70" → {"albums":[{"artist":"Enrico Rava","album":"The Pilgrim And The Stars"},{"artist":"Giorgio Gaslini","album":"Schizophonia"},{"artist":"Area","album":"Arbeit Macht Frei"},{"artist":"Pepi Lemer","album":"Postcard"}],"artists":["Franco D'Andrea","Mario Schiano"],"deep_cuts":["Gaetano Liguori","Giancarlo Schiaffini","Bruno Tommaso","Lino Patruno","Antonello Salis"],"labels":["Horo","Black Saint","Soul Note","Carosello","Fonit Cetra"],"discogs":{"genre":"Jazz","style":"Post Bop","country":"Italy","year_start":"1970","year_end":"1979"},"fallback_genres":["Jazz"],"mood":"chill"}
- "rap americano 2022-2024" → {"albums":[{"artist":"Kendrick Lamar","album":"Mr. Morale & The Big Steppers"},{"artist":"Drake","album":"Her Loss"},{"artist":"21 Savage","album":"american dream"},{"artist":"Tyler the Creator","album":"Call Me If You Get Lost"}],"artists":["Lil Baby","Gunna"],"deep_cuts":["Armani Caesar","Boldy James","Stove God Cooks","Rome Streetz"],"labels":["Top Dawg Entertainment","Dreamville","EMPIRE","Interscope"],"discogs":{"genre":"Hip Hop","style":"Trap","year_start":"2022","year_end":"2024"},"fallback_genres":["Hip Hop"],"mood":"energetic"}
- "stile di Alchemist e Larry June" → {"albums":[{"artist":"Boldy James","album":"The Price of Tea in China"},{"artist":"Westside Gunn","album":"Hitler Wears Hermes 8"},{"artist":"Larry June","album":"Cruise Us"},{"artist":"Jay Worthy","album":"LNDN DRGS"},{"artist":"Mach-Hommy","album":"Pray for Haiti"}],"artists":["Roc Marciano","Your Old Droog"],"deep_cuts":["Stove God Cooks","Ransom","Flee Lord","Rome Streetz","Armani Caesar"],"labels":["EMPIRE","Griselda Records","ALC Records","Nature Sounds"],"discogs":{"genre":"Hip Hop","style":"Boom Bap","year_start":"2018","year_end":"2024"},"fallback_genres":["Hip Hop"],"mood":"chill"}`

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.25,
      max_tokens: 1400,
      response_format: { type: "json_object" },
    }),
  })

  if (!res.ok) throw new Error(`Groq ${res.status}`)

  const data = await res.json()
  const text: string = data.choices?.[0]?.message?.content ?? ""
  const parsed = JSON.parse(text) as Partial<GroqResult>

  const validMoods: Mood[] = ["chill", "energetic", "focus", "melancholic", "upbeat"]
  const mood = validMoods.includes(parsed.mood as Mood) ? (parsed.mood as Mood) : "chill"

  const allGenres = ALL_GENRES as readonly string[]
  const fallback_genres = (parsed.fallback_genres ?? []).filter((g) => allGenres.includes(g))

  const filterArtists = (arr: unknown[]) =>
    arr.filter((a): a is string => typeof a === "string" && a.length > 1 && !isStockArtist(a))

  const artists = filterArtists(parsed.artists ?? [])
  const deep_cuts = filterArtists(parsed.deep_cuts ?? []).filter((a) => !artists.includes(a))

  const labels = (parsed.labels ?? []).filter(
    (l): l is string => typeof l === "string" && l.length > 1
  )

  const albums = (parsed.albums ?? []).filter(
    (a): a is GroqAlbum =>
      a && typeof a.artist === "string" && typeof a.album === "string" &&
      a.artist.length > 0 && a.album.length > 0 && !isStockArtist(a.artist)
  )

  return {
    albums,
    artists,
    deep_cuts,
    labels,
    discogs: parsed.discogs ?? {},
    fallback_genres: fallback_genres.length > 0 ? fallback_genres : [...allGenres],
    mood,
  }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim()
  if (!q) return NextResponse.json([])

  const seenParam = req.nextUrl.searchParams.get("seen") || ""
  const seenIds = new Set<number>(
    seenParam ? seenParam.split(",").map(Number).filter(Boolean) : []
  )

  let groqAlbums: GroqAlbum[] = []
  let groqArtists: string[] = []
  let groqDeepCuts: string[] = []
  let groqLabels: string[] = []
  let discogsParams: GroqResult["discogs"] = {}
  let fallbackGenres: string[] = [...ALL_GENRES]
  let mood: Mood = "chill"

  if (GROQ_KEY) {
    try {
      const result = await queryGroq(q)
      groqAlbums = result.albums
      groqArtists = result.artists
      groqDeepCuts = result.deep_cuts
      groqLabels = result.labels
      discogsParams = result.discogs
      fallbackGenres = result.fallback_genres
      mood = result.mood
    } catch {
      // fallback silently
    }
  }

  const yearStart = discogsParams.year_start ? parseInt(discogsParams.year_start) : null
  const yearEnd   = discogsParams.year_end   ? parseInt(discogsParams.year_end)   : null

  const tracks: Track[] = []
  const usedIds = new Set<number>()

  function addTracks(items: Track[], seedArtist: string, limit = 3) {
    const pool = shuffle([...filterByArtistMatch(items, seedArtist)])
    let added = 0
    for (const t of pool) {
      if (tracks.length >= 35 || added >= limit) break
      if (!t.id || usedIds.has(t.id)) continue
      if (seenIds.has(t.id)) continue
      if (isStockArtist(t.artist)) continue
      usedIds.add(t.id)
      tracks.push(t)
      added++
    }
  }

  // STEP 0: Specific Groq albums → searchAlbum (highest precision, year-aware)
  if (groqAlbums.length > 0) {
    const searches = await Promise.allSettled(
      groqAlbums.slice(0, 15).map((a) => searchAlbum(a.artist, a.album))
    )
    for (let i = 0; i < searches.length; i++) {
      const r = searches[i]
      if (r.status !== "fulfilled") continue
      addTracks(r.value, groqAlbums[i].artist, 3)
    }
  }

  // STEP 1: Broader Groq artists → 2 tracks each
  if (groqArtists.length > 0) {
    const searches = await Promise.allSettled(
      groqArtists.slice(0, 8).map((a) => searchArtist(a))
    )
    for (let i = 0; i < searches.length; i++) {
      const r = searches[i]
      if (r.status !== "fulfilled") continue
      addTracks(r.value, groqArtists[i], 2)
    }
  }

  // STEP 2: Deep cuts — obscure/cult Groq artists, up to 3 tracks each
  if (groqDeepCuts.length > 0) {
    const searches = await Promise.allSettled(
      groqDeepCuts.slice(0, 10).map((a) => searchArtist(a))
    )
    for (let i = 0; i < searches.length; i++) {
      const r = searches[i]
      if (r.status !== "fulfilled") continue
      addTracks(r.value, groqDeepCuts[i], 3)
    }
  }

  // STEP 3: Label-based Discogs discovery → album search
  if (tracks.length < 22 && groqLabels.length > 0) {
    const labelReleases = await getArtistsByLabel(groqLabels)
    const fresh = labelReleases.filter((r) => !isStockArtist(r.artist))
    const searches = await Promise.allSettled(
      fresh.slice(0, 16).map((r) => searchAlbum(r.artist, r.album))
    )
    for (let i = 0; i < searches.length; i++) {
      const r = searches[i]
      if (r.status !== "fulfilled") continue
      addTracks(r.value, fresh[i].artist)
    }
  }

  // STEP 4: Discogs targeted params → album search
  if (tracks.length < 20 && Object.keys(discogsParams).length > 0) {
    const discogsReleases = await getArtistsByDiscogParams({
      genre:     discogsParams.genre,
      style:     discogsParams.style,
      country:   discogsParams.country,
      yearStart: discogsParams.year_start,
      yearEnd:   discogsParams.year_end,
    })
    const fresh = discogsReleases.filter((r) => !isStockArtist(r.artist))
    const searches = await Promise.allSettled(
      fresh.slice(0, 20).map((r) => searchAlbum(r.artist, r.album))
    )
    for (let i = 0; i < searches.length; i++) {
      const r = searches[i]
      if (r.status !== "fulfilled") continue
      addTracks(r.value, fresh[i].artist)
    }
  }

  // STEP 5: Generic fallback if still too few tracks
  if (tracks.length < 15) {
    const fallbackReleases = await getArtistsByGenreAndMood(fallbackGenres, mood)
    const fresh = fallbackReleases.filter((r) => !isStockArtist(r.artist))
    const searches = await Promise.allSettled(
      fresh.slice(0, 15).map((r) => searchAlbum(r.artist, r.album))
    )
    for (let i = 0; i < searches.length; i++) {
      const r = searches[i]
      if (r.status !== "fulfilled") continue
      addTracks(r.value, fresh[i].artist)
    }
  }

  // ── Year-range post-filter ──────────────────────────────────────────────────
  // Apply ONLY when Groq identified a specific year range AND tracks have year data.
  // Keep tracks with unknown year (year undefined) to avoid emptying the list.
  let finalTracks = tracks
  if (yearStart !== null || yearEnd !== null) {
    const lo = yearStart ?? 0
    const hi = yearEnd   ?? 9999
    const withYear    = tracks.filter((t) => t.year !== undefined)
    const withoutYear = tracks.filter((t) => t.year === undefined)
    const inRange     = withYear.filter((t) => t.year! >= lo && t.year! <= hi)
    // Use year-filtered set if it gives us at least 8 tracks; otherwise mix in unknowns
    const yearFiltered = inRange.length >= 8
      ? inRange
      : [...inRange, ...withoutYear].slice(0, 30)
    if (yearFiltered.length >= 8) finalTracks = yearFiltered
  }

  return NextResponse.json(shuffle(finalTracks).slice(0, 30))
}

import { NextRequest, NextResponse } from "next/server"
import { getRecommendations, searchArtist, searchAlbum } from "@/lib/monochrome"
import { findRelatedArtists } from "@/lib/musicbrainz"
import type { Track } from "@/lib/types"

const GROQ_KEY = process.env.GROQ_API_KEY

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
  /study(?: music| time)?/i,
  /yoga(?: music)?/i,
  /spa(?: music)?/i,
  /meditation(?: music)?/i,
  /sleep(?: music)?/i,
  /background(?: music)?/i,
  /workout(?: music)?/i,
  /smooth jazz (?:club|radio|collective)/i,
  /all stars?$/i,
  /bgm/i,
]
function isStock(name: string) {
  return STOCK_ARTIST_PATTERNS.some((re) => re.test(name))
}

interface GroqMixResult {
  sonic_description: string
  albums: { artist: string; album: string }[]
  artists: string[]
}

async function groqSimilar(title: string, artist: string): Promise<GroqMixResult> {
  const prompt = `You are a music expert. The user wants a playlist that sounds EXACTLY like "${title}" by ${artist}.

Decompose this track's sonic identity: BPM range, energy level, mood, production style, instruments, sample sources, era.
Find albums and artists sharing the IDENTICAL sonic fingerprint — not just same genre, but same exact vibe, tempo, and production aesthetic.

Respond with JSON only:
{
  "sonic_description": "15-word max description of the sound",
  "albums": [{"artist": "...", "album": "..."}],
  "artists": ["..."]
}

- "sonic_description": captures BPM range, mood, production texture in ≤15 words
- "albums": 10-12 specific albums with identical sound — same BPM, same energy, same production philosophy. Mix well-known and obscure.
- "artists": 5-8 additional artists with the same sonic DNA
- Do NOT pick based on genre alone — match the actual sound`

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 900,
      response_format: { type: "json_object" },
    }),
  })
  if (!res.ok) throw new Error(`Groq ${res.status}`)
  const data = await res.json()
  const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as Partial<GroqMixResult>
  return {
    sonic_description: parsed.sonic_description ?? "",
    albums: (parsed.albums ?? []).filter(
      (a): a is { artist: string; album: string } =>
        typeof a?.artist === "string" && typeof a?.album === "string"
    ),
    artists: (parsed.artists ?? []).filter(
      (a): a is string => typeof a === "string" && a.length > 1
    ),
  }
}

// GET /api/mix?title=XXX&artist=YYY&id=ZZZ
export async function GET(req: NextRequest) {
  const title  = req.nextUrl.searchParams.get("title")?.trim()
  const artist = req.nextUrl.searchParams.get("artist")?.trim()
  const trackId = req.nextUrl.searchParams.get("id")
  if (!title || !artist) {
    return NextResponse.json({ error: "title and artist required" }, { status: 400 })
  }

  const seenParam = req.nextUrl.searchParams.get("seen") || ""
  const seenIds = new Set<number>(
    seenParam ? seenParam.split(",").map(Number).filter(Boolean) : []
  )
  if (trackId) seenIds.add(Number(trackId)) // exclude seed track itself

  const tracks: Track[] = []
  const usedIds = new Set<number>()

  function addTracks(items: Track[], seedName: string, limit = 3) {
    const seed = seedName.toLowerCase()
    const words = seed.split(/\s+/).filter((w) => w.length >= 4)
    const pool = shuffle(
      items.filter((t) => {
        const a = t.artist.toLowerCase()
        return words.length === 0 || words.some((w) => a.includes(w))
      })
    )
    let added = 0
    for (const t of pool) {
      if (tracks.length >= 30 || added >= limit) break
      if (!t.id || usedIds.has(t.id) || seenIds.has(t.id)) continue
      if (isStock(t.artist)) continue
      usedIds.add(t.id)
      tracks.push(t)
      added++
    }
  }

  // Run all three sources in parallel
  const [tidalRecs, mbArtists, groqResult] = await Promise.all([
    trackId ? getRecommendations(Number(trackId)) : Promise.resolve([] as Track[]),
    findRelatedArtists(artist),
    GROQ_KEY
      ? groqSimilar(title, artist).catch(
          (): GroqMixResult => ({ sonic_description: "", albums: [], artists: [] })
        )
      : Promise.resolve<GroqMixResult>({ sonic_description: "", albums: [], artists: [] }),
  ])

  // STEP 1: Tidal recs — most sonically precise
  for (const t of shuffle(tidalRecs)) {
    if (tracks.length >= 30) break
    if (!t.id || usedIds.has(t.id) || seenIds.has(t.id)) continue
    if (isStock(t.artist)) continue
    usedIds.add(t.id)
    tracks.push(t)
  }

  // STEP 2: Groq specific albums — curated sonic matches
  if (groqResult.albums.length > 0) {
    const searches = await Promise.allSettled(
      groqResult.albums.slice(0, 12).map((a) => searchAlbum(a.artist, a.album))
    )
    for (let i = 0; i < searches.length; i++) {
      const r = searches[i]
      if (r.status !== "fulfilled") continue
      addTracks(r.value, groqResult.albums[i].artist, 3)
    }
  }

  // STEP 3: MusicBrainz related artists — collaborators, band members, influences
  if (mbArtists.length > 0) {
    const searches = await Promise.allSettled(
      mbArtists.slice(0, 10).map((a) => searchArtist(a))
    )
    for (let i = 0; i < searches.length; i++) {
      const r = searches[i]
      if (r.status !== "fulfilled") continue
      addTracks(r.value, mbArtists[i], 2)
    }
  }

  // STEP 4: Groq broader artist list
  if (groqResult.artists.length > 0) {
    const searches = await Promise.allSettled(
      groqResult.artists.slice(0, 8).map((a) => searchArtist(a))
    )
    for (let i = 0; i < searches.length; i++) {
      const r = searches[i]
      if (r.status !== "fulfilled") continue
      addTracks(r.value, groqResult.artists[i], 2)
    }
  }

  return NextResponse.json({
    tracks: shuffle(tracks).slice(0, 25),
    sonicDescription: groqResult.sonic_description,
  })
}

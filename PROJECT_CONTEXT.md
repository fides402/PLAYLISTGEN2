# HiFi Mood — PROJECT CONTEXT

> Persistent memory file. Updated at each significant architectural change.
> Last updated: 2026-03-01

---

## 1. Project Overview

**HiFi Mood** is an AI-powered music discovery and streaming app that lets users describe what they want to hear in free text (e.g. "jazz italiano anni 70", "stile di Alchemist", "ost italiano anni 70") and generates a curated 30-track playlist streamed in Hi-Fi quality via Tidal (through the Monochrome API).

**Path**: `C:\Users\User\Downloads\appaìhifi\hifi-mood\`
**Repo**: `https://github.com/fides402/PLAYLISTGEN2`
**Branch**: `main`

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.1.6 — App Router, Turbopack |
| Language | TypeScript 5, strict mode |
| Styling | Tailwind CSS 4 |
| State | Zustand 5.0.11 with localStorage `persist` |
| Audio | HLS.js 1.6.15 + native `<audio>` |
| Auth | Supabase (optional — app works without it) |
| AI/LLM | Groq (LLaMA 3.3 70B) |
| Music DB | Discogs API |
| Relationship graph | MusicBrainz |
| Streaming | Monochrome API (Tidal wrapper) |

**Dev server**: port **3002** (`npm run dev -- --port 3002`)
Port 3000 often occupied by system process 38944.

---

## 3. Directory Structure

```
hifi-mood/
├── app/
│   ├── api/
│   │   ├── ai-search/route.ts     ← Main AI pipeline (Groq→Discogs→MusicBrainz→Monochrome)
│   │   ├── for-you/route.ts       ← Personalised recs from liked tracks
│   │   ├── like/route.ts          ← Like/unlike track
│   │   ├── mix/route.ts           ← Mix from a specific track
│   │   ├── playlist/route.ts      ← Mood-based playlist generation
│   │   ├── recommend/route.ts     ← Monochrome recommendations endpoint
│   │   └── stream/route.ts        ← Audio proxy (Range-aware, CORS bypass)
│   ├── share/[token]/
│   │   ├── page.tsx               ← Shared playlist page (SSR)
│   │   └── SharePlayer.tsx        ← Client player for shared playlists
│   ├── mood/page.tsx              ← Mood selector UI
│   ├── onboarding/page.tsx        ← Genre exclusion setup
│   ├── player/page.tsx            ← Main player (free-text search + playlist)
│   ├── page.tsx                   ← Home / landing
│   └── layout.tsx                 ← Root layout, fonts, metadata
├── components/
│   ├── AudioPlayer.tsx            ← Core player component, range requests, buffering
│   └── TrackCard.tsx              ← Track row with like/play controls
├── lib/
│   ├── types.ts                   ← Track, Mood, Genre, MOODS[], GENRE_DISCOGS_MAP
│   ├── store.ts                   ← Zustand store (see §6)
│   ├── share.ts                   ← encodePlaylist / decodePlaylist (base64url)
│   ├── monochrome.ts              ← Tidal wrapper (search, stream, recs)
│   ├── discogs.ts                 ← Discogs genre/label/mood search
│   └── musicbrainz.ts             ← Artist relationship graph
├── .env.local                     ← API keys (see §4)
├── next.config.ts
└── PROJECT_CONTEXT.md             ← THIS FILE
```

---

## 4. Environment Variables (`.env.local`)

```env
NODE_OPTIONS=--dns-result-order=ipv4first
MONOCHROME_API_URL=https://api.monochrome.tf
DISCOGS_TOKEN=<your_discogs_token>
GEMINI_API_KEY=<your_gemini_key>
GROQ_API_KEY=<your_groq_key>
# Optional Supabase:
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

---

## 5. AI Search Pipeline (`app/api/ai-search/route.ts`)

This is the core of the app. The full flow:

### Step 0 — Groq Pass 1 (structured intent extraction)
`queryGroq(userQuery)` → LLaMA 3.3 70B at temperature 0.25 returns:
```json
{
  "albums":        [{"artist": "...", "album": "..."}],  // 10-15 specific albums (MOST IMPORTANT)
  "artists":       ["..."],                               // 5-8 broader discovery artists
  "deep_cuts":     ["..."],                               // 6-10 obscure/cult artists
  "labels":        ["..."],                               // 4-8 scene labels
  "discogs":       {"genre":"Jazz","style":"Post Bop","country":"Italy","year_start":"1970","year_end":"1979"},
  "fallback_genres": ["Jazz"],
  "mood":          "chill"
}
```

### Step 0 — Groq Pass 2 (deep cuts expansion, fires in parallel)
`queryGroqDeepPass(query, alreadyFoundArtists)` → second Groq call at temperature 0.7:
- Takes original query + all artists found in Pass 1 as excluded list
- Returns 10-15 even more obscure artists NOT in Pass 1
- Fires immediately after Pass 1 completes, resolves during Steps 1-3
- Awaited as "STEP 2c" — zero net latency impact

### Step 1 — MusicBrainz parallel launch
`findRelatedArtists(topGroqArtist)` fires in parallel with Steps 1-3.
Two MB API requests + 1.1s sleep (rate-limit) → ~1.5s total.
24h server-side Next.js cache (`next: { revalidate: 86400 }`).
Awaited in Step 2b.

### Step 2 — Monochrome album searches (Pass 1 albums)
`searchAlbum(artist, album)` for each Groq album (up to 15), parallel.
`addTracks(results, artist, 3)` — max 3 tracks per artist, shuffled.

### Step 3 — Monochrome artist searches (Pass 1 artists)
`searchArtist(artist)` for each Groq artist (up to 8), parallel.
`addTracks(results, artist, 2)` — 2 tracks per artist.

### Step 4 — Monochrome deep cut searches (Pass 1 deep_cuts)
`searchArtist(artist)` for Groq deep cuts (up to 10), parallel.
`addTracks(results, artist, 3)`.

### Step 2b — MusicBrainz results (already resolved)
Collaborators/band members/influences of the top Groq artist.
Up to 8 artists, 2 tracks each.

### Step 2c — Groq Pass 2 deep cuts (already resolved)
Artists from the second Groq pass.
Up to 12 artists, 2 tracks each.

### Step 5 — Label-based Discogs (only if <22 tracks)
`getArtistsByLabel(groqLabels)` → Discogs label releases → Monochrome.

### Step 6 — Discogs targeted params (only if <20 tracks)
`getArtistsByDiscogParams({genre, style, country, yearStart, yearEnd})` → Monochrome.

### Step 7 — Generic fallback (only if <15 tracks)
`getArtistsByGenreAndMood(fallbackGenres, mood)` → Monochrome.

### Year post-filter
If Groq identified a year range AND we have ≥8 in-range tracks → filter.
Safety: if filtered result has <8 tracks, mix in unknown-year tracks to avoid empty list.

### Final output
`shuffle(finalTracks).slice(0, 30)` → 30 tracks max, randomised.

---

## 6. Zustand Store (`lib/store.ts`)

Persisted to localStorage as `hifi-mood-store`. Key fields:

| Field | Type | Description |
|---|---|---|
| `excludedGenres` | `string[]` | Genres the user doesn't want |
| `likedTrackIds` | `number[]` | Tidal track IDs the user liked |
| `likedTracks` | `Track[]` | Full track objects for liked |
| `playedTrackIds` | `number[]` | Tracks already heard (max 300, avoids repeats) |
| `playlist` | `Track[]` | Current queue (NOT persisted) |
| `currentIndex` | `number` | Current position in queue (NOT persisted) |
| `currentMood` | `Mood \| null` | Active mood (NOT persisted) |
| `volume` | `number` | 0-1 (persisted) |
| `streamQuality` | `string` | "HIGH", "LOW", etc. (persisted) |
| `repeatMode` | `"none" \| "one" \| "all"` | Persisted |
| `lastSearchQuery` | `string` | Last free-text query (for "New playlist" regeneration) |

Non-persisted (ephemeral, managed by `AudioPlayer`):
`playbackTime`, `playbackDuration`, `isBuffering`, `playbackError`

---

## 7. Monochrome API (`lib/monochrome.ts`)

Base URL: `https://api.monochrome.tf`

**ALL responses** wrap data as:
```json
{ "version": "2.x", "data": { ...actual payload... } }
```

| Endpoint | Usage |
|---|---|
| `/search/?s=query` | Text search → returns `data.items[]` |
| `/track/?id=N&quality=HIGH` | Stream manifest → `data.manifestMimeType` + `data.manifest` (base64) |
| `/recommendations/?id=N` | Related tracks → `data.items[]` each is `{ track: {...} }` |

**Manifest types:**
- `application/vnd.tidal.bts` → BTS JSON → direct MP4 URL → `/api/stream?id=` proxy
- `application/dash+xml` → DASH manifest → 501 to user (not supported)

**Quality**: `HIGH` = 320 kbps AAC, BTS format, Range-request-seekable.

**Key filters in `monochrome.ts`:**
- `FAKE_TITLE_RE` — strips type beats, karaoke, covers, backing tracks
- `MIN_DURATION_SECS = 90` — strips interludes/skits
- Year extraction order: `streamStartDate` → copyright string → albumObj fields

---

## 8. Artist Matching (`filterByArtistMatch`)

Three-tier approach to handle Tidal's inconsistent artist name indexing:

| Tier | Logic | Example |
|---|---|---|
| 1 | Full seed is substring of artist | seed="ennio morricone", artist="ennio morricone" ✓ |
| 2 | All seed words match artist | seed="ennio morricone", artist="morricone & orchestra" → "morricone" ✓ |
| 3 | Longest word (≥4 chars) matches | seed="ennio morricone", artist="morricone" → "morricone" ✓ |

Tier 3 was introduced specifically for Italian/classical artists where Tidal often indexes just the surname.

---

## 9. Sharing (`lib/share.ts`)

Playlists are encoded as `base64url` tokens in the URL: `/share/{token}`.
No server storage — the token IS the playlist (compact JSON with short field names).

Compact schema per track:
```ts
{ i: number,  // id
  t: string,  // title
  a: string,  // artist
  l?: string, // album
  c?: string, // cover UUID (extracted from Tidal CDN)
  y?: number  // year
}
```

---

## 10. Audio Streaming (`app/api/stream/route.ts`)

`/api/stream?id={tidalId}` — server-side proxy:
1. Calls Monochrome `/track/?id=N&quality=HIGH` to get manifest
2. Decodes base64 BTS manifest → extracts direct CDN URL
3. Forwards `Range` header from client → returns 206 Partial Content
4. This bypasses CORS (Tidal CDN blocks direct browser access)

---

## 11. Key Bugs Fixed (historical)

| Bug | Fix |
|---|---|
| Monochrome nested `{ data: { manifest } }` | Unwrap `.data` before reading manifest fields |
| Recommendations wrapped as `{ track: {...} }` | Unwrap `.track` before `normalizeTrack()` |
| Type beats / karaoke in results | `FAKE_TITLE_RE` filter in `monochrome.ts` |
| Year wrong on re-releases | Try `streamStartDate` first, then copyright regex |
| `filterByArtistMatch` too strict (`every`) | 3-tier with longest-word fallback |
| Italian OST returning wrong artists | Groq prompt OST section + Italian composers list |
| Share link broken after revert | Back to base64url token (no server-side file) |

---

## 12. Discogs Functions (`lib/discogs.ts`)

| Function | Purpose |
|---|---|
| `getArtistsByDiscogParams({genre, style, country, yearStart, yearEnd})` | Releases matching Discogs search params |
| `getArtistsByLabel(labels[])` | Releases from specific record labels |
| `getArtistsByGenreAndMood(genres[], mood)` | Fallback — genre + mood mapping |

---

## 13. MusicBrainz Functions (`lib/musicbrainz.ts`)

| Function | Purpose |
|---|---|
| `findRelatedArtists(artistName)` | Related artists via relationship graph (collaborators, band members, influences, producers) |
| `findRecordingCollaborators(title, artist)` | Co-credits on a specific recording |

Rate limit: 1 req/sec. Uses `sleep(1100)` between calls.
24h Next.js server cache (`next: { revalidate: 86400 }`).

---

## 14. Groq Prompt Key Rules (summary)

- **albums** (10-15): specific artist+album pairs, most important signal
- **artists** (5-8): broader discovery, same aesthetic
- **deep_cuts** (6-10): underground/cult, same vibe not same fame
- **labels** (4-8): scene-defining labels
- **discogs.genre**: strict taxonomy (Jazz, Electronic, Hip Hop, Rock, Funk / Soul, Classical, Blues, Folk/World/Country, Pop, Reggae, Latin)
- **discogs.style**: most specific subgenre (e.g. "Post Bop", "Boom Bap", "Soundtrack")
- **mood**: strictly BPM-based (chill=60-90, melancholic=55-80, focus=90-115, upbeat=100-130, energetic=120-160)
- OST queries → genre="Classical" or "Jazz", style="Soundtrack", use Italian composers list
- Year range requests → ONLY albums from that range

---

## 15. Git Log (recent)

```
64c7ad2  fix(ai-search): 3-tier artist filter + OST/soundtrack Groq guidance
2e82803  fix(ai-search): MusicBrainz in pipeline, type-beat filter, year fix, stricter artist match
d135f89  revert: back to a031ed0, keep SVG play/pause icons in CompactPlayerBar
a031ed0  feat: MusicBrainz integration, share link, mix from track, compact mobile player
```


---

## Nuove Funzionalità Implementate (F1–F4)

### F1 — LLM Planner (`lib/planner.ts`)
Trasforma il testo utente in un piano strutturato (JSON validato con Zod):
- **2–5 query di ricerca** per Monochrome/Discogs
- **3–8 seed track candidate** con `estimatedRarity` [0-1]
- **Vincoli musicali**: bpmMin/bpmMax, mood, yearMin/yearMax, country, instruments, keywords

**Adattatori**:
1. `OPENAI_API_KEY` → GPT-4o-mini
2. `GROQ_API_KEY` → llama-3.3-70b (già usato da ai-search)
3. Mock rule-based → nessuna API key richiesta

Funzione pubblica: `planFromPrompt(prompt: string): Promise<Plan>`

---

### F2 — Ranking "Rarità" (`lib/ranker.ts`)

**Punteggio composito `rarityScore` [0-1]**:
| Componente | Peso | Logica |
|---|---|---|
| popularityScore | 0.35 | 1 - pop/100 (bassa pop = score alto) |
| artistPenalty | 0.15 | -0.2 per ogni occorrenza aggiuntiva dello stesso artista |
| mainstreamPenalty | 0.20 | penalità forte se pop > 70 |
| diversityBonus | 0.15 | premia anni/album rari nella pool |
| constraintCoherence | 0.15 | coerenza con bpm/mood/anno/keywords |

**Personalizzazione** (capped a ±0.20 per mantenere esplorazione):
- artistAffinity boost/penalty
- rarityPreference match
- BPM compatibility

Funzione pubblica: `rankTracks(tracks, constraints, userProfile?): RankedTrack[]`

---

### F3 — Discovery a Grafo Multi-Hop (`lib/graphDiscovery.ts`)

Algoritmo con budget request tracciato (max 40 request/generazione):

```
1. Search (planFromPrompt queries) → candidate pool
2. selectSeeds(pool) → 3-8 seedIds (diversità artisti)
3. hop1: getRecommendations(seed) × max8 seeds, max25 rec/seed
4. hop2: getRecommendations(topK hop1) × max3 seeds (opzionale)
5. dedup + rankTracks + ensureArtistDiversity
```

Limiti configurabili: `maxSeeds`, `maxRecsPerSeed`, `hop2MaxSeeds`, `maxRequests`, `requestTimeoutMs`

**Fallback**: timeout per richiesta lenta (configurable), `Promise.allSettled` ovunque.

Endpoint: `GET /api/discover?q=...&seen=...&hop2=true&limit=30`

---

### F4 — Personalizzazione (`lib/userProfile.ts`, `app/api/feedback/route.ts`)

**Struttura FeedbackEntry**: `{ trackId, liked, timestamp, bpm?, rarityScore?, artist, year? }`

**UserProfile derivato**:
- `artistAffinity: Map<artist, score>` — +1 like, -1.5 dislike, clampato [-10, +10]
- `preferredBpmRange: [min, max]` — media ± 1.5σ dei BPM liked
- `rarityPreference: [0-1]` — media pesata rarityScore liked (likato conta ×2)

**Storage**: localStorage (Zustand `feedbackStore` + `serializedProfile`), persistito in JSON

**API**:
- `POST /api/feedback` — registra like/dislike
- `GET /api/feedback?userId=...` — recupera profilo
- `DELETE /api/feedback?userId=...&trackId=...` — rimuove feedback

**Integrazione store.ts**: `addLike()` e `addDislike()` ora aggiornano automaticamente il profilo.

**Passare il profilo alle API**:
```
const profileB64 = btoa(JSON.stringify(serializedProfile))
fetch(`/api/ai-search?q=...&profile=${profileB64}`)
fetch(`/api/discover?q=...&profile=${profileB64}`)
fetch(`/api/for-you?liked=...&profile=${profileB64}`)
```

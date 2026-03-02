/**
 * lib/graphDiscovery.ts — FUNZIONALITÀ 3: Discovery a "Grafo" Multi-Hop
 *
 * Algoritmo:
 *  1) Search → candidate pool (tramite Monochrome/Discogs)
 *  2) Scegli 3-8 seed trackIds (dal Planner o dalla pool)
 *  3) hop1: recommendations(seed) per ogni seed
 *  4) hop2: recommendations(topK hop1) — opzionale, configurabile
 *  5) Unisci pool, dedup, recupera info per subset (batching)
 *  6) Rerank finale con rarityScore + diversità + personalizzazione
 *
 * Limiti:
 *  - max seed = 8
 *  - max rec per seed = 25
 *  - hop2 max 3 seed
 *  - max totale richieste per generazione = 40
 *
 * Esporta: graphDiscover(options): Promise<RankedTrack[]>
 */

import { searchTracks, getRecommendations } from "./monochrome"
import type { Track } from "./types"
import type { TrackWithMeta, RankedTrack } from "./ranker"
import { rankTracks } from "./ranker"
import type { MusicalConstraints, Plan } from "./planner"
import type { UserProfile } from "./userProfile"

// ─── Configurazione ───────────────────────────────────────────────────────────

export interface GraphDiscoveryConfig {
  /** Numero massimo di seed trackId da usare (default: 6, max: 8) */
  maxSeeds?: number
  /** Massimo raccomandazioni per seed in hop1 (default: 20, max: 25) */
  maxRecsPerSeed?: number
  /** Abilitare hop2 (default: true) */
  enableHop2?: boolean
  /** Numero massimo seed per hop2 (default: 3) */
  hop2MaxSeeds?: number
  /** Massimo raccomandazioni per seed in hop2 (default: 15) */
  hop2MaxRecs?: number
  /** Budget massimo richieste API totali (default: 40) */
  maxRequests?: number
  /** Timeout per singola richiesta in ms (default: 5000) */
  requestTimeoutMs?: number
  /** Numero tracce finali da restituire (default: 30) */
  outputSize?: number
}

const DEFAULT_CONFIG: Required<GraphDiscoveryConfig> = {
  maxSeeds: 6,
  maxRecsPerSeed: 20,
  enableHop2: true,
  hop2MaxSeeds: 3,
  hop2MaxRecs: 15,
  maxRequests: 40,
  requestTimeoutMs: 5000,
  outputSize: 30,
}

// ─── Budget Tracker ───────────────────────────────────────────────────────────

class RequestBudget {
  private used = 0
  constructor(private readonly max: number) {}

  canMake(n = 1): boolean {
    return this.used + n <= this.max
  }

  use(n = 1): boolean {
    if (!this.canMake(n)) return false
    this.used += n
    return true
  }

  remaining(): number {
    return Math.max(0, this.max - this.used)
  }

  get totalUsed(): number {
    return this.used
  }
}

// ─── Wrapper con timeout e fallback ─────────────────────────────────────────

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

// ─── Deduplicazione pool ─────────────────────────────────────────────────────

function deduplicatePool(tracks: Track[]): Track[] {
  const seen = new Map<number, Track>()
  for (const t of tracks) {
    if (!seen.has(t.id)) seen.set(t.id, t)
  }
  return Array.from(seen.values())
}

// ─── Selezione seed dalla pool ────────────────────────────────────────────────

/**
 * Seleziona i seed trackId ottimali dalla pool candidata.
 * Preferisce tracce con:
 *  - artisti diversi (no più di 1 per artista)
 *  - distribuzione anni variata
 *  - non già viste dall'utente
 */
function selectSeeds(
  pool: Track[],
  maxSeeds: number,
  seenIds: Set<number>
): number[] {
  const usedArtists = new Set<string>()
  const seeds: number[] = []

  // Shuffle per varietà
  const shuffled = [...pool].sort(() => Math.random() - 0.5)

  for (const track of shuffled) {
    if (seeds.length >= maxSeeds) break
    if (seenIds.has(track.id)) continue
    const artistKey = track.artist.toLowerCase()
    if (usedArtists.has(artistKey)) continue

    usedArtists.add(artistKey)
    seeds.push(track.id)
  }

  // Se non abbastanza seed, aggiungi anche con artisti ripetuti
  if (seeds.length < Math.min(3, maxSeeds)) {
    for (const track of shuffled) {
      if (seeds.length >= maxSeeds) break
      if (!seeds.includes(track.id)) seeds.push(track.id)
    }
  }

  return seeds
}

// ─── Core Algorithm ───────────────────────────────────────────────────────────

export interface GraphDiscoveryOptions {
  /** Prompt utente o Plan già calcolato */
  plan: Plan
  /** ID tracce già viste dall'utente */
  seenIds?: Set<number>
  /** Profilo utente per personalizzazione */
  userProfile?: UserProfile
  /** Track candidate iniziali (dalla ricerca precedente) */
  initialPool?: Track[]
  /** Configurazione algoritmo */
  config?: GraphDiscoveryConfig
}

export interface GraphDiscoveryResult {
  tracks: RankedTrack[]
  meta: {
    requestsUsed: number
    seedsUsed: number
    hop1TracksFound: number
    hop2TracksFound: number
    totalCandidates: number
    finalCount: number
  }
}

/**
 * graphDiscover(options): Promise<GraphDiscoveryResult>
 *
 * Algoritmo multi-hop di discovery musicale a grafo.
 */
export async function graphDiscover(
  options: GraphDiscoveryOptions
): Promise<GraphDiscoveryResult> {
  const cfg = { ...DEFAULT_CONFIG, ...(options.config || {}) }
  cfg.maxSeeds = Math.min(cfg.maxSeeds, 8)
  cfg.maxRecsPerSeed = Math.min(cfg.maxRecsPerSeed, 25)
  cfg.hop2MaxSeeds = Math.min(cfg.hop2MaxSeeds, 3)

  const budget = new RequestBudget(cfg.maxRequests)
  const seenIds = options.seenIds ?? new Set<number>()
  const constraints: MusicalConstraints = options.plan.constraints

  let candidatePool: Track[] = [...(options.initialPool || [])]

  // ── STEP 1: Search → candidate pool (se non già fornita) ─────────────────
  if (candidatePool.length < 5 && options.plan.searchQueries.length > 0) {
    const queriesToRun = options.plan.searchQueries.slice(0, Math.min(5, budget.remaining()))
    const searchResults = await Promise.allSettled(
      queriesToRun.map((q) => {
        if (!budget.use()) return Promise.resolve([])
        return withTimeout(searchTracks(q), cfg.requestTimeoutMs, [])
      })
    )
    for (const r of searchResults) {
      if (r.status === "fulfilled") candidatePool.push(...r.value)
    }
  }

  candidatePool = deduplicatePool(candidatePool)
    .filter((t) => !seenIds.has(t.id))

  // ── STEP 2: Seleziona seed trackIds ──────────────────────────────────────
  // Usa seed dal Planner se possibili, altrimenti cerca dalla pool
  let seedTrackIds: number[] = []

  // Prima prova seed dal planner (cerca per titolo+artista nella pool)
  if (options.plan.seedTracks.length > 0) {
    const plannerSeeds = options.plan.seedTracks.slice(0, cfg.maxSeeds)
    for (const seed of plannerSeeds) {
      if (seedTrackIds.length >= cfg.maxSeeds) break
      // Cerca nella pool una traccia che matcha
      const match = candidatePool.find((t) =>
        t.artist.toLowerCase().includes(seed.artist.toLowerCase().split(" ")[0].toLowerCase()) ||
        t.title.toLowerCase().includes(seed.title.toLowerCase().split(" ")[0].toLowerCase())
      )
      if (match && !seenIds.has(match.id) && !seedTrackIds.includes(match.id)) {
        seedTrackIds.push(match.id)
      }
    }
  }

  // Complementa con seed dalla pool se necessario
  if (seedTrackIds.length < Math.min(3, cfg.maxSeeds)) {
    const poolSeeds = selectSeeds(candidatePool, cfg.maxSeeds - seedTrackIds.length, seenIds)
    seedTrackIds.push(...poolSeeds.filter((id) => !seedTrackIds.includes(id)))
  }

  seedTrackIds = seedTrackIds.slice(0, cfg.maxSeeds)

  // ── STEP 3: hop1 — recommendations(seed) ──────────────────────────────────
  const hop1Pool: Track[] = []
  const hop1Requests = Math.min(seedTrackIds.length, budget.remaining())

  const hop1Results = await Promise.allSettled(
    seedTrackIds.slice(0, hop1Requests).map((id) => {
      if (!budget.use()) return Promise.resolve([])
      return withTimeout(getRecommendations(id), cfg.requestTimeoutMs, [])
    })
  )

  for (const r of hop1Results) {
    if (r.status === "fulfilled") {
      hop1Pool.push(...r.value.slice(0, cfg.maxRecsPerSeed))
    }
  }

  const hop1Dedup = deduplicatePool(hop1Pool).filter((t) => !seenIds.has(t.id))
  candidatePool.push(...hop1Dedup)
  candidatePool = deduplicatePool(candidatePool)

  // ── STEP 4: hop2 — recommendations(topK hop1) — opzionale ───────────────
  let hop2Count = 0
  if (cfg.enableHop2 && hop1Dedup.length > 0 && budget.canMake(1)) {
    // Seleziona i migliori seed per hop2: quelli con artisti più vari
    const hop2Seeds = selectSeeds(hop1Dedup, cfg.hop2MaxSeeds, seenIds)
    const hop2Requests = Math.min(hop2Seeds.length, budget.remaining())

    const hop2Results = await Promise.allSettled(
      hop2Seeds.slice(0, hop2Requests).map((id) => {
        if (!budget.use()) return Promise.resolve([])
        return withTimeout(getRecommendations(id), cfg.requestTimeoutMs, [])
      })
    )

    for (const r of hop2Results) {
      if (r.status === "fulfilled") {
        const newTracks = r.value
          .slice(0, cfg.hop2MaxRecs)
          .filter((t) => !seenIds.has(t.id))
        candidatePool.push(...newTracks)
        hop2Count += newTracks.length
      }
    }

    candidatePool = deduplicatePool(candidatePool)
  }

  // ── STEP 5: Rerank finale con rarityScore + personalizzazione ────────────
  const tracksWithMeta: TrackWithMeta[] = candidatePool.map((t) => ({
    ...t,
    popularity: undefined, // Monochrome non espone popularity direttamente
  }))

  const ranked = rankTracks(tracksWithMeta, constraints, options.userProfile)

  // ── STEP 6: Diversità finale — garantisci varietà artisti ────────────────
  const finalTracks = ensureArtistDiversity(ranked, cfg.outputSize)

  return {
    tracks: finalTracks,
    meta: {
      requestsUsed: budget.totalUsed,
      seedsUsed: seedTrackIds.length,
      hop1TracksFound: hop1Dedup.length,
      hop2TracksFound: hop2Count,
      totalCandidates: candidatePool.length,
      finalCount: finalTracks.length,
    },
  }
}

// ─── Diversità Artisti ───────────────────────────────────────────────────────

/**
 * ensureArtistDiversity: seleziona le tracce dalla lista ranked
 * garantendo massimo 2 tracce per artista nelle prime N posizioni.
 */
function ensureArtistDiversity(ranked: RankedTrack[], outputSize: number): RankedTrack[] {
  const artistCount = new Map<string, number>()
  const result: RankedTrack[] = []
  const overflow: RankedTrack[] = []

  const MAX_PER_ARTIST = 2

  for (const track of ranked) {
    const key = track.artist.toLowerCase()
    const count = artistCount.get(key) ?? 0

    if (count < MAX_PER_ARTIST && result.length < outputSize) {
      artistCount.set(key, count + 1)
      result.push(track)
    } else {
      overflow.push(track)
    }
  }

  // Se non abbastanza tracce, riempi con overflow
  if (result.length < outputSize) {
    for (const track of overflow) {
      if (result.length >= outputSize) break
      result.push(track)
    }
  }

  return result
}

// ─── Utility: converti Track[] → TrackWithMeta[] ─────────────────────────────

export function toTracksWithMeta(tracks: Track[]): TrackWithMeta[] {
  return tracks.map((t) => ({ ...t, popularity: undefined, bpm: undefined, key: undefined }))
}

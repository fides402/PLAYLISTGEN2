/**
 * lib/ranker.ts — FUNZIONALITÀ 2: Ranking "Rarità"
 *
 * Punteggio composito rarityScore:
 *  - popularity (bassa = più rara)        peso: 0.35
 *  - penalità artisti ripetuti            peso: 0.15
 *  - penalità mainstream (pop > 70)       peso: 0.20
 *  - bonus diversità (anni/album/artista) peso: 0.15
 *  - coerenza con vincoli musicali        peso: 0.15
 *
 * Esporta:
 *  - rarityScore(track, constraints, artistCount) → number [0-1]
 *  - rankTracks(tracks, constraints, userProfile) → RankedTrack[]
 */

import type { Track } from "./types"
import type { MusicalConstraints } from "./planner"
import type { UserProfile } from "./userProfile"

// ─── Tipi ─────────────────────────────────────────────────────────────────────

export interface TrackWithMeta extends Track {
  /** Popolarità [0-100] come da Tidal/Monochrome, se disponibile */
  popularity?: number
  /** BPM stimato, se disponibile */
  bpm?: number
  /** Key musicale (es. "Am", "C#"), se disponibile */
  key?: string
}

export interface RankedTrack extends TrackWithMeta {
  rarityScore: number
  personalizedScore: number
  breakdown: {
    popularityScore: number
    artistPenalty: number
    mainstreamnessP: number
    diversityBonus: number
    constraintCoherence: number
    personalizationBoost: number
  }
}

// ─── Pesi documentati ────────────────────────────────────────────────────────
/**
 * PESI DEL RARITYCORE COMPOSITO
 *
 * W_POP  = 0.35  Popolarità (invertita): tracce con popularity bassa = score alto
 * W_ART  = 0.15  Penalità artisti ripetuti: riduce tracce dello stesso artista
 * W_MAIN = 0.20  Penalità mainstream: penalizza forte se popularity > 70
 * W_DIV  = 0.15  Bonus diversità: premia varietà di anni, album, artisti
 * W_CON  = 0.15  Coerenza vincoli: premia tracce che rispettano bpm/mood/anno
 */
const W_POP = 0.35
const W_ART = 0.15
const W_MAIN = 0.20
const W_DIV = 0.15
const W_CON = 0.15

// ─── Calcolo rarityScore per singola traccia ──────────────────────────────────

/**
 * rarityScore(track, constraints, artistCount) → number [0-1]
 *
 * @param track         La traccia da valutare
 * @param constraints   Vincoli musicali dal Planner
 * @param artistCount   Mappa artista → quante volte appare nella pool corrente
 * @param poolStats     Statistiche della pool (min/max anno) per normalizzare
 * @returns score [0-1] dove 1 = rara/originale, 0 = mainstream/ripetuta
 */
export function rarityScore(
  track: TrackWithMeta,
  constraints: MusicalConstraints,
  artistCount: Map<string, number>,
  poolStats: { minYear: number; maxYear: number; totalTracks: number }
): number {
  const pop = track.popularity ?? 30 // Default: moderatamente rara

  // 1. POPOLARITÀ (invertita e normalizzata)
  // pop 0-100: 0=sconosciuta(max rarity), 100=mainstream(min rarity)
  const popularityRaw = Math.max(0, Math.min(100, pop))
  const popularityScore = 1 - popularityRaw / 100

  // 2. PENALITÀ ARTISTI RIPETUTI
  // Ogni apparizione aggiuntiva dello stesso artista riduce il punteggio
  const count = artistCount.get(track.artist.toLowerCase()) ?? 1
  const artistPenalty = count <= 1 ? 0 : Math.min(0.6, (count - 1) * 0.2)

  // 3. PENALITÀ MAINSTREAM
  // Tracce molto popolari (>70) ricevono una penalità aggiuntiva forte
  let mainstreamP = 0
  if (popularityRaw > 70) {
    mainstreamP = ((popularityRaw - 70) / 30) * 0.8 // max 0.8 a pop=100
  }

  // 4. BONUS DIVERSITÀ
  // Premia tracce che portano diversità alla pool (anni rari, album raro)
  let diversityBonus = 0
  if (track.year !== undefined && poolStats.maxYear > poolStats.minYear) {
    // Anni ai margini della distribuzione sono più "rari"
    const yearRange = poolStats.maxYear - poolStats.minYear
    const yearCenter = (poolStats.maxYear + poolStats.minYear) / 2
    const distFromCenter = Math.abs(track.year - yearCenter)
    diversityBonus += Math.min(0.3, distFromCenter / yearRange)
  }
  // Bonus se l'album non è nullo/sconosciuto
  if (track.album && track.album.trim().length > 0 && track.album !== "Unknown Album") {
    diversityBonus += 0.1
  }
  diversityBonus = Math.min(0.5, diversityBonus)

  // 5. COERENZA CON VINCOLI
  let constraintScore = 0.5 // default neutro
  let constraintChecks = 0
  let constraintHits = 0

  // Anno
  if (track.year !== undefined) {
    constraintChecks++
    if (
      (constraints.yearMin === undefined || track.year >= constraints.yearMin) &&
      (constraints.yearMax === undefined || track.year <= constraints.yearMax)
    ) {
      constraintHits++
    }
  }

  // BPM
  if (track.bpm !== undefined && (constraints.bpmMin !== undefined || constraints.bpmMax !== undefined)) {
    constraintChecks++
    const inBpm =
      (constraints.bpmMin === undefined || track.bpm >= constraints.bpmMin) &&
      (constraints.bpmMax === undefined || track.bpm <= constraints.bpmMax)
    if (inBpm) constraintHits++
  }

  // Keyword match nel titolo/artista
  if (constraints.keywords && constraints.keywords.length > 0) {
    constraintChecks++
    const textToMatch = `${track.title} ${track.artist} ${track.album || ""}`.toLowerCase()
    const matched = constraints.keywords.filter((kw) => textToMatch.includes(kw.toLowerCase()))
    if (matched.length > 0) constraintHits += Math.min(1, matched.length / 3)
  }

  if (constraintChecks > 0) {
    constraintScore = constraintHits / constraintChecks
  }

  // ─── Score composito ───────────────────────────────────────────────────────
  const score =
    popularityScore * W_POP -
    artistPenalty * W_ART -
    mainstreamP * W_MAIN +
    diversityBonus * W_DIV +
    constraintScore * W_CON

  return Math.max(0, Math.min(1, score))
}

// ─── Pool statistics helper ──────────────────────────────────────────────────

function computePoolStats(tracks: TrackWithMeta[]) {
  const years = tracks.map((t) => t.year).filter((y): y is number => y !== undefined)
  return {
    minYear: years.length > 0 ? Math.min(...years) : 1950,
    maxYear: years.length > 0 ? Math.max(...years) : 2026,
    totalTracks: tracks.length,
  }
}

// ─── rankTracks ──────────────────────────────────────────────────────────────

/**
 * rankTracks(tracks, constraints, userProfile) → RankedTrack[]
 *
 * 1. Deduplica per trackId
 * 2. Costruisce mappa conteggio artisti
 * 3. Calcola rarityScore per ogni traccia
 * 4. Applica personalizationBoost da UserProfile
 * 5. Normalizza score a [0-1]
 * 6. Ordina per personalizedScore desc
 */
export function rankTracks(
  tracks: TrackWithMeta[],
  constraints: MusicalConstraints,
  userProfile?: UserProfile
): RankedTrack[] {
  // 1. Deduplicazione per trackId
  const seen = new Map<number, TrackWithMeta>()
  for (const t of tracks) {
    if (!seen.has(t.id)) seen.set(t.id, t)
  }
  const unique = Array.from(seen.values())

  // 2. Mappa conteggio artisti nella pool
  const artistCount = new Map<string, number>()
  for (const t of unique) {
    const key = t.artist.toLowerCase()
    artistCount.set(key, (artistCount.get(key) ?? 0) + 1)
  }

  // 3. Statistiche pool
  const poolStats = computePoolStats(unique)

  // 4. Calcola scores
  const scored = unique.map((track) => {
    const rScore = rarityScore(track, constraints, artistCount, poolStats)

    // Breakdown per debug/trasparenza
    const pop = track.popularity ?? 30
    const popularityRaw = Math.max(0, Math.min(100, pop))
    const count = artistCount.get(track.artist.toLowerCase()) ?? 1
    const breakdown = {
      popularityScore: 1 - popularityRaw / 100,
      artistPenalty: count <= 1 ? 0 : Math.min(0.6, (count - 1) * 0.2),
      mainstreamnessP: popularityRaw > 70 ? ((popularityRaw - 70) / 30) * 0.8 : 0,
      diversityBonus: 0, // calcolato internamente
      constraintCoherence: 0, // calcolato internamente
      personalizationBoost: 0,
    }

    // 5. PersonalizationBoost
    let personalizationBoost = 0
    if (userProfile) {
      const artistKey = track.artist.toLowerCase()
      const affinity = userProfile.artistAffinity.get(artistKey) ?? 0

      // Boost da affinità artista: max +0.15 (preferito) o -0.10 (detestato)
      personalizationBoost += Math.max(-0.10, Math.min(0.15, affinity * 0.05))

      // Boost da rarityPreference: se l'utente ama brani rari, premiamo score alto
      if (userProfile.rarityPreference > 0.6) {
        personalizationBoost += rScore * 0.10 // max +0.10
      } else if (userProfile.rarityPreference < 0.4) {
        personalizationBoost -= rScore * 0.05 // lieve penalità
      }

      // BPM compatibility
      if (track.bpm !== undefined && userProfile.preferredBpmRange) {
        const [prefMin, prefMax] = userProfile.preferredBpmRange
        const inBpm = track.bpm >= prefMin && track.bpm <= prefMax
        if (inBpm) personalizationBoost += 0.05
      }

      // Esplorazione: NON aggiungiamo boost massivi per artisti MAI visti
      // per mantenere la scoperta. Il boost massimo è cappato a 0.20
      personalizationBoost = Math.max(-0.15, Math.min(0.20, personalizationBoost))
      breakdown.personalizationBoost = personalizationBoost
    }

    const personalizedScore = Math.max(0, Math.min(1, rScore + personalizationBoost))

    return {
      ...track,
      rarityScore: rScore,
      personalizedScore,
      breakdown,
    } as RankedTrack
  })

  // 6. Normalizzazione scores a [0-1] (min-max)
  const maxScore = Math.max(...scored.map((t) => t.personalizedScore), 0.001)
  const minScore = Math.min(...scored.map((t) => t.personalizedScore), 0)
  const range = maxScore - minScore || 1

  const normalized = scored.map((t) => ({
    ...t,
    personalizedScore: (t.personalizedScore - minScore) / range,
    rarityScore: (t.rarityScore - Math.min(...scored.map((x) => x.rarityScore), 0)) /
      (Math.max(...scored.map((x) => x.rarityScore), 0.001) - Math.min(...scored.map((x) => x.rarityScore), 0) || 1),
  }))

  // 7. Ordina per personalizedScore decrescente, con shuffle leggero per top tracce simili
  return normalized.sort((a, b) => {
    // Se gli score sono molto vicini (<0.02), shuffle leggero
    const diff = b.personalizedScore - a.personalizedScore
    if (Math.abs(diff) < 0.02) return Math.random() - 0.5
    return diff
  })
}

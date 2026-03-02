/**
 * lib/userProfile.ts — FUNZIONALITÀ 4: Personalizzazione
 *
 * Gestisce il feedback like/dislike e deriva un UserProfile leggero:
 *  - artistAffinity: Map<artist, score> (+1 like, -1 dislike)
 *  - preferredBpmRange: [min, max] stimato da liked tracks
 *  - rarityPreference: 0-1 (media rarityScore delle tracce piaciute)
 *
 * Il profilo viene usato da rankTracks() per aggiungere personalizationBoost
 * mantenendo l'esplorazione con diversità.
 *
 * Storage: localStorage-compatible (serializzabile JSON)
 */

import type { TrackWithMeta } from "./ranker"

// ─── Tipi ─────────────────────────────────────────────────────────────────────

export interface FeedbackEntry {
  trackId: number
  liked: boolean
  timestamp: number
  /** BPM della traccia al momento del feedback, se disponibile */
  bpm?: number
  /** rarityScore calcolato per questa traccia */
  rarityScore?: number
  artist: string
  year?: number
}

export interface UserProfile {
  userId: string
  /** Map artista (lowercase) → score affinità (-10 .. +10) */
  artistAffinity: Map<string, number>
  /** Range BPM preferito stimato dai like: [min, max] */
  preferredBpmRange: [number, number] | null
  /**
   * Preferenza per rarità: 0 = ama i mainstream, 1 = ama i rarissimi
   * Stimato come media di rarityScore delle tracce piaciute
   */
  rarityPreference: number
  /** Numero totale di like e dislike */
  stats: {
    totalLikes: number
    totalDislikes: number
    avgRarityLiked: number
    avgRarityDisliked: number
  }
}

export interface UserProfileStore {
  feedback: FeedbackEntry[]
  lastUpdated: number
}

// ─── Costanti ────────────────────────────────────────────────────────────────

const AFFINITY_LIKE_DELTA = 1.0       // incremento su like
const AFFINITY_DISLIKE_DELTA = -1.5   // decremento su dislike (più forte)
const AFFINITY_MAX = 10
const AFFINITY_MIN = -10
const BPM_FALLBACK_RANGE: [number, number] = [70, 130]
const DEFAULT_RARITY_PREFERENCE = 0.5

// ─── Aggiornamento Feedback ───────────────────────────────────────────────────

/**
 * addFeedback(store, entry) → aggiornato UserProfileStore
 * Non mutates l'input; ritorna un nuovo store.
 */
export function addFeedback(
  store: UserProfileStore,
  entry: FeedbackEntry
): UserProfileStore {
  // Rimuovi eventuale feedback precedente per la stessa traccia
  const filtered = store.feedback.filter((f) => f.trackId !== entry.trackId)
  return {
    feedback: [...filtered, entry],
    lastUpdated: Date.now(),
  }
}

/**
 * removeFeedback(store, trackId) → aggiornato UserProfileStore
 */
export function removeFeedback(
  store: UserProfileStore,
  trackId: number
): UserProfileStore {
  return {
    feedback: store.feedback.filter((f) => f.trackId !== trackId),
    lastUpdated: Date.now(),
  }
}

// ─── Derivazione UserProfile ──────────────────────────────────────────────────

/**
 * deriveUserProfile(userId, store) → UserProfile
 *
 * Analizza il feedback accumulato e deriva il profilo leggero.
 * Da chiamare ogni volta che si vuole aggiornare il profilo.
 */
export function deriveUserProfile(
  userId: string,
  store: UserProfileStore
): UserProfile {
  const likes = store.feedback.filter((f) => f.liked)
  const dislikes = store.feedback.filter((f) => !f.liked)

  // 1. Artist Affinity
  const artistAffinity = new Map<string, number>()

  for (const entry of store.feedback) {
    const key = entry.artist.toLowerCase().trim()
    const current = artistAffinity.get(key) ?? 0
    const delta = entry.liked ? AFFINITY_LIKE_DELTA : AFFINITY_DISLIKE_DELTA
    const next = Math.max(AFFINITY_MIN, Math.min(AFFINITY_MAX, current + delta))
    artistAffinity.set(key, next)
  }

  // 2. Preferred BPM Range
  let preferredBpmRange: [number, number] | null = null
  const likedBpms = likes.map((f) => f.bpm).filter((b): b is number => b !== undefined)

  if (likedBpms.length >= 2) {
    const mean = likedBpms.reduce((a, b) => a + b, 0) / likedBpms.length
    const variance =
      likedBpms.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / likedBpms.length
    const std = Math.sqrt(variance)

    // Range = [mean - 1.5*std, mean + 1.5*std], clampato a valori sensati
    const bpmMin = Math.max(40, Math.round(mean - 1.5 * std))
    const bpmMax = Math.min(220, Math.round(mean + 1.5 * std))
    preferredBpmRange = [bpmMin, bpmMax]
  } else if (likedBpms.length === 1) {
    const bpm = likedBpms[0]
    preferredBpmRange = [Math.max(40, bpm - 20), Math.min(220, bpm + 20)]
  }

  // 3. Rarity Preference
  const likedRarities = likes.map((f) => f.rarityScore).filter((r): r is number => r !== undefined)
  const dislikedRarities = dislikes.map((f) => f.rarityScore).filter((r): r is number => r !== undefined)

  const avgRarityLiked =
    likedRarities.length > 0
      ? likedRarities.reduce((a, b) => a + b, 0) / likedRarities.length
      : DEFAULT_RARITY_PREFERENCE

  const avgRarityDisliked =
    dislikedRarities.length > 0
      ? dislikedRarities.reduce((a, b) => a + b, 0) / dislikedRarities.length
      : DEFAULT_RARITY_PREFERENCE

  // rarityPreference = media pesata: liked conta doppio rispetto a disliked
  let rarityPreference = DEFAULT_RARITY_PREFERENCE
  if (likedRarities.length > 0 || dislikedRarities.length > 0) {
    const weightedLiked = avgRarityLiked * 2 * likedRarities.length
    const weightedDisliked = (1 - avgRarityDisliked) * dislikedRarities.length
    const totalWeight = 2 * likedRarities.length + dislikedRarities.length
    rarityPreference = totalWeight > 0 ? (weightedLiked + weightedDisliked) / totalWeight : DEFAULT_RARITY_PREFERENCE
    rarityPreference = Math.max(0, Math.min(1, rarityPreference))
  }

  return {
    userId,
    artistAffinity,
    preferredBpmRange,
    rarityPreference,
    stats: {
      totalLikes: likes.length,
      totalDislikes: dislikes.length,
      avgRarityLiked,
      avgRarityDisliked,
    },
  }
}

// ─── Serializzazione (per localStorage / persistenza) ────────────────────────

export interface SerializedUserProfile {
  userId: string
  artistAffinity: Array<[string, number]>
  preferredBpmRange: [number, number] | null
  rarityPreference: number
  stats: UserProfile["stats"]
}

export function serializeProfile(profile: UserProfile): SerializedUserProfile {
  return {
    ...profile,
    artistAffinity: Array.from(profile.artistAffinity.entries()),
  }
}

export function deserializeProfile(data: SerializedUserProfile): UserProfile {
  return {
    ...data,
    artistAffinity: new Map(data.artistAffinity),
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createEmptyStore(): UserProfileStore {
  return { feedback: [], lastUpdated: Date.now() }
}

export function createEmptyProfile(userId: string): UserProfile {
  return {
    userId,
    artistAffinity: new Map(),
    preferredBpmRange: null,
    rarityPreference: DEFAULT_RARITY_PREFERENCE,
    stats: { totalLikes: 0, totalDislikes: 0, avgRarityLiked: 0, avgRarityDisliked: 0 },
  }
}

// ─── Helper: crea FeedbackEntry da TrackWithMeta ──────────────────────────────

export function makeFeedbackEntry(
  track: TrackWithMeta,
  liked: boolean,
  rarityScore?: number
): FeedbackEntry {
  return {
    trackId: track.id,
    liked,
    timestamp: Date.now(),
    bpm: track.bpm,
    rarityScore,
    artist: track.artist,
    year: track.year,
  }
}

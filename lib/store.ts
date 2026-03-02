"use client"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Track, Mood } from "./types"
import {
  addFeedback,
  removeFeedback,
  deriveUserProfile,
  serializeProfile,
  deserializeProfile,
  makeFeedbackEntry,
  createEmptyStore,
  type UserProfileStore,
  type SerializedUserProfile,
  type FeedbackEntry,
} from "./userProfile"

interface User {
  id: string
  email: string
}

interface Store {
  // Auth (optional — works without Supabase)
  user: User | null
  setUser: (user: User | null) => void

  // Onboarding
  hasCompletedOnboarding: boolean
  setHasCompletedOnboarding: (v: boolean) => void

  // Genre preferences
  excludedGenres: string[]
  setExcludedGenres: (genres: string[]) => void
  toggleGenre: (genre: string) => void

  // Liked tracks (legacy — manteniamo per retrocompatibilità)
  likedTrackIds: number[]
  likedTracks: Track[]
  addLike: (track: Track, rarityScore?: number) => void
  removeLike: (id: number) => void
  isLiked: (id: number) => boolean

  // Disliked tracks
  dislikedTrackIds: number[]
  addDislike: (track: Track, rarityScore?: number) => void
  removeDislike: (id: number) => void
  isDisliked: (id: number) => boolean

  // ─── F4: Feedback & UserProfile ──────────────────────────────────────
  feedbackStore: UserProfileStore
  /** Profilo serializzato (senza Map, persiste in localStorage) */
  serializedProfile: SerializedUserProfile | null
  /** Aggiunge like/dislike al feedback store e ricalcola il profilo */
  recordFeedback: (track: Track, liked: boolean, rarityScore?: number) => void
  /** Rimuove il feedback per una traccia */
  clearFeedback: (trackId: number) => void
  /** Resetta l'intero profilo utente */
  resetProfile: () => void

  // Player
  currentMood: Mood | null
  setCurrentMood: (mood: Mood) => void
  playlist: Track[]
  setPlaylist: (tracks: Track[]) => void
  addToPlaylist: (tracks: Track[]) => void

  // Tracks the user has already heard — used to avoid repeats
  playedTrackIds: number[]
  currentIndex: number
  setCurrentIndex: (i: number) => void
  nextTrack: () => void
  prevTrack: () => void
  isPlaying: boolean
  setIsPlaying: (v: boolean) => void
  volume: number
  setVolume: (v: number) => void
  streamQuality: string
  setStreamQuality: (q: string) => void
  repeatMode: "none" | "one" | "all"
  setRepeatMode: (m: "none" | "one" | "all") => void
  cycleRepeat: () => void

  // Last free-text search query (used by regenerate)
  lastSearchQuery: string
  setLastSearchQuery: (q: string) => void

  // Ephemeral playback state (not persisted — managed by AudioPlayer)
  playbackTime: number
  playbackDuration: number
  isBuffering: boolean
  playbackError: string | null
  setPlaybackTime: (t: number) => void
  setPlaybackDuration: (d: number) => void
  setIsBuffering: (v: boolean) => void
  setPlaybackError: (e: string | null) => void
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      user: null,
      setUser: (user) => set({ user }),

      hasCompletedOnboarding: false,
      setHasCompletedOnboarding: (v) => set({ hasCompletedOnboarding: v }),

      excludedGenres: [],
      setExcludedGenres: (genres) => set({ excludedGenres: genres }),
      toggleGenre: (genre) => {
        const excluded = get().excludedGenres
        if (excluded.includes(genre)) {
          set({ excludedGenres: excluded.filter((g) => g !== genre) })
        } else {
          set({ excludedGenres: [...excluded, genre] })
        }
      },

      likedTrackIds: [],
      likedTracks: [],
      addLike: (track, rarityScore) => {
        const { likedTrackIds, likedTracks } = get()
        if (!likedTrackIds.includes(track.id)) {
          set({
            likedTrackIds: [...likedTrackIds, track.id],
            likedTracks: [...likedTracks, track],
          })
        }
        // Registra nel feedback store
        get().recordFeedback(track, true, rarityScore)
      },
      removeLike: (id) => {
        set({
          likedTrackIds: get().likedTrackIds.filter((x) => x !== id),
          likedTracks: get().likedTracks.filter((t) => t.id !== id),
        })
        get().clearFeedback(id)
      },
      isLiked: (id) => get().likedTrackIds.includes(id),

      dislikedTrackIds: [],
      addDislike: (track, rarityScore) => {
        const { dislikedTrackIds } = get()
        if (!dislikedTrackIds.includes(track.id)) {
          set({ dislikedTrackIds: [...dislikedTrackIds, track.id] })
        }
        // Registra nel feedback store
        get().recordFeedback(track, false, rarityScore)
      },
      removeDislike: (id) => {
        set({ dislikedTrackIds: get().dislikedTrackIds.filter((x) => x !== id) })
        get().clearFeedback(id)
      },
      isDisliked: (id) => get().dislikedTrackIds.includes(id),

      // ─── F4: Feedback & UserProfile ────────────────────────────────────
      feedbackStore: createEmptyStore(),
      serializedProfile: null,

      recordFeedback: (track, liked, rarityScore) => {
        const userId = get().user?.id || "anonymous"
        const entry = makeFeedbackEntry(
          { ...track, popularity: undefined, bpm: undefined },
          liked,
          rarityScore
        )
        const updatedStore = addFeedback(get().feedbackStore, entry)
        const profile = deriveUserProfile(userId, updatedStore)
        set({
          feedbackStore: updatedStore,
          serializedProfile: serializeProfile(profile),
        })
      },

      clearFeedback: (trackId) => {
        const userId = get().user?.id || "anonymous"
        const updatedStore = removeFeedback(get().feedbackStore, trackId)
        const profile = deriveUserProfile(userId, updatedStore)
        set({
          feedbackStore: updatedStore,
          serializedProfile: serializeProfile(profile),
        })
      },

      resetProfile: () => {
        set({
          feedbackStore: createEmptyStore(),
          serializedProfile: null,
          likedTrackIds: [],
          likedTracks: [],
          dislikedTrackIds: [],
        })
      },

      currentMood: null,
      setCurrentMood: (mood) => set({ currentMood: mood }),
      playlist: [],
      setPlaylist: (tracks) => {
        // Track IDs as "already heard" so future playlists skip them
        const { playedTrackIds } = get()
        const newIds = tracks.map((t) => t.id)
        const combined = [...new Set([...playedTrackIds, ...newIds])]
        // Keep only the last 300 to avoid unbounded growth
        const limited = combined.slice(-300)
        set({ playlist: tracks, currentIndex: 0, playedTrackIds: limited })
      },
      addToPlaylist: (tracks) => {
        const current = get().playlist
        const existing = new Set(current.map((t) => t.id))
        const fresh = tracks.filter((t) => !existing.has(t.id))
        set({ playlist: [...current, ...fresh] })
      },
      playedTrackIds: [],
      currentIndex: 0,
      setCurrentIndex: (i) => set({ currentIndex: i }),
      nextTrack: () => {
        const { currentIndex, playlist, repeatMode } = get()
        if (repeatMode === "all" && currentIndex >= playlist.length - 1) {
          set({ currentIndex: 0 })
        } else if (currentIndex < playlist.length - 1) {
          set({ currentIndex: currentIndex + 1 })
        }
      },
      prevTrack: () => {
        const { currentIndex } = get()
        if (currentIndex > 0) set({ currentIndex: currentIndex - 1 })
      },
      isPlaying: false,
      setIsPlaying: (v) => set({ isPlaying: v }),
      volume: 0.8,
      setVolume: (v) => set({ volume: v }),
      streamQuality: "HIGH",
      setStreamQuality: (q) => set({ streamQuality: q }),
      repeatMode: "none",
      setRepeatMode: (m) => set({ repeatMode: m }),
      cycleRepeat: () => {
        const order: Array<"none" | "all" | "one"> = ["none", "all", "one"]
        const curr = get().repeatMode
        set({ repeatMode: order[(order.indexOf(curr) + 1) % order.length] })
      },

      lastSearchQuery: "",
      setLastSearchQuery: (q) => set({ lastSearchQuery: q }),

      playbackTime: 0,
      playbackDuration: 0,
      isBuffering: false,
      playbackError: null,
      setPlaybackTime: (t) => set({ playbackTime: t }),
      setPlaybackDuration: (d) => set({ playbackDuration: d }),
      setIsBuffering: (v) => set({ isBuffering: v }),
      setPlaybackError: (e) => set({ playbackError: e }),
    }),
    {
      name: "hifi-mood-store",
      partialize: (s) => ({
        user: s.user,
        excludedGenres: s.excludedGenres,
        likedTrackIds: s.likedTrackIds,
        likedTracks: s.likedTracks,
        dislikedTrackIds: s.dislikedTrackIds,
        hasCompletedOnboarding: s.hasCompletedOnboarding,
        currentMood: s.currentMood,
        volume: s.volume,
        streamQuality: s.streamQuality,
        playedTrackIds: s.playedTrackIds,
        repeatMode: s.repeatMode,
        lastSearchQuery: s.lastSearchQuery,
        // F4: Persisti il feedback store e il profilo serializzato
        feedbackStore: s.feedbackStore,
        serializedProfile: s.serializedProfile,
      }),
    }
  )
)

"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { useStore } from "@/lib/store"
import { AudioPlayer } from "@/components/AudioPlayer"
import { TrackCard } from "@/components/TrackCard"
import { MOODS } from "@/lib/types"
import type { Track, MoodConfig } from "@/lib/types"

// ─── Shared track row (recommendations + for-you) ────────────────────────────
function TrackRow({
  track,
  onAdd,
  onPlay,
}: {
  track: Track
  onAdd?: () => void
  onPlay?: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors group cursor-default">
      {track.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={track.coverUrl}
          alt=""
          className="w-9 h-9 rounded-md object-cover shrink-0 ring-1 ring-white/10"
        />
      ) : (
        <div className="w-9 h-9 rounded-md bg-white/5 flex items-center justify-center text-sm shrink-0">
          🎵
        </div>
      )}
      <div className="min-w-0 flex-1" onClick={onPlay} style={onPlay ? { cursor: "pointer" } : {}}>
        <div className="text-xs font-medium text-gray-200 truncate">{track.title}</div>
        <div className="text-xs text-gray-500 truncate">{track.artist}</div>
      </div>
      {onAdd && (
        <button
          onClick={onAdd}
          title="Add to queue"
          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-gray-600 hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all text-sm font-bold"
        >
          +
        </button>
      )}
    </div>
  )
}

// ─── For You panel ────────────────────────────────────────────────────────────
function ForYouPanel({ onSelectTrack }: { onSelectTrack: (i: number) => void }) {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)
  const likedTrackIds = useStore((s) => s.likedTrackIds)

  const fetch_ = useCallback(async () => {
    const { likedTrackIds, playedTrackIds, playlist } = useStore.getState()
    if (likedTrackIds.length === 0) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("liked", likedTrackIds.slice(-30).join(","))
      const seen = [...new Set([...playedTrackIds, ...playlist.map((t) => t.id)])]
      if (seen.length > 0) params.set("seen", seen.slice(-300).join(","))
      const res = await fetch(`/api/for-you?${params}`)
      const data = await res.json()
      if (Array.isArray(data)) setTracks(data)
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [])

  // Auto-fetch once on mount
  useEffect(() => { fetch_() }, [fetch_])

  const handlePlayAll = useCallback(() => {
    if (tracks.length === 0) return
    useStore.getState().setPlaylist(tracks)
    useStore.getState().setIsPlaying(true)
    onSelectTrack(0)
  }, [tracks, onSelectTrack])

  const handleAddToQueue = useCallback((track: Track) => {
    useStore.getState().addToPlaylist([track])
    setTracks((prev) => prev.filter((t) => t.id !== track.id))
  }, [])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/5 shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
            For You
          </h2>
          <button
            onClick={fetch_}
            disabled={loading}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors disabled:opacity-40"
          >
            {loading ? (
              <span className="inline-block w-3 h-3 rounded-full border-2 border-gray-500 border-t-transparent animate-spin" />
            ) : "↻ Refresh"}
          </button>
        </div>
        <p className="text-xs text-gray-600">
          Based on your likes &amp; listening history
        </p>
        {tracks.length > 0 && (
          <button
            onClick={handlePlayAll}
            className="w-full py-1.5 rounded-lg bg-white text-black text-xs font-semibold hover:bg-white/90 active:scale-[0.98] transition-all"
          >
            ▶ Play all ({tracks.length})
          </button>
        )}
      </div>

      {/* Track list */}
      <div className="flex-1 overflow-y-auto py-1">
        {likedTrackIds.length === 0 ? (
          <p className="text-xs text-gray-600 text-center mt-8 px-4">
            Like some tracks first and we&apos;ll find music you&apos;ll love.
          </p>
        ) : loading && tracks.length === 0 ? (
          <div className="flex justify-center mt-8">
            <span className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
          </div>
        ) : tracks.length === 0 ? (
          <p className="text-xs text-gray-600 text-center mt-8 px-4">
            No new tracks found. Try refreshing.
          </p>
        ) : (
          tracks.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              onAdd={() => handleAddToQueue(track)}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ─── Queue panel ──────────────────────────────────────────────────────────────
interface QueuePanelProps {
  playlist: Track[]
  currentIndex: number
  moodConfig: MoodConfig | undefined
  searchQuery: string
  setSearchQuery: (v: string) => void
  isSearching: boolean
  isRegenerating: boolean
  handleSearch: (e: React.FormEvent) => void
  handleRegenerate: () => void
  onSelectTrack: (i: number) => void
  onChangeMood: () => void
}

function QueuePanel({
  playlist,
  currentIndex,
  moodConfig,
  searchQuery,
  setSearchQuery,
  isSearching,
  isRegenerating,
  handleSearch,
  handleRegenerate,
  onSelectTrack,
  onChangeMood,
}: QueuePanelProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-white/5 space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
            Queue
          </h2>
          <button
            onClick={onChangeMood}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            New search
          </button>
        </div>

        {moodConfig && (
          <p className="text-xs text-gray-600">
            {moodConfig.emoji} {moodConfig.label} · {playlist.length} tracks
          </p>
        )}

        {/* AI Search */}
        <form onSubmit={handleSearch} className="flex gap-1.5">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search… (e.g. 70s Italian jazz)"
            className="flex-1 min-w-0 text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-white/40 transition-colors"
          />
          <button
            type="submit"
            disabled={isSearching || !searchQuery.trim()}
            className="shrink-0 px-2.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors border border-white/10"
          >
            {isSearching ? (
              <span className="block w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : "↵"}
          </button>
        </form>

        {/* Regenerate */}
        <button
          onClick={handleRegenerate}
          disabled={isRegenerating}
          className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg border border-white/8 text-xs text-gray-500 hover:text-gray-300 hover:border-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {isRegenerating ? (
            <>
              <span className="block w-3 h-3 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
              Generating…
            </>
          ) : <>⟳ New playlist</>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {playlist.map((track, i) => (
          <TrackCard
            key={`${track.id}-${i}`}
            track={track}
            isActive={i === currentIndex}
            onClick={() => onSelectTrack(i)}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PlayerPage() {
  const router = useRouter()
  const {
    playlist,
    currentIndex,
    currentMood,
    excludedGenres,
    hasCompletedOnboarding,
    lastSearchQuery,
    setCurrentIndex,
    setPlaylist,
    setCurrentMood,
    setIsPlaying,
    setLastSearchQuery,
  } = useStore()

  const [searchQuery, setSearchQuery] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [mobileTab, setMobileTab] = useState<"playing" | "queue" | "foryou">("playing")
  const [sidebarTab, setSidebarTab] = useState<"queue" | "foryou">("queue")
  const [recommendations, setRecommendations] = useState<Track[]>([])
  const [isLoadingRecs, setIsLoadingRecs] = useState(false)
  const lastRecId = useRef<number | null>(null)

  const currentTrack = playlist[currentIndex]
  const moodConfig = MOODS.find((m) => m.id === currentMood)

  useEffect(() => {
    if (!hasCompletedOnboarding) {
      router.replace("/onboarding")
      return
    }
    if (!currentMood || playlist.length === 0) {
      router.replace("/mood")
    }
  }, [hasCompletedOnboarding, currentMood, playlist.length, router])

  // Auto-fetch similar tracks when current track changes
  useEffect(() => {
    if (!currentTrack || currentTrack.id === lastRecId.current) return
    lastRecId.current = currentTrack.id
    setIsLoadingRecs(true)
    setRecommendations([])
    const inPlaylist = new Set(useStore.getState().playlist.map((t) => t.id))
    fetch(`/api/recommend?id=${currentTrack.id}`)
      .then((r) => r.json())
      .then((data: Track[]) => {
        if (Array.isArray(data)) {
          setRecommendations(data.filter((t) => !inPlaylist.has(t.id)).slice(0, 8))
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingRecs(false))
  }, [currentTrack?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const q = searchQuery.trim()
      if (!q) return
      setIsSearching(true)
      try {
        const played = useStore.getState().playedTrackIds.slice(-150)
        const params = new URLSearchParams({ q })
        if (played.length > 0) params.set("seen", played.join(","))
        const likedArtists = [
          ...new Set(useStore.getState().likedTracks.map((t) => t.artist)),
        ].slice(0, 15)
        if (likedArtists.length > 0) params.set("liked", likedArtists.join(","))
        const res = await fetch(`/api/ai-search?${params.toString()}`)
        const tracks = await res.json()
        if (Array.isArray(tracks) && tracks.length > 0) {
          setLastSearchQuery(q)
          setPlaylist(tracks)
          setCurrentMood("chill")
          setIsPlaying(true)
          setMobileTab("playing")
        }
      } catch { /* silent */ } finally {
        setIsSearching(false)
      }
    },
    [searchQuery, setPlaylist, setCurrentMood, setIsPlaying, setLastSearchQuery]
  )

  // Regenerate: reuse the last search query if available, else fall back to mood
  const handleRegenerate = useCallback(async () => {
    setIsRegenerating(true)
    try {
      const played = useStore.getState().playedTrackIds.slice(-150)
      const likedArtists = [
        ...new Set(useStore.getState().likedTracks.map((t) => t.artist)),
      ].slice(0, 15)

      let tracks: Track[] = []

      if (lastSearchQuery) {
        const params = new URLSearchParams({ q: lastSearchQuery })
        if (excludedGenres.length > 0) params.set("excluded", excludedGenres.join(","))
        if (played.length > 0) params.set("seen", played.join(","))
        if (likedArtists.length > 0) params.set("liked", likedArtists.join(","))
        const res = await fetch(`/api/ai-search?${params.toString()}`)
        tracks = await res.json()
      } else if (currentMood) {
        const params = new URLSearchParams({ mood: currentMood })
        if (excludedGenres.length > 0) params.set("excluded", excludedGenres.join(","))
        if (played.length > 0) params.set("seen", played.join(","))
        if (likedArtists.length > 0) params.set("liked", likedArtists.join(","))
        const res = await fetch(`/api/playlist?${params.toString()}`)
        tracks = await res.json()
      }

      if (Array.isArray(tracks) && tracks.length > 0) {
        setPlaylist(tracks)
        setIsPlaying(true)
      }
    } catch { /* silent */ } finally {
      setIsRegenerating(false)
    }
  }, [currentMood, excludedGenres, lastSearchQuery, setPlaylist, setIsPlaying])

  const handleAddRec = useCallback((track: Track) => {
    useStore.getState().addToPlaylist([track])
    setRecommendations((prev) => prev.filter((t) => t.id !== track.id))
  }, [])

  const handleSelectTrack = useCallback(
    (i: number) => {
      setCurrentIndex(i)
      setIsPlaying(true)
      setMobileTab("playing")
    },
    [setCurrentIndex, setIsPlaying]
  )

  const queuePanelProps: QueuePanelProps = {
    playlist,
    currentIndex,
    moodConfig,
    searchQuery,
    setSearchQuery,
    isSearching,
    isRegenerating,
    handleSearch,
    handleRegenerate,
    onSelectTrack: handleSelectTrack,
    onChangeMood: () => router.push("/mood"),
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ─── Desktop sidebar ─── */}
      <aside className="hidden md:flex w-72 flex-col border-r border-white/5 shrink-0 overflow-hidden">
        {/* Sidebar tab bar */}
        <div className="flex shrink-0 border-b border-white/5">
          <button
            onClick={() => setSidebarTab("queue")}
            className={[
              "flex-1 py-2.5 text-xs font-medium transition-colors",
              sidebarTab === "queue" ? "text-white border-b-2 border-white/60" : "text-gray-500 hover:text-gray-300",
            ].join(" ")}
          >
            Queue
          </button>
          <button
            onClick={() => setSidebarTab("foryou")}
            className={[
              "flex-1 py-2.5 text-xs font-medium transition-colors",
              sidebarTab === "foryou" ? "text-white border-b-2 border-white/60" : "text-gray-500 hover:text-gray-300",
            ].join(" ")}
          >
            For You
          </button>
        </div>

        {sidebarTab === "queue" ? (
          <QueuePanel {...queuePanelProps} />
        ) : (
          <ForYouPanel onSelectTrack={handleSelectTrack} />
        )}
      </aside>

      {/* ─── Main ─── */}
      <main className="flex-1 flex flex-col overflow-hidden bg-black">
        {/* Mobile tabs */}
        <div className="md:hidden flex shrink-0 border-b border-white/5 bg-black/20">
          <button
            onClick={() => setMobileTab("playing")}
            className={[
              "flex-1 py-3 text-sm font-medium transition-colors",
              mobileTab === "playing" ? "text-white border-b-2 border-white/70" : "text-gray-500",
            ].join(" ")}
          >
            Now Playing
          </button>
          <button
            onClick={() => setMobileTab("queue")}
            className={[
              "flex-1 py-3 text-sm font-medium transition-colors",
              mobileTab === "queue" ? "text-white border-b-2 border-white/70" : "text-gray-500",
            ].join(" ")}
          >
            Queue
            {playlist.length > 0 && (
              <span className="ml-1.5 text-xs text-gray-500">{playlist.length}</span>
            )}
          </button>
          <button
            onClick={() => setMobileTab("foryou")}
            className={[
              "flex-1 py-3 text-sm font-medium transition-colors",
              mobileTab === "foryou" ? "text-white border-b-2 border-white/70" : "text-gray-500",
            ].join(" ")}
          >
            For You
          </button>
        </div>

        {/* Mobile: queue tab */}
        {mobileTab === "queue" && (
          <div className="md:hidden flex-1 overflow-hidden flex flex-col">
            <QueuePanel {...queuePanelProps} />
          </div>
        )}

        {/* Mobile: for you tab */}
        {mobileTab === "foryou" && (
          <div className="md:hidden flex-1 overflow-hidden flex flex-col">
            <ForYouPanel onSelectTrack={handleSelectTrack} />
          </div>
        )}

        {/* Now Playing content */}
        <div
          className={[
            "flex-1 overflow-y-auto pb-44 md:pb-28",
            mobileTab === "queue" || mobileTab === "foryou" ? "hidden md:block" : "",
          ].join(" ")}
        >
          {currentTrack ? (
            <div className="max-w-md mx-auto px-6 pt-10 pb-4 animate-fadeup">
              {/* Album art */}
              <div className="flex justify-center mb-6">
                {currentTrack.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentTrack.coverUrl}
                    alt={currentTrack.album || currentTrack.title}
                    className="w-56 h-56 sm:w-64 sm:h-64 rounded-2xl object-cover ring-1 ring-white/10"
                    style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}
                  />
                ) : (
                  <div className="w-56 h-56 sm:w-64 sm:h-64 rounded-2xl bg-white/5 flex items-center justify-center text-7xl ring-1 ring-white/10">
                    🎵
                  </div>
                )}
              </div>

              {/* Track info */}
              <div className="text-center mb-8">
                <h1 className="text-xl sm:text-2xl font-bold text-white mb-1 leading-tight">
                  {currentTrack.title}
                </h1>
                <p className="text-gray-300 text-sm">{currentTrack.artist}</p>
                {currentTrack.album && (
                  <p className="text-gray-500 text-xs mt-1">{currentTrack.album}</p>
                )}
              </div>

              {/* Similar tracks */}
              {(isLoadingRecs || recommendations.length > 0) && (
                <div>
                  <h2 className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-2 px-1">
                    Similar tracks
                  </h2>
                  {isLoadingRecs ? (
                    <div className="flex justify-center py-8">
                      <span className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
                    </div>
                  ) : (
                    <div className="rounded-xl overflow-hidden bg-black/20 border border-white/5">
                      {recommendations.map((rec) => (
                        <TrackRow
                          key={rec.id}
                          track={rec}
                          onAdd={() => handleAddRec(rec)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <div className="text-5xl mb-4">🎵</div>
              <p>Loading playlist…</p>
            </div>
          )}
        </div>
      </main>

      {/* Player bar */}
      <AudioPlayer />
    </div>
  )
}

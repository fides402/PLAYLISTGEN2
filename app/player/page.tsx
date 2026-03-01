"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { useStore } from "@/lib/store"
import { AudioPlayer, seekRef } from "@/components/AudioPlayer"
import { TrackCard } from "@/components/TrackCard"
import { MOODS } from "@/lib/types"
import type { Track, MoodConfig } from "@/lib/types"

function fmt(secs: number) {
  if (!isFinite(secs) || secs < 0) return "0:00"
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

// ─── Shared track row ─────────────────────────────────────────────────────────
function TrackRow({ track, onAdd }: { track: Track; onAdd?: () => void }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors group cursor-default">
      {track.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={track.coverUrl} alt="" className="w-9 h-9 rounded-md object-cover shrink-0 ring-1 ring-white/10" />
      ) : (
        <div className="w-9 h-9 rounded-md bg-white/5 flex items-center justify-center text-sm shrink-0">🎵</div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-gray-200 truncate">{track.title}</div>
        <div className="text-xs text-gray-500 truncate">{track.artist}</div>
      </div>
      {onAdd && (
        <button
          onClick={onAdd}
          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-gray-600 hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all text-sm font-bold"
        >+</button>
      )}
    </div>
  )
}

// ─── Mobile full-screen player ────────────────────────────────────────────────
function MobilePlayer({ onLike }: { onLike: () => void }) {
  const {
    playlist, currentIndex, isPlaying, volume, repeatMode, isBuffering, playbackError,
    setIsPlaying, nextTrack, prevTrack, cycleRepeat, isLiked, setVolume,
  } = useStore()
  const playbackTime = useStore((s) => s.playbackTime)
  const playbackDuration = useStore((s) => s.playbackDuration)

  const currentTrack = playlist[currentIndex]
  const liked = currentTrack ? isLiked(currentTrack.id) : false
  const showSpinner = isBuffering && !playbackError

  if (!currentTrack) return null

  return (
    <div className="flex flex-col h-full bg-black px-6 pt-6 pb-8 select-none">
      {/* Album art */}
      <div className="flex-1 flex items-center justify-center min-h-0 mb-6">
        {currentTrack.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentTrack.coverUrl}
            alt={currentTrack.title}
            className="w-full max-w-xs aspect-square rounded-2xl object-cover ring-1 ring-white/10"
            style={{ boxShadow: "0 32px 80px rgba(0,0,0,0.7)" }}
          />
        ) : (
          <div className="w-full max-w-xs aspect-square rounded-2xl bg-white/5 flex items-center justify-center text-8xl ring-1 ring-white/10">
            🎵
          </div>
        )}
      </div>

      {/* Track info + like */}
      <div className="flex items-start justify-between mb-5 gap-3">
        <div className="min-w-0">
          <div className="text-xl font-bold text-white leading-tight truncate">{currentTrack.title}</div>
          <div className="text-gray-400 text-sm mt-0.5 truncate">{currentTrack.artist}</div>
          {currentTrack.album && <div className="text-gray-600 text-xs mt-0.5 truncate">{currentTrack.album}</div>}
        </div>
        <button onClick={onLike} className={["shrink-0 text-2xl mt-0.5 transition-all active:scale-90", liked ? "text-red-500" : "text-gray-500"].join(" ")}>
          {liked ? "♥" : "♡"}
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <input
          type="range" min={0} max={playbackDuration || 0} value={playbackTime}
          onChange={(e) => seekRef.current?.(parseFloat(e.target.value))}
          className="progress-bar w-full mb-1.5"
          style={{ background: `linear-gradient(to right, #ffffff ${playbackDuration ? (playbackTime / playbackDuration) * 100 : 0}%, #282828 0%)` }}
        />
        <div className="flex justify-between">
          <span className="text-xs text-gray-500 tabular-nums">{fmt(playbackTime)}</span>
          <span className="text-xs text-gray-500 tabular-nums">{fmt(playbackDuration)}</span>
        </div>
      </div>

      {playbackError && <p className="text-xs text-red-400 text-center mb-3">{playbackError}</p>}

      {/* Main controls */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={cycleRepeat} className={["text-xl transition-colors", repeatMode === "none" ? "text-gray-600" : "text-white"].join(" ")}>
          {repeatMode === "one" ? "↺1" : "↺"}
        </button>
        <button onClick={prevTrack} className="text-white text-3xl active:scale-90 transition-transform">⏮</button>
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center text-2xl font-bold active:scale-95 transition-transform"
        >
          {showSpinner
            ? <span className="block w-6 h-6 rounded-full border-2 border-black border-t-transparent animate-spin" />
            : isPlaying ? "⏸" : "▶"}
        </button>
        <button onClick={nextTrack} className="text-white text-3xl active:scale-90 transition-transform">⏭</button>
        <div className="w-8" />
      </div>

      {/* Volume */}
      <div className="flex items-center gap-2">
        <span className="text-gray-500 text-sm">🔈</span>
        <input
          type="range" min={0} max={1} step={0.05} value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="volume-bar flex-1"
        />
        <span className="text-gray-500 text-sm">🔊</span>
      </div>
    </div>
  )
}

// ─── Mini bar (shown on Queue/ForYou tabs) ────────────────────────────────────
function MiniBar({ onGoToPlayer }: { onGoToPlayer: () => void }) {
  const { playlist, currentIndex, isPlaying, setIsPlaying, isBuffering } = useStore()
  const currentTrack = playlist[currentIndex]
  if (!currentTrack) return null
  return (
    <div
      className="shrink-0 flex items-center gap-3 px-4 py-3 border-t border-white/5"
      style={{ background: "rgba(8,8,12,0.95)" }}
    >
      {currentTrack.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={currentTrack.coverUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 ring-1 ring-white/10" onClick={onGoToPlayer} />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0 text-lg" onClick={onGoToPlayer}>🎵</div>
      )}
      <div className="min-w-0 flex-1 cursor-pointer" onClick={onGoToPlayer}>
        <div className="text-sm font-medium text-white truncate">{currentTrack.title}</div>
        <div className="text-xs text-gray-400 truncate">{currentTrack.artist}</div>
      </div>
      <button
        onClick={() => setIsPlaying(!isPlaying)}
        className="shrink-0 w-10 h-10 rounded-full bg-white text-black flex items-center justify-center font-bold active:scale-95 transition-transform"
      >
        {isBuffering ? <span className="block w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin" /> : isPlaying ? "⏸" : "▶"}
      </button>
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
    } catch { /* silent */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetch_() }, [fetch_])

  const handlePlayAll = useCallback(() => {
    if (tracks.length === 0) return
    useStore.getState().setPlaylist(tracks)
    useStore.getState().setIsPlaying(true)
    onSelectTrack(0)
  }, [tracks, onSelectTrack])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-white/5 shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">For You</h2>
          <button onClick={fetch_} disabled={loading} className="text-xs text-gray-600 hover:text-gray-400 transition-colors disabled:opacity-40">
            {loading ? <span className="inline-block w-3 h-3 rounded-full border-2 border-gray-500 border-t-transparent animate-spin" /> : "↻ Refresh"}
          </button>
        </div>
        <p className="text-xs text-gray-600">Based on your likes &amp; listening history</p>
        {tracks.length > 0 && (
          <button onClick={handlePlayAll} className="w-full py-1.5 rounded-lg bg-white text-black text-xs font-semibold hover:bg-white/90 active:scale-[0.98] transition-all">
            ▶ Play all ({tracks.length})
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {likedTrackIds.length === 0 ? (
          <p className="text-xs text-gray-600 text-center mt-8 px-4">Like some tracks first and we&apos;ll find music you&apos;ll love.</p>
        ) : loading && tracks.length === 0 ? (
          <div className="flex justify-center mt-8"><span className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" /></div>
        ) : tracks.length === 0 ? (
          <p className="text-xs text-gray-600 text-center mt-8 px-4">No new tracks found. Try refreshing.</p>
        ) : tracks.map((track) => (
          <TrackRow key={track.id} track={track} onAdd={() => {
            useStore.getState().addToPlaylist([track])
            setTracks((prev) => prev.filter((t) => t.id !== track.id))
          }} />
        ))}
      </div>
    </div>
  )
}

// ─── Queue panel ──────────────────────────────────────────────────────────────
interface QueuePanelProps {
  playlist: Track[]; currentIndex: number; moodConfig: MoodConfig | undefined
  searchQuery: string; setSearchQuery: (v: string) => void
  isSearching: boolean; isRegenerating: boolean
  handleSearch: (e: React.FormEvent) => void; handleRegenerate: () => void
  onSelectTrack: (i: number) => void; onChangeMood: () => void
}

function QueuePanel({ playlist, currentIndex, moodConfig, searchQuery, setSearchQuery, isSearching, isRegenerating, handleSearch, handleRegenerate, onSelectTrack, onChangeMood }: QueuePanelProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-white/5 space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Queue</h2>
          <button onClick={onChangeMood} className="text-xs text-gray-600 hover:text-gray-400 transition-colors">New search</button>
        </div>
        {moodConfig && <p className="text-xs text-gray-600">{moodConfig.emoji} {moodConfig.label} · {playlist.length} tracks</p>}
        <form onSubmit={handleSearch} className="flex gap-1.5">
          <input
            type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search… (e.g. 70s Italian jazz)"
            className="flex-1 min-w-0 text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-white/40 transition-colors"
          />
          <button type="submit" disabled={isSearching || !searchQuery.trim()} className="shrink-0 px-2.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white text-xs font-medium transition-colors border border-white/10">
            {isSearching ? <span className="block w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" /> : "↵"}
          </button>
        </form>
        <button onClick={handleRegenerate} disabled={isRegenerating} className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg border border-white/8 text-xs text-gray-500 hover:text-gray-300 hover:border-white/20 disabled:opacity-40 transition-all">
          {isRegenerating ? <><span className="block w-3 h-3 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />Generating…</> : <>⟳ New playlist</>}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {playlist.map((track, i) => (
          <TrackCard key={`${track.id}-${i}`} track={track} isActive={i === currentIndex} onClick={() => onSelectTrack(i)} />
        ))}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PlayerPage() {
  const router = useRouter()
  const {
    playlist, currentIndex, currentMood, excludedGenres, hasCompletedOnboarding,
    lastSearchQuery, setCurrentIndex, setPlaylist, setCurrentMood, setIsPlaying, setLastSearchQuery,
    addLike, removeLike, isLiked, addToPlaylist,
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
    if (!hasCompletedOnboarding) { router.replace("/onboarding"); return }
    if (!currentMood || playlist.length === 0) router.replace("/mood")
  }, [hasCompletedOnboarding, currentMood, playlist.length, router])

  useEffect(() => {
    if (!currentTrack || currentTrack.id === lastRecId.current) return
    lastRecId.current = currentTrack.id
    setIsLoadingRecs(true)
    setRecommendations([])
    const inPlaylist = new Set(useStore.getState().playlist.map((t) => t.id))
    fetch(`/api/recommend?id=${currentTrack.id}`)
      .then((r) => r.json())
      .then((data: Track[]) => { if (Array.isArray(data)) setRecommendations(data.filter((t) => !inPlaylist.has(t.id)).slice(0, 8)) })
      .catch(() => {})
      .finally(() => setIsLoadingRecs(false))
  }, [currentTrack?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const q = searchQuery.trim()
    if (!q) return
    setIsSearching(true)
    try {
      const played = useStore.getState().playedTrackIds.slice(-150)
      const params = new URLSearchParams({ q })
      if (played.length > 0) params.set("seen", played.join(","))
      const likedArtists = [...new Set(useStore.getState().likedTracks.map((t) => t.artist))].slice(0, 15)
      if (likedArtists.length > 0) params.set("liked", likedArtists.join(","))
      const res = await fetch(`/api/ai-search?${params.toString()}`)
      const tracks = await res.json()
      if (Array.isArray(tracks) && tracks.length > 0) {
        setLastSearchQuery(q); setPlaylist(tracks); setCurrentMood("chill"); setIsPlaying(true); setMobileTab("playing")
      }
    } catch { /* silent */ } finally { setIsSearching(false) }
  }, [searchQuery, setPlaylist, setCurrentMood, setIsPlaying, setLastSearchQuery])

  const handleRegenerate = useCallback(async () => {
    setIsRegenerating(true)
    try {
      const played = useStore.getState().playedTrackIds.slice(-150)
      const likedArtists = [...new Set(useStore.getState().likedTracks.map((t) => t.artist))].slice(0, 15)
      let tracks: Track[] = []
      if (lastSearchQuery) {
        const params = new URLSearchParams({ q: lastSearchQuery })
        if (excludedGenres.length > 0) params.set("excluded", excludedGenres.join(","))
        if (played.length > 0) params.set("seen", played.join(","))
        if (likedArtists.length > 0) params.set("liked", likedArtists.join(","))
        tracks = await (await fetch(`/api/ai-search?${params}`)).json()
      } else if (currentMood) {
        const params = new URLSearchParams({ mood: currentMood })
        if (excludedGenres.length > 0) params.set("excluded", excludedGenres.join(","))
        if (played.length > 0) params.set("seen", played.join(","))
        if (likedArtists.length > 0) params.set("liked", likedArtists.join(","))
        tracks = await (await fetch(`/api/playlist?${params}`)).json()
      }
      if (Array.isArray(tracks) && tracks.length > 0) { setPlaylist(tracks); setIsPlaying(true) }
    } catch { /* silent */ } finally { setIsRegenerating(false) }
  }, [currentMood, excludedGenres, lastSearchQuery, setPlaylist, setIsPlaying])

  const handleSelectTrack = useCallback((i: number) => {
    setCurrentIndex(i); setIsPlaying(true); setMobileTab("playing")
  }, [setCurrentIndex, setIsPlaying])

  const handleLike = useCallback(async () => {
    if (!currentTrack) return
    if (isLiked(currentTrack.id)) { removeLike(currentTrack.id); return }
    addLike(currentTrack)
    try {
      const params = new URLSearchParams({ id: String(currentTrack.id) })
      const res = await fetch(`/api/recommend?${params}`)
      const recs = await res.json()
      if (Array.isArray(recs) && recs.length > 0) addToPlaylist(recs)
    } catch { /* silent */ }
  }, [currentTrack, isLiked, removeLike, addLike, addToPlaylist])

  const queuePanelProps: QueuePanelProps = {
    playlist, currentIndex, moodConfig, searchQuery, setSearchQuery,
    isSearching, isRegenerating, handleSearch, handleRegenerate,
    onSelectTrack: handleSelectTrack, onChangeMood: () => router.push("/mood"),
  }

  return (
    <div className="flex h-screen overflow-hidden bg-black">
      {/* ─── Desktop sidebar ─── */}
      <aside className="hidden md:flex w-72 flex-col border-r border-white/5 shrink-0 overflow-hidden">
        <div className="flex shrink-0 border-b border-white/5">
          {(["queue", "foryou"] as const).map((tab) => (
            <button key={tab} onClick={() => setSidebarTab(tab)}
              className={["flex-1 py-2.5 text-xs font-medium transition-colors", sidebarTab === tab ? "text-white border-b-2 border-white/60" : "text-gray-500 hover:text-gray-300"].join(" ")}
            >{tab === "queue" ? "Queue" : "For You"}</button>
          ))}
        </div>
        {sidebarTab === "queue" ? <QueuePanel {...queuePanelProps} /> : <ForYouPanel onSelectTrack={handleSelectTrack} />}
      </aside>

      {/* ─── Main content ─── */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* Mobile tab bar */}
        <div className="md:hidden flex shrink-0 border-b border-white/5">
          {(["playing", "queue", "foryou"] as const).map((tab) => (
            <button key={tab} onClick={() => setMobileTab(tab)}
              className={["flex-1 py-3 text-xs font-medium transition-colors", mobileTab === tab ? "text-white border-b-2 border-white/60" : "text-gray-500"].join(" ")}
            >
              {tab === "playing" ? "Now Playing" : tab === "queue" ? `Queue${playlist.length > 0 ? ` (${playlist.length})` : ""}` : "For You"}
            </button>
          ))}
        </div>

        {/* Mobile: Now Playing — full-screen player */}
        {mobileTab === "playing" && (
          <div className="md:hidden flex-1 overflow-hidden">
            <MobilePlayer onLike={handleLike} />
          </div>
        )}

        {/* Mobile: Queue tab */}
        {mobileTab === "queue" && (
          <div className="md:hidden flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-hidden"><QueuePanel {...queuePanelProps} /></div>
            <MiniBar onGoToPlayer={() => setMobileTab("playing")} />
          </div>
        )}

        {/* Mobile: For You tab */}
        {mobileTab === "foryou" && (
          <div className="md:hidden flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-hidden"><ForYouPanel onSelectTrack={handleSelectTrack} /></div>
            <MiniBar onGoToPlayer={() => setMobileTab("playing")} />
          </div>
        )}

        {/* Desktop: Now Playing content */}
        <div className="hidden md:flex flex-1 overflow-y-auto pb-28">
          {currentTrack ? (
            <div className="max-w-md mx-auto px-6 pt-10 pb-4 w-full animate-fadeup">
              <div className="flex justify-center mb-6">
                {currentTrack.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={currentTrack.coverUrl} alt={currentTrack.title}
                    className="w-56 h-56 sm:w-64 sm:h-64 rounded-2xl object-cover ring-1 ring-white/10"
                    style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}
                  />
                ) : (
                  <div className="w-56 h-56 sm:w-64 sm:h-64 rounded-2xl bg-white/5 flex items-center justify-center text-7xl ring-1 ring-white/10">🎵</div>
                )}
              </div>
              <div className="text-center mb-8">
                <h1 className="text-xl sm:text-2xl font-bold text-white mb-1 leading-tight">{currentTrack.title}</h1>
                <p className="text-gray-300 text-sm">{currentTrack.artist}</p>
                {currentTrack.album && <p className="text-gray-500 text-xs mt-1">{currentTrack.album}</p>}
              </div>
              {(isLoadingRecs || recommendations.length > 0) && (
                <div>
                  <h2 className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-2 px-1">Similar tracks</h2>
                  {isLoadingRecs ? (
                    <div className="flex justify-center py-8"><span className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" /></div>
                  ) : (
                    <div className="rounded-xl overflow-hidden bg-black/20 border border-white/5">
                      {recommendations.map((rec) => (
                        <TrackRow key={rec.id} track={rec} onAdd={() => {
                          useStore.getState().addToPlaylist([rec])
                          setRecommendations((prev) => prev.filter((t) => t.id !== rec.id))
                        }} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 w-full">
              <div className="text-5xl mb-4">🎵</div>
              <p>Loading playlist…</p>
            </div>
          )}
        </div>
      </main>

      {/* Desktop-only player bar */}
      <AudioPlayer />
    </div>
  )
}

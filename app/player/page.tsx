"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useStore } from "@/lib/store"
import { AudioPlayer, seekRef } from "@/components/AudioPlayer"
import { TrackCard } from "@/components/TrackCard"
import { SearchForm } from "@/components/SearchForm"
import { MOODS } from "@/lib/types"
import { encodePlaylist } from "@/lib/share"
import type { Track, MoodConfig } from "@/lib/types"

function fmt(secs: number) {
  if (!isFinite(secs) || secs < 0) return "0:00"
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

// ─── Shared track row (For You panel) ────────────────────────────────────────
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

// ─── Compact mobile player bar ────────────────────────────────────────────────
// Matches the Tidal-style mini player from the screenshot
function CompactPlayerBar({ onLike }: { onLike: () => void }) {
  const {
    playlist, currentIndex, isPlaying, repeatMode, isBuffering,
    setIsPlaying, nextTrack, prevTrack, cycleRepeat, isLiked,
  } = useStore()
  const playbackTime     = useStore((s) => s.playbackTime)
  const playbackDuration = useStore((s) => s.playbackDuration)

  const currentTrack = playlist[currentIndex]
  const liked = currentTrack ? isLiked(currentTrack.id) : false

  if (!currentTrack) return null

  const pct = playbackDuration ? (playbackTime / playbackDuration) * 100 : 0

  return (
    <div className="shrink-0 px-4 pt-3 pb-5 border-t border-white/5" style={{ background: "#090909" }}>
      {/* Track info row */}
      <div className="flex items-center gap-2.5 mb-3">
        {currentTrack.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentTrack.coverUrl}
            alt=""
            className="w-7 h-7 rounded-md object-cover shrink-0 ring-1 ring-white/10"
          />
        ) : (
          <div className="w-7 h-7 rounded-md bg-white/5 flex items-center justify-center shrink-0 text-xs">🎵</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-white truncate leading-tight">{currentTrack.title}</div>
          <div className="text-[11px] text-gray-500 truncate leading-tight">{currentTrack.artist}</div>
        </div>
        <button
          onClick={onLike}
          className={["shrink-0 text-base transition-all active:scale-90", liked ? "text-red-400" : "text-gray-600"].join(" ")}
        >
          {liked ? "♥" : "♡"}
        </button>
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-center gap-7 mb-3">
        <button onClick={prevTrack} className="text-white text-xl active:scale-90 transition-transform">⏮</button>
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center active:scale-95 transition-transform shrink-0"
        >
          {isBuffering ? (
            <span className="block w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
          ) : isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]">
              <rect x="5" y="4" width="4" height="16" rx="1.2"/>
              <rect x="15" y="4" width="4" height="16" rx="1.2"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]" style={{ marginLeft: "2px" }}>
              <path d="M8 5v14l11-7z"/>
            </svg>
          )}
        </button>
        <button onClick={nextTrack} className="text-white text-xl active:scale-90 transition-transform">⏭</button>
        <button
          onClick={cycleRepeat}
          className={["text-base transition-colors", repeatMode === "none" ? "text-gray-600" : "text-white"].join(" ")}
        >
          {repeatMode === "one" ? "↺1" : "↺"}
        </button>
      </div>

      {/* Progress bar */}
      <div>
        <input
          type="range" min={0} max={playbackDuration || 0} value={playbackTime}
          onChange={(e) => seekRef.current?.(parseFloat(e.target.value))}
          className="progress-bar w-full mb-1.5"
          style={{ background: `linear-gradient(to right, #ffffff ${pct}%, #282828 0%)` }}
        />
        <div className="flex justify-between">
          <span className="text-[10px] text-gray-600 tabular-nums">{fmt(playbackTime)}</span>
          <span className="text-[10px] text-gray-600 tabular-nums">{fmt(playbackDuration)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Now Playing album art view (mobile "playing" tab) ────────────────────────
function NowPlayingContent({
  onLike, onMix, mixingId,
}: {
  onLike: () => void
  onMix: (track: Track) => void
  mixingId: number | null
}) {
  const { playlist, currentIndex, isLiked } = useStore()
  const currentTrack = playlist[currentIndex]
  if (!currentTrack) return null
  const liked = isLiked(currentTrack.id)

  return (
    <div className="flex flex-col items-center justify-center h-full bg-black px-6 pb-4">
      {/* Album art */}
      <div className="w-full max-w-xs mb-5">
        {currentTrack.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentTrack.coverUrl}
            alt={currentTrack.title}
            className="w-full aspect-square rounded-2xl object-cover ring-1 ring-white/10"
            style={{ boxShadow: "0 24px 72px rgba(0,0,0,0.7)" }}
          />
        ) : (
          <div className="w-full aspect-square rounded-2xl bg-white/5 flex items-center justify-center text-8xl ring-1 ring-white/10">🎵</div>
        )}
      </div>

      {/* Track info + like */}
      <div className="flex items-start justify-between w-full max-w-xs mb-5 gap-3">
        <div className="min-w-0">
          <div className="text-lg font-bold text-white leading-tight truncate">{currentTrack.title}</div>
          <div className="text-gray-400 text-sm mt-0.5 truncate">{currentTrack.artist}</div>
          {currentTrack.album && <div className="text-gray-600 text-xs mt-0.5 truncate">{currentTrack.album}</div>}
        </div>
        <button onClick={onLike} className={["shrink-0 text-2xl mt-0.5 transition-all active:scale-90", liked ? "text-red-400" : "text-gray-500"].join(" ")}>
          {liked ? "♥" : "♡"}
        </button>
      </div>

      {/* Mix from this track */}
      <button
        onClick={() => onMix(currentTrack)}
        disabled={mixingId !== null}
        className="w-full max-w-xs py-2 rounded-xl border border-white/10 text-xs text-gray-400 hover:text-white hover:border-white/30 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
      >
        {mixingId === currentTrack.id
          ? <><span className="block w-3 h-3 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" /> Building mix…</>
          : <>⌁ Mix from this track</>}
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
    const { likedTrackIds, likedTracks, playedTrackIds, playlist } = useStore.getState()
    if (likedTrackIds.length === 0) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("liked", likedTrackIds.slice(-30).join(","))
      const seen = [...new Set([...playedTrackIds, ...playlist.map((t) => t.id)])]
      if (seen.length > 0) params.set("seen", seen.slice(-300).join(","))
      const likedArtists = [...new Set(likedTracks.map((t) => t.artist))].slice(0, 10)
      if (likedArtists.length > 0) params.set("artists", likedArtists.join("||"))
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
  isSearching: boolean; isRegenerating: boolean
  onSearch: (q: string) => void; handleRegenerate: () => void
  onSelectTrack: (i: number) => void
  onMix: (track: Track) => void; mixingId: number | null
  onShare: () => void; shareCopied: boolean
}

function QueuePanel({
  playlist, currentIndex, moodConfig,
  isSearching, isRegenerating, onSearch, handleRegenerate,
  onSelectTrack, onMix, mixingId, onShare, shareCopied,
}: QueuePanelProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/5 shrink-0">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Queue</h2>
          <button onClick={onShare} className="text-xs text-gray-600 hover:text-gray-300 transition-colors">
            {shareCopied ? "✓ Copied!" : "Share ↗"}
          </button>
        </div>
        {moodConfig && (
          <p className="text-xs text-gray-600 mb-3">{moodConfig.emoji} {moodConfig.label} · {playlist.length} tracks</p>
        )}

        {/* Structured search form */}
        <SearchForm onSearch={onSearch} isSearching={isSearching} compact />

        {/* New playlist (same query, fresh tracks) */}
        <button
          onClick={handleRegenerate}
          disabled={isRegenerating}
          className="w-full mt-2 flex items-center justify-center gap-2 py-1.5 rounded-lg border border-white/8 text-xs text-gray-500 hover:text-gray-300 hover:border-white/20 disabled:opacity-40 transition-all"
        >
          {isRegenerating
            ? <><span className="block w-3 h-3 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />Generating…</>
            : <>⟳ New playlist</>}
        </button>
      </div>

      {/* Track list */}
      <div className="flex-1 overflow-y-auto py-1">
        {playlist.map((track, i) => (
          <div key={`${track.id}-${i}`} className="relative group">
            <TrackCard track={track} isActive={i === currentIndex} onClick={() => onSelectTrack(i)} />
            <button
              onClick={() => onMix(track)}
              disabled={mixingId !== null}
              title="Mix from this track"
              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-gray-500 hover:text-white px-1.5 py-1 rounded bg-black/60 backdrop-blur-sm disabled:opacity-30"
            >
              {mixingId === track.id
                ? <span className="block w-2.5 h-2.5 rounded-full border border-gray-400 border-t-transparent animate-spin" />
                : "⌁ mix"}
            </button>
          </div>
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

  const playlistIds = useMemo(() => playlist.map((t) => t.id), [playlist])

  const [isSearching, setIsSearching]       = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [mobileTab, setMobileTab]           = useState<"playing" | "queue" | "foryou">("playing")
  const [sidebarTab, setSidebarTab]         = useState<"queue" | "foryou">("queue")
  const [recommendations, setRecommendations] = useState<Track[]>([])
  const [isLoadingRecs, setIsLoadingRecs]   = useState(false)
  const [mixingId, setMixingId]             = useState<number | null>(null)
  const [sonicDesc, setSonicDesc]           = useState("")
  const [shareCopied, setShareCopied]       = useState(false)

  const lastRecId  = useRef<number | null>(null)
  const isExtending = useRef(false)

  const currentTrack = playlist[currentIndex]
  const moodConfig   = MOODS.find((m) => m.id === currentMood)

  useEffect(() => {
    if (!hasCompletedOnboarding) { router.replace("/onboarding"); return }
    if (!currentMood || playlist.length === 0) router.replace("/mood")
  }, [hasCompletedOnboarding, currentMood, playlist.length, router])

  // Load similar tracks for desktop sidebar
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

  // Auto-extend queue when < 5 tracks remain ahead
  useEffect(() => {
    const remaining = playlist.length - currentIndex - 1
    if (remaining >= 5) return
    if (isExtending.current) return
    const { lastSearchQuery: lsq, currentMood: cm, playedTrackIds, excludedGenres: eg } = useStore.getState()
    if (!lsq && !cm) return

    isExtending.current = true
    const inPlaylist = new Set(playlistIds)
    const played = [...new Set([...playedTrackIds, ...playlistIds])].slice(-200)
    const params = new URLSearchParams()
    if (played.length > 0) params.set("seen", played.join(","))
    if (eg.length > 0) params.set("excluded", eg.join(","))

    const endpoint = lsq
      ? `/api/ai-search?q=${encodeURIComponent(lsq)}&${params}`
      : `/api/playlist?mood=${cm}&${params}`

    fetch(endpoint)
      .then((r) => r.json())
      .then((newTracks: Track[]) => {
        if (Array.isArray(newTracks) && newTracks.length > 0) {
          const fresh = newTracks.filter((t) => !inPlaylist.has(t.id))
          if (fresh.length > 0) addToPlaylist(fresh)
        }
      })
      .catch(() => {})
      .finally(() => { isExtending.current = false })
  }, [currentIndex, playlist.length, playlistIds, addToPlaylist]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) return
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
  }, [setPlaylist, setCurrentMood, setIsPlaying, setLastSearchQuery])

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
      const res = await fetch(`/api/recommend?id=${currentTrack.id}`)
      const recs = await res.json()
      if (Array.isArray(recs) && recs.length > 0) addToPlaylist(recs)
    } catch { /* silent */ }
  }, [currentTrack, isLiked, removeLike, addLike, addToPlaylist])

  const handleMix = useCallback(async (track: Track) => {
    if (mixingId !== null) return
    setMixingId(track.id)
    setSonicDesc("")
    try {
      const played = [...new Set([
        ...useStore.getState().playedTrackIds,
        ...useStore.getState().playlist.map((t) => t.id),
      ])].slice(-150)
      const params = new URLSearchParams({
        title: track.title,
        artist: track.artist,
        id: String(track.id),
      })
      if (played.length > 0) params.set("seen", played.join(","))
      const res = await fetch(`/api/mix?${params}`)
      const data = await res.json()
      if (Array.isArray(data.tracks) && data.tracks.length > 0) {
        setPlaylist(data.tracks)
        setIsPlaying(true)
        setMobileTab("playing")
        if (data.sonicDescription) {
          setSonicDesc(data.sonicDescription)
          setTimeout(() => setSonicDesc(""), 5000)
        }
      }
    } catch { /* silent */ } finally { setMixingId(null) }
  }, [mixingId, setPlaylist, setIsPlaying])

  const handleShare = useCallback(() => {
    const pl = useStore.getState().playlist
    if (pl.length === 0) return
    const token = encodePlaylist(pl)
    const url   = `${window.location.origin}/share/${token}`
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2500)
    }).catch(() => {})
  }, [])

  const queuePanelProps: QueuePanelProps = {
    playlist, currentIndex, moodConfig,
    isSearching, isRegenerating, onSearch: handleSearch, handleRegenerate,
    onSelectTrack: handleSelectTrack,
    onMix: handleMix, mixingId, onShare: handleShare, shareCopied,
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

        {/* ── Mobile layout ── */}
        <div className="md:hidden flex flex-col h-full">
          {/* Tab bar */}
          <div className="flex shrink-0 border-b border-white/5">
            {(["playing", "queue", "foryou"] as const).map((tab) => (
              <button key={tab} onClick={() => setMobileTab(tab)}
                className={["flex-1 py-3 text-xs font-medium transition-colors", mobileTab === tab ? "text-white border-b-2 border-white/60" : "text-gray-500"].join(" ")}
              >
                {tab === "playing" ? "Now Playing" : tab === "queue" ? `Queue${playlist.length > 0 ? ` (${playlist.length})` : ""}` : "For You"}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden">
            {mobileTab === "playing" && (
              <NowPlayingContent onLike={handleLike} onMix={handleMix} mixingId={mixingId} />
            )}
            {mobileTab === "queue" && (
              <QueuePanel {...queuePanelProps} />
            )}
            {mobileTab === "foryou" && (
              <ForYouPanel onSelectTrack={handleSelectTrack} />
            )}
          </div>

          {/* Persistent compact player bar — always visible */}
          <CompactPlayerBar onLike={handleLike} />
        </div>

        {/* ── Desktop Now Playing content ── */}
        <div className="hidden md:flex flex-1 overflow-y-auto pb-28">
          {currentTrack ? (
            <div className="max-w-md mx-auto px-6 pt-10 pb-4 w-full animate-fadeup">
              {/* Sonic description toast */}
              {sonicDesc && (
                <div className="mb-4 text-center text-xs text-gray-500 italic animate-pulse">
                  {sonicDesc}
                </div>
              )}
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
              <div className="text-center mb-5">
                <h1 className="text-xl sm:text-2xl font-bold text-white mb-1 leading-tight">{currentTrack.title}</h1>
                <p className="text-gray-300 text-sm">{currentTrack.artist}</p>
                {currentTrack.album && <p className="text-gray-500 text-xs mt-1">{currentTrack.album}</p>}
              </div>
              <button
                onClick={() => handleMix(currentTrack)}
                disabled={mixingId !== null}
                className="w-full mb-6 py-2 rounded-xl border border-white/10 text-xs text-gray-500 hover:text-white hover:border-white/30 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
              >
                {mixingId === currentTrack.id
                  ? <><span className="block w-3 h-3 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />Building mix…</>
                  : <>⌁ Mix from this track</>}
              </button>
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

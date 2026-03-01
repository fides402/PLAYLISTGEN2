"use client"

import { useEffect, useRef, useCallback } from "react"
import { useStore } from "@/lib/store"

// Module-level seek reference — consumed by MobilePlayer in player/page.tsx
export const seekRef = { current: null as ((t: number) => void) | null }

function fmt(secs: number) {
  if (!isFinite(secs) || secs < 0) return "0:00"
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function AudioPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const loadingRef = useRef(false)

  const {
    playlist,
    currentIndex,
    isPlaying,
    volume,
    streamQuality,
    repeatMode,
    setIsPlaying,
    nextTrack,
    prevTrack,
    cycleRepeat,
    addLike,
    removeLike,
    isLiked,
    addToPlaylist,
    excludedGenres,
    setPlaybackTime,
    setPlaybackDuration,
    setIsBuffering,
    setPlaybackError,
  } = useStore()

  const currentTrack = playlist[currentIndex]

  // Register seek callback for mobile player
  useEffect(() => {
    seekRef.current = (t: number) => {
      const audio = audioRef.current
      if (!audio) return
      audio.currentTime = t
      setPlaybackTime(t)
    }
    return () => { seekRef.current = null }
  }, [setPlaybackTime])

  // Load new track when currentTrack or quality changes
  useEffect(() => {
    const audio = audioRef.current
    if (!currentTrack || !audio) return
    setPlaybackError(null)
    setIsBuffering(true)
    setPlaybackTime(0)
    setPlaybackDuration(0)
    loadingRef.current = true
    audio.src = `/api/stream?id=${currentTrack.id}&quality=${streamQuality}`
    audio.load()
  }, [currentTrack?.id, streamQuality]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync play/pause
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      if (audio.readyState >= 2) audio.play().catch(() => setIsPlaying(false))
    } else {
      audio.pause()
    }
  }, [isPlaying, setIsPlaying])

  // Volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTimeUpdate = () => setPlaybackTime(audio.currentTime)
    const onDuration = () => {
      if (isFinite(audio.duration)) setPlaybackDuration(audio.duration)
    }
    const onEnded = () => {
      if (useStore.getState().repeatMode === "one") {
        audio.currentTime = 0
        audio.play().catch(() => {})
      } else {
        loadingRef.current = true
        nextTrack()
      }
    }
    const onPlay = () => { setIsPlaying(true); setIsBuffering(false) }
    // audio.ended is true when pause fires naturally at end-of-track (per WHATWG spec)
    // loadingRef covers the pause from audio.load()
    const onPause = () => {
      if (!loadingRef.current && !audio.ended) setIsPlaying(false)
    }
    const onWaiting = () => setIsBuffering(true)
    const onCanPlay = () => {
      loadingRef.current = false
      setIsBuffering(false)
      if (useStore.getState().isPlaying) {
        audio.play().catch(() => useStore.getState().setIsPlaying(false))
      }
    }
    const onError = () => {
      setIsBuffering(false)
      setIsPlaying(false)
      setPlaybackError("Traccia non disponibile — salto al successivo…")
      // Auto-advance after 2 s — gives time to see the message
      setTimeout(() => {
        const state = useStore.getState()
        if (state.playbackError) {
          state.setPlaybackError(null)
          state.nextTrack()
        }
      }, 2000)
    }

    audio.addEventListener("timeupdate", onTimeUpdate)
    audio.addEventListener("durationchange", onDuration)
    audio.addEventListener("ended", onEnded)
    audio.addEventListener("play", onPlay)
    audio.addEventListener("pause", onPause)
    audio.addEventListener("waiting", onWaiting)
    audio.addEventListener("canplay", onCanPlay)
    audio.addEventListener("error", onError)
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate)
      audio.removeEventListener("durationchange", onDuration)
      audio.removeEventListener("ended", onEnded)
      audio.removeEventListener("play", onPlay)
      audio.removeEventListener("pause", onPause)
      audio.removeEventListener("waiting", onWaiting)
      audio.removeEventListener("canplay", onCanPlay)
      audio.removeEventListener("error", onError)
    }
  }, [nextTrack, setIsPlaying, setPlaybackTime, setPlaybackDuration, setIsBuffering, setPlaybackError])

  // Media Session API — background/lock-screen audio on iOS & Android
  useEffect(() => {
    if (!("mediaSession" in navigator) || !currentTrack) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album || "",
      artwork: currentTrack.coverUrl
        ? [{ src: currentTrack.coverUrl, sizes: "640x640", type: "image/jpeg" }]
        : [],
    })
  }, [currentTrack])

  useEffect(() => {
    if (!("mediaSession" in navigator)) return
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused"
  }, [isPlaying])

  useEffect(() => {
    if (!("mediaSession" in navigator)) return
    const ms = navigator.mediaSession
    ms.setActionHandler("play", () => setIsPlaying(true))
    ms.setActionHandler("pause", () => setIsPlaying(false))
    ms.setActionHandler("nexttrack", () => nextTrack())
    ms.setActionHandler("previoustrack", () => prevTrack())
    try {
      ms.setActionHandler("seekto", (d) => {
        if (audioRef.current && d.seekTime != null) {
          audioRef.current.currentTime = d.seekTime
          setPlaybackTime(d.seekTime)
        }
      })
    } catch { /* seekto not supported on all browsers */ }
    return () => {
      ms.setActionHandler("play", null)
      ms.setActionHandler("pause", null)
      ms.setActionHandler("nexttrack", null)
      ms.setActionHandler("previoustrack", null)
      try { ms.setActionHandler("seekto", null) } catch { /* ignore */ }
    }
  }, [setIsPlaying, nextTrack, prevTrack, setPlaybackTime])

  useEffect(() => {
    if (!("mediaSession" in navigator)) return
    const { playbackDuration, playbackTime } = useStore.getState()
    if (!playbackDuration) return
    try {
      navigator.mediaSession.setPositionState({
        duration: playbackDuration,
        playbackRate: audioRef.current?.playbackRate ?? 1,
        position: Math.min(playbackTime, playbackDuration),
      })
    } catch { /* ignore */ }
  })

  const handleLike = useCallback(async () => {
    if (!currentTrack) return
    if (isLiked(currentTrack.id)) { removeLike(currentTrack.id); return }
    addLike(currentTrack)
    try {
      const params = new URLSearchParams({ id: String(currentTrack.id) })
      if (excludedGenres.length > 0) params.set("excluded", excludedGenres.join(","))
      const res = await fetch(`/api/recommend?${params.toString()}`)
      const recs = await res.json()
      if (Array.isArray(recs) && recs.length > 0) addToPlaylist(recs)
    } catch { /* silent */ }
  }, [currentTrack, isLiked, removeLike, addLike, excludedGenres, addToPlaylist])

  const liked = currentTrack ? isLiked(currentTrack.id) : false
  const playbackTime = useStore((s) => s.playbackTime)
  const playbackDuration = useStore((s) => s.playbackDuration)
  const isBuffering = useStore((s) => s.isBuffering)
  const playbackError = useStore((s) => s.playbackError)
  const showSpinner = isBuffering && !playbackError

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    seekRef.current?.(parseFloat(e.target.value))
  }

  return (
    <>
      <audio ref={audioRef} preload="auto" className="hidden" />

      {/* Desktop-only player bar */}
      <div
        className="hidden md:block fixed bottom-0 left-0 right-0 z-50"
        style={{
          background: "linear-gradient(to top, rgba(8,8,12,0.98) 60%, rgba(8,8,12,0.85))",
          backdropFilter: "blur(24px)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {currentTrack ? (
          <div className="max-w-screen-xl mx-auto flex items-center gap-4 px-4 py-3">
            {/* Track info */}
            <div className="flex items-center gap-3 w-56 shrink-0 min-w-0">
              {currentTrack.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={currentTrack.coverUrl} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0 ring-1 ring-white/10" />
              ) : (
                <div className="w-11 h-11 rounded-lg bg-white/5 flex items-center justify-center text-xl shrink-0">🎵</div>
              )}
              <div className="min-w-0">
                <div className="text-sm font-medium text-white truncate">{currentTrack.title}</div>
                <div className="text-xs text-gray-400 truncate">{currentTrack.artist}</div>
              </div>
            </div>

            {/* Center controls */}
            <div className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
              <div className="flex items-center gap-5">
                <button onClick={prevTrack} className="text-gray-400 hover:text-white transition-colors text-lg">⏮</button>
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center font-bold hover:scale-105 active:scale-95 transition-transform"
                >
                  {showSpinner
                    ? <span className="block w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
                    : isPlaying ? "⏸" : "▶"}
                </button>
                <button onClick={nextTrack} className="text-gray-400 hover:text-white transition-colors text-lg">⏭</button>
                <button
                  onClick={cycleRepeat}
                  className={["text-sm transition-colors", repeatMode === "none" ? "text-gray-600 hover:text-gray-400" : "text-white"].join(" ")}
                >
                  {repeatMode === "one" ? "↺1" : "↺"}
                </button>
              </div>
              <div className="flex items-center gap-2 w-full max-w-md">
                <span className="text-xs text-gray-500 w-8 text-right tabular-nums">{fmt(playbackTime)}</span>
                <input
                  type="range" min={0} max={playbackDuration || 0} value={playbackTime}
                  onChange={seek} className="progress-bar flex-1"
                  style={{ background: `linear-gradient(to right, #ffffff ${playbackDuration ? (playbackTime / playbackDuration) * 100 : 0}%, #282828 0%)` }}
                />
                <span className="text-xs text-gray-500 w-8 tabular-nums">{fmt(playbackDuration)}</span>
              </div>
              {playbackError && <p className="text-xs text-red-400 mt-0.5">{playbackError}</p>}
            </div>

            {/* Like + Volume + Quality */}
            <div className="flex items-center gap-3 w-52 justify-end shrink-0">
              <button
                onClick={handleLike}
                className={["text-xl transition-all active:scale-90", liked ? "text-red-500 scale-110" : "text-gray-500 hover:text-white"].join(" ")}
              >
                {liked ? "♥" : "♡"}
              </button>
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500 text-xs">🔈</span>
                <input
                  type="range" min={0} max={1} step={0.05} value={volume}
                  onChange={(e) => useStore.getState().setVolume(parseFloat(e.target.value))}
                  className="volume-bar w-16"
                />
              </div>
              <select
                value={streamQuality}
                onChange={(e) => useStore.getState().setStreamQuality(e.target.value)}
                className="text-xs bg-white/5 border border-white/10 rounded px-1.5 py-1 text-gray-400 hover:text-white focus:outline-none focus:border-white/30 transition-colors cursor-pointer"
                style={{ fontSize: "11px" }}
              >
                <option value="LOW">Low</option>
                <option value="HIGH">High</option>
                <option value="LOSSLESS">Lossless</option>
                <option value="HI_RES_LOSSLESS">Hi-Res</option>
              </select>
            </div>
          </div>
        ) : (
          <div className="text-center text-gray-600 text-sm py-4">Select a track to play</div>
        )}
      </div>
    </>
  )
}

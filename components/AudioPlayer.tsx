"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useStore } from "@/lib/store"

function fmt(secs: number) {
  if (!isFinite(secs) || secs < 0) return "0:00"
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function AudioPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const loadingRef = useRef(false) // true while audio.load() is in progress
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffering, setBuffering] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)

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
  } = useStore()

  const currentTrack = playlist[currentIndex]

  useEffect(() => {
    const audio = audioRef.current
    if (!currentTrack || !audio) return
    setStreamError(null)
    setBuffering(true)
    setCurrentTime(0)
    setDuration(0)
    loadingRef.current = true
    audio.src = `/api/stream?id=${currentTrack.id}&quality=${streamQuality}`
    audio.load()
  }, [currentTrack?.id, streamQuality]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      if (audio.readyState >= 2) {
        audio.play().catch(() => setIsPlaying(false))
      }
    } else {
      audio.pause()
    }
  }, [isPlaying, setIsPlaying])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTimeUpdate = () => setCurrentTime(audio.currentTime)
    const onDuration = () => {
      if (isFinite(audio.duration)) setDuration(audio.duration)
    }
    const onEnded = () => {
      if (useStore.getState().repeatMode === "one") {
        const audio = audioRef.current
        if (audio) { audio.currentTime = 0; audio.play().catch(() => {}) }
      } else {
        nextTrack()
      }
    }
    const onPlay = () => { setIsPlaying(true); setBuffering(false) }
    // Ignore pause events fired by audio.load() — those don't reflect user intent
    const onPause = () => { if (!loadingRef.current) setIsPlaying(false) }
    const onWaiting = () => setBuffering(true)
    const onCanPlay = () => {
      loadingRef.current = false
      setBuffering(false)
      if (useStore.getState().isPlaying) {
        audio.play().catch(() => useStore.getState().setIsPlaying(false))
      }
    }
    const onError = () => {
      const code = audio.error?.code
      setStreamError(code === 4 ? "DASH format — skip to next" : "Playback error — try next")
      setBuffering(false)
      setIsPlaying(false)
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
  }, [nextTrack, setIsPlaying])

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value)
    if (audioRef.current) audioRef.current.currentTime = t
    setCurrentTime(t)
  }

  const handleLike = useCallback(async () => {
    if (!currentTrack) return
    if (isLiked(currentTrack.id)) {
      removeLike(currentTrack.id)
      return
    }
    addLike(currentTrack)
    try {
      const params = new URLSearchParams({ id: String(currentTrack.id) })
      if (excludedGenres.length > 0) params.set("excluded", excludedGenres.join(","))
      const res = await fetch(`/api/recommend?${params.toString()}`)
      const recs = await res.json()
      if (Array.isArray(recs) && recs.length > 0) addToPlaylist(recs)
    } catch {
      /* silent */
    }
  }, [currentTrack, isLiked, removeLike, addLike, excludedGenres, addToPlaylist])

  // ── Media Session API ─────────────────────────────────────────────────────
  // Signals to iOS/Android that audio is active → keeps playing in background
  // and on lock screen, and shows OS media controls.

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
        if (audioRef.current && d.seekTime != null)
          audioRef.current.currentTime = d.seekTime
      })
    } catch { /* seekto not supported on all browsers */ }
    return () => {
      ms.setActionHandler("play", null)
      ms.setActionHandler("pause", null)
      ms.setActionHandler("nexttrack", null)
      ms.setActionHandler("previoustrack", null)
      try { ms.setActionHandler("seekto", null) } catch { /* ignore */ }
    }
  }, [setIsPlaying, nextTrack, prevTrack])

  useEffect(() => {
    if (!("mediaSession" in navigator) || !duration) return
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: audioRef.current?.playbackRate ?? 1,
        position: Math.min(currentTime, duration),
      })
    } catch { /* ignore if not supported */ }
  }, [currentTime, duration])
  // ──────────────────────────────────────────────────────────────────────────

  const liked = currentTrack ? isLiked(currentTrack.id) : false
  const showSpinner = buffering && !streamError

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: "linear-gradient(to top, rgba(8,8,12,0.98) 60%, rgba(8,8,12,0.85))",
        backdropFilter: "blur(24px)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <audio ref={audioRef} preload="auto" />

      {currentTrack ? (
        <>
          {/* ── Mobile layout ── */}
          <div className="md:hidden px-3 py-2">
            {/* Progress bar */}
            <input
              type="range"
              min={0}
              max={duration || 0}
              value={currentTime}
              onChange={seek}
              className="progress-bar w-full mb-2"
              style={{
                background: `linear-gradient(to right, #ffffff ${duration ? (currentTime / duration) * 100 : 0}%, #282828 0%)`,
              }}
            />
            <div className="flex items-center gap-3">
              {/* Cover */}
              {currentTrack.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentTrack.coverUrl}
                  alt=""
                  className="w-10 h-10 rounded-lg object-cover shrink-0 ring-1 ring-white/10"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-lg shrink-0">
                  🎵
                </div>
              )}
              {/* Title */}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-white truncate">{currentTrack.title}</div>
                <div className="text-xs text-gray-400 truncate">{currentTrack.artist}</div>
              </div>
              {/* Controls */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleLike}
                  className={[
                    "text-lg transition-all active:scale-90",
                    liked ? "text-red-500" : "text-gray-500 hover:text-white",
                  ].join(" ")}
                >
                  {liked ? "♥" : "♡"}
                </button>
                <button
                  onClick={prevTrack}
                  className="text-gray-400 hover:text-white transition-colors text-lg"
                >
                  ⏮
                </button>
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center font-bold hover:scale-105 active:scale-95 transition-transform"
                >
                  {showSpinner ? (
                    <span className="block w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
                  ) : isPlaying ? "⏸" : "▶"}
                </button>
                <button
                  onClick={nextTrack}
                  className="text-gray-400 hover:text-white transition-colors text-lg"
                >
                  ⏭
                </button>
                <button
                  onClick={cycleRepeat}
                  title={repeatMode === "none" ? "Repeat off" : repeatMode === "all" ? "Repeat all" : "Repeat one"}
                  className={[
                    "text-sm transition-colors",
                    repeatMode === "none" ? "text-gray-600" : "text-white",
                  ].join(" ")}
                >
                  {repeatMode === "one" ? "↺1" : "↺"}
                </button>
              </div>
            </div>
            {streamError && (
              <p className="text-xs text-red-400 text-center mt-1">{streamError}</p>
            )}
          </div>

          {/* ── Desktop layout ── */}
          <div className="hidden md:flex max-w-screen-xl mx-auto items-center gap-4 px-4 py-3">
            {/* Track info */}
            <div className="flex items-center gap-3 w-56 shrink-0 min-w-0">
              {currentTrack.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentTrack.coverUrl}
                  alt=""
                  className="w-11 h-11 rounded-lg object-cover shrink-0 ring-1 ring-white/10"
                />
              ) : (
                <div className="w-11 h-11 rounded-lg bg-white/5 flex items-center justify-center text-xl shrink-0">
                  🎵
                </div>
              )}
              <div className="min-w-0">
                <div className="text-sm font-medium text-white truncate">{currentTrack.title}</div>
                <div className="text-xs text-gray-400 truncate">{currentTrack.artist}</div>
              </div>
            </div>

            {/* Center controls */}
            <div className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
              <div className="flex items-center gap-5">
                <button onClick={prevTrack} className="text-gray-400 hover:text-white transition-colors text-lg">
                  ⏮
                </button>
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center font-bold hover:scale-105 active:scale-95 transition-transform"
                >
                  {showSpinner ? (
                    <span className="block w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
                  ) : isPlaying ? "⏸" : "▶"}
                </button>
                <button onClick={nextTrack} className="text-gray-400 hover:text-white transition-colors text-lg">
                  ⏭
                </button>
                <button
                  onClick={cycleRepeat}
                  title={repeatMode === "none" ? "Repeat off" : repeatMode === "all" ? "Repeat all" : "Repeat one"}
                  className={[
                    "text-sm transition-colors",
                    repeatMode === "none" ? "text-gray-600 hover:text-gray-400" : "text-white",
                  ].join(" ")}
                >
                  {repeatMode === "one" ? "↺1" : "↺"}
                </button>
              </div>

              <div className="flex items-center gap-2 w-full max-w-md">
                <span className="text-xs text-gray-500 w-8 text-right tabular-nums">{fmt(currentTime)}</span>
                <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  value={currentTime}
                  onChange={seek}
                  className="progress-bar flex-1"
                  style={{
                    background: `linear-gradient(to right, #ffffff ${duration ? (currentTime / duration) * 100 : 0}%, #282828 0%)`,
                  }}
                />
                <span className="text-xs text-gray-500 w-8 tabular-nums">{fmt(duration)}</span>
              </div>

              {streamError && <p className="text-xs text-red-400 mt-0.5">{streamError}</p>}
            </div>

            {/* Like + Volume + Quality */}
            <div className="flex items-center gap-3 w-52 justify-end shrink-0">
              <button
                onClick={handleLike}
                title={liked ? "Unlike" : "Like · get more like this"}
                className={[
                  "text-xl transition-all active:scale-90",
                  liked ? "text-red-500 scale-110" : "text-gray-500 hover:text-white",
                ].join(" ")}
              >
                {liked ? "♥" : "♡"}
              </button>

              <div className="flex items-center gap-1.5">
                <span className="text-gray-500 text-xs">🔈</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => useStore.getState().setVolume(parseFloat(e.target.value))}
                  className="volume-bar w-16"
                />
              </div>

              <select
                value={streamQuality}
                onChange={(e) => useStore.getState().setStreamQuality(e.target.value)}
                title="Stream quality"
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
        </>
      ) : (
        <div className="text-center text-gray-600 text-sm py-4">
          Select a track to play
        </div>
      )}
    </div>
  )
}

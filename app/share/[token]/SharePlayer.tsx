"use client"

import { useRouter } from "next/navigation"
import { useStore } from "@/lib/store"
import type { Track } from "@/lib/types"

export default function SharePlayer({ initialTracks }: { initialTracks: Track[] }) {
  const router = useRouter()
  const { setPlaylist, setIsPlaying, setCurrentMood, setHasCompletedOnboarding } = useStore()

  const handlePlay = () => {
    if (initialTracks.length === 0) return
    setHasCompletedOnboarding(true)
    setCurrentMood("chill")
    setPlaylist(initialTracks)
    setIsPlaying(true)
    router.push("/player")
  }

  if (initialTracks.length === 0) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-3">
        <div className="text-5xl">🎵</div>
        <p className="text-gray-500 text-sm">Playlist not found or link expired.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-lg mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Shared playlist</h1>
          <p className="text-gray-500 text-sm mt-1">{initialTracks.length} tracks</p>
        </div>

        {/* Play button */}
        <button
          onClick={handlePlay}
          className="w-full py-3 rounded-xl bg-white text-black font-semibold text-sm mb-6 hover:bg-white/90 active:scale-[0.98] transition-all"
        >
          ▶ Play all in HiFi Mood
        </button>

        {/* Track list */}
        <div className="space-y-0.5">
          {initialTracks.map((track, i) => (
            <div
              key={`${track.id}-${i}`}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors"
            >
              {track.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={track.coverUrl}
                  alt=""
                  className="w-10 h-10 rounded-lg object-cover shrink-0 ring-1 ring-white/10"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0 text-lg">
                  🎵
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-white truncate">{track.title}</div>
                <div className="text-xs text-gray-400 truncate">
                  {track.artist}
                  {track.year ? <span className="text-gray-600"> · {track.year}</span> : null}
                </div>
              </div>
              <span className="text-xs text-gray-700 shrink-0 tabular-nums">
                {i + 1}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <p className="text-center text-gray-700 text-xs mt-8">Made with HiFi Mood</p>
      </div>
    </div>
  )
}

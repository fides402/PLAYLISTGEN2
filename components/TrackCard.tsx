"use client"

import { useStore } from "@/lib/store"
import type { Track } from "@/lib/types"

interface Props {
  track: Track
  isActive: boolean
  onClick: () => void
}

export function TrackCard({ track, isActive, onClick }: Props) {
  const isLiked = useStore((s) => s.isLiked(track.id))

  return (
    <button
      onClick={onClick}
      className={[
        "flex items-center gap-3 w-full px-3 py-2 text-left transition-colors",
        isActive
          ? "bg-white/8 border-l-2 border-white/60"
          : "hover:bg-white/4 border-l-2 border-transparent",
      ].join(" ")}
    >
      {/* Cover or placeholder */}
      {track.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={track.coverUrl}
          alt=""
          className="w-9 h-9 rounded object-cover shrink-0 ring-1 ring-white/10"
        />
      ) : (
        <div className="w-9 h-9 rounded bg-white/5 flex items-center justify-center text-base shrink-0">
          🎵
        </div>
      )}

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div
          className={[
            "text-xs font-medium truncate",
            isActive ? "text-white" : "text-gray-300",
          ].join(" ")}
        >
          {track.title}
        </div>
        <div className="text-xs text-gray-500 truncate">{track.artist}</div>
      </div>

      {/* Like indicator */}
      {isLiked && (
        <span className="text-red-500 text-xs shrink-0">♥</span>
      )}

      {/* Playing indicator */}
      {isActive && (
        <span className="text-white/60 text-xs shrink-0 animate-pulse">▶</span>
      )}
    </button>
  )
}

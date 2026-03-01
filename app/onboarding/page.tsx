"use client"

import { useRouter } from "next/navigation"
import { useStore } from "@/lib/store"
import { ALL_GENRES } from "@/lib/types"

export default function OnboardingPage() {
  const router = useRouter()
  const { excludedGenres, toggleGenre, setHasCompletedOnboarding } = useStore()

  const included = ALL_GENRES.filter((g) => !excludedGenres.includes(g))

  function handleContinue() {
    setHasCompletedOnboarding(true)
    router.push("/mood")
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16 animate-fadeup">
      {/* Logo / title */}
      <div className="mb-10 text-center">
        <div className="text-5xl mb-3">🎧</div>
        <h1 className="text-3xl font-bold text-white tracking-tight">
          HiFi Mood
        </h1>
        <p className="mt-3 text-gray-400 text-base max-w-sm">
          Tap the genres you{" "}
          <span className="text-purple-400 font-semibold">don&apos;t like</span>
          . Everything else will be used to build your playlists.
        </p>
      </div>

      {/* Genre grid */}
      <div className="flex flex-wrap gap-3 justify-center max-w-2xl">
        {ALL_GENRES.map((genre) => {
          const excluded = excludedGenres.includes(genre)
          return (
            <button
              key={genre}
              onClick={() => toggleGenre(genre)}
              className={[
                "px-4 py-2 rounded-full text-sm font-medium border transition-all duration-200 select-none",
                excluded
                  ? "bg-transparent border-gray-700 text-gray-600 line-through opacity-50"
                  : "bg-purple-950/60 border-purple-700 text-purple-100 hover:bg-purple-800/70 hover:border-purple-500",
              ].join(" ")}
            >
              {genre}
            </button>
          )
        })}
      </div>

      {/* Stats */}
      <p className="mt-8 text-sm text-gray-500">
        {included.length}{" "}
        <span className="text-purple-400 font-medium">genres selected</span> ·{" "}
        {excludedGenres.length} excluded
      </p>

      {/* CTA */}
      <button
        onClick={handleContinue}
        disabled={included.length === 0}
        className="mt-8 px-8 py-3 rounded-full bg-purple-600 hover:bg-purple-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold text-base transition-colors"
      >
        Start Listening →
      </button>

      {/* Reset link */}
      {excludedGenres.length > 0 && (
        <button
          onClick={() => useStore.getState().setExcludedGenres([])}
          className="mt-3 text-xs text-gray-600 hover:text-gray-400 underline transition-colors"
        >
          Reset all
        </button>
      )}
    </div>
  )
}

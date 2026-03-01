"use client"

import { useRouter } from "next/navigation"
import { useStore } from "@/lib/store"
import { useState } from "react"

export default function MoodPage() {
  const router = useRouter()
  const { setCurrentMood, setPlaylist, setIsPlaying, excludedGenres, setLastSearchQuery } = useStore()
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setLoading(true)
    try {
      const played = useStore.getState().playedTrackIds.slice(-150)
      const params = new URLSearchParams({ q })
      if (excludedGenres.length > 0) params.set("excluded", excludedGenres.join(","))
      if (played.length > 0) params.set("seen", played.join(","))
      const likedArtists = [...new Set(useStore.getState().likedTracks.map((t) => t.artist))].slice(0, 15)
      if (likedArtists.length > 0) params.set("liked", likedArtists.join(","))

      const res = await fetch(`/api/ai-search?${params.toString()}`)
      const tracks = await res.json()
      if (Array.isArray(tracks) && tracks.length > 0) {
        setLastSearchQuery(q)
        setPlaylist(tracks)
        setCurrentMood("chill")
        setIsPlaying(true)
        router.push("/player")
      }
    } catch {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16 animate-fadeup">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold text-white tracking-tight">
          What do you want to hear?
        </h1>
        <p className="mt-2 text-gray-400 text-sm">
          Describe a mood, genre, era, or anything.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-md flex flex-col gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. 70s Italian jazz, late night lo-fi, energetic punk…"
          autoFocus
          disabled={loading}
          className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-white/40 transition-colors disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="w-full py-3.5 rounded-2xl bg-white text-black font-semibold text-sm hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
              Building playlist…
            </>
          ) : (
            "Build playlist →"
          )}
        </button>
      </form>

      <button
        onClick={() => router.push("/onboarding")}
        className="mt-10 text-sm text-gray-600 hover:text-gray-400 underline transition-colors"
      >
        ← Edit genre preferences
      </button>
    </div>
  )
}

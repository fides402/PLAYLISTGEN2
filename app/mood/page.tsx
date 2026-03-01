"use client"

import { useRouter } from "next/navigation"
import { useStore } from "@/lib/store"
import { useState } from "react"
import { SearchForm } from "@/components/SearchForm"

export default function MoodPage() {
  const router = useRouter()
  const { setCurrentMood, setPlaylist, setIsPlaying, excludedGenres, setLastSearchQuery } = useStore()
  const [loading, setLoading] = useState(false)

  async function handleSearch(q: string) {
    if (!q.trim()) return
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
      // silent
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-start px-6 py-12 animate-fadeup overflow-y-auto">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-white tracking-tight">
          What do you want to hear?
        </h1>
        <p className="mt-2 text-gray-400 text-sm">
          Select genre, style, decade, country and mood.
        </p>
      </div>

      <div className="w-full max-w-lg pb-12">
        <SearchForm onSearch={handleSearch} isSearching={loading} />
      </div>

      <button
        onClick={() => router.push("/onboarding")}
        className="text-sm text-gray-600 hover:text-gray-400 underline transition-colors"
      >
        ← Edit genre preferences
      </button>
    </div>
  )
}

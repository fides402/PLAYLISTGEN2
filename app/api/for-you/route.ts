import { NextRequest, NextResponse } from "next/server"
import { getRecommendations } from "@/lib/monochrome"
import type { Track } from "@/lib/types"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const likedIds = (searchParams.get("liked") ?? "")
    .split(",").map(Number).filter(Boolean)
  const seenIds = new Set(
    (searchParams.get("seen") ?? "").split(",").map(Number).filter(Boolean)
  )

  if (likedIds.length === 0) return NextResponse.json([])

  // Seed from up to 5 random liked tracks
  const seeds = [...likedIds].sort(() => Math.random() - 0.5).slice(0, 5)
  const batches = await Promise.all(seeds.map((id) => getRecommendations(id)))

  const seen = new Set(seenIds)
  // Also exclude the liked tracks themselves
  for (const id of likedIds) seen.add(id)

  const out: Track[] = []
  for (const tracks of batches) {
    for (const t of tracks) {
      if (!seen.has(t.id)) {
        seen.add(t.id)
        out.push(t)
      }
    }
  }

  return NextResponse.json(out.slice(0, 40))
}

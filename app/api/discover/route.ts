/**
 * app/api/discover/route.ts — API per Graph Discovery (F1 + F2 + F3)
 *
 * GET /api/discover?q=<prompt>&seen=<ids>&userId=<id>&hop2=<bool>
 *
 * 1. Chiama planFromPrompt() per ottenere searchQueries + seeds + constraints
 * 2. Avvia graphDiscover() per il discovery multi-hop
 * 3. Restituisce le tracce rankate con rarityScore
 */

import { NextRequest, NextResponse } from "next/server"
import { planFromPrompt } from "@/lib/planner"
import { graphDiscover, toTracksWithMeta } from "@/lib/graphDiscovery"
import { searchTracks } from "@/lib/monochrome"
import {
  deriveUserProfile,
  deserializeProfile,
  type UserProfileStore,
  type SerializedUserProfile,
} from "@/lib/userProfile"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl

  const q = searchParams.get("q")?.trim()
  if (!q) return NextResponse.json({ error: "Missing q parameter" }, { status: 400 })

  const seenParam = searchParams.get("seen") || ""
  const seenIds = new Set<number>(
    seenParam ? seenParam.split(",").map(Number).filter(Boolean) : []
  )

  const userId = searchParams.get("userId") || "anonymous"
  const enableHop2 = searchParams.get("hop2") !== "false"
  const outputSize = Math.min(50, parseInt(searchParams.get("limit") || "30", 10))

  // Profilo utente opzionale (passato come JSON encodato in base64)
  let userProfile = undefined
  const profileParam = searchParams.get("profile")
  if (profileParam) {
    try {
      const decoded = JSON.parse(
        Buffer.from(profileParam, "base64").toString("utf-8")
      ) as SerializedUserProfile
      userProfile = deserializeProfile(decoded)
    } catch {
      // Ignora profilo invalido
    }
  }

  // Profilo da feedback store (alternativa)
  const feedbackParam = searchParams.get("feedback")
  if (!userProfile && feedbackParam) {
    try {
      const store = JSON.parse(
        Buffer.from(feedbackParam, "base64").toString("utf-8")
      ) as UserProfileStore
      userProfile = deriveUserProfile(userId, store)
    } catch {
      // Ignora store invalido
    }
  }

  try {
    // STEP 1: Planner — trasforma il prompt in un piano strutturato
    const plan = await planFromPrompt(q)

    // STEP 2: Search iniziale — fornisce candidati per il grafo
    const initialSearches = await Promise.allSettled(
      plan.searchQueries.slice(0, 3).map((query) => searchTracks(query))
    )
    const initialPool = initialSearches
      .filter((r): r is PromiseFulfilledResult<typeof r extends PromiseFulfilledResult<infer T> ? T : never> => r.status === "fulfilled")
      .flatMap((r) => r.value)

    // STEP 3: Graph Discovery multi-hop
    const result = await graphDiscover({
      plan,
      seenIds,
      userProfile,
      initialPool: toTracksWithMeta(initialPool),
      config: {
        enableHop2,
        outputSize,
        maxRequests: 40,
      },
    })

    return NextResponse.json({
      tracks: result.tracks,
      plan: {
        searchQueries: plan.searchQueries,
        constraints: plan.constraints,
        seedCount: plan.seedTracks.length,
        plannerType: plan.meta.plannerType,
      },
      meta: result.meta,
    })
  } catch (err) {
    console.error("[discover] Error:", err)
    return NextResponse.json({ error: "Discovery failed" }, { status: 500 })
  }
}

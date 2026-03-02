/**
 * app/api/feedback/route.ts — API per Feedback e Personalizzazione (F4)
 *
 * POST /api/feedback
 * Body: { userId, trackId, liked, bpm?, rarityScore?, artist, year? }
 * → Salva il feedback e restituisce il profilo aggiornato
 *
 * GET /api/feedback/profile?userId=<id>
 * → Restituisce il profilo serializzato dell'utente
 *
 * Il feedback è gestito lato client (Zustand) con questa route
 * per future integrazioni Supabase o altro backend.
 * Lato server mantiene un in-memory store (per sviluppo/demo).
 * In produzione collegare a database.
 */

import { NextRequest, NextResponse } from "next/server"
import {
  addFeedback,
  removeFeedback,
  deriveUserProfile,
  serializeProfile,
  createEmptyStore,
  type FeedbackEntry,
  type UserProfileStore,
} from "@/lib/userProfile"

// ─── In-memory store (dev/demo) ───────────────────────────────────────────────
// In produzione sostituire con Supabase o Redis

const inMemoryStores = new Map<string, UserProfileStore>()

function getStore(userId: string): UserProfileStore {
  if (!inMemoryStores.has(userId)) {
    inMemoryStores.set(userId, createEmptyStore())
  }
  return inMemoryStores.get(userId)!
}

// ─── POST /api/feedback ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      userId,
      trackId,
      liked,
      bpm,
      rarityScore,
      artist,
      year,
      remove,
    } = body as {
      userId?: string
      trackId?: number
      liked?: boolean
      bpm?: number
      rarityScore?: number
      artist?: string
      year?: number
      remove?: boolean
    }

    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 })
    }
    if (!trackId || typeof trackId !== "number") {
      return NextResponse.json({ error: "Missing trackId" }, { status: 400 })
    }

    let store = getStore(userId)

    if (remove) {
      // Rimuovi feedback
      store = removeFeedback(store, trackId)
    } else {
      if (typeof liked !== "boolean") {
        return NextResponse.json({ error: "Missing liked boolean" }, { status: 400 })
      }
      if (!artist || typeof artist !== "string") {
        return NextResponse.json({ error: "Missing artist" }, { status: 400 })
      }

      const entry: FeedbackEntry = {
        trackId,
        liked,
        timestamp: Date.now(),
        bpm,
        rarityScore,
        artist,
        year,
      }

      store = addFeedback(store, entry)
    }

    inMemoryStores.set(userId, store)

    // Deriva profilo aggiornato
    const profile = deriveUserProfile(userId, store)
    const serialized = serializeProfile(profile)

    return NextResponse.json({
      ok: true,
      profile: serialized,
      stats: profile.stats,
    })
  } catch (err) {
    console.error("[feedback POST]", err)
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }
}

// ─── GET /api/feedback/profile ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId")

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 })
  }

  const store = getStore(userId)
  const profile = deriveUserProfile(userId, store)
  const serialized = serializeProfile(profile)

  return NextResponse.json({
    profile: serialized,
    feedbackCount: store.feedback.length,
    lastUpdated: store.lastUpdated,
  })
}

// ─── DELETE /api/feedback ─────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId")
  const trackId = req.nextUrl.searchParams.get("trackId")

  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 })

  if (trackId) {
    const id = parseInt(trackId, 10)
    if (!isNaN(id)) {
      const store = getStore(userId)
      inMemoryStores.set(userId, removeFeedback(store, id))
    }
  } else {
    // Reset completo del profilo
    inMemoryStores.set(userId, createEmptyStore())
  }

  return NextResponse.json({ ok: true })
}

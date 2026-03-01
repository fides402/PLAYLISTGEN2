import { NextRequest, NextResponse } from "next/server"

// Likes are stored client-side (Zustand + localStorage).
// This route exists for future Supabase integration.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    return NextResponse.json({ ok: true, track: body })
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")
  return NextResponse.json({ ok: true, removed: id })
}

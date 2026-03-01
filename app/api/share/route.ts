import { NextRequest, NextResponse } from "next/server"
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs"
import { join } from "path"
import type { Track } from "@/lib/types"

const SHARES_DIR = join(process.cwd(), "data", "shares")

function ensureDir() {
  if (!existsSync(SHARES_DIR)) mkdirSync(SHARES_DIR, { recursive: true })
}

function genId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  let id = ""
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return id
}

// POST /api/share — save playlist, return short ID
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { tracks: Track[] }
    const tracks = body?.tracks
    if (!Array.isArray(tracks) || tracks.length === 0) {
      return NextResponse.json({ error: "No tracks" }, { status: 400 })
    }

    ensureDir()

    // Generate a unique 8-char alphanumeric ID
    let id = genId()
    let attempts = 0
    while (existsSync(join(SHARES_DIR, `${id}.json`)) && attempts < 20) {
      id = genId()
      attempts++
    }

    writeFileSync(join(SHARES_DIR, `${id}.json`), JSON.stringify(tracks), "utf-8")
    return NextResponse.json({ id })
  } catch (err) {
    console.error("[share] POST error:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// GET /api/share?id=xxx — retrieve playlist by ID
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? ""
  if (!/^[a-z0-9]{8}$/.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  }
  try {
    const file = join(SHARES_DIR, `${id}.json`)
    if (!existsSync(file)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    const tracks = JSON.parse(readFileSync(file, "utf-8")) as Track[]
    return NextResponse.json({ tracks })
  } catch (err) {
    console.error("[share] GET error:", err)
    return NextResponse.json({ error: "Read error" }, { status: 500 })
  }
}

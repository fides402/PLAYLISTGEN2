import { NextRequest, NextResponse } from "next/server"
import { getStreamManifest } from "@/lib/monochrome"
import type { StreamResult } from "@/lib/monochrome"

// Quality fallback chain — highest to lowest
// LOSSLESS / HI_RES often return DASH manifests which we cannot play;
// we automatically try the next lower quality until we find a direct (BTS) stream.
const QUALITY_CHAIN = ["HI_RES_LOSSLESS", "LOSSLESS", "HIGH", "LOW"] as const

async function getDirectStream(
  id: number,
  preferredQuality: string
): Promise<{ result: StreamResult; usedQuality: string } | null> {
  // Build fallback list starting from the preferred quality
  const startIdx = QUALITY_CHAIN.indexOf(preferredQuality as (typeof QUALITY_CHAIN)[number])
  const toTry: string[] =
    startIdx >= 0
      ? [...QUALITY_CHAIN.slice(startIdx)]
      : [preferredQuality, ...QUALITY_CHAIN]

  for (const q of toTry) {
    const result = await getStreamManifest(id, q)
    if (result && result.type === "direct") {
      return { result, usedQuality: q }
    }
  }
  return null
}

export async function GET(req: NextRequest) {
  const idParam = req.nextUrl.searchParams.get("id")
  const quality = req.nextUrl.searchParams.get("quality") || "HIGH"

  if (!idParam) {
    return new NextResponse("Missing id", { status: 400 })
  }

  const id = parseInt(idParam, 10)
  if (isNaN(id)) {
    return new NextResponse("Invalid id", { status: 400 })
  }

  const found = await getDirectStream(id, quality)

  if (!found) {
    // All quality levels returned DASH or null — nothing we can proxy
    return new NextResponse(
      "No playable stream found (all formats are DASH or unavailable)",
      { status: 501 }
    )
  }

  const { result, usedQuality } = found
  const audioUrl = result.url!
  const rangeHeader = req.headers.get("range")

  try {
    const upstream = await fetch(audioUrl, {
      headers: rangeHeader ? { Range: rangeHeader } : {},
    })

    const headers = new Headers()
    const ct =
      upstream.headers.get("Content-Type") || result.mimeType || "audio/mp4"
    headers.set("Content-Type", ct)
    headers.set("Accept-Ranges", "bytes")
    headers.set("Cache-Control", "no-store")
    // Let the player know which quality was actually used (useful for debugging)
    headers.set("X-Stream-Quality", usedQuality)

    const cl = upstream.headers.get("Content-Length")
    if (cl) headers.set("Content-Length", cl)

    const cr = upstream.headers.get("Content-Range")
    if (cr) headers.set("Content-Range", cr)

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    })
  } catch (err) {
    return new NextResponse(`Upstream fetch failed: ${err}`, { status: 502 })
  }
}

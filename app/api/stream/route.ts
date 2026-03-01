import { NextRequest, NextResponse } from "next/server"
import { getStreamManifest } from "@/lib/monochrome"

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

  const result = await getStreamManifest(id, quality)

  if (!result) {
    return new NextResponse("Could not retrieve stream manifest", { status: 502 })
  }

  if (result.type === "dash") {
    // DASH requires a full media player library — not yet supported
    return new NextResponse("DASH stream not supported in browser player", {
      status: 501,
    })
  }

  // BTS — proxy the audio so the browser avoids CORS issues with Tidal CDN
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

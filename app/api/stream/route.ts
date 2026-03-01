import { NextRequest, NextResponse } from "next/server"
import { getStreamManifest } from "@/lib/monochrome"
import type { StreamResult } from "@/lib/monochrome"

// Quality preference order — highest to lowest
const QUALITY_CHAIN = ["HI_RES_LOSSLESS", "LOSSLESS", "HIGH", "LOW"] as const
type Quality = (typeof QUALITY_CHAIN)[number]

// ─── Manifest resolution ──────────────────────────────────────────────────────

/**
 * Single-pass through the quality chain.
 * Returns the first direct (BTS) stream found, OR the best DASH manifest
 * encountered along the way as a fallback — whichever comes first.
 *
 * The quality preference stored in the client's Zustand store is NEVER
 * modified; fallback is purely server-side and per-request.
 */
async function getBestManifest(
  id: number,
  preferredQuality: string
): Promise<{ result: StreamResult; usedQuality: string; isDash: boolean } | null> {
  const startIdx = QUALITY_CHAIN.indexOf(preferredQuality as Quality)
  const toTry: string[] =
    startIdx >= 0
      ? [...QUALITY_CHAIN.slice(startIdx)]
      : [preferredQuality, ...QUALITY_CHAIN]

  let dashFallback: { result: StreamResult; usedQuality: string } | null = null

  for (const q of toTry) {
    const result = await getStreamManifest(id, q)
    if (!result) continue
    // Direct (BTS) stream → use immediately
    if (result.type === "direct") return { result, usedQuality: q, isDash: false }
    // DASH → keep as fallback (we'll proxy it if no direct stream exists)
    if (result.type === "dash" && !dashFallback) dashFallback = { result, usedQuality: q }
  }

  return dashFallback ? { ...dashFallback, isDash: true } : null
}

// ─── DASH segment extraction ─────────────────────────────────────────────────

/** Resolve a potentially relative URL against a base URL from <BaseURL>. */
function resolveUrl(href: string, base: string): string {
  if (!href) return ""
  if (href.startsWith("http://") || href.startsWith("https://")) return href
  if (!base) return href
  return base.replace(/\/?$/, "") + "/" + href.replace(/^\//, "")
}

/**
 * Parses a DASH manifest and returns an ordered list of segment URLs:
 * [initialization, seg1, seg2, …]
 *
 * Handles both SegmentList (Tidal FLAC) and SegmentTemplate styles.
 */
function extractDashSegments(manifest: string): string[] {
  // Optional BaseURL element (absolute prefix for relative hrefs)
  const baseMatch = manifest.match(/<BaseURL[^>]*>\s*(https?:\/\/[^\s<]+)\s*<\/BaseURL>/i)
  const base = baseMatch ? baseMatch[1].replace(/\/$/, "") : ""

  const urls: string[] = []

  // ── SegmentList style ─────────────────────────────────────────────────────
  const initMatch = manifest.match(/Initialization[^>]+sourceURL="([^"]+)"/i)
  if (initMatch?.[1]) urls.push(resolveUrl(initMatch[1], base))

  const segRe = /<SegmentURL[^>]+media="([^"]+)"/gi
  let m: RegExpExecArray | null
  while ((m = segRe.exec(manifest)) !== null) {
    urls.push(resolveUrl(m[1], base))
  }

  if (urls.length >= 2) return urls // SegmentList found → done

  // ── SegmentTemplate style ─────────────────────────────────────────────────
  const initTplMatch = manifest.match(/initialization="([^"]+)"/i)
  const mediaTplMatch = manifest.match(/\bmedia="([^"]+)"/i)

  if (initTplMatch && mediaTplMatch) {
    const repIdMatch = manifest.match(/<Representation[^>]+\bid="([^"]+)"/i)
    const repId = repIdMatch?.[1] ?? "0"
    const bwMatch = manifest.match(/<Representation[^>]+bandwidth="(\d+)"/i)
    const bw = bwMatch?.[1] ?? ""
    const startNumMatch = manifest.match(/startNumber="(\d+)"/i)
    const startNum = startNumMatch ? parseInt(startNumMatch[1]) : 1

    function applyTpl(tpl: string, n: number): string {
      return resolveUrl(tpl, base)
        .replace(/\$RepresentationID\$/g, repId)
        .replace(/\$Bandwidth\$/g, bw)
        .replace(/\$Number%0*(\d+)d\$/g, (_: string, len: string) =>
          String(n).padStart(parseInt(len), "0")
        )
        .replace(/\$Number\$/g, String(n))
    }

    // Initialization
    urls.push(applyTpl(initTplMatch[1], startNum))

    // Count total segments from <S> elements in SegmentTimeline
    let totalSegments = 0
    const sTags = manifest.match(/<S\b[^>]*/gi) ?? []
    for (const s of sTags) {
      const rMatch = s.match(/\br="(\d+)"/)
      totalSegments += rMatch ? parseInt(rMatch[1]) + 1 : 1
    }

    for (let i = 0; i < Math.min(totalSegments, 500); i++) {
      urls.push(applyTpl(mediaTplMatch[1], startNum + i))
    }
  }

  return urls.filter(Boolean)
}

/** Extract audio MIME type from DASH manifest AdaptationSet or Representation. */
function extractDashMime(manifest: string): string {
  const m =
    manifest.match(/AdaptationSet[^>]+mimeType="([^"]+)"/i) ||
    manifest.match(/Representation[^>]+mimeType="([^"]+)"/i)
  if (!m) return "audio/flac"
  const raw = m[1]
  // Normalise: audio/flac, audio/mp4, audio/aac…
  if (raw.includes("flac")) return "audio/flac"
  if (raw.includes("mp4")) return "audio/mp4"
  return raw
}

// ─── DASH streaming ───────────────────────────────────────────────────────────

/**
 * Creates a ReadableStream that fetches DASH segments in order and
 * yields their bytes concatenated — the browser receives a continuous
 * audio byte stream it can decode as FLAC or MP4.
 *
 * Seeking is not supported (no Content-Length / Accept-Ranges), but
 * playback from start works perfectly.
 */
function createDashStream(segmentUrls: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const url of segmentUrls) {
        try {
          const res = await fetch(url)
          if (!res.ok || !res.body) continue
          const reader = res.body.getReader()
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            controller.enqueue(value)
          }
        } catch {
          // Skip a failed segment and keep going — better than stopping entirely
        }
      }
      controller.close()
    },
  })
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const idParam = req.nextUrl.searchParams.get("id")
  const quality = req.nextUrl.searchParams.get("quality") || "HIGH"

  if (!idParam) return new NextResponse("Missing id", { status: 400 })
  const id = parseInt(idParam, 10)
  if (isNaN(id)) return new NextResponse("Invalid id", { status: 400 })

  const found = await getBestManifest(id, quality)

  if (!found) {
    return new NextResponse("Track unavailable", { status: 404 })
  }

  const { result, usedQuality, isDash } = found

  // ── Direct (BTS) stream ──────────────────────────────────────────────────
  if (!isDash) {
    const audioUrl = result.url!
    const rangeHeader = req.headers.get("range")
    try {
      const upstream = await fetch(audioUrl, {
        headers: rangeHeader ? { Range: rangeHeader } : {},
      })
      const headers = new Headers()
      headers.set(
        "Content-Type",
        upstream.headers.get("Content-Type") || result.mimeType || "audio/mp4"
      )
      headers.set("Accept-Ranges", "bytes")
      headers.set("Cache-Control", "no-store")
      headers.set("X-Stream-Quality", usedQuality)
      const cl = upstream.headers.get("Content-Length")
      if (cl) headers.set("Content-Length", cl)
      const cr = upstream.headers.get("Content-Range")
      if (cr) headers.set("Content-Range", cr)
      return new NextResponse(upstream.body, { status: upstream.status, headers })
    } catch (err) {
      return new NextResponse(`Upstream fetch failed: ${err}`, { status: 502 })
    }
  }

  // ── DASH proxy ───────────────────────────────────────────────────────────
  // Parse manifest, extract ordered segment URLs, stream concatenated bytes.
  const segments = extractDashSegments(result.manifest ?? "")
  if (segments.length === 0) {
    return new NextResponse("Could not parse DASH manifest", { status: 501 })
  }

  const mimeType = extractDashMime(result.manifest ?? "")
  const headers = new Headers()
  headers.set("Content-Type", mimeType)
  headers.set("Cache-Control", "no-store")
  headers.set("Accept-Ranges", "none") // Seeking not supported via DASH proxy
  headers.set("X-Stream-Quality", usedQuality + "-dash")

  return new NextResponse(createDashStream(segments), { status: 200, headers })
}

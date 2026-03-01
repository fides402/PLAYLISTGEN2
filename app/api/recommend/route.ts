import { NextRequest, NextResponse } from "next/server"
import { getRecommendations } from "@/lib/monochrome"

export async function GET(req: NextRequest) {
  const idParam = req.nextUrl.searchParams.get("id")

  if (!idParam) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  const id = parseInt(idParam, 10)
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  }

  const tracks = await getRecommendations(id)
  return NextResponse.json(tracks)
}

import { existsSync, readFileSync } from "fs"
import { join } from "path"
import SharePlayer from "./SharePlayer"
import type { Track } from "@/lib/types"

const SHARES_DIR = join(process.cwd(), "data", "shares")

function loadTracks(id: string): Track[] {
  if (!/^[a-z0-9]{8}$/.test(id)) return []
  try {
    const file = join(SHARES_DIR, `${id}.json`)
    if (!existsSync(file)) return []
    return JSON.parse(readFileSync(file, "utf-8")) as Track[]
  } catch {
    return []
  }
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const tracks = loadTracks(token)
  return <SharePlayer initialTracks={tracks} />
}

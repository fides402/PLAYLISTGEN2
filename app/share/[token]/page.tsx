import { decodePlaylist } from "@/lib/share"
import SharePlayer from "./SharePlayer"

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const tracks = decodePlaylist(token)
  return <SharePlayer initialTracks={tracks ?? []} />
}

"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useStore } from "@/lib/store"

export default function Home() {
  const router = useRouter()
  const hasCompletedOnboarding = useStore((s) => s.hasCompletedOnboarding)

  useEffect(() => {
    if (hasCompletedOnboarding) {
      router.replace("/mood")
    } else {
      router.replace("/onboarding")
    }
  }, [hasCompletedOnboarding, router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
    </div>
  )
}

"use client"

import { useState } from "react"
import { MOODS } from "@/lib/types"

// ─── Discogs genres ────────────────────────────────────────────────────────────
export const GENRES_UI = [
  { value: "Jazz",                    label: "Jazz" },
  { value: "Electronic",              label: "Electronic" },
  { value: "Hip Hop",                 label: "Hip Hop" },
  { value: "Rock",                    label: "Rock" },
  { value: "Funk / Soul",             label: "Funk / Soul" },
  { value: "Classical",               label: "Classical" },
  { value: "Blues",                   label: "Blues" },
  { value: "Folk, World, & Country",  label: "World / Folk" },
  { value: "Pop",                     label: "Pop" },
  { value: "Reggae",                  label: "Reggae" },
  { value: "Latin",                   label: "Latin" },
  { value: "Stage & Screen",          label: "Soundtrack / OST" },
]

// ─── Styles per genre (all major Discogs styles) ──────────────────────────────
export const GENRE_STYLES_UI: Record<string, string[]> = {
  "Jazz": [
    "Post Bop", "Modal", "Hard Bop", "Bebop", "Cool Jazz", "Free Jazz",
    "Fusion", "Bossa Nova", "Soul Jazz", "Jazz-Funk", "Latin Jazz",
    "Spiritual Jazz", "Avant-garde Jazz", "Contemporary Jazz",
    "Third Stream", "Swing", "Mainstream Jazz", "Progressive Jazz",
    "Chamber Jazz", "Free Improvisation",
  ],
  "Electronic": [
    "Downtempo", "Ambient", "House", "Deep House", "Techno", "IDM",
    "Drum n Bass", "Trip Hop", "Electro", "Minimal", "Synth-pop",
    "Dark Ambient", "Kosmische Musik", "Drone", "Glitch", "EBM",
    "New Wave", "Witch House", "Breakbeat", "Jungle", "Trance",
    "Acid", "Industrial", "Hauntology",
  ],
  "Hip Hop": [
    "Boom Bap", "Trap", "Abstract", "Jazz-Rap", "Conscious", "Underground",
    "G-Funk", "Lo-Fi", "East Coast", "West Coast", "Gangsta",
    "Alternative Hip Hop", "Hardcore Hip-Hop", "Crunk", "Chopped & Screwed",
  ],
  "Rock": [
    "Alternative Rock", "Indie Rock", "Psychedelic Rock", "Post-Rock",
    "Shoegaze", "Garage Rock", "Krautrock", "Hard Rock", "Progressive Rock",
    "Punk", "Noise Rock", "Math Rock", "Dream Pop", "Space Rock",
    "Stoner Rock", "Grunge", "New Wave", "Art Rock", "Slowcore",
    "Post-Punk", "Gothic Rock", "Dark Wave",
  ],
  "Funk / Soul": [
    "Funk", "Soul", "Neo Soul", "R&B", "Rare Groove", "Deep Funk",
    "Jazz-Funk", "Quiet Storm", "P.Funk", "Boogie", "Disco",
    "Contemporary R&B", "New Jack Swing", "Motown", "Northern Soul",
    "Deep Soul", "Southern Soul",
  ],
  "Classical": [
    "Baroque", "Romantic", "Contemporary", "Minimalism", "Neo-Classical",
    "Soundtrack", "Impressionist", "Chamber Music", "Expressionism",
    "Renaissance", "Orchestral", "String Quartet", "Opera", "Choral",
    "Neo-Romantic", "Serialism",
  ],
  "Blues": [
    "Delta Blues", "Electric Blues", "Chicago Blues", "Country Blues",
    "Soul Blues", "Boogie Woogie", "Acoustic Blues", "Blues Rock",
    "Piedmont Blues", "Swamp Blues", "Jump Blues", "Texas Blues",
  ],
  "Folk, World, & Country": [
    "Folk", "Americana", "Celtic", "Bluegrass", "World Fusion", "African",
    "Country", "Old-Time", "Indie Folk", "Dark Folk", "Freak Folk",
    "Appalachian", "Balkan", "Middle Eastern", "Indian Classical",
    "Afrobeat", "Highlife", "Cumbia", "Flamenco", "Nordic",
  ],
  "Pop": [
    "Synth-pop", "Dream Pop", "Baroque Pop", "Art Pop", "Chamber Pop",
    "Indie Pop", "Sophisti-Pop", "Dance-pop", "Electropop",
    "Bubblegum", "Twee Pop", "Power Pop", "C-Pop", "K-Pop",
    "Minimal Wave", "Cold Wave",
  ],
  "Reggae": [
    "Roots Reggae", "Dub", "Dancehall", "Ska", "Rocksteady",
    "Lovers Rock", "Nyahbinghi", "Conscious", "Ragga",
  ],
  "Latin": [
    "Bossa Nova", "Salsa", "Latin Jazz", "Cumbia", "Tango", "Bolero",
    "Merengue", "Son", "Nueva Canción", "Flamenco", "Mambo",
    "Samba", "Baile Funk", "Tropical",
  ],
  "Stage & Screen": [
    "Soundtrack", "Score", "Musical Theatre", "TV", "Video Game Music",
    "Library Music", "Exploitation", "Lounge",
  ],
}

// ─── Decades ──────────────────────────────────────────────────────────────────
export const DECADE_OPTIONS = [
  { label: "Any decade", from: "", to: "" },
  { label: "1950s",      from: "1950", to: "1959" },
  { label: "1960s",      from: "1960", to: "1969" },
  { label: "1970s",      from: "1970", to: "1979" },
  { label: "1980s",      from: "1980", to: "1989" },
  { label: "1990s",      from: "1990", to: "1999" },
  { label: "2000s",      from: "2000", to: "2009" },
  { label: "2010s",      from: "2010", to: "2019" },
  { label: "2020s",      from: "2020", to: "2025" },
]

// ─── Countries ────────────────────────────────────────────────────────────────
export const COUNTRIES_UI = [
  "Italy", "United States", "United Kingdom", "Germany", "France",
  "Japan", "Brazil", "Jamaica", "Sweden", "Nigeria", "Argentina",
  "Cuba", "Spain", "Portugal", "South Africa", "South Korea",
  "Greece", "Australia", "Canada", "Mexico", "Colombia", "Norway",
]

// ─── Component ────────────────────────────────────────────────────────────────
interface SearchFormProps {
  onSearch: (q: string) => void
  isSearching: boolean
  /** compact=true for sidebar; compact=false (default) for full-page */
  compact?: boolean
}

export function SearchForm({ onSearch, isSearching, compact = false }: SearchFormProps) {
  const [genre,   setGenre]   = useState("")
  const [style,   setStyle]   = useState("")
  const [decade,  setDecade]  = useState(0)
  const [country, setCountry] = useState("")
  const [mood,    setMood]    = useState("")

  const availableStyles = genre ? (GENRE_STYLES_UI[genre] ?? []) : []

  function toggleGenre(g: string) {
    setGenre(genre === g ? "" : g)
    setStyle("")
  }

  function buildQuery() {
    const parts: string[] = []
    if (style)   parts.push(style)
    if (genre)   parts.push(genre)
    if (country) parts.push(country)
    const dec = DECADE_OPTIONS[decade]
    if (dec.from) parts.push(`${dec.from}-${dec.to}`)
    if (mood)    parts.push(mood)
    return parts.join(" ").trim()
  }

  const canSearch = !!(genre || style || mood)

  function reset() {
    setGenre(""); setStyle(""); setDecade(0); setCountry(""); setMood("")
  }

  const chipBase =
    "rounded-md font-medium border transition-all " +
    (compact ? "px-2 py-1 text-[10px]" : "px-2.5 py-1 text-xs")

  function chip(active: boolean, subtle?: boolean) {
    return [
      chipBase,
      active
        ? subtle
          ? "bg-white/15 text-white border-white/40"
          : "bg-white text-black border-white"
        : "text-gray-500 border-white/10 hover:border-white/25 hover:text-gray-300",
    ].join(" ")
  }

  const labelCls = (compact ? "text-[10px]" : "text-xs") +
    " text-gray-600 uppercase tracking-widest font-medium mb-1.5 block"

  const selectCls =
    "w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 " +
    (compact ? "text-xs" : "text-sm") +
    " text-white focus:outline-none focus:border-white/30 transition-colors"

  const gap = compact ? "space-y-3" : "space-y-4"

  return (
    <div className={gap}>

      {/* ── Genre ── */}
      <div>
        <span className={labelCls}>Genre</span>
        <div className="flex flex-wrap gap-1">
          {GENRES_UI.map((g) => (
            <button key={g.value} onClick={() => toggleGenre(g.value)} className={chip(genre === g.value)}>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Style (appears after genre selection) ── */}
      {availableStyles.length > 0 && (
        <div>
          <span className={labelCls}>Style</span>
          <div className="flex flex-wrap gap-1">
            {availableStyles.map((s) => (
              <button key={s} onClick={() => setStyle(style === s ? "" : s)} className={chip(style === s, true)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Decade + Country ── */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className={labelCls}>Decade</span>
          <select value={decade} onChange={(e) => setDecade(Number(e.target.value))} className={selectCls}>
            {DECADE_OPTIONS.map((d, i) => (
              <option key={i} value={i}>{d.label}</option>
            ))}
          </select>
        </div>
        <div>
          <span className={labelCls}>Country</span>
          <select value={country} onChange={(e) => setCountry(e.target.value)} className={selectCls}>
            <option value="">Any</option>
            {COUNTRIES_UI.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Mood ── */}
      <div>
        <span className={labelCls}>Mood</span>
        <div className="flex gap-1">
          {MOODS.map((m) => (
            <button
              key={m.id}
              onClick={() => setMood(mood === m.id ? "" : m.id)}
              title={m.label}
              className={[
                "flex-1 rounded-md border transition-all flex flex-col items-center gap-px",
                compact ? "py-1.5" : "py-2",
                mood === m.id
                  ? "bg-white/15 border-white/40 text-white"
                  : "border-white/8 text-gray-600 hover:border-white/20 hover:text-gray-400",
              ].join(" ")}
            >
              <span className={compact ? "text-sm leading-none" : "text-base leading-none"}>{m.emoji}</span>
              <span className={compact ? "text-[8px] leading-none" : "text-[10px] leading-none"}>{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="flex gap-1.5">
        <button
          onClick={() => { const q = buildQuery(); if (q) onSearch(q) }}
          disabled={isSearching || !canSearch}
          className={[
            "flex-1 bg-white text-black font-semibold disabled:opacity-30 hover:bg-white/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2",
            compact
              ? "py-2 text-xs rounded-lg"
              : "py-3.5 text-sm rounded-2xl",
          ].join(" ")}
        >
          {isSearching ? (
            <span className={`block rounded-full border-2 border-black border-t-transparent animate-spin ${compact ? "w-3.5 h-3.5" : "w-4 h-4"}`} />
          ) : (
            compact ? "▶ Generate playlist" : "Build playlist →"
          )}
        </button>
        {canSearch && (
          <button
            onClick={reset}
            className={[
              "border border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20 transition-all rounded-lg",
              compact ? "px-2.5 py-2 text-xs" : "px-3 py-3 text-sm",
            ].join(" ")}
          >✕</button>
        )}
      </div>
    </div>
  )
}

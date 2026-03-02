/**
 * lib/planner.ts — FUNZIONALITÀ 1: LLM Planner
 *
 * Trasforma il testo utente in:
 *  a) 2-5 query di ricerca
 *  b) 3-8 seed track candidate
 *  c) vincoli musicali (bpm range, mood, anni, paese, strumenti)
 *
 * Esporta: planFromPrompt(prompt): Promise<Plan>
 * Se OPENAI_API_KEY o GROQ_API_KEY sono presenti, usa LLM reale.
 * Altrimenti usa il mock rule-based.
 */

import { z } from "zod"
import type { Mood } from "./types"
import { MOODS } from "./types"

export const MusicalConstraintsSchema = z.object({
  bpmMin: z.number().int().min(40).max(220).optional(),
  bpmMax: z.number().int().min(40).max(220).optional(),
  mood: z.enum(["chill", "energetic", "focus", "melancholic", "upbeat"]).optional(),
  yearMin: z.number().int().min(1900).max(2100).optional(),
  yearMax: z.number().int().min(1900).max(2100).optional(),
  country: z.string().max(60).optional(),
  instruments: z.array(z.string()).max(10).optional(),
  keywords: z.array(z.string()).max(20).optional(),
})

export const SeedTrackSchema = z.object({
  ref: z.string(),
  artist: z.string(),
  title: z.string(),
  estimatedRarity: z.number().min(0).max(1).default(0.5),
  reason: z.string().optional(),
})

export const PlanSchema = z.object({
  searchQueries: z.array(z.string()).min(2).max(5),
  seedTracks: z.array(SeedTrackSchema).min(3).max(8),
  constraints: MusicalConstraintsSchema,
  meta: z.object({
    rawPrompt: z.string(),
    plannerType: z.enum(["llm-openai", "llm-groq", "mock"]),
    generatedAt: z.string(),
  }),
})

export type MusicalConstraints = z.infer<typeof MusicalConstraintsSchema>
export type SeedTrack = z.infer<typeof SeedTrackSchema>
export type Plan = z.infer<typeof PlanSchema>

const KEYWORD_RULES: Array<{ pattern: RegExp; mood: Mood; genres: string[]; instruments: string[] }> = [
  { pattern: /jazz|bebop|swing|blues/i, mood: "chill", genres: ["jazz", "bebop", "cool jazz"], instruments: ["saxophone", "trumpet", "piano", "double bass"] },
  { pattern: /classical|orchestra|symphony|baroque/i, mood: "focus", genres: ["classical", "orchestral"], instruments: ["violin", "piano", "cello"] },
  { pattern: /electronic|techno|house|edm|synth/i, mood: "energetic", genres: ["electronic", "techno", "house"], instruments: ["synthesizer", "drum machine"] },
  { pattern: /hip.?hop|rap|trap|boom.?bap/i, mood: "energetic", genres: ["hip hop", "rap", "boom bap"], instruments: ["drum machine", "sampler"] },
  { pattern: /ambient|drone|atmospheric|meditat/i, mood: "chill", genres: ["ambient", "drone"], instruments: ["synthesizer", "piano"] },
  { pattern: /rock|punk|metal|grunge|indie/i, mood: "energetic", genres: ["rock", "indie rock"], instruments: ["electric guitar", "drums"] },
  { pattern: /folk|acoustic|singer.?songwriter|country/i, mood: "chill", genres: ["folk", "acoustic"], instruments: ["acoustic guitar", "banjo"] },
  { pattern: /soul|funk|r&b|motown|gospel/i, mood: "upbeat", genres: ["soul", "funk", "r&b"], instruments: ["organ", "brass section"] },
  { pattern: /latin|bossa|samba|salsa|flamenco/i, mood: "upbeat", genres: ["latin", "bossa nova"], instruments: ["guitar", "percussion"] },
  { pattern: /lo.?fi|chill.?hop|bedroom|vaporwave/i, mood: "chill", genres: ["lo-fi", "chill hop"], instruments: ["sampler", "piano"] },
  { pattern: /sad|melanchol|dark|introspect/i, mood: "melancholic", genres: ["post-rock", "ambient"], instruments: ["piano", "strings"] },
]

const YEAR_PATTERNS: Array<{ pattern: RegExp; extractor: (m: RegExpMatchArray) => { min?: number; max?: number } }> = [
  { pattern: /anni[s]+'?(d{2})|years?[s]+'?(d{2})/i, extractor: (m) => { const d = parseInt(m[1] || m[2]); const b = d < 30 ? 2000 : 1900; return { min: b + d, max: b + d + 9 } } },
  { pattern: /(d{4})s*[-–]s*(d{4})/, extractor: (m) => ({ min: parseInt(m[1]), max: parseInt(m[2]) }) },
  { pattern: /dals+(d{4})|sinces+(d{4})|froms+(d{4})/i, extractor: (m) => ({ min: parseInt(m[1] || m[2] || m[3]) }) },
  { pattern: /(d{4})s/, extractor: (m) => ({ min: parseInt(m[1]), max: parseInt(m[1]) + 9 }) },
]

const COUNTRY_PATTERNS: Array<{ pattern: RegExp; country: string }> = [
  { pattern: /italian|italiano|itali/i, country: "Italy" },
  { pattern: /french|francese/i, country: "France" },
  { pattern: /german|tedesco/i, country: "Germany" },
  { pattern: /brazil|brasileir/i, country: "Brazil" },
  { pattern: /american|statuniten/i, country: "US" },
  { pattern: /british|inglese|uk/i, country: "UK" },
  { pattern: /japanese|giapponese/i, country: "Japan" },
  { pattern: /swedish|svedese/i, country: "Sweden" },
  { pattern: /spanish|spagnolo/i, country: "Spain" },
]

const GENRE_SEEDS: Record<string, Array<{ artist: string; title: string; rarity: number }>> = {
  jazz: [
    { artist: "Sun Ra", title: "Space Is the Place", rarity: 0.75 },
    { artist: "Pharoah Sanders", title: "The Creator Has a Master Plan", rarity: 0.70 },
    { artist: "Albert Ayler", title: "Ghosts", rarity: 0.80 },
    { artist: "Mal Waldron", title: "Soul Eyes", rarity: 0.65 },
  ],
  electronic: [
    { artist: "Boards of Canada", title: "Roygbiv", rarity: 0.60 },
    { artist: "Burial", title: "Archangel", rarity: 0.65 },
    { artist: "Actress", title: "IWAAD", rarity: 0.80 },
    { artist: "Basic Channel", title: "Phylyps Trak", rarity: 0.82 },
  ],
  "hip hop": [
    { artist: "Mach-Hommy", title: "Wap Wap Wap", rarity: 0.85 },
    { artist: "Boldy James", title: "Scrape It Off", rarity: 0.75 },
    { artist: "Roc Marciano", title: "Emeralds", rarity: 0.70 },
    { artist: "Your Old Droog", title: "Dump Dump", rarity: 0.72 },
  ],
  rock: [
    { artist: "Slint", title: "Good Morning, Captain", rarity: 0.75 },
    { artist: "The Jesus Lizard", title: "Mouth Breather", rarity: 0.78 },
    { artist: "Fugazi", title: "Waiting Room", rarity: 0.60 },
  ],
  classical: [
    { artist: "Morton Feldman", title: "Palais de Mari", rarity: 0.82 },
    { artist: "Arvo Part", title: "Spiegel im Spiegel", rarity: 0.65 },
    { artist: "John Adams", title: "Shaker Loops", rarity: 0.70 },
  ],
  ambient: [
    { artist: "William Basinski", title: "Disintegration Loop 1.1", rarity: 0.85 },
    { artist: "Stars of the Lid", title: "Requiem for Dying Mothers", rarity: 0.82 },
    { artist: "Tim Hecker", title: "Hatred of Music I", rarity: 0.75 },
  ],
  soul: [
    { artist: "Donny Hathaway", title: "A Song for You", rarity: 0.55 },
    { artist: "Bill Withers", title: "Grandma's Hands", rarity: 0.50 },
  ],
  folk: [
    { artist: "John Fahey", title: "Sunflower River Blues", rarity: 0.75 },
    { artist: "Bert Jansch", title: "Blackwaterside", rarity: 0.72 },
    { artist: "Nick Drake", title: "Which Will", rarity: 0.65 },
  ],
}

const DEFAULT_SEEDS = [
  { artist: "Talk Talk", title: "Ascension Day", rarity: 0.72 },
  { artist: "Scott Walker", title: "Farmer in the City", rarity: 0.80 },
  { artist: "Moondog", title: "Bird's Lament", rarity: 0.78 },
  { artist: "Arthur Russell", title: "A Little Lost", rarity: 0.75 },
]

function generateSearchQueries(prompt: string): string[] {
  const queries: string[] = [prompt.trim()]
  const stopwords = new Set(["the", "and", "for", "with", "that", "this", "from", "have", "una", "del", "con", "per", "che", "non", "degli"])
  const words = prompt.toLowerCase().replace(/[^a-zA-ZÀ-ÿ0-9s]/g, " ").split(/s+/).filter((w) => w.length > 3 && !stopwords.has(w)).slice(0, 4)
  if (words.length >= 2) queries.push(words.slice(0, 2).join(" "))
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(prompt)) { queries.push((rule.genres[0] + " " + (words[0] || "")).trim()); break }
  }
  for (const yp of YEAR_PATTERNS) {
    const m = prompt.match(yp.pattern)
    if (m) { const r = yp.extractor(m); if (r.min) queries.push(`music ${r.min}s discovery`); break }
  }
  return [...new Set(queries)].slice(0, 5)
}

function generateSeedTracks(prompt: string): SeedTrack[] {
  let matchedGenre: string | null = null
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(prompt)) {
      for (const key of Object.keys(GENRE_SEEDS)) {
        if (rule.genres.some((g) => g.toLowerCase().includes(key))) { matchedGenre = key; break }
      }
      break
    }
  }
  const pool = matchedGenre ? [...(GENRE_SEEDS[matchedGenre] || []), ...DEFAULT_SEEDS] : DEFAULT_SEEDS
  return pool.sort((a, b) => b.rarity - a.rarity).slice(0, 6).map((s) => ({
    ref: `${s.artist} - ${s.title}`,
    artist: s.artist,
    title: s.title,
    estimatedRarity: s.rarity,
    reason: `Seed rule-based per "${matchedGenre || "discovery"}"`,
  }))
}

function extractConstraints(prompt: string): MusicalConstraints {
  const c: MusicalConstraints = {}
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(prompt)) {
      c.mood = rule.mood
      c.instruments = rule.instruments
      const moodCfg = MOODS.find((m) => m.id === c.mood)
      if (moodCfg) { c.bpmMin = moodCfg.bpmRange[0]; c.bpmMax = moodCfg.bpmRange[1] }
      break
    }
  }
  const bpmMatch = prompt.match(/(d{2,3})s*(?:bpm|BPM)/)
  if (bpmMatch) { const bpm = parseInt(bpmMatch[1]); c.bpmMin = Math.max(40, bpm - 15); c.bpmMax = Math.min(220, bpm + 15) }
  for (const yp of YEAR_PATTERNS) {
    const m = prompt.match(yp.pattern)
    if (m) { const r = yp.extractor(m); if (r.min) c.yearMin = r.min; if (r.max) c.yearMax = r.max; break }
  }
  for (const cp of COUNTRY_PATTERNS) {
    if (cp.pattern.test(prompt)) { c.country = cp.country; break }
  }
  c.keywords = prompt.toLowerCase().replace(/[^a-zA-ZÀ-ÿ0-9s]/g, " ").split(/s+/).filter((w) => w.length > 3).slice(0, 10)
  return c
}

const LLM_SYSTEM = `You are a music discovery expert. Given a prompt, return JSON:
{"searchQueries":["q1","q2"],"seedTracks":[{"ref":"A - T","artist":"A","title":"T","estimatedRarity":0.8,"reason":"..."}],"constraints":{"bpmMin":70,"bpmMax":110,"mood":"chill","yearMin":1970,"yearMax":1985}}
Prefer RARE tracks (estimatedRarity>0.6). 2-5 queries, 3-8 seeds.`

async function planFromPromptLLM(prompt: string, apiKey: string, provider: "openai" | "groq"): Promise<Plan | null> {
  try {
    const url = provider === "openai" ? "https://api.openai.com/v1/chat/completions" : "https://api.groq.com/openai/v1/chat/completions"
    const model = provider === "openai" ? "gpt-4o-mini" : "llama-3.3-70b-versatile"
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "system", content: LLM_SYSTEM }, { role: "user", content: prompt }], temperature: 0.4, max_tokens: 800, response_format: { type: "json_object" } }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}")
    return PlanSchema.parse({ ...parsed, meta: { rawPrompt: prompt, plannerType: provider === "openai" ? "llm-openai" : "llm-groq", generatedAt: new Date().toISOString() } })
  } catch { return null }
}

/**
 * planFromPrompt(prompt): Promise<Plan>
 * 1. OpenAI GPT-4o-mini se OPENAI_API_KEY
 * 2. Groq llama-3.3-70b se GROQ_API_KEY
 * 3. Mock rule-based fallback
 */
export async function planFromPrompt(prompt: string): Promise<Plan> {
  const openaiKey = process.env.OPENAI_API_KEY
  const groqKey = process.env.GROQ_API_KEY
  if (openaiKey) { const p = await planFromPromptLLM(prompt, openaiKey, "openai"); if (p) return p }
  if (groqKey) { const p = await planFromPromptLLM(prompt, groqKey, "groq"); if (p) return p }
  const constraints = extractConstraints(prompt)
  const searchQueries = generateSearchQueries(prompt)
  const seedTracks = generateSeedTracks(prompt)
  return PlanSchema.parse({ searchQueries, seedTracks, constraints, meta: { rawPrompt: prompt, plannerType: "mock", generatedAt: new Date().toISOString() } })
}

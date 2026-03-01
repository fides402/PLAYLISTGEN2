import type { Mood } from "./types"

const DISCOGS_URL = "https://api.discogs.com"
const TOKEN = process.env.DISCOGS_TOKEN

// ─── Map our genre labels → Discogs genre field ────────────────────────────
const GENRE_TO_DISCOGS: Record<string, string> = {
  Jazz:         "Jazz",
  Electronic:   "Electronic",
  "Hip Hop":    "Hip Hop",
  House:        "Electronic",
  Techno:       "Electronic",
  Rock:         "Rock",
  Alternative:  "Rock",
  Soul:         "Funk / Soul",
  "R&B":        "Funk / Soul",
  Funk:         "Funk / Soul",
  Ambient:      "Electronic",
  "Lo-fi":      "Electronic",
  Indie:        "Rock",
  Classical:    "Classical",
  Blues:        "Blues",
  Folk:         "Folk, World, & Country",
  Pop:          "Pop",
  Dance:        "Electronic",
  Metal:        "Rock",
  Punk:         "Rock",
  Reggae:       "Reggae",
  Latin:        "Latin",
  Gospel:       "Funk / Soul",
  Country:      "Folk, World, & Country",
  "New Age":    "Electronic",
  World:        "Folk, World, & Country",
}

// ─── Niche / underground styles per genre + mood ───────────────────────────
// Deliberately specific so we surface lesser-known records, not chart hits.
const GENRE_MOOD_STYLES: Record<string, Record<string, string[]>> = {
  Jazz: {
    chill:      ["Modal", "Post Bop", "Third Stream", "Cool Jazz", "Spiritual Jazz", "Bossa Nova"],
    energetic:  ["Hard Bop", "Bebop", "Latin Jazz", "Jazz-Funk"],
    focus:      ["Contemporary Jazz", "Fusion", "Modal", "Free Improvisation"],
    melancholic:["Free Jazz", "Avant-garde Jazz", "Contemporary Jazz", "Chamber Jazz"],
    upbeat:     ["Soul Jazz", "Latin Jazz", "Jazz-Funk", "Swing"],
  },
  Electronic: {
    chill:      ["Downtempo", "Trip Hop", "Chillwave", "Balearic", "Leftfield", "Synth-pop", "Kosmische Musik"],
    energetic:  ["Drum n Bass", "Jungle", "Industrial", "Gabber", "Breakbeat", "Electro"],
    focus:      ["IDM", "Minimal", "Drone", "Glitch", "Microsound"],
    melancholic:["Dark Ambient", "EBM", "Illbient", "Witch House", "Hauntology"],
    upbeat:     ["Italo-Disco", "Electro", "Nu-Disco", "Eurobeat", "Hi NRG", "Acid"],
  },
  "Hip Hop": {
    chill:      ["Abstract", "Lo-Fi", "Jazz-Rap", "Underground"],
    energetic:  ["Hardcore Hip-Hop", "East Coast", "Crunk", "Hyphy"],
    focus:      ["Abstract", "Conscious", "Jazz-Rap", "Boom Bap"],
    melancholic:["Alternative Hip Hop", "Abstract", "Emo Rap"],
    upbeat:     ["G-Funk", "Bounce", "Party Rap", "Turntablism"],
  },
  House: {
    chill:      ["Deep House", "Garage House", "Proto-House", "Soulful House"],
    energetic:  ["Acid House", "Tribal", "Hard House", "Progressive House"],
    focus:      ["Deep House", "Minimal Techno", "Microhouse", "Dub Techno"],
    melancholic:["Deep House", "Proto-House"],
    upbeat:     ["Chicago House", "Afro House", "Funky House", "Acid House"],
  },
  Techno: {
    chill:      ["Detroit Techno", "Ambient Techno", "Dub Techno", "Minimal Techno"],
    energetic:  ["Hard Techno", "Acid Techno", "Industrial Techno", "Schranz"],
    focus:      ["Minimal Techno", "Microhouse", "Detroit Techno"],
    melancholic:["Dub Techno", "Isolationism", "Dark Techno"],
    upbeat:     ["Acid Techno", "Rave", "Industrial"],
  },
  Rock: {
    chill:      ["Psychedelic Rock", "Dream Pop", "Shoegaze", "Space Rock", "Krautrock"],
    energetic:  ["Hard Rock", "Garage Rock", "Noise Rock", "Stoner Rock"],
    focus:      ["Post-Rock", "Math Rock", "Art Rock", "Krautrock"],
    melancholic:["Shoegaze", "Post-Rock", "Gothic Rock", "Slowcore", "Sadcore"],
    upbeat:     ["Power Pop", "Glam Rock", "Pub Rock", "New Wave"],
  },
  Alternative: {
    chill:      ["Dream Pop", "Shoegaze", "Lo-Fi", "Slowcore", "Indie Pop"],
    energetic:  ["Noise Rock", "Post-Hardcore", "Grunge", "No Wave"],
    focus:      ["Post-Rock", "Math Rock", "Experimental", "Art Rock"],
    melancholic:["Shoegaze", "Sadcore", "Dark Wave", "Cold Wave"],
    upbeat:     ["Indie Pop", "New Wave", "Power Pop", "Twee Pop"],
  },
  Soul: {
    chill:      ["Neo Soul", "Quiet Storm", "Rare Groove", "Deep Funk"],
    energetic:  ["Northern Soul", "Deep Funk", "Crossover"],
    focus:      ["Neo Soul", "Jazz-Funk", "Rare Groove"],
    melancholic:["Soul Blues", "Deep Soul", "Southern Soul"],
    upbeat:     ["Funk", "Disco", "Boogie", "Motown"],
  },
  "R&B": {
    chill:      ["Neo Soul", "Quiet Storm", "Contemporary R&B"],
    energetic:  ["New Jack Swing", "Funk", "Go-Go"],
    focus:      ["Neo Soul", "Contemporary R&B"],
    melancholic:["Soul", "Ballad", "Deep Soul"],
    upbeat:     ["New Jack Swing", "Boogie", "Contemporary R&B"],
  },
  Funk: {
    chill:      ["Jazz-Funk", "Deep Funk", "Rare Groove"],
    energetic:  ["P.Funk", "Boogie", "Afrobeat"],
    focus:      ["Jazz-Funk", "Fusion", "Rare Groove"],
    melancholic:["Soul", "Deep Funk"],
    upbeat:     ["P.Funk", "Boogie", "Disco", "Electro Funk"],
  },
  Ambient: {
    chill:      ["Drone", "New Age", "Kosmische Musik", "Space", "Isolationism"],
    energetic:  ["Ambient Techno", "Noise", "Industrial"],
    focus:      ["Drone", "Minimalism", "Isolationism", "New Age"],
    melancholic:["Dark Ambient", "Drone", "Hauntology"],
    upbeat:     ["Kosmische Musik", "Space", "Chillwave"],
  },
  "Lo-fi": {
    chill:      ["Bedroom Pop", "Cassette Culture", "Home Recording", "Slacker"],
    energetic:  ["Noise Rock", "Lo-Fi", "Garage Rock"],
    focus:      ["Bedroom Pop", "Instrumental", "Home Recording"],
    melancholic:["Bedroom Pop", "Sadcore", "Slacker"],
    upbeat:     ["Bedroom Pop", "Twee Pop", "Indiepop"],
  },
  Indie: {
    chill:      ["Dream Pop", "Bedroom Pop", "Slowcore", "Twee Pop"],
    energetic:  ["Indie Rock", "Garage Rock", "Post-Punk Revival"],
    focus:      ["Post-Rock", "Math Rock", "Indie Folk"],
    melancholic:["Shoegaze", "Sadcore", "Slowcore", "Dark Folk"],
    upbeat:     ["Indie Pop", "Twee Pop", "New Wave"],
  },
  Classical: {
    chill:      ["Impressionist", "Romantic", "Baroque", "Chamber Music"],
    energetic:  ["Contemporary", "Orchestral", "Neo-Romantic"],
    focus:      ["Minimalism", "Neo-Classical", "Baroque", "String Quartet"],
    melancholic:["Romantic", "Expressionism", "Contemporary"],
    upbeat:     ["Baroque", "Renaissance", "Orchestral"],
  },
  Blues: {
    chill:      ["Delta Blues", "Acoustic Blues", "Country Blues", "Piedmont Blues"],
    energetic:  ["Electric Blues", "Chicago Blues", "Blues Rock"],
    focus:      ["Delta Blues", "Country Blues", "Acoustic Blues"],
    melancholic:["Delta Blues", "Soul Blues", "Acoustic Blues"],
    upbeat:     ["Jump Blues", "Boogie Woogie", "Swamp Blues"],
  },
  Folk: {
    chill:      ["Acoustic", "Freak Folk", "Folk Pop", "Chamber Folk", "Appalachian"],
    energetic:  ["Folk Rock", "Celtic", "Bluegrass", "Old-Time"],
    focus:      ["Acoustic", "Fingerstyle", "Freak Folk"],
    melancholic:["Dark Folk", "Folk", "Indie Folk", "Traditional"],
    upbeat:     ["Folk Rock", "Celtic", "Bluegrass", "Old-Time"],
  },
  Pop: {
    chill:      ["Sophisti-Pop", "Dream Pop", "Chamber Pop", "Baroque Pop"],
    energetic:  ["Dance-pop", "Electropop", "Synth-pop"],
    focus:      ["Chamber Pop", "Baroque Pop", "Art Pop"],
    melancholic:["Dream Pop", "Baroque Pop", "Indie Pop"],
    upbeat:     ["Bubblegum", "Electropop", "Italo-Disco", "Hi NRG"],
  },
  Dance: {
    chill:      ["Nu-Disco", "Balearic", "Chillwave"],
    energetic:  ["Hi NRG", "Rave", "Eurodance", "Hardstyle"],
    focus:      ["Minimal Techno", "Microhouse"],
    melancholic:["Cold Wave", "Dark Electro"],
    upbeat:     ["Eurodance", "Hi NRG", "Nu-Disco", "Italo-Disco"],
  },
  Metal: {
    chill:      ["Doom Metal", "Post-Metal", "Atmospheric Black Metal"],
    energetic:  ["Thrash", "Death Metal", "Speed Metal", "Crossover"],
    focus:      ["Progressive Metal", "Post-Metal", "Instrumental"],
    melancholic:["Funeral Doom Metal", "Black Metal", "Gothic Metal"],
    upbeat:     ["Power Metal", "Glam Metal", "Speed Metal"],
  },
  Punk: {
    chill:      ["Post-Punk", "Art Punk", "Cold Wave"],
    energetic:  ["Hardcore", "Oi!", "Anarcho-Punk", "D-beat"],
    focus:      ["Post-Punk", "No Wave", "Art Punk"],
    melancholic:["Post-Punk", "Dark Wave", "Cold Wave", "Goth Rock"],
    upbeat:     ["Pop Punk", "Ska Punk", "Street Punk"],
  },
  Reggae: {
    chill:      ["Roots Reggae", "Dub", "Lovers Rock"],
    energetic:  ["Dancehall", "Ska", "Rocksteady", "Rude Boy"],
    focus:      ["Dub", "Roots Reggae", "Nyahbinghi"],
    melancholic:["Roots Reggae", "Dub", "Conscious"],
    upbeat:     ["Ska", "Dancehall", "Rocksteady"],
  },
  Latin: {
    chill:      ["Bossa Nova", "Bolero", "Latin Jazz", "Nueva Canción"],
    energetic:  ["Salsa", "Cumbia", "Merengue", "Mambo"],
    focus:      ["Bossa Nova", "Latin Jazz", "Nueva Trova", "Flamenco"],
    melancholic:["Bolero", "Tango", "Flamenco", "Nueva Canción"],
    upbeat:     ["Salsa", "Cumbia", "Merengue", "Son"],
  },
  Gospel: {
    chill:      ["Contemporary Gospel", "Spiritual", "Gospel"],
    energetic:  ["Southern Gospel", "Quartet", "Gospel"],
    focus:      ["Inspirational", "Spiritual", "Gospel"],
    melancholic:["Spiritual", "Gospel Blues"],
    upbeat:     ["Contemporary Gospel", "CCM"],
  },
  Country: {
    chill:      ["Americana", "Bluegrass", "Old-Time", "Country Blues"],
    energetic:  ["Outlaw Country", "Country Rock", "Honky Tonk"],
    focus:      ["Americana", "Singer-Songwriter", "Bluegrass"],
    melancholic:["Americana", "Country Blues", "Tragic"],
    upbeat:     ["Rockabilly", "Honky Tonk", "Country Pop"],
  },
  "New Age": {
    chill:      ["New Age", "Ambient", "Meditation", "Space Music", "Healing"],
    energetic:  ["World Fusion", "New Age"],
    focus:      ["Meditation", "New Age", "Ambient", "Space Music"],
    melancholic:["Dark Ambient", "New Age"],
    upbeat:     ["World Fusion", "Ethno"],
  },
  World: {
    chill:      ["African", "Indian Classical", "Middle Eastern", "Ethnic", "World Fusion"],
    energetic:  ["Afrobeat", "Highlife", "Cumbia", "Soukous"],
    focus:      ["Indian Classical", "Middle Eastern", "World Fusion", "Ethno"],
    melancholic:["African", "Middle Eastern", "Celtic", "Dark Folk"],
    upbeat:     ["Afrobeat", "Highlife", "Soukous", "Afropop"],
  },
}

function extractArtist(title: string): string {
  return title.split(" - ")[0]?.trim() || ""
}

/**
 * Targeted Discogs query using explicit parameters extracted from user intent
 * (genre, style, country, year range). Used by the AI search route.
 */
export async function getArtistsByDiscogParams({
  genre,
  style,
  country,
  yearStart,
  yearEnd,
}: {
  genre?: string
  style?: string
  country?: string
  yearStart?: string
  yearEnd?: string
}): Promise<string[]> {
  if (!TOKEN) return []

  const seenArtists = new Set<string>()
  const artists: string[] = []

  // Build a list of years to query (pick up to 5 random years from the range)
  let yearsToQuery: Array<string | null> = [null]
  if (yearStart && yearEnd) {
    const start = parseInt(yearStart)
    const end = parseInt(yearEnd)
    const range: string[] = []
    for (let y = start; y <= end; y++) range.push(String(y))
    yearsToQuery = [...range].sort(() => Math.random() - 0.5).slice(0, 5)
  } else if (yearStart) {
    yearsToQuery = [yearStart]
  }

  for (const year of yearsToQuery) {
    try {
      const params = new URLSearchParams({
        type:       "release",
        format:     "LP",
        per_page:   "10",
        page:       String(Math.floor(Math.random() * 15) + 2),
        token:      TOKEN,
        sort:       "want",
        sort_order: "desc",
      })
      if (genre)   params.set("genre",   genre)
      if (style)   params.set("style",   style)
      if (country) params.set("country", country)
      if (year)    params.set("year",    year)

      const res = await fetch(
        `${DISCOGS_URL}/database/search?${params.toString()}`,
        { headers: { "User-Agent": "HiFiMoodApp/1.0" }, next: { revalidate: 300 } }
      )
      if (!res.ok) continue

      const data = (await res.json()) as { results?: { title?: string }[] }
      for (const release of data.results ?? []) {
        const artist = extractArtist(release.title ?? "")
        const key = artist.toLowerCase()
        if (
          artist.length > 1 &&
          !artist.toLowerCase().includes("various") &&
          !seenArtists.has(key)
        ) {
          seenArtists.add(key)
          artists.push(artist)
        }
      }
    } catch {
      // keep going
    }
  }

  return artists
}

/**
 * Returns real artists from Discogs matching the user's genres + mood.
 *
 * Strategy for rarity:
 *   - Sort by `want` (sought-after, harder to find) rather than `have` (popular)
 *   - Randomise over a wide page range (2–20) so top-charting results are skipped
 *   - Use niche subgenre styles instead of broad genre names
 */
export async function getArtistsByGenreAndMood(
  genres: string[],
  mood: Mood
): Promise<string[]> {
  if (!TOKEN) return []

  const seenArtists = new Set<string>()
  const artists: string[] = []

  const shuffledGenres = [...genres].sort(() => Math.random() - 0.5)

  for (const genre of shuffledGenres.slice(0, 10)) {
    const discogsGenre = GENRE_TO_DISCOGS[genre]
    if (!discogsGenre) continue

    const availableStyles = GENRE_MOOD_STYLES[genre]?.[mood] ?? []
    // Pick 2 random niche styles per genre
    const stylesToQuery = [...availableStyles]
      .sort(() => Math.random() - 0.5)
      .slice(0, 2)

    const queries = stylesToQuery.length > 0 ? stylesToQuery : [null]

    for (const style of queries) {
      try {
        const params = new URLSearchParams({
          type:       "release",
          format:     "LP",          // prefer full albums over compilations
          per_page:   "10",
          // Wide random page range → avoids always returning chart-toppers
          page:       String(Math.floor(Math.random() * 18) + 2),
          token:      TOKEN,
          sort:       "want",        // ← sought-after / rare records first
          sort_order: "desc",
          genre:      discogsGenre,
        })
        if (style) params.set("style", style)

        const res = await fetch(
          `${DISCOGS_URL}/database/search?${params.toString()}`,
          {
            headers: { "User-Agent": "HiFiMoodApp/1.0" },
            next: { revalidate: 600 }, // short cache so results vary across calls
          }
        )
        if (!res.ok) continue

        const data = (await res.json()) as { results?: { title?: string }[] }
        for (const release of data.results ?? []) {
          const artist = extractArtist(release.title ?? "")
          const key = artist.toLowerCase()
          if (
            artist.length > 1 &&
            !artist.toLowerCase().includes("various") &&
            !seenArtists.has(key)
          ) {
            seenArtists.add(key)
            artists.push(artist)
          }
        }
      } catch {
        // keep going
      }
    }
  }

  return artists
}

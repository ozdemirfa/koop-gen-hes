import dotenv from 'dotenv'
import path from 'path'

// Local development için root'daki .env dosyasını yükle (varsa)
// Render/Vercel gibi ortamlarda environment variable'lar doğrudan process.env'de olur.
dotenv.config({ override: true })
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true })
dotenv.config({ path: path.resolve(process.cwd(), '../.env'), override: true })

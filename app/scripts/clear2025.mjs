import pkg from 'pg'
const {Client} = pkg
import {readFileSync} from 'fs'
const env = readFileSync('.env','utf8')
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)?.[1]
const c = new Client({connectionString:url})
await c.connect()
const r = await c.query("DELETE FROM financial_data WHERE year=2025")
console.log('Silindi:',r.rowCount,'kayıt')
await c.end()

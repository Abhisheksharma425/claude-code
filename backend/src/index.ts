import 'dotenv/config'
import cors from 'cors'
import express from 'express'

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

// Step 5 adds POST /api/explain here.

const port = Number(process.env.PORT ?? 3001)
app.listen(port, () => console.log(`Backend listening on http://localhost:${port}`))

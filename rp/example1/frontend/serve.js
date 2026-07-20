import express from 'express'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const port = process.env.PORT || 5173

const app = express()
app.use(express.static(join(__dirname, 'dist')))
app.use((_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(port, () => {
  console.log(`Frontend serving on port ${port}`)
})

import express from "express"
import cors from "cors"
import fetch from "node-fetch"
import dotenv from "dotenv"
type LinkSuggestion = { title: string; url: string }

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 4000

app.use((req, res, next) => {
  console.log(` ${req.method} ${req.url}`)
  if (req.body && Object.keys(req.body).length > 0) {
    console.log("Body:", JSON.stringify(req.body, null, 2))
  }
  next()
})

app.get("/getLinks", async (req, res) => {
  const query = req.query.query as string
  console.log("[GET /getLinks] Query recebida:", query)

  const baseUrl = process.env.JINA_API_URL ?? "https://s.jina.ai"
  const url = `${baseUrl}?q=${encodeURIComponent(query)}`
  console.log("[GET /getLinks] URL chamada:", url)

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": "Bearer " + process.env.JINA_API_KEY,
        "X-Respond-With": "no-content"
      }
    })

    const text = await response.text()
    console.log("[GET /getLinks] Texto retornado da Jina API:\n", text)

    const entries: LinkSuggestion[] = []
    const entryRegex = /\[(\d+)] Title: (.*?)\n\[\1] URL Source: (.*?)\n/g

    let match
    while ((match = entryRegex.exec(text)) !== null) {
      const [, index, title, url] = match
      console.log(`[GET /getLinks] Match ${index}:`, { title, url })
      entries.push({ title, url })
    }

    console.log("[GET /getLinks] Total de links extraídos:", entries.length)
    res.json(entries.slice(0, 3))
  } catch (err) {
    console.error("❌ Erro ao buscar links:", err)
    res.status(500).json({ error: "Error getting links" })
  }
})

app.post("/rewrite", async (req, res) => {
  const { text } = req.body

  const endpoint = process.env.REWRITE_API_URL || "https://tinq.ai/api/v2/rewrite"
  const apiKey = process.env.REWRITE_API_KEY

  const requestBody = {
    text,
    mode: "advanced",
    lang: "en"
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    })

    const rawData = await response.text()

    let data
    try {
      data = JSON.parse(rawData)
    } catch (parseError) {
      console.error("[/rewrite] Error parsing JSON:", parseError)
    }
    console.log("[POST /rewrite] Text returned by Rewrite API:\n", data)

    const rewritten = data.paraphrase?.trim()

    res.json({ rewritten })
  } catch (error) {
    console.error("[/rewrite] Error calling external API:", error)
  }
})


app.listen(PORT, () => {
  console.log(`Backend server running in http://localhost:${PORT}`)
})
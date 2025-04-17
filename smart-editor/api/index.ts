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

const baseUrl = process.env.JINA_API_URL ?? "https://s.jina.ai"
const url = `${baseUrl}?q=${encodeURIComponent(query)}`
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": "Bearer " + process.env.JINA_API_KEY,
        "X-Respond-With": "no-content"
      }
    })

    const text = await response.text()

    const entries: LinkSuggestion[] = []
    const entryRegex = /\[(\d+)] Title: (.*?)\n\[\1] URL Source: (.*?)\n/g

    let match
    while ((match = entryRegex.exec(text)) !== null) {
      const [, , title, url] = match
      entries.push({ title, url })
    }

    res.json(entries.slice(0, 3))
  } catch (err) {
    console.error("Error getting links", err)
    res.status(500).json({ error: "Error getting links" })
  }
})

app.post("/rewrite", async (req, res) => {
  const { text } = req.body

  try {
    const response = await fetch(`${process.env.COHERE_API_URL || "https://api.cohere.ai/v1/chat"}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.COHERE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "command-r",
        message: `Rewrite the following sentence to make it sound clearer and more natural, keeping the original language. Keep the same punctuation. Don't add any of these "". Respond with the rewritten sentence only, no explanations or further comments: "${text}"`,
        temperature: 0.7
      })
    })

    const data = await response.json() as {
      text: any
    }

    const rewritten = data.text?.trim()
    res.json({ rewritten })
  } catch (error) {
    console.error("Error Calling Cohere API:", error)
    res.status(500).json({ error: "Error rewriting text" })
  }
})

export default app
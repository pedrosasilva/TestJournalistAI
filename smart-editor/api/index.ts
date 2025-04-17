import fetch from "node-fetch"
import dotenv from "dotenv"

dotenv.config()

type LinkSuggestion = { title: string; url: string }

// Função que será executada pelo Vercel
export default async function handler(req, res) {
  if (req.method === "GET" && req.url.includes("/getLinks")) {
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

      res.json(entries.slice(0, 3))  // Retorna os primeiros 3 links
    } catch (err) {
      console.error("Error getting links", err)
      res.status(500).json({ error: "Error getting links" })
    }
  } else if (req.method === "POST" && req.url.includes("/rewrite")) {
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
  } else {
    // Método não permitido
    res.status(405).json({ error: "Method Not Allowed" })
  }
}

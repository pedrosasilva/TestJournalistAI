import { LinkSuggestion } from "../components/FloatingMenu"

export const fetchLinkSuggestions = async (query: string): Promise<LinkSuggestion[]> => {
    try {
      const response = await fetch(`http://localhost:4000/getLinks?query=${encodeURIComponent(query)}`, {
        method: "GET"
      })
  
      if (!response.ok) {
        console.error("Backend error:", response.status)
        return []
      }
  
      const links = await response.json()
      return links
    } catch (err) {
      console.error("Error while obtaining links:", err)
      return []
    }
}

export async function rewriteWithCohere(text: string): Promise<string> {
    const response = await fetch("http://localhost:4000/rewrite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text })
    })
  
    if (!response.ok) {
        console.error("Backend error:", response.status)
    }
  
    const data = await response.json()
    const rewritten = data.rewritten?.trim()
    return rewritten || text
}
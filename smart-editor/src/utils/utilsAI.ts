import { LinkSuggestion } from "../components/FloatingMenu"
import { Editor, Transforms, Text, Range } from "slate"
import { ReactEditor } from "slate-react"

export const fetchLinkSuggestions = async (query: string): Promise<LinkSuggestion[]> => {
    try {
      const response = await fetch(`${process.env.REACT_APP_COHERE_API_KEY}/getLinks?query=${encodeURIComponent(query)}`, {
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
    const response = await fetch(`${process.env.REACT_APP_COHERE_API_KEY}/rewrite`, {
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

export function applyRewrite({
  editor,
  rewriteRange,
  rewriteSuggestion,
}: {
  editor: Editor & ReactEditor
  rewriteRange: Range
  rewriteSuggestion: string
}) {
  try {
    const [linkedNodeEntry] = Array.from(
      Editor.nodes(editor, {
        at: rewriteRange,
        match: (n) =>
          Text.isText(n) &&
          (n as any).linked &&
          !!(n as any).url,
      })
    )
  
    const linkedNode = linkedNodeEntry?.[0] as
      | (Text & { linked?: boolean; url?: string })
      | undefined
  
    Transforms.select(editor, rewriteRange)
    Transforms.delete(editor, { at: rewriteRange })
    Transforms.insertText(editor, rewriteSuggestion, {
      at: rewriteRange.anchor,
    })
  
    const end = Editor.after(editor, rewriteRange.anchor, {
      distance: rewriteSuggestion.length,
      unit: "character",
    })
  
    if (end) {
      const newRange = { anchor: rewriteRange.anchor, focus: end }
      Editor.withoutNormalizing(editor, () => {
        Transforms.setNodes(
          editor,
          {
            rewritten: true,
            ...(linkedNode && { linked: true, url: linkedNode.url }),
          },
          { match: Text.isText, at: newRange, split: true }
        )
      })
    }
  } catch (error) {
    console.error("Error applying rewrite:", error)
  }
}

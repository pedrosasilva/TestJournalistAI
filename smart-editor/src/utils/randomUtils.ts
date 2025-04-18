import { Editor, Range, Text, Transforms } from "slate"
import { ReactEditor } from "slate-react"

export function applyLinkToBestMatchInSelection(
  editor: Editor,
  selectedText: string,
  range: Range,
  linkTitle: string,
  linkUrl: string
) {
  try {
    const normalizedTitle = linkTitle.toLowerCase()
    const normalizedText = selectedText.toLowerCase()
  
    let bestMatch = ""
    let bestStart = -1
  
    for (let len = normalizedText.length; len > 0; len--) {
      for (let i = 0; i <= normalizedText.length - len; i++) {
        const substr = normalizedText.slice(i, i + len)
        if (normalizedTitle.includes(substr)) {
          bestMatch = selectedText.slice(i, i + len)
          bestStart = i
          break
        }
      }
      if (bestMatch) break
    }
  
    if (!bestMatch || bestStart === -1){
      console.error("No matching substring found")
      return
    }
  
    const anchor = Editor.point(editor, range.anchor, { edge: "start" })
    const focus = Editor.point(editor, range.focus, { edge: "start" })
    const baseOffset = Math.min(anchor.offset, focus.offset)
  
    const start = { path: anchor.path, offset: baseOffset + bestStart }
    const end = { path: anchor.path, offset: baseOffset + bestStart + bestMatch.length }
  
    const linkRange: Range = { anchor: start, focus: end }
  
    Editor.withoutNormalizing(editor, () => {
      Transforms.setNodes(
        editor,
        { linked: true, url: linkUrl },
        { at: linkRange, match: Text.isText, split: true }
      )
    })
  } catch(error) {
    console.error("Error applying link:", error)
  }
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


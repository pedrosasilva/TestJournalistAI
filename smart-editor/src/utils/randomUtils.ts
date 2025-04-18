import { Editor, Point, Range, Text, Transforms } from "slate"
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

    let wordStart = bestStart
    while (wordStart > 0 && /\w/.test(selectedText[wordStart - 1])) {
      wordStart--
    }
    let wordEnd = bestStart + bestMatch.length
    while (wordEnd < selectedText.length && /\w/.test(selectedText[wordEnd])) {
      wordEnd++
    }
  
    const anchor = Editor.point(editor, range.anchor, { edge: "start" })
    const focus = Editor.point(editor, range.focus, { edge: "start" })
    const baseOffset = Math.min(anchor.offset, focus.offset)

    const start: Point = {
      path: anchor.path,
      offset: baseOffset + wordStart,
    }

    const end: Point = {
      path: anchor.path,
      offset: baseOffset + wordEnd,
    }
  
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
          Text.isText(n) && (n as any).linked && !!(n as any).url,
      })
    )

    const linkedNode = linkedNodeEntry?.[0] as
      | (Text & { linked?: boolean; url?: string })
      | undefined

    const start = Editor.start(editor, rewriteRange)

    Editor.withoutNormalizing(editor, () => {
      Transforms.delete(editor, { at: rewriteRange })
      Transforms.insertText(editor, rewriteSuggestion, { at: start })

      const end: Point = {
        path: start.path,
        offset: start.offset + rewriteSuggestion.length,
      }

      const rewrittenRange: Range = { anchor: start, focus: end }

      Transforms.setNodes(
        editor,
        {
          rewritten: true,
          ...(linkedNode && { linked: true, url: linkedNode.url }),
        },
        { at: rewrittenRange, match: Text.isText, split: true }
      )
    })

    Transforms.deselect(editor)
  } catch (error) {
    console.error("Error applying rewrite:", error)
  }
}


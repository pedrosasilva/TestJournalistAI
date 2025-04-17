import { Editor, Range, Text, Transforms } from "slate"

export function applyLinkToBestMatchInSelection(editor: Editor, selectedText: string, range: Range, linkUrl: string) {
  const linkText = linkUrl.toLowerCase()
  const words = selectedText.split(/\s+/)

  let bestMatch = ""
  for (const word of words) {
    if (linkText.includes(word.toLowerCase()) && word.length > bestMatch.length) {
      bestMatch = word
    }
  }

  if (!bestMatch) return

  const startOffset = selectedText.toLowerCase().indexOf(bestMatch.toLowerCase())
  const endOffset = startOffset + bestMatch.length

  const anchor = Editor.point(editor, range.anchor, { edge: "start" })
  const focus = Editor.point(editor, range.focus, { edge: "start" })

  const baseOffset = Math.min(anchor.offset, focus.offset)
  const start = { path: anchor.path, offset: baseOffset + startOffset }
  const end = { path: anchor.path, offset: baseOffset + endOffset }

  const linkRange: Range = { anchor: start, focus: end }

  Editor.withoutNormalizing(editor, () => {
    Transforms.setNodes(
      editor,
      { linked: true, url: linkUrl },
      { at: linkRange, match: Text.isText, split: true }
    )
  })
}

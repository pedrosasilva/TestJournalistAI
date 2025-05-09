import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createEditor, Descendant, BaseEditor, Editor, Transforms, Point, Range, Text, Node, Path } from "slate"
import { Slate, Editable, withReact, ReactEditor } from "slate-react"
import { HistoryEditor } from "slate-history"
import { fetchLinkSuggestions, rewriteWithCohere } from "../utils/utilsAI"
import { applyLinkToBestMatchInSelection, applyRewrite } from "../utils/randomUtils"
import "../css/styles.css"
import { FloatingMenu, LinkSuggestion, MenuState } from "./FloatingMenu"

type CustomText = {
  text: string
  rewritten?: boolean | null
  linked?: boolean | null
  url?: string | null
}

type ParagraphElement = {
  type: "paragraph"
  children: CustomText[]
}

declare module "slate" {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor & HistoryEditor
    Element: ParagraphElement
    Text: CustomText
  }
}

const initialValue: Descendant[] = [
  {
    type: "paragraph",
    children: [
      {
        text: "The Roland TR-808 Rhythm Composer, commonly known as the 808, is a drum machine manufactured by Roland Corporation between 1980 and 1983. It was one of the first drum machines to allow users to program rhythms instead of using preset patterns. Unlike its nearest competitor at the time, the more expensive Linn LM-1, the 808 generates sounds using analog synthesis rather than by playing samples."
      }
    ]
  }
]

export function expandSelectionToWord(editor: Editor, selection: Range): Range {
    const isBackward = Range.isBackward(selection)
    const fullText = Editor.string(editor, [])
  
    const start = Editor.start(editor, selection)
    const end = Editor.end(editor, selection)
  
    let offset = 0
    let startOffset = 0
    let endOffset = 0
  
    for (const [node, path] of Node.texts(editor)) {
      const text = Node.string(node)
      if (Path.equals(path, start.path)) {
        startOffset = offset + start.offset
      }
      if (Path.equals(path, end.path)) {
        endOffset = offset + end.offset
      }
      offset += text.length
    }
  
    const isWordChar = (char: string) => /\w/.test(char)
  
    let newStartOffset = startOffset
    while (newStartOffset > 0 && isWordChar(fullText[newStartOffset - 1])) {
      newStartOffset--
    }
  
    let newEndOffset = endOffset
    while (newEndOffset < fullText.length && isWordChar(fullText[newEndOffset])) {
      newEndOffset++
    }
  
    let currentOffset = 0
    let newAnchor: Point | null = null
    let newFocus: Point | null = null
  
    for (const [node, path] of Node.texts(editor)) {
      const text = Node.string(node)
      const textLength = text.length
  
      if (!newAnchor && currentOffset + textLength >= newStartOffset) {
        newAnchor = {
          path,
          offset: newStartOffset - currentOffset,
        }
      }
  
      if (!newFocus && currentOffset + textLength >= newEndOffset) {
        newFocus = {
          path,
          offset: newEndOffset - currentOffset,
        }
      }
  
      currentOffset += textLength
  
      if (newAnchor && newFocus) break
    }
  
    if (!newAnchor || !newFocus) {
      return selection
    }
  
    return isBackward
      ? { anchor: newFocus, focus: newAnchor }
      : { anchor: newAnchor, focus: newFocus }
  }

export const RichTextEditor = () => {
  const editor = useMemo(() => withReact(createEditor()), [])
  const [value, setValue] = useState<Descendant[]>(initialValue)

  const [disableLinks, setDisableLinks] = useState(false)
  const [selection, setSelection] = useState<Range | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)

  const [rewriteSuggestion, setRewriteSuggestion] = useState<string | null>(null)
  const [rewriteRange, setRewriteRange] = useState<Range | null>(null)

  const [linkSuggestions, setLinkSuggestions] = useState<LinkSuggestion[] | null>(null)
  const [linkRange, setLinkRange] = useState<Range | null>(null)

  const [loadingRewrite, setLoadingRewrite] = useState(false)
  const [loadingLinks, setLoadingLinks] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)

  const menuState: MenuState = useMemo(() => {
    if (!selection || !menuPosition) return "idle"
    if (rewriteSuggestion) return "showingRewrite"
    if(loadingRewrite) return "loadingRewrite"
    if (loadingLinks) return "loadingLinks"
    if (linkSuggestions) return "showingLinks"
    return "idle"
  }, [selection, menuPosition, rewriteSuggestion, linkSuggestions, loadingRewrite, loadingLinks])

  useEffect(() => {
    if (selection && !Range.isCollapsed(selection)) {
      setTimeout(() => {
        try {
            const domRange = ReactEditor.toDOMRange(editor, selection)
            const rect = domRange.getBoundingClientRect()

            const containerRect = containerRef.current?.getBoundingClientRect()

            if (containerRect) {
                setMenuPosition({
                    top: rect.bottom - containerRect.top + 8,
                    left: rect.left - containerRect.left,
                })
            }
        } catch (err) {
          console.warn("Error calculating menu position:", err)
        }
      })
    }
  }, [selection, editor])

  const handleMouseUp = () => {
    setTimeout(() => {
      const { selection } = editor
      setRewriteSuggestion(null)
      setRewriteRange(null)

      setLinkSuggestions(null)
      setLinkRange(null)

      if (selection && !Range.isCollapsed(selection)) {
        const selectedText = Editor.string(editor, selection)
        if (selectedText.trim() === "" || !/[a-zA-Z0-9]/.test(selectedText)) {
            setSelection(null)
            setMenuPosition(null)
            return
        }
        setDisableLinks(!!Array.from(
            Editor.nodes(editor, {
              at: selection,
              match: (n) => Text.isText(n) && !!(n as any).linked,
            })
          ).length)

        const domRange = ReactEditor.toDOMRange(editor, selection)
        const rect = domRange.getBoundingClientRect()

        const containerRect = containerRef.current?.getBoundingClientRect()

        if (containerRect) {
            setMenuPosition({
                top: rect.bottom - containerRect.top + 8,
                left: rect.left - containerRect.left,
            })
        }
      } else {
        setMenuPosition(null)
      }
    })
  }

  const renderLeaf = useCallback((props: any) => <Leaf {...props} />, [])

  const clearUI = () => {
    Transforms.deselect(editor)
    setLinkSuggestions(null)
    setRewriteSuggestion(null)
    setLinkRange(null)
    setRewriteRange(null)
    setMenuPosition(null)
    setSelection(null)
  }
  return (
    <div ref={containerRef} className="rich-text-container">
      <Slate
        editor={editor}
        initialValue={value}
        onChange={(newValue) => {
          setValue(newValue)
          const { selection } = editor

          if (selection && !Range.isCollapsed(selection)) {
            const selectedText = Editor.string(editor, selection)
            if (selectedText.trim() === "" || !/[a-zA-Z0-9]/.test(selectedText)) {
                setSelection(null)
                setMenuPosition(null)
                return
            } else {
              setSelection(selection)
            }
          } else {
            setSelection(null)
            setMenuPosition(null)
          }
        }}
      >
        <Editable
          renderLeaf={renderLeaf}
          onKeyUp={() => {
            const allText = Editor.string(editor, {
              anchor: Editor.start(editor, []),
              focus: Editor.end(editor, []),
            })
        
            if (allText.trim() === "") {
              Transforms.setNodes(
                editor,
                { rewritten: null, linked: null, url: null },
                { at: [], match: Text.isText }
              )
            }
          }}
          onMouseUp={handleMouseUp}
          placeholder="Write anything!"
          className="rich-text-editable"
        />
        
        {selection && menuPosition && (
            <FloatingMenu
            editor={editor}
            position={menuPosition}
            state={menuState}
            disableLinks={disableLinks}
            linkSuggestions={linkSuggestions}
            rewriteSuggestion={rewriteSuggestion}
            onRequestRewrite={async () => {
              if (!selection) return
              const expanded = expandSelectionToWord(editor, selection)
              const selectedText = Editor.string(editor, expanded)
              setRewriteRange(expanded)
              setLoadingRewrite(true)
              const suggestion = await rewriteWithCohere(selectedText)
              setRewriteSuggestion(suggestion)
              setLoadingRewrite(false)
            }}
            onRequestLinks={async () => {
              if (!selection) return
              const expanded = expandSelectionToWord(editor, selection)
              const selectedText = Editor.string(editor, expanded)
              setLinkRange(expanded)
              setLoadingLinks(true)
              const suggestions = await fetchLinkSuggestions(selectedText)
              setLinkSuggestions(suggestions)
              setLoadingLinks(false)
            }}
            onSelectLink={(link) => {
              if (!linkRange) return
              const selectedText = Editor.string(editor, linkRange)
              applyLinkToBestMatchInSelection(editor, selectedText, linkRange, link.title, link.url )
              clearUI()
            }}
            onAcceptRewrite={() => {
                if (rewriteRange && rewriteSuggestion) {
                    applyRewrite({
                        editor,
                        rewriteRange,
                        rewriteSuggestion,
                    })
                }
                clearUI()
            }}
            onCancel={() => {
                clearUI()
            }}
          />
          
        )}
      </Slate>
    </div>
  )
}

const Leaf = ({ attributes, children, leaf }: any) => {
    const classNames = []
  
    if (leaf.rewritten) classNames.push("leaf-rewritten")
    if (leaf.linked) classNames.push("leaf-linked")
  
    if (leaf.linked && leaf.url) {
      return (
        <a
          {...attributes}
          href={leaf.url}
          target="_blank"
          rel="noopener noreferrer"
          className={classNames.join(" ")}
          onClick={(e) => {
            const selection = window.getSelection()
            if (selection && selection.toString().length === 0) {
              window.open(leaf.url, "_blank", "noopener,noreferrer")
            }
          }}
          style={{ cursor: "pointer", textDecoration: "underline", color: "#1a0dab" }}
        >
          {children}
        </a>
      )
    }
  
    return <span {...attributes} className={classNames.join(" ")}>{children}</span>
  }
  
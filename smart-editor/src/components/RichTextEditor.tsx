import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createEditor, Descendant, BaseEditor, Editor, Transforms, Point, Range, Text } from "slate"
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

function expandSelectionToWord(editor: Editor, selection: Range): Range {
  let { anchor, focus } = selection

  const anchorBefore = Editor.before(editor, anchor, { unit: "character" })
  const anchorAfter = Editor.after(editor, anchor, { unit: "character" })
  const focusBefore = Editor.before(editor, focus, { unit: "character" })
  const focusAfter = Editor.after(editor, focus, { unit: "character" })

  const isMiddle = (point: Point, before?: Point | null, after?: Point | null) => {
    const charBefore = before ? Editor.string(editor, { anchor: before, focus: point }) : " "
    const charAfter = after ? Editor.string(editor, { anchor: point, focus: after }) : " "
    return /\w/.test(charBefore) && /\w/.test(charAfter)
  }

  if (isMiddle(anchor, anchorBefore, anchorAfter)) {
    anchor = Editor.before(editor, anchor, { unit: "word" }) ?? anchor
  }

  if (isMiddle(focus, focusBefore, focusAfter)) {
    focus = Editor.after(editor, focus, { unit: "word" }) ?? focus
  }

  return { anchor, focus }
}

export const RichTextEditor = () => {
  const editor = useMemo(() => withReact(createEditor()), [])
  const [value, setValue] = useState<Descendant[]>(initialValue)

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
        if (selectedText.trim() === "" || !/[a-zA-Z]/.test(selectedText)) {
            setSelection(null)
            setMenuPosition(null)
            return
        }

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
            if (selectedText.trim() === "" || !/[a-zA-Z]/.test(selectedText)) {
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
          onMouseUp={handleMouseUp}
          placeholder="Write anything!"
          className="rich-text-editable"
        />
        
        {selection && menuPosition && (
            <FloatingMenu
            editor={editor}
            position={menuPosition}
            state={menuState}
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
        >
          {children}
        </a>
      )
    }
  
    return <span {...attributes} className={classNames.join(" ")}>{children}</span>
  }
  
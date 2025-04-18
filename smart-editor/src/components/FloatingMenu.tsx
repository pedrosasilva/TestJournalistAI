import React, { ReactNode } from "react"
import LoadingSpinner from "./LoadingSpinner"
import { Editor } from "slate"

export type MenuState =
  | "idle"
  | "loadingLinks"
  | "showingLinks"
  | "loadingRewrite"
  | "showingRewrite"

export type LinkSuggestion = {
    snippet: ReactNode
    title: string
    url: string
  }

interface FloatingMenuProps {
    editor: Editor
    position: { top: number; left: number }
    state: MenuState
    linkSuggestions: LinkSuggestion[] | null
    rewriteSuggestion: string | null
    onRequestRewrite: () => void
    onRequestLinks: () => void
    onSelectLink: (link: LinkSuggestion) => void
    onAcceptRewrite: () => void
    onCancel: () => void
    disableLinks?: boolean
}

export const FloatingMenu: React.FC<FloatingMenuProps> = ({
  position,
  state,
  linkSuggestions,
  rewriteSuggestion,
  onRequestRewrite,
  onRequestLinks,
  onSelectLink,
  onAcceptRewrite,
  onCancel,
  disableLinks = false,
}) => {
  return (
    <div
        className="menu-box z-50 w-80"
        style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        }}
    >
      {state === "idle" && (
        <div className="menu-buttons">
          <button onClick={onRequestRewrite}>✏️ Rewrite</button>
          {!disableLinks && (
            <button onClick={onRequestLinks}>🔗 Add link</button>
          )}
        </div>
      )}

      {state === "loadingLinks" && <LoadingSpinner text="Looking for links..." />}

      {state === "loadingRewrite" && <LoadingSpinner text="Rewriting..." />}

      {state === "showingLinks" && (
        <div className="menu-links">
          {linkSuggestions?.length === 0 ? (
            <p>No relevant links found.</p>
          ) : (
            linkSuggestions?.map((link, i) => (
                <div
                    key={i}
                    className="px-3 py-2 mb-2 hover:bg-gray-100 cursor-pointer rounded transition cursor-pointer"
                >
                    <button className="font-semibold text-base" onClick={() => onSelectLink(link)}>{link.title}</button>
                </div>
              ))
          )}
          <button className="back-button" onClick={onCancel}>❌ Close</button>
        </div>
      )}

      {state === "showingRewrite" && rewriteSuggestion && (
        <div className="menu-rewrite">
          <p>{rewriteSuggestion}</p>
          <div className="rewrite-actions">
            <button onClick={onAcceptRewrite}>✅ Accept</button>
            <button onClick={onCancel}>❌ Close</button>
          </div>
        </div>
      )}
    </div>
  )
} 

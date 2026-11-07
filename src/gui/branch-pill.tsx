import { Show } from "solid-js"

export interface BranchPillProps {
  readonly name: string
  readonly color: string
  readonly remotes?: readonly string[]
  readonly hash?: string
  readonly current?: boolean
  readonly compact?: boolean
  readonly muted?: boolean
}

function pillTitle(props: BranchPillProps): string {
  const parts = [props.name]
  if (props.remotes && props.remotes.length > 0) parts.push(props.remotes.join(", "))
  if (props.hash) parts.push(props.hash.slice(0, 7))
  return parts.join(" · ")
}

/** A branch reference badge whose dot color comes from the branch color map. */
export function BranchPill(props: BranchPillProps) {
  const fontSize = () => (props.compact ? "9px" : "10px")
  const dotSize = () => (props.compact ? "6px" : "7px")

  return (
    <span
      title={pillTitle(props)}
      style={{
        display: "inline-flex",
        "align-items": "center",
        gap: "4px",
        padding: props.compact ? "0 4px" : "2px 6px",
        "border-radius": "4px",
        border: props.current ? `1px solid ${props.color}` : "1px solid transparent",
        "background-color": props.compact ? `${props.color}22` : "transparent",
        "font-size": fontSize(),
        "line-height": props.compact ? "14px" : "16px",
        "max-width": "180px",
        overflow: "hidden",
        "white-space": "nowrap",
        opacity: props.muted ? 0.65 : 1,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: dotSize(),
          height: dotSize(),
          "border-radius": "50%",
          "flex-shrink": 0,
          background: props.color,
        }}
      />
      <span style={{ overflow: "hidden", "text-overflow": "ellipsis" }}>{props.name}</span>
      <Show when={props.remotes && props.remotes.length > 0}>
        <span style={{ opacity: 0.65, overflow: "hidden", "text-overflow": "ellipsis" }}>
          {props.remotes?.join(", ")}
        </span>
      </Show>
    </span>
  )
}

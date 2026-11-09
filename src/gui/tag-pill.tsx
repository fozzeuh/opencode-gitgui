import { Show } from "solid-js"

export interface TagPillProps {
  readonly name: string
  readonly hash?: string
  readonly compact?: boolean
}

/** A tag reference badge, visually distinct from branch pills. */
export function TagPill(props: TagPillProps) {
  const color = "#f1c21b"
  const fontSize = () => (props.compact ? "9px" : "10px")

  return (
    <span
      title={props.hash ? `${props.name} · ${props.hash.slice(0, 7)}` : props.name}
      style={{
        display: "inline-flex",
        "align-items": "center",
        gap: "3px",
        padding: props.compact ? "0 4px" : "2px 6px",
        "border-radius": "4px",
        border: `1px solid ${color}55`,
        "background-color": `${color}18`,
        color,
        "font-size": fontSize(),
        "line-height": props.compact ? "14px" : "16px",
        "max-width": "180px",
        overflow: "hidden",
        "white-space": "nowrap",
      }}
    >
      <Show when={props.name}>
        <span aria-hidden="true" style={{ opacity: 0.85 }}>
          #
        </span>
      </Show>
      <span style={{ overflow: "hidden", "text-overflow": "ellipsis" }}>{props.name}</span>
    </span>
  )
}

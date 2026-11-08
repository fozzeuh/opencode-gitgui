/** Vertical gap between a merge node center and the tip of its incoming arrow. */
export const MERGE_ARROW_GAP = 10

export interface EdgeEndpoints {
  /** Horizontal position of the commit at the top of the edge. */
  readonly fromX: number
  /** Vertical position of the commit at the top of the edge. */
  readonly fromY: number
  /** Horizontal position of the parent at the bottom of the edge. */
  readonly toX: number
  /** Vertical position of the parent at the bottom of the edge. */
  readonly toY: number
}

/**
 * Build the cubic path for one graph edge.
 *
 * History is drawn newest first, so a regular edge naturally runs from the
 * commit down to its parent. A merge edge is reversed: it starts at the second
 * parent and ends just below the merge commit, which makes the arrowhead point
 * up into the merge and shows the side branch flowing into it.
 */
export function edgePath(edge: EdgeEndpoints, merge: boolean): string {
  const middle = (edge.fromY + edge.toY) / 2
  if (merge) {
    return `M ${edge.toX} ${edge.toY} C ${edge.toX} ${middle}, ${edge.fromX} ${middle}, ${edge.fromX} ${edge.fromY + MERGE_ARROW_GAP}`
  }
  return `M ${edge.fromX} ${edge.fromY} C ${edge.fromX} ${middle}, ${edge.toX} ${middle}, ${edge.toX} ${edge.toY}`
}

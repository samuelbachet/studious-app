export type AimDragLayout = { id: string; y: number; height: number };

// Layout events can omit a position update when a reordered row lands in its
// previewed slot. Derive positions from the current order and measured heights
// instead of caching coordinates by ID across drags.
export function orderedAimLayouts(ids: readonly string[], heights: ReadonlyMap<string, number>): AimDragLayout[] | null {
  const layouts: AimDragLayout[] = [];
  let y = 0;
  for (const id of ids) {
    const height = heights.get(id);
    if (height === undefined || !Number.isFinite(height) || height <= 0) return null;
    layouts.push({ id, y, height });
    y += height;
  }
  return layouts;
}

export function boundedAimOffset(items: readonly AimDragLayout[], sourceId: string, requestedOffset: number): number {
  const source = items.find((item) => item.id === sourceId);
  if (!source || items.length === 0) return 0;
  const firstY = Math.min(...items.map((item) => item.y));
  const lastBottom = Math.max(...items.map((item) => item.y + item.height));
  return Math.max(firstY - source.y, Math.min(requestedOffset, lastBottom - source.height - source.y));
}

export function previewIndex(index: number, sourceIndex: number, targetIndex: number): number {
  if (index === sourceIndex) return targetIndex;
  if (sourceIndex < targetIndex && index > sourceIndex && index <= targetIndex) return index - 1;
  if (sourceIndex > targetIndex && index >= targetIndex && index < sourceIndex) return index + 1;
  return index;
}

export function previewAimTops(items: readonly AimDragLayout[], sourceId: string, targetIndex: number): Map<string, number> {
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= items.length) {
    return new Map(items.map((item) => [item.id, item.y]));
  }
  const ordered = [...items];
  const [moving] = ordered.splice(sourceIndex, 1);
  ordered.splice(targetIndex, 0, moving);
  let top = items[0].y;
  const positions = new Map<string, number>();
  for (const item of ordered) {
    positions.set(item.id, top);
    top += item.height;
  }
  return positions;
}

// Cross a neighbor's midpoint with the dragged row's leading edge. Its center
// may never reach that midpoint when a tall row moves into a shorter row's slot.
// Use the same edge in both directions at each boundary to avoid jitter.
export function proposedAimIndex(items: readonly AimDragLayout[], sourceId: string, currentIndex: number, draggedTopY: number): number {
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  if (sourceIndex < 0) return currentIndex;
  const draggedBottomY = draggedTopY + items[sourceIndex].height;
  const others = items.filter((item) => item.id !== sourceId);
  const hysteresis = 4;
  let index = currentIndex;
  while (index < others.length) {
    const edge = index >= sourceIndex ? draggedBottomY : draggedTopY;
    if (edge <= others[index].y + others[index].height / 2 + hysteresis) break;
    index += 1;
  }
  while (index > 0) {
    const boundary = index - 1;
    const edge = boundary >= sourceIndex ? draggedBottomY : draggedTopY;
    if (edge >= others[boundary].y + others[boundary].height / 2 - hysteresis) break;
    index -= 1;
  }
  return index;
}

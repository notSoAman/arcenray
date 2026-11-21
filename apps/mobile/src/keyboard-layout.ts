/** Screen-coordinate geometry works with both Android resize and overlay keyboards. */
export function focusedFieldScrollOffset({
  offset,
  fieldTop,
  fieldHeight,
  viewportTop,
  viewportBottom,
  keyboardTop,
}: {
  offset: number;
  fieldTop: number;
  fieldHeight: number;
  viewportTop: number;
  viewportBottom: number;
  keyboardTop: number;
}) {
  const bottom = Math.min(viewportBottom, keyboardTop) - 20;
  const top = viewportTop + 20;
  if (fieldTop + fieldHeight > bottom)
    return Math.max(0, offset + fieldTop + fieldHeight - bottom);
  if (fieldTop < top) return Math.max(0, offset + fieldTop - top);
  return offset;
}

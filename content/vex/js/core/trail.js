// Returns a new list with `item` appended, keeping at most `max` items (oldest dropped).
export function appendBounded(list, item, max) {
  const kept = list.length >= max ? list.slice(list.length - max + 1) : list;
  return [...kept, item];
}

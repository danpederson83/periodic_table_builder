let cache;

export function loadData() {
  cache ??= fetch(new URL('../../data/elements.json', import.meta.url)).then((r) => {
    if (!r.ok) throw new Error(`Could not load element data (${r.status})`);
    return r.json();
  });
  return cache;
}

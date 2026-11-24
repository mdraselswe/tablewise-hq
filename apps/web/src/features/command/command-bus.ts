let opener: (() => void) | undefined;

/** Opens the command palette from anywhere (the sidebar's search button). */
export function showCommandPalette(): void {
  opener?.();
}

/** Registered by the mounted palette. */
export function onOpenCommandPalette(open: () => void): () => void {
  opener = open;
  return () => {
    if (opener === open) opener = undefined;
  };
}

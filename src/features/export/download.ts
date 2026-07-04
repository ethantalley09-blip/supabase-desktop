declare global {
  interface Window {
    __TAURI__?: unknown;
  }
}

// Inside the Tauri shell, save through the native file dialog; in a plain
// browser (dev preview), fall back to an anchor download.
export async function saveFile(filename: string, blob: Blob) {
  if (window.__TAURI__) {
    const { save } = await import('@tauri-apps/api/dialog');
    const { writeBinaryFile } = await import('@tauri-apps/api/fs');
    const path = await save({ defaultPath: filename });
    if (!path) return; // user cancelled
    await writeBinaryFile(path, new Uint8Array(await blob.arrayBuffer()));
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

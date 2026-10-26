/**
 * Copies text to the clipboard. Works over plain http (LAN) where
 * `navigator.clipboard` is undefined, and when the async API rejects.
 * Never throws: resolves `true` on success and `false` otherwise.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the execCommand fallback.
  }

  if (typeof document === "undefined") return false;

  let textarea: HTMLTextAreaElement | null = null;
  try {
    textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    return document.execCommand("copy") === true;
  } catch {
    return false;
  } finally {
    if (textarea) {
      try {
        document.body.removeChild(textarea);
      } catch {
        // Already detached.
      }
    }
  }
}

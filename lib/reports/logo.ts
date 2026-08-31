import fs from "fs";
import path from "path";

let cachedLogoBuffer: Buffer | null = null;

/**
 * Returns the raw PNG buffer for the Celeritas logo (Icon + CELERITAS text).
 * Caches the buffer in memory for fast subsequent PDF generation calls.
 */
export async function getCeleritasLogoPngBuffer(): Promise<Buffer | null> {
  if (cachedLogoBuffer) {
    return cachedLogoBuffer;
  }

  const logoPath = path.join(process.cwd(), "public", "celeritas-logo.png");
  try {
    if (fs.existsSync(logoPath)) {
      cachedLogoBuffer = await fs.promises.readFile(logoPath);
      return cachedLogoBuffer;
    }
  } catch (err) {
    console.error("[logo] Failed to read Celeritas logo from public directory:", err);
  }

  return null;
}

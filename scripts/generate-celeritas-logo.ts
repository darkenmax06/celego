import fs from "fs";
import path from "path";
import sharp from "sharp";

// Standalone SVG of Celeritas logo (Icon + CELERITAS text, without MENSAJERIA EXPRESS)
const svg = `<svg width="450" height="90" viewBox="0 0 450 90" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(12, -10) scale(0.55)" fill="none" stroke="#0b1d36" stroke-width="17" stroke-linecap="round">
    <path d="M144.4 62.7 A58 58 0 1 0 144.4 137.3" />
    <path d="M20 68 L38 68" />
    <path d="M6 100 L26 100" />
    <path d="M20 132 L38 132" />
    <polygon points="142,76 176,100 142,124" fill="#0b1d36" stroke="none" />
  </g>
  <text x="125" y="59" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="42" font-weight="600" letter-spacing="5" fill="#0b1d36">CELERITAS</text>
</svg>`;

async function main() {
  const publicDir = path.join(process.cwd(), "public");
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const svgPath = path.join(publicDir, "celeritas-logo.svg");
  const pngPath = path.join(publicDir, "celeritas-logo.png");

  fs.writeFileSync(svgPath, svg, "utf8");

  await sharp(Buffer.from(svg), { density: 300 })
    .png()
    .toFile(pngPath);

  console.log("Logo files written to public/celeritas-logo.svg and public/celeritas-logo.png");
}

main().catch(console.error);

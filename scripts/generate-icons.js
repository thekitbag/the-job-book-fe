// Generates PNG app icons from public/icon.svg.
// Run with: node scripts/generate-icons.js
import sharp from 'sharp'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const svgPath = resolve(root, 'public', 'icon.svg')
const svg = readFileSync(svgPath)

const sizes = [192, 512]
for (const size of sizes) {
  const out = resolve(root, 'public', `icon-${size}.png`)
  await sharp(svg).resize(size, size).png().toFile(out)
  console.log(`wrote ${out}`)
}

// Genera los iconos PNG de la app (una mancuerna verde sobre fondo oscuro).
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function icon(size) {
  const bg = [9, 9, 11], fg = [163, 230, 53]
  const px = Buffer.alloc(size * size * 3)
  for (let i = 0; i < size * size; i++) px.set(bg, i * 3)
  const rect = (x0, y0, x1, y1) => {
    for (let y = Math.round(y0 * size); y < Math.round(y1 * size); y++)
      for (let x = Math.round(x0 * size); x < Math.round(x1 * size); x++) px.set(fg, (y * size + x) * 3)
  }
  rect(0.22, 0.47, 0.78, 0.53) // barra
  rect(0.24, 0.32, 0.32, 0.68) // discos izquierda
  rect(0.16, 0.38, 0.24, 0.62)
  rect(0.68, 0.32, 0.76, 0.68) // discos derecha
  rect(0.76, 0.38, 0.84, 0.62)
  const raw = Buffer.alloc((size * 3 + 1) * size)
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}
for (const s of [180, 192, 512]) writeFileSync(new URL(`../public/icon-${s}.png`, import.meta.url), icon(s))
console.log('Iconos generados')

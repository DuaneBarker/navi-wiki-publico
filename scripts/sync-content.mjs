#!/usr/bin/env node
// Copia el subconjunto público del second-brain de Navi hacia content/ de Quartz.
// SOLO copia las carpetas en ALLOWED_FOLDERS. Todo lo demás en el wiki fuente
// (partners/, suppliers/, campaigns/, competitors/, personas/, archivos sueltos
// como log.md/trends.md/index.md, y por supuesto 04-Finanzas y docs/sesiones,
// que ni siquiera viven bajo wiki/) queda excluido explícitamente.

import { existsSync, rmSync, cpSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, "..")

const SOURCE_WIKI = process.env.SOURCE_WIKI_PATH ?? "D:\\BarkeX\\Navi\\second-brain\\wiki"
const DEST_CONTENT = path.join(REPO_ROOT, "content")

const ALLOWED_FOLDERS = ["products", "brands", "ingredients", "skin-concerns", "inspiration"]

// Cualquier línea que contenga un wikilink hacia una de estas carpetas internas
// se elimina del archivo copiado, aunque la carpeta destino nunca vaya a existir
// publicada — evita que el nombre (proveedor, partner, competidor) quede como
// texto plano visible en el sitio público.
const REDACT_LINK_PREFIXES = ["suppliers/", "partners/", "campaigns/", "competitors/", "personas/"]

const EXCLUDED_NOTE = [
  "partners/",
  "suppliers/",
  "campaigns/",
  "competitors/",
  "personas/",
  "index.md, log.md, trends.md, validation-report.md (archivos sueltos en wiki/)",
  "04-Finanzas (fuera de wiki/, nunca tocado)",
  "docs/sesiones (fuera de wiki/, nunca tocado)",
]

if (!existsSync(SOURCE_WIKI)) {
  console.error(`No se encontró el wiki fuente en: ${SOURCE_WIKI}`)
  process.exit(1)
}

let totalFiles = 0

for (const folder of ALLOWED_FOLDERS) {
  const src = path.join(SOURCE_WIKI, folder)
  const dest = path.join(DEST_CONTENT, folder)

  if (!existsSync(src)) {
    console.warn(`⚠ Carpeta permitida "${folder}" no existe en el origen, se omite.`)
    continue
  }

  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true })
  }
  mkdirSync(dest, { recursive: true })
  cpSync(src, dest, { recursive: true })

  const count = countFiles(dest)
  totalFiles += count
  const redacted = redactExcludedLinks(dest)
  console.log(
    `✓ ${folder}/ → ${count} archivo(s) copiados` +
      (redacted > 0 ? ` (${redacted} línea(s) con referencias internas redactadas)` : ""),
  )
}

console.log(`\nTotal: ${totalFiles} archivos copiados a ${DEST_CONTENT}`)
console.log("\nCarpetas/archivos EXCLUIDOS deliberadamente (no publicados):")
for (const item of EXCLUDED_NOTE) console.log(`  - ${item}`)

function redactExcludedLinks(dir) {
  let redactedCount = 0
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      redactedCount += redactExcludedLinks(full)
      continue
    }
    if (!full.endsWith(".md")) continue

    const original = readFileSync(full, "utf-8")
    const lines = original.split("\n")
    const kept = lines.filter((line) => {
      const hasExcludedLink = REDACT_LINK_PREFIXES.some((prefix) => line.includes(`[[${prefix}`))
      if (hasExcludedLink) redactedCount++
      return !hasExcludedLink
    })

    if (kept.length !== lines.length) {
      writeFileSync(full, kept.join("\n"))
    }
  }
  return redactedCount
}

function countFiles(dir) {
  let count = 0
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      count += countFiles(full)
    } else {
      count += 1
    }
  }
  return count
}

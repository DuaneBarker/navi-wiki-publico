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

// Claves de frontmatter YAML que se eliminan por completo del archivo copiado
// (no solo el wikilink en el cuerpo) porque su valor identifica a un tercero
// interno (proveedor, partner) que no debe quedar visible en el repo público.
const REDACT_FRONTMATTER_KEYS = ["proveedor"]

// Secciones completas (heading exacto hasta el siguiente heading, cualquier
// nivel) que se eliminan del cuerpo porque por convención son notas internas
// dirigidas al equipo (ej. "## Nota operacional") y no contenido para el
// sitio público.
const REDACT_SECTION_HEADINGS = ["## Nota operacional"]

// Líneas sueltas (por prefijo, tras trim) que se eliminan porque por
// convención mezclan estado del producto con datos internos (proveedor,
// referencias a ADRs/documentos internos) — ej. notas de descontinuación.
const REDACT_LINE_PREFIXES = ["- **Descontinuado"]

// Archivos puntuales que, aunque vivan dentro de una carpeta permitida, no se
// publican porque su contenido es de estrategia/research interno, no
// "inspiración" pública. Ruta relativa a SOURCE_WIKI (con /).
const EXCLUDED_FILES = [
  "inspiration/blueprint-diseno-web-v1.md",
  // El propio archivo se autodeclara "Solo referencia interna — nunca se publican".
  "inspiration/taste-library.md",
]

const EXCLUDED_NOTE = [
  "partners/",
  "suppliers/",
  "campaigns/",
  "competitors/",
  "personas/",
  "index.md, log.md, trends.md, validation-report.md (archivos sueltos en wiki/)",
  "04-Finanzas (fuera de wiki/, nunca tocado)",
  "docs/sesiones (fuera de wiki/, nunca tocado)",
  "frontmatter 'proveedor:' (redactado de cada archivo copiado)",
  "líneas '- **Descontinuado...' (redactadas de cada archivo copiado)",
  ...EXCLUDED_FILES,
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
  removeExcludedFiles(folder, dest)

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
    const withoutSections = stripRedactedSections(lines)
    redactedCount += lines.length - withoutSections.length

    const kept = withoutSections.filter((line) => {
      const hasExcludedLink = REDACT_LINK_PREFIXES.some((prefix) => line.includes(`[[${prefix}`))
      const hasExcludedFrontmatterKey = REDACT_FRONTMATTER_KEYS.some((key) =>
        new RegExp(`^${key}\\s*:`).test(line),
      )
      const hasExcludedLinePrefix = REDACT_LINE_PREFIXES.some((prefix) => line.trim().startsWith(prefix))
      const shouldRedact = hasExcludedLink || hasExcludedFrontmatterKey || hasExcludedLinePrefix
      if (shouldRedact) redactedCount++
      return !shouldRedact
    })

    if (kept.length !== lines.length) {
      writeFileSync(full, kept.join("\n"))
    }
  }
  return redactedCount
}

function stripRedactedSections(lines) {
  const out = []
  let skipping = false
  for (const line of lines) {
    if (REDACT_SECTION_HEADINGS.includes(line.trim())) {
      skipping = true
      continue
    }
    if (skipping && /^#{1,6}\s/.test(line)) {
      skipping = false
    }
    if (!skipping) out.push(line)
  }
  return out
}

function removeExcludedFiles(folder, dest) {
  for (const excluded of EXCLUDED_FILES) {
    if (!excluded.startsWith(`${folder}/`)) continue
    const relative = excluded.slice(folder.length + 1)
    const full = path.join(dest, relative)
    if (existsSync(full)) {
      rmSync(full)
      console.log(`  ⛔ ${excluded} excluido explícitamente, no publicado.`)
    }
  }
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

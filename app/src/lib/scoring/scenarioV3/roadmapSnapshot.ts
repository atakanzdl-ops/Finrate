// app/src/lib/scoring/scenarioV3/roadmapSnapshot.ts
// V3 snapshot persistence helper (Faz 7.3.60.1)

import type { ScenarioV3ApiResponse } from './responseTypes'

export interface RoadmapSnapshotWrapper {
  schemaVersion:    number
  generatedAt:      string
  source:           'manual' | 'pdf-fallback'
  targetRating:     string
  inputFingerprint: string
  response:         ScenarioV3ApiResponse
}

const CURRENT_SCHEMA_VERSION = 1

/**
 * V3 response'tan snapshot wrapper üret.
 */
export function buildRoadmapSnapshot(
  response:         ScenarioV3ApiResponse,
  targetRating:     string,
  source:           'manual' | 'pdf-fallback',
  inputFingerprint: string,
): RoadmapSnapshotWrapper {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    generatedAt:   new Date().toISOString(),
    source,
    targetRating,
    inputFingerprint,
    response,
  }
}

/**
 * JSON string'i parse et.
 * Geçersiz veya eski sürüm ise null döner.
 */
export function parseRoadmapSnapshot(
  json: string | null,
): RoadmapSnapshotWrapper | null {
  if (!json) return null

  try {
    const parsed = JSON.parse(json) as RoadmapSnapshotWrapper

    if (parsed.schemaVersion !== CURRENT_SCHEMA_VERSION) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

/**
 * Mevcut girdilere göre snapshot fingerprint hesapla.
 * Snapshot fresh mi kontrolü için (defansif ikinci güvenlik katmanı).
 */
export function buildRoadmapInputFingerprint(inputs: {
  finalScore?:            number | null
  finalRating?:           string | null
  sectorCode?:            string | null
  financialAccountsHash?: string | null
  subjectiveTotal?:       number | null
}): string {
  const parts = [
    inputs.finalScore            ?? '_',
    inputs.finalRating           ?? '_',
    inputs.sectorCode            ?? '_',
    inputs.financialAccountsHash ?? '_',
    inputs.subjectiveTotal       ?? '_',
  ]
  return parts.join('|')
}

/**
 * Snapshot, mevcut girdilerle uyuşuyor mu?
 */
export function isRoadmapSnapshotFresh(
  snapshot:            RoadmapSnapshotWrapper | null,
  currentFingerprint:  string,
): boolean {
  if (!snapshot) return false
  return snapshot.inputFingerprint === currentFingerprint
}

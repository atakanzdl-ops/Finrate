/**
 * Stateless structured logger — Faz 6b
 * Metrik backend Faz 8'de bağlanacak.
 */

export type LogEvent =
  | 'engine_selected'
  | 'engine_error'
  | 'fallback'
  | 'engine_double_fail'
  | 'targetRating_normalized_miss'

export function logEvent(event: LogEvent, data: Record<string, unknown>): void {
  console.log(JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    ...data,
  }))
}

export function generateCorrelationId(): string {
  return Math.random().toString(36).slice(2, 10)
}

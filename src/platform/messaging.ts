import { AppError } from '../core/errors.js';
import type { Reply, RecordingSession } from '../core/model.js';
export async function command<T>(type: string, fields: Record<string, unknown> = {}): Promise<T> {
  const reply = await chrome.runtime.sendMessage<Reply<T>>({ ...fields, type });
  if (!reply || typeof reply !== 'object' || typeof reply.ok !== 'boolean')
    throw new AppError('invalid-data', 'Die Erweiterung hat keine gültige Antwort geliefert. Bitte neu laden.');
  if (!reply.ok)
    throw new AppError('invalid-data', reply.error);
  return reply.value;
}
export function recordingState(): Promise<RecordingSession | null> { return command('GET_STATE'); }

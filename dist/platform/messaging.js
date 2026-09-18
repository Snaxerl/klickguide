import { AppError } from '../core/errors.js';
export async function command(type, fields = {}) {
    const reply = await chrome.runtime.sendMessage({ ...fields, type });
    if (!reply || typeof reply !== 'object' || typeof reply.ok !== 'boolean')
        throw new AppError('invalid-data', 'Die Erweiterung hat keine gültige Antwort geliefert. Bitte neu laden.');
    if (!reply.ok)
        throw new AppError('invalid-data', reply.error);
    return reply.value;
}
export function recordingState() { return command('GET_STATE'); }

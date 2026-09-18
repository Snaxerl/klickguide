export class AppError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'AppError';
    }
}
export function errorMessage(error) {
    if (error instanceof AppError)
        return error.message;
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        return 'Der lokale Speicher ist voll. Exportiere eine Sicherung und lösche nicht mehr benötigte Anleitungen.';
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
        return 'Der Vorgang wurde abgebrochen. Deine zuletzt gespeicherte Version bleibt erhalten.';
    }
    return 'Der Vorgang konnte nicht abgeschlossen werden. Bitte erneut versuchen. Details stehen in der Erweiterungskonsole.';
}
export function assert(condition, message) {
    if (!condition)
        throw new AppError('invalid-data', message);
}

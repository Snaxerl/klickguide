export function cleanLabel(value) {
    return value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
}
export function actionTitle(action, language) {
    const label = cleanLabel(action.label);
    if (language === 'en') {
        if (action.kind === 'manual')
            return 'Review this step';
        if (action.kind === 'input')
            return label ? `Fill in “${label}”` : 'Fill in the field';
        return label ? `Click “${label}”` : 'Click the highlighted control';
    }
    if (action.kind === 'manual')
        return 'Prüfe diesen Schritt';
    if (action.kind === 'input')
        return label ? `Fülle „${label}“ aus` : 'Fülle das Feld aus';
    return label ? `Klicke auf „${label}“` : 'Klicke auf das markierte Element';
}
export function safeOrigin(value) {
    try {
        const url = new URL(value);
        return (url.protocol === 'http:' || url.protocol === 'https:') ? url.origin : '';
    }
    catch {
        return '';
    }
}
export function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}
export function escapeMarkdown(value) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/([\\`*_{}\[\]()#+.!|~-])/g, '\\$1');
}
export function safeFilename(title) {
    const name = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '').slice(0, 70).toLowerCase();
    return name && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(name) ? name : 'anleitung';
}
export function formatDate(timestamp) {
    return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }).format(timestamp);
}
export function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

import { AppError } from '../core/errors.js';
// captureVisibleTab needs <all_urls> for persistent access; a pair of HTTP/HTTPS
// host patterns is not sufficient for that API. Recording itself stays HTTP(S)-only.
const ALL_WEBSITES = '<all_urls>';
export const WEBSITE_ACCESS_MESSAGE = 'KlickGuide fehlt der dauerhafte Websitezugriff. Wähle in den Erweiterungsdetails unter „Websitezugriff“ die Einstellung „Auf allen Websites“.';
export function hasWebsiteAccess() {
    return chrome.permissions.contains({ origins: [ALL_WEBSITES] });
}
export async function requireWebsiteAccess() {
    if (!await hasWebsiteAccess())
        throw new AppError('permission', WEBSITE_ACCESS_MESSAGE);
}
/** Call directly from a button handler so Chrome retains the user gesture. */
export async function requestWebsiteAccess() {
    const granted = await chrome.permissions.request({ origins: [ALL_WEBSITES] });
    if (!granted)
        throw new AppError('permission', 'Der Websitezugriff wurde nicht erteilt. Ohne diese Freigabe wird keine Aufnahme gestartet. Du kannst die Einstellung später in den Erweiterungsdetails ändern.');
}

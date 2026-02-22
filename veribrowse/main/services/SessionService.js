import { session } from 'electron';

/**
 * SessionService
 * Manages cookie synchronization between the Electron main session
 * and the Playwright BrowserContext. This ensures that if a user is logged
 * into a site in a User Tab, the Agent (Shadow Tab) is also logged in.
 */

/**
 * Gets all cookies from the default Electron session.
 */
export async function getSessionCookies() {
    try {
        return await session.defaultSession.cookies.get({});
    } catch (err) {
        console.error('[SessionService] Failed to get session cookies:', err.message);
        return [];
    }
}

/**
 * Sets cookies into the default Electron session.
 */
export async function setSessionCookies(cookies) {
    try {
        const promises = cookies.map((cookie) => {
            const { name, value, domain, path, secure, httpOnly, expirationDate } = cookie;
            // Convert Playwright/DB cookie format to Electron format
            const url = `${secure ? 'https' : 'http'}://${domain.startsWith('.') ? domain.substring(1) : domain}${path}`;
            return session.defaultSession.cookies.set({
                url,
                name,
                value,
                domain,
                path,
                secure,
                httpOnly,
                expirationDate,
            });
        });
        await Promise.all(promises);
    } catch (err) {
        console.error('[SessionService] Failed to set session cookies:', err.message);
    }
}

/**
 * Clears all cookies from the default Electron session.
 */
export async function clearSession() {
    try {
        await session.defaultSession.clearStorageData({ storages: ['cookies'] });
    } catch (err) {
        console.error('[SessionService] Failed to clear session:', err.message);
    }
}

/**
 * Formats Electron cookies for Playwright BrowserContext.
 */
export function formatForPlaywright(electronCookies) {
    return electronCookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expirationDate,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: 'Lax', // Default safe choice
    }));
}

/**
 * syncSession.js
 * 
 * Synchronizes cookies from the Electron session to the Playwright context.
 * Ensures the Agent shares the User's logged-in state.
 * 
 * ZERO LLM calls.
 */

import * as SessionService from '../../services/SessionService.js';

export default async function syncSession(page) {
    try {
        console.log('[Tool:SyncSession] Synchronizing cookies from Electron to Playwright...');

        // 1. Get cookies from Electron main session
        const electronCookies = await SessionService.getSessionCookies();

        // 2. Format for Playwright
        const playwrightCookies = SessionService.formatForPlaywright(electronCookies);

        // 3. Apply to Playwright context
        const context = page.context();
        await context.addCookies(playwrightCookies);

        console.log(`[Tool:SyncSession] Successfully synced ${playwrightCookies.length} cookies.`);

        return {
            success: true,
            result: `Synced ${playwrightCookies.length} cookies`,
            error: null
        };
    } catch (err) {
        console.error(`[Tool:SyncSession] Failed: ${err.message}`);
        return {
            success: false,
            result: null,
            error: err.message
        };
    }
}

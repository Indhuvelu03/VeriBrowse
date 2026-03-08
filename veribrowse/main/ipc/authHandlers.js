import { ipcMain } from 'electron';
import * as AuthService from '../services/AuthService.js';
import * as UserProfileService from '../services/UserProfileService.js';

/**
 * authHandlers.js
 * 
 * IPC handlers for authentication and profile management.
 * NOTE: Firebase authentication happens in the renderer (Next.js).
 * This handler manages Supabase sync and profile data.
 */

export function registerAuthHandlers() {

    // ── auth:sync-user ────────────────────────────────────────────────────────
    // Called by renderer after Firebase auth succeeds
    ipcMain.handle('auth:sync-user', async (event, { uid, email, displayName }) => {
        try {
            const result = await AuthService.syncUserToSupabase(uid, {
                email,
                display_name: displayName,
                auth_provider: 'firebase',
            });

            if (result) {
                // Initialize user profile
                await UserProfileService.initializeUserProfile(uid, {
                    email,
                    display_name: displayName,
                    auth_provider: 'firebase',
                });

                return { success: true, profile: result };
            } else {
                return { success: false, error: 'Failed to sync user' };
            }
        } catch (err) {
            console.error('[IPC:auth:sync-user] Error:', err.message);
            return { success: false, error: err.message };
        }
    });

    // ── auth:update-last-login ────────────────────────────────────────────────
    // Called by renderer on successful sign in
    ipcMain.handle('auth:update-last-login', async (event, { uid }) => {
        try {
            await AuthService.updateUserLastLogin(uid);
            return { success: true };
        } catch (err) {
            console.error('[IPC:auth:update-last-login] Error:', err.message);
            return { success: false, error: err.message };
        }
    });

    // ── auth:delete-account ────────────────────────────────────────────────────
    ipcMain.handle('auth:delete-account', async (event, { uid }) => {
        try {
            const result = await AuthService.deleteUserAccount(uid);
            return result;
        } catch (err) {
            console.error('[IPC:auth:delete-account] Error:', err.message);
            return { success: false, error: err.message };
        }
    });

    // ── profile:get-user-profile ───────────────────────────────────────────────
    ipcMain.handle('profile:get-user-profile', async (event, { uid }) => {
        try {
            const profile = await AuthService.getUserProfile(uid);
            return { success: true, profile };
        } catch (err) {
            console.error('[IPC:profile:get-user-profile] Error:', err.message);
            return { success: false, error: err.message };
        }
    });

    // ── profile:update-user-profile ────────────────────────────────────────────
    ipcMain.handle('profile:update-user-profile', async (event, { uid, updates }) => {
        try {
            const result = await AuthService.updateUserProfile(uid, updates);
            return result;
        } catch (err) {
            console.error('[IPC:profile:update-user-profile] Error:', err.message);
            return { success: false, error: err.message };
        }
    });

    // ── profile:get-user-preferences ───────────────────────────────────────────
    ipcMain.handle('profile:get-user-preferences', async (event, { uid }) => {
        try {
            const preferences = await UserProfileService.getUserPreferences(uid);
            return { success: true, preferences };
        } catch (err) {
            console.error('[IPC:profile:get-user-preferences] Error:', err.message);
            return { success: false, error: err.message };
        }
    });

    // ── profile:update-user-preferences ────────────────────────────────────────
    ipcMain.handle('profile:update-user-preferences', async (event, { uid, preferences }) => {
        try {
            const result = await UserProfileService.updateUserPreferences(uid, preferences);
            return result;
        } catch (err) {
            console.error('[IPC:profile:update-user-preferences] Error:', err.message);
            return { success: false, error: err.message };
        }
    });

    // ── profile:get-user-stats ────────────────────────────────────────────────
    ipcMain.handle('profile:get-user-stats', async (event, { uid }) => {
        try {
            const stats = await UserProfileService.getUserStats(uid);
            return { success: true, stats };
        } catch (err) {
            console.error('[IPC:profile:get-user-stats] Error:', err.message);
            return { success: false, error: err.message };
        }
    });

    // ── profile:get-user-account-info ──────────────────────────────────────────
    ipcMain.handle('profile:get-user-account-info', async (event, { uid }) => {
        try {
            const accountInfo = await UserProfileService.getUserAccountInfo(uid);
            return { success: true, accountInfo };
        } catch (err) {
            console.error('[IPC:profile:get-user-account-info] Error:', err.message);
            return { success: false, error: err.message };
        }
    });

    // ── profile:update-user-avatar ────────────────────────────────────────────
    ipcMain.handle('profile:update-user-avatar', async (event, { uid, avatarUrl }) => {
        try {
            const result = await UserProfileService.updateUserAvatar(uid, avatarUrl);
            return result;
        } catch (err) {
            console.error('[IPC:profile:update-user-avatar] Error:', err.message);
            return { success: false, error: err.message };
        }
    });

    // ── profile:clear-user-profile ────────────────────────────────────────────
    ipcMain.handle('profile:clear-user-profile', async (event, { uid }) => {
        try {
            const result = UserProfileService.clearUserProfile(uid);
            return result;
        } catch (err) {
            console.error('[IPC:profile:clear-user-profile] Error:', err.message);
            return { success: false, error: err.message };
        }
    });
}

import Store from 'electron-store';
import { updateUserProfile, getUserProfile } from './AuthService.js';

const store = new Store();

// ─── USER PROFILE MANAGEMENT ────────────────────────────────────────────────

/**
 * Get user preferences and settings
 */
export async function getUserPreferences(uid) {
  try {
    const preferences = store.get(`user-preferences-${uid}`, {
      theme: 'dark',
      autoSave: true,
      maxCredits: 1000,
      language: 'en',
      notifications: true,
      researchMode: false,
      apiTimeout: 30000,
    });

    return preferences;
  } catch (err) {
    console.error('[UserProfileService] Get preferences failed:', err.message);
    return null;
  }
}

/**
 * Update user preferences
 */
export async function updateUserPreferences(uid, preferences) {
  try {
    store.set(`user-preferences-${uid}`, {
      ...store.get(`user-preferences-${uid}`, {}),
      ...preferences,
      updatedAt: new Date().toISOString(),
    });

    // Also sync to Supabase if available
    await updateUserProfile(uid, {
      preferences: preferences,
    });

    return { success: true };
  } catch (err) {
    console.error('[UserProfileService] Update preferences failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Initialize user profile with default values
 */
export async function initializeUserProfile(uid, userData) {
  try {
    // Set local preferences
    const preferences = {
      theme: 'dark',
      autoSave: true,
      maxCredits: 1000,
      language: 'en',
      notifications: true,
      researchMode: false,
      apiTimeout: 30000,
      createdAt: new Date().toISOString(),
    };

    store.set(`user-preferences-${uid}`, preferences);

    // Initialize Supabase profile (if available)
    const profileData = {
      uid,
      ...userData,
      preferences,
      credits_used: 0,
      total_sessions: 0,
      total_workflows: 0,
      created_at: new Date().toISOString(),
    };

    const result = await updateUserProfile(uid, profileData);
    return result;
  } catch (err) {
    console.error('[UserProfileService] Initialize profile failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Get user stats (credits, sessions, etc.)
 */
export async function getUserStats(uid) {
  try {
    const profile = await getUserProfile(uid);
    if (!profile) {
      return {
        creditsUsed: 0,
        totalSessions: 0,
        totalWorkflows: 0,
        accountCreated: null,
        lastLogin: null,
      };
    }

    return {
      creditsUsed: profile.credits_used || 0,
      totalSessions: profile.total_sessions || 0,
      totalWorkflows: profile.total_workflows || 0,
      accountCreated: profile.created_at,
      lastLogin: profile.last_login,
    };
  } catch (err) {
    console.error('[UserProfileService] Get stats failed:', err.message);
    return null;
  }
}

/**
 * Update user stats
 */
export async function updateUserStats(uid, updates) {
  try {
    const result = await updateUserProfile(uid, updates);
    return result;
  } catch (err) {
    console.error('[UserProfileService] Update stats failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Get user avatar/profile photo
 */
export async function getUserAvatar(uid) {
  try {
    const profile = await getUserProfile(uid);
    return profile?.avatar_url || null;
  } catch (err) {
    console.error('[UserProfileService] Get avatar failed:', err.message);
    return null;
  }
}

/**
 * Update user avatar
 */
export async function updateUserAvatar(uid, avatarUrl) {
  try {
    const result = await updateUserProfile(uid, {
      avatar_url: avatarUrl,
    });
    return result;
  } catch (err) {
    console.error('[UserProfileService] Update avatar failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Get user account info
 */
export async function getUserAccountInfo(uid) {
  try {
    const profile = await getUserProfile(uid);
    if (!profile) return null;

    return {
      uid: profile.uid,
      email: profile.email,
      displayName: profile.display_name,
      authProvider: profile.auth_provider,
      accountCreated: profile.created_at,
      lastLogin: profile.last_login,
      creditsLimit: profile.credits_limit || 1000,
    };
  } catch (err) {
    console.error('[UserProfileService] Get account info failed:', err.message);
    return null;
  }
}

/**
 * Clear user profile (on logout)
 */
export function clearUserProfile(uid) {
  try {
    store.delete(`user-preferences-${uid}`);
    store.delete('currentUser');
    return { success: true };
  } catch (err) {
    console.error('[UserProfileService] Clear profile failed:', err.message);
    return { success: false, error: err.message };
  }
}

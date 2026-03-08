import { create } from 'zustand';
import * as firebaseAuth from '../lib/firebaseAuth';

/**
 * authStore
 * 
 * Manages global authentication state and user profile information.
 * Firebase auth handled client-side, Supabase sync via IPC.
 */

export const useAuthStore = create((set, get) => ({
  // Authentication State
  currentUser: null,
  isAuthenticated: false,
  isLoading: false,
  authError: null,
  firebaseReady: false,

  // Profile State
  userProfile: null,
  userPreferences: null,
  userStats: null,

  // Modal/Form State
  showAuthModal: false,
  authMode: 'login', // 'login' | 'signup' | 'reset'

  // Actions
  
  /**
   * Initialize Firebase with config
   */
  initializeFirebase: (config) => {
    try {
      const success = firebaseAuth.initializeFirebase(config);
      set({ firebaseReady: success });
      return success;
    } catch (err) {
      console.error('[authStore] Firebase init failed:', err.message);
      return false;
    }
  },

  /**
   * Set current user
   */
  setCurrentUser: (user) => {
    set({
      currentUser: user,
      isAuthenticated: !!user,
      authError: null,
    });
  },

  /**
   * Clear current user (logout)
   */
  clearCurrentUser: () => {
    set({
      currentUser: null,
      isAuthenticated: false,
      userProfile: null,
      userPreferences: null,
      userStats: null,
    });
  },

  /**
   * Set loading state
   */
  setIsLoading: (loading) => {
    set({ isLoading: loading });
  },

  /**
   * Set authentication error
   */
  setAuthError: (error) => {
    set({ authError: error });
  },

  /**
   * Clear authentication error
   */
  clearAuthError: () => {
    set({ authError: null });
  },

  /**
   * Set user profile
   */
  setUserProfile: (profile) => {
    set({ userProfile: profile });
  },

  /**
   * Set user preferences
   */
  setUserPreferences: (preferences) => {
    set({ userPreferences: preferences });
  },

  /**
   * Set user stats
   */
  setUserStats: (stats) => {
    set({ userStats: stats });
  },

  /**
   * Update user profile partially
   */
  updateUserProfile: (updates) => {
    set((state) => ({
      userProfile: state.userProfile ? { ...state.userProfile, ...updates } : null,
    }));
  },

  /**
   * Update user preferences partially
   */
  updateUserPreferences: (updates) => {
    set((state) => ({
      userPreferences: state.userPreferences ? { ...state.userPreferences, ...updates } : null,
    }));
  },

  /**
   * Update user stats partially
   */
  updateUserStats: (updates) => {
    set((state) => ({
      userStats: state.userStats ? { ...state.userStats, ...updates } : null,
    }));
  },

  /**
   * Show/hide auth modal
   */
  setShowAuthModal: (show) => {
    set({ showAuthModal: show });
  },

  /**
   * Set auth mode (login, signup, reset)
   */
  setAuthMode: (mode) => {
    set({ authMode: mode });
  },

  /**
   * Open auth modal in login mode
   */
  openLoginModal: () => {
    set({ showAuthModal: true, authMode: 'login', authError: null });
  },

  /**
   * Open auth modal in signup mode
   */
  openSignupModal: () => {
    set({ showAuthModal: true, authMode: 'signup', authError: null });
  },

  /**
   * Open auth modal in reset password mode
   */
  openResetPasswordModal: () => {
    set({ showAuthModal: true, authMode: 'reset', authError: null });
  },

  /**
   * Close auth modal
   */
  closeAuthModal: () => {
    set({ showAuthModal: false, authError: null });
  },

  /**
   * Perform sign up using Firebase
   */
  signUp: async (email, password, displayName) => {
    set({ isLoading: true, authError: null });
    try {
      const result = await firebaseAuth.signUp(email, password, displayName);
      
      if (result.success) {
        set({
          currentUser: result.user,
          isAuthenticated: true,
          isLoading: false,
          showAuthModal: false,
        });
        return { success: true };
      } else {
        set({
          authError: result.error,
          isLoading: false,
        });
        return { success: false, error: result.error };
      }
    } catch (err) {
      const errorMsg = err.message || 'Sign up failed';
      set({
        authError: errorMsg,
        isLoading: false,
      });
      return { success: false, error: errorMsg };
    }
  },

  /**
   * Perform sign in using Firebase
   */
  signIn: async (email, password) => {
    set({ isLoading: true, authError: null });
    try {
      const result = await firebaseAuth.signIn(email, password);
      
      if (result.success) {
        set({
          currentUser: result.user,
          isAuthenticated: true,
          isLoading: false,
          showAuthModal: false,
        });
        return { success: true };
      } else {
        set({
          authError: result.error,
          isLoading: false,
        });
        return { success: false, error: result.error };
      }
    } catch (err) {
      const errorMsg = err.message || 'Sign in failed';
      set({
        authError: errorMsg,
        isLoading: false,
      });
      return { success: false, error: errorMsg };
    }
  },

  /**
   * Perform sign out
   */
  signOut: async () => {
    set({ isLoading: true });
    try {
      const result = await firebaseAuth.logout();
      
      if (result.success) {
        set({
          currentUser: null,
          isAuthenticated: false,
          userProfile: null,
          userPreferences: null,
          userStats: null,
          isLoading: false,
        });
        return { success: true };
      } else {
        set({ isLoading: false });
        return { success: false, error: result.error };
      }
    } catch (err) {
      set({ isLoading: false });
      return { success: false, error: err.message };
    }
  },

  /**
   * Send password reset email
   */
  sendPasswordReset: async (email) => {
    set({ isLoading: true });
    try {
      const result = await firebaseAuth.sendPasswordReset(email);
      set({ isLoading: false });
      return result;
    } catch (err) {
      set({ isLoading: false });
      return { success: false, error: err.message };
    }
  },

  /**
   * Delete user account
   */
  deleteAccount: async () => {
    set({ isLoading: true });
    try {
      const result = await firebaseAuth.deleteAccount();
      if (result.success) {
        set({
          currentUser: null,
          isAuthenticated: false,
          userProfile: null,
          userPreferences: null,
          userStats: null,
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }
      return result;
    } catch (err) {
      set({ isLoading: false });
      return { success: false, error: err.message };
    }
  },

  /**
   * Watch Firebase auth state
   */
  watchAuthState: () => {
    return firebaseAuth.watchAuthState((user) => {
      if (user) {
        set({
          currentUser: user,
          isAuthenticated: true,
        });
      } else {
        get().clearCurrentUser();
      }
    });
  },

  /**
   * Load user profile
   */
  loadUserProfile: async (uid) => {
    try {
      if (!window.electronAPI?.profile) {
        throw new Error('Profile API not available');
      }

      const result = await window.electronAPI.profile.getUserProfile(uid);
      
      if (result.success) {
        set({ userProfile: result.profile });
        return { success: true };
      } else {
        return { success: false, error: result.error };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  /**
   * Load user preferences
   */
  loadUserPreferences: async (uid) => {
    try {
      if (!window.electronAPI?.profile) {
        throw new Error('Profile API not available');
      }

      const result = await window.electronAPI.profile.getUserPreferences(uid);
      
      if (result.success) {
        set({ userPreferences: result.preferences });
        return { success: true };
      } else {
        return { success: false, error: result.error };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  /**
   * Load user stats
   */
  loadUserStats: async (uid) => {
    try {
      if (!window.electronAPI?.profile) {
        throw new Error('Profile API not available');
      }

      const result = await window.electronAPI.profile.getUserStats(uid);
      
      if (result.success) {
        set({ userStats: result.stats });
        return { success: true };
      } else {
        return { success: false, error: result.error };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  /**
   * Save user preferences
   */
  saveUserPreferences: async (uid, preferences) => {
    try {
      if (!window.electronAPI?.profile) {
        throw new Error('Profile API not available');
      }

      const result = await window.electronAPI.profile.updateUserPreferences(uid, preferences);
      
      if (result.success) {
        set((state) => ({
          userPreferences: { ...state.userPreferences, ...preferences },
        }));
        return { success: true };
      } else {
        return { success: false, error: result.error };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  /**
   * Load full user data (profile, preferences, stats)
   */
  loadFullUserData: async (uid) => {
    try {
      const [profileRes, prefsRes, statsRes] = await Promise.all([
        get().loadUserProfile(uid),
        get().loadUserPreferences(uid),
        get().loadUserStats(uid),
      ]);

      if (profileRes.success && prefsRes.success && statsRes.success) {
        return { success: true };
      } else {
        const errors = [];
        if (!profileRes.success) errors.push(profileRes.error);
        if (!prefsRes.success) errors.push(prefsRes.error);
        if (!statsRes.success) errors.push(statsRes.error);
        return { success: false, error: errors.join(', ') };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
}));

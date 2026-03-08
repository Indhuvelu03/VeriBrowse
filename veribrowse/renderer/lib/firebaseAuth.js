/**
 * firebaseAuth.js
 * 
 * Client-side Firebase authentication for the renderer process.
 * This handles all Firebase auth operations.
 */

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  deleteUser,
} from 'firebase/auth';

let firebaseApp = null;
let firebaseAuth = null;

/**
 * Initialize Firebase with config
 */
export function initializeFirebase(config) {
  try {
    if (!config || !config.apiKey) {
      console.warn('[Firebase] Config not provided, skipping initialization');
      return false;
    }

    if (!firebaseApp) {
      firebaseApp = initializeApp(config);
      firebaseAuth = getAuth(firebaseApp);
    }
    return true;
  } catch (err) {
    console.error('[Firebase] Initialization failed:', err.message);
    return false;
  }
}

/**
 * Check if Firebase is initialized
 */
export function isFirebaseReady() {
  return !!firebaseAuth;
}

/**
 * Sign up with email and password
 */
export async function signUp(email, password, displayName = '') {
  try {
    if (!firebaseAuth) {
      throw new Error('Firebase not initialized');
    }

    const userCredential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
    const user = userCredential.user;

    if (displayName) {
      await updateProfile(user, { displayName });
    }

    // Sync to main process
    if (window.electronAPI?.auth?.syncUser) {
      await window.electronAPI.auth.syncUser({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
      });
    }

    return {
      success: true,
      user: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
      },
    };
  } catch (err) {
    console.error('[Firebase] Sign up failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Sign in with email and password
 */
export async function signIn(email, password) {
  try {
    if (!firebaseAuth) {
      throw new Error('Firebase not initialized');
    }

    const userCredential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    const user = userCredential.user;

    // Update last login in main process
    if (window.electronAPI?.auth?.updateLastLogin) {
      await window.electronAPI.auth.updateLastLogin({ uid: user.uid });
    }

    return {
      success: true,
      user: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
      },
    };
  } catch (err) {
    console.error('[Firebase] Sign in failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Sign out
 */
export async function logout() {
  try {
    if (!firebaseAuth) {
      throw new Error('Firebase not initialized');
    }

    await signOut(firebaseAuth);
    return { success: true };
  } catch (err) {
    console.error('[Firebase] Sign out failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Get current user
 */
export function getCurrentUser() {
  return new Promise((resolve) => {
    if (!firebaseAuth) {
      resolve(null);
      return;
    }

    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      unsubscribe();
      if (user) {
        resolve({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
        });
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Watch auth state changes
 */
export function watchAuthState(callback) {
  if (!firebaseAuth) {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(firebaseAuth, (user) => {
    if (user) {
      callback({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
      });
    } else {
      callback(null);
    }
  });
}

/**
 * Send password reset email
 */
export async function sendPasswordReset(email) {
  try {
    if (!firebaseAuth) {
      throw new Error('Firebase not initialized');
    }

    await sendPasswordResetEmail(firebaseAuth, email);
    return { success: true };
  } catch (err) {
    console.error('[Firebase] Password reset failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Delete user account
 */
export async function deleteAccount() {
  try {
    if (!firebaseAuth || !firebaseAuth.currentUser) {
      throw new Error('No user logged in');
    }

    const uid = firebaseAuth.currentUser.uid;
    await deleteUser(firebaseAuth.currentUser);

    // Delete from Supabase via main process
    if (window.electronAPI?.auth?.deleteAccount) {
      await window.electronAPI.auth.deleteAccount({ uid });
    }

    return { success: true };
  } catch (err) {
    console.error('[Firebase] Delete account failed:', err.message);
    return { success: false, error: err.message };
  }
}

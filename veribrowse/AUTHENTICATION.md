# VeriBrowse Authentication & User Profile System

## Overview

This document outlines the complete authentication and user profile system implemented in VeriBrowse 3.0, supporting both **Firebase Authentication** and **Supabase** for data persistence.

## Architecture

### Technology Stack
- **Authentication**: Firebase Authentication (email/password)
- **Database**: Supabase (PostgreSQL with vector support)
- **State Management**: Zustand (React)
- **IPC Communication**: Electron IPC (main ↔ renderer)

### Components & Services

#### 1. **AuthService.js** (`main/services/AuthService.js`)
Handles Firebase authentication operations and Supabase sync.

**Key Functions:**
- `signUpWithFirebase(email, password, displayName)` - Create new user account
- `signInWithFirebase(email, password)` - Sign in existing user
- `signOutFromFirebase()` - Sign out current user
- `sendPasswordReset(email)` - Send password reset email
- `getCurrentUser()` - Get current authenticated user
- `watchAuthState(callback)` - Watch auth state changes (real-time)
- `deleteUserAccount()` - Delete user account and associated data
- `getUserProfile(uid)` - Get user profile from Supabase
- `updateUserProfile(uid, updates)` - Update user profile
- `setFirebaseConfig(config)` - Configure Firebase

#### 2. **UserProfileService.js** (`main/services/UserProfileService.js`)
Manages user preferences and profile data.

**Key Functions:**
- `initializeUserProfile(uid, userData)` - Initialize new user profile
- `getUserPreferences(uid)` - Get user preferences
- `updateUserPreferences(uid, preferences)` - Save user preferences
- `getUserStats(uid)` - Get user statistics
- `updateUserStats(uid, updates)` - Update user stats
- `getUserAvatar(uid)` - Get user avatar URL
- `updateUserAvatar(uid, avatarUrl)` - Update user avatar
- `clearUserProfile(uid)` - Clear profile on logout

#### 3. **authHandlers.js** (`main/ipc/authHandlers.js`)
IPC handlers for authentication requests from the renderer.

**Available Channels:**
```javascript
// Authentication
'auth:sign-up'              // Create account
'auth:sign-in'              // Sign in
'auth:sign-out'             // Sign out
'auth:get-current-user'     // Get current user
'auth:password-reset'       // Request password reset
'auth:set-firebase-config'  // Set Firebase config
'auth:delete-account'       // Delete account

// Profile Management
'profile:get-user-profile'
'profile:update-user-profile'
'profile:get-user-preferences'
'profile:update-user-preferences'
'profile:get-user-stats'
'profile:get-user-account-info'
'profile:update-user-avatar'
'profile:clear-user-profile'
```

#### 4. **authStore.js** (`renderer/store/authStore.js`)
Zustand store for client-side authentication state.

**State:**
- `currentUser` - Currently authenticated user
- `isAuthenticated` - Boolean authentication status
- `isLoading` - Loading indicator
- `authError` - Last authentication error
- `userProfile` - User profile data
- `userPreferences` - User preferences
- `userStats` - User statistics
- `showAuthModal` - Auth modal visibility
- `authMode` - Auth mode ('login' | 'signup' | 'reset')

**Actions:**
- `setCurrentUser(user)` - Set authenticated user
- `signUp(email, password, displayName)` - Create account
- `signIn(email, password)` - Sign in
- `signOut()` - Sign out
- `loadUserProfile(uid)` - Load user profile
- `loadUserPreferences(uid)` - Load preferences
- `loadUserStats(uid)` - Load statistics
- `saveUserPreferences(uid, preferences)` - Save preferences
- `loadFullUserData(uid)` - Load all user data

#### 5. **AuthModal.jsx** (`renderer/components/agent/AuthModal.jsx`)
Modal component for authentication UI.

**Features:**
- Login mode
- Sign up mode (with password confirmation)
- Form validation
- Error display
- Mode switching

#### 6. **Updated SettingsPage.jsx** (`renderer/components/pages/SettingsPage.jsx`)
Enhanced settings page with user profile and authentication.

**Sections:**
- **User Profile** (if logged in)
  - Display name, email
  - Account creation date
  - Last login date
  - Usage statistics (sessions, workflows, credits)
  - Sign out button

- **User Preferences** (if logged in)
  - Auto-save workflows toggle
  - Notifications toggle
  - Research mode toggle
  - API timeout configuration
  - Save preferences button

- **Intelligence Profile**
  - Gemini API key configuration

- **Knowledge Core**
  - Supabase URL and API key

- **Firebase Authentication**
  - Firebase Project ID configuration

#### 7. **Updated Siderail.jsx** (`renderer/components/shell/Siderail.jsx`)
Navigation sidebar with authentication integration.

**Changes:**
- Profile button shows "Sign In" if not authenticated
- Profile button shows "Profile" if authenticated
- Green badge on profile icon when logged in
- Clicking profile icon opens auth modal or settings

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  uid TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  auth_provider TEXT DEFAULT 'firebase',
  credits_used INTEGER DEFAULT 0,
  credits_limit INTEGER DEFAULT 1000,
  total_sessions INTEGER DEFAULT 0,
  total_workflows INTEGER DEFAULT 0,
  preferences JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_login TIMESTAMPTZ
);
```

### Modified Tables
All existing tables (history, chat_history, downloads, agent_skills) now have:
- `uid TEXT REFERENCES users(uid) ON DELETE CASCADE` - Link to user
- `uid` indexed for fast queries

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

Firebase should already be in package.json.

### 2. Configure Firebase

Set your Firebase configuration in the Settings Panel or via environment setup:

```javascript
{
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
}
```

### 3. Configure Supabase

Set your Supabase credentials in the Settings Panel:
- **Supabase URL**: `https://your-project.supabase.co`
- **Anon Key**: Your public anonymous key

### 4. Update Database Schema

Run the migration in `supabase/schema.sql` to create the users table and update existing tables with UID foreign keys.

## Usage Examples

### Sign Up
```javascript
const { signUp } = authStore;
const result = await signUp('user@example.com', 'password123', 'John Doe');

if (result.success) {
  console.log('Account created!');
} else {
  console.error(result.error);
}
```

### Sign In
```javascript
const { signIn } = authStore;
const result = await signIn('user@example.com', 'password123');

if (result.success) {
  console.log('Signed in successfully!');
}
```

### Access User Data
```javascript
const { currentUser, userProfile, userStats } = useAuthStore();

console.log('Email:', currentUser?.email);
console.log('Profile:', userProfile);
console.log('Sessions:', userStats?.totalSessions);
```

### Update Preferences
```javascript
const { saveUserPreferences } = authStore;

const result = await saveUserPreferences(currentUser.uid, {
  theme: 'light',
  notifications: false,
  autoSave: true,
});
```

## IPC API

### Expose to Renderer
All auth/profile methods are exposed via `window.electronAPI`:

```javascript
// Authentication
window.electronAPI.auth.signUp(email, password, displayName)
window.electronAPI.auth.signIn(email, password)
window.electronAPI.auth.signOut()
window.electronAPI.auth.getCurrentUser()
window.electronAPI.auth.passwordReset(email)
window.electronAPI.auth.setFirebaseConfig(config)
window.electronAPI.auth.getFirebaseConfigStatus()
window.electronAPI.auth.deleteAccount()

// Profile
window.electronAPI.profile.getUserProfile(uid)
window.electronAPI.profile.updateUserProfile(uid, updates)
window.electronAPI.profile.getUserPreferences(uid)
window.electronAPI.profile.updateUserPreferences(uid, preferences)
window.electronAPI.profile.getUserStats(uid)
window.electronAPI.profile.getAccountInfo(uid)
window.electronAPI.profile.updateAvatar(uid, avatarUrl)
window.electronAPI.profile.clearProfile(uid)
```

## Security Considerations

1. **Password Storage**: Handled by Firebase (hashed and salted)
2. **Session Management**: Firebase auth tokens managed automatically
3. **Data Persistence**: Sensitive data stored in Supabase (not in electron-store)
4. **API Keys**: Should be environment variables in production
5. **CORS**: Supabase CORS configured for Electron context

## Error Handling

All authentication functions return `{ success: boolean, error?: string }` or `{ success: boolean, data }`.

Example:
```javascript
const result = await authStore.signIn(email, password);

if (!result.success) {
  // Handle error
  console.error(result.error);
  // Possible errors:
  // - "Invalid login credentials"
  // - "User not found"
  // - "Too many login attempts"
}
```

## Future Enhancements

1. **Social Authentication**
   - Google Sign-In
   - GitHub Sign-In

2. **Multi-Factor Authentication**
   - Email verification
   - SMS OTP

3. **Profile Customization**
   - Avatar upload
   - Bio/description
   - Theme preferences

4. **Account Management**
   - Email change
   - Password change
   - Account recovery

5. **Activity Tracking**
   - Login history
   - Device tracking
   - Session management

## Troubleshooting

### Firebase Configuration Not Loading
- Check Settings panel for Firebase Project ID
- Verify Firebase credentials in your Firebase Console
- Check browser console for errors

### Supabase Connection Failed
- Verify Supabase URL and Anon Key in Settings
- Check Supabase project status
- Ensure firewall allows Supabase connections

### User Data Not Syncing
- Check that Supabase is properly configured
- Verify user UID matches between Firebase and Supabase
- Check database schema migration was applied

### AuthModal Not Showing
- Import AuthModal in main layout
- Check useAuthStore imports
- Verify electronAPI is available globally

# Firebase & Supabase Authentication Setup Guide

## Quick Start

Your VeriBrowse authentication system is now complete! Here's how to set it up and use it.

## What's Been Implemented

✅ **Firebase Authentication** - User registration and login  
✅ **Supabase Integration** - User data persistence and profiles  
✅ **User Profile System** - Display name, email, preferences, statistics  
✅ **Settings Page** - Complete user profile and preferences UI  
✅ **Auth Modal** - Beautiful login/signup modal  
✅ **IPC Handlers** - Secure communication between main and renderer  
✅ **Zustand Store** - Client-side state management  
✅ **Database Schema** - Users table with relationships  

## Step 1: Get Firebase Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or use existing one
3. Enable "Email/Password" authentication under Authentication → Sign-in method
4. Go to Project Settings → General
5. Scroll to "Your apps" section and click `</>` for web
6. Copy your Firebase config:

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

## Step 2: Get Supabase Credentials

1. Go to [Supabase Dashboard](https://app.supabase.com/)
2. Create a new project or use existing one
3. Go to Project Settings → API
4. Copy:
   - **Project URL** (e.g., `https://your-project.supabase.co`)
   - **Anon/Public Key** (under "Project API keys")

## Step 3: Configure in VeriBrowse

### In the App:
1. Open VeriBrowse
2. Click the **Profile icon** (bottom left) → **Sign In** → **Create Account** to test signup first
3. After creating account, go to **Settings** (gear icon)
4. Scroll down to **Firebase Authentication** section
5. Add your **Firebase Project ID**
6. Scroll down to **Knowledge Core** section
7. Add your **Supabase URL** and **Anon Key**
8. Click **Save All Configuration**

### Or via Environment Variables (Recommended):
Create a `.env.local` file in your project root:
```
NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=YOUR_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID=YOUR_APP_ID

NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Step 4: Update Database Schema

1. Log into your Supabase project
2. Go to SQL Editor
3. Create a new query
4. Copy and paste the content from `supabase/schema.sql`
5. Click "Run"

This will:
- Create the `users` table
- Add `uid` foreign keys to existing tables
- Create table indexes for performance

## Step 5: Test Authentication

1. Start VeriBrowse: `npm run dev`
2. Click Profile icon (bottom left) → **Create Account**
3. Fill in email, password, and display name
4. Click "Create Account"
5. After signup, you should be automatically signed in
6. Your profile should appear in Settings
7. Try signing out and signing back in

## User Profile Features

Once logged in, users can:

### View Profile (Settings → User Profile)
- Display name
- Email address
- Account creation date
- Last login date
- Usage statistics:
  - Total sessions
  - Total workflows
  - Credits used

### Manage Preferences (Settings → Preferences)
- **Auto-save Workflows** - Toggle automatic saving
- **Notifications** - Toggle desktop notifications
- **Research Mode** - Toggle research features
- **API Timeout** - Set timeout in milliseconds

### Manage API Keys (Settings)
- **Gemini API Key** - Google's AI API
- **Supabase URL & Key** - Database connection
- **Firebase Project ID** - Authentication provider

## Architecture Overview

```
┌─────────────────────────────────────────┐
│         Renderer Process (React)        │
│  AuthModal.jsx → authStore (Zustand)   │
│  SettingsPage.jsx → useAuthStore        │
└────────────────────┬────────────────────┘
                     │ IPC
          ┌──────────▼──────────┐
          │   authHandlers.js   │
          │  IPC Event Bridge   │
          └──────────┬──────────┘
                     │
┌────────────────────▼────────────────────┐
│      Main Process (Node.js)             │
│                                         │
│  AuthService.js ─────► Firebase         │
│      ↓                                  │
│  UserProfileService.js                 │
│      ↓                                  │
│  Supabase Sync                          │
│                                         │
└──────────────────────────────────────────┘
         │
         ▼
    ┌─────────────────┐
    │   Supabase      │
    │  (PostgreSQL)   │
    │    + Vector DB  │
    └─────────────────┘
```

## Key Files

- **Services**
  - `main/services/AuthService.js` - Firebase + Supabase integration
  - `main/services/UserProfileService.js` - Profile management

- **IPC**
  - `main/ipc/authHandlers.js` - Authentication request handlers
  - `main/preload.js` - Expose auth API to renderer

- **Components**
  - `renderer/components/agent/AuthModal.jsx` - Login/signup modal
  - `renderer/components/pages/SettingsPage.jsx` - Profile & settings
  - `renderer/components/shell/Siderail.jsx` - Navigation with auth

- **State**
  - `renderer/store/authStore.js` - Zustand auth store

- **Database**
  - `supabase/schema.sql` - Database schema with users table

## Available IPC Channels

### Authentication
```javascript
// From Renderer
window.electronAPI.auth.signUp(email, password, displayName)
window.electronAPI.auth.signIn(email, password)
window.electronAPI.auth.signOut()
window.electronAPI.auth.getCurrentUser()
window.electronAPI.auth.passwordReset(email)
window.electronAPI.auth.deleteAccount()
```

### Profile Management
```javascript
// From Renderer
window.electronAPI.profile.getUserProfile(uid)
window.electronAPI.profile.updateUserProfile(uid, updates)
window.electronAPI.profile.getUserPreferences(uid)
window.electronAPI.profile.updateUserPreferences(uid, preferences)
window.electronAPI.profile.getUserStats(uid)
window.electronAPI.profile.getAccountInfo(uid)
window.electronAPI.profile.updateAvatar(uid, avatarUrl)
```

## Troubleshooting

### AuthModal doesn't appear
```
✓ Check that AuthModal is imported in app/page.js
✓ Verify useAuthStore is working
✓ Check browser console for errors
```

### Can't sign up
```
✓ Check Firebase project has email/password auth enabled
✓ Verify Firebase config is set correctly
✓ Check password is at least 6 characters
✓ Check email format is valid
```

### User profile doesn't show
```
✓ Verify you're logged in (profile icon has green badge)
✓ Check Settings → User Profile section exists
✓ Check browser console for API errors
```

### Supabase sync not working
```
✓ Verify Supabase URL and Anon Key are correct
✓ Check database schema was applied
✓ Verify firewall allows Supabase connections
```

## Next Steps

1. **Customize** - Modify auth UI to match your branding
2. **Add Social Login** - Integrate Google, GitHub, etc.
3. **Setup Email Verification** - Require confirmed email
4. **Add Profile Pictures** - Allow avatar uploads
5. **Add Two-Factor Auth** - Extra security for sensitive operations
6. **Track Activity** - Log user sessions and actions

## Support

For detailed documentation, see:
- `AUTHENTICATION.md` - Complete authentication system documentation
- Firebase Docs: https://firebase.google.com/docs
- Supabase Docs: https://supabase.com/docs

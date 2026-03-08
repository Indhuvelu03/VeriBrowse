# Firebase Setup Guide for VeriBrowse

## 🚀 Quick Setup (5 minutes)

### Step 1: Get Firebase Credentials

1. Go to **Firebase Console**: https://console.firebase.google.com/
2. Select your project (or create a new one)
3. Click the **Settings icon ⚙️** (top-left corner)
4. Go to **Project Settings**
5. Scroll down to **"Your apps"** section
6. Under **Web** app, you'll see your Firebase config:

```javascript
{
  apiKey: "AIzaSyD...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-123",
  storageBucket: "your-project-123.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcd1234efgh5678"
}
```

### Step 2: Add to .env.local

1. Open the file: `.env.local` (in project root)
2. Replace the placeholders with your actual Firebase credentials:

```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyD...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-123
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-123.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abcd1234efgh5678
```

3. **Save the file**

### Step 3: Restart Dev Server

```bash
# Stop the current dev server (Ctrl+C)
# Then restart:
npm run dev
```

### Step 4: Test Authentication

1. The VeriBrowse app should now load properly
2. Click **"Sign Up"** tab
3. Enter credentials:
   - **Full Name**: Your Name
   - **Email**: test@example.com
   - **Password**: test123456
   - **Confirm Password**: test123456
4. Click **"Create Account"**
5. ✅ If successful → You're logged in!

---

## 📋 Firebase Console - Where to Find Each Value

| Value | Location |
|-------|----------|
| **apiKey** | Firebase Console → Project Settings → General → Web API Key |
| **authDomain** | Firebase Console → Project Settings → General |
| **projectId** | Firebase Console → Project Settings → General → Project ID |
| **storageBucket** | Firebase Console → Project Settings → General |
| **messagingSenderId** | Firebase Console → Project Settings → General |
| **appId** | Firebase Console → Project Settings → General |

---

## ✅ Verify It Works

Once set up:

1. **Create Account** in VeriBrowse
2. Go to **Firebase Console** → **Authentication** → **Users**
3. You should see your new user there! 🎉

---

## 🔐 Security Notes

- `.env.local` is **git-ignored** and never committed
- These variables are **public** (NEXT_PUBLIC_) because Firebase is client-side
- Never commit `.env.local` to version control
- Each developer/environment can have different credentials

---

## ❌ Troubleshooting

### "Firebase credentials not found in environment variables"
- Check `.env.local` exists in project root
- Verify all NEXT_PUBLIC_FIREBASE_* values are filled in
- Restart dev server after editing `.env.local`

### "Firebase not initialized"
- Make sure you waited for Firebase init (check console)
- Verify API key is correct (copy-paste carefully)
- Check Firebase Console → Project Settings for correct values

### Sign up fails
- Check browser console (F12 → Console tab)
- Make sure password is 6+ characters
- Try a different email address
- Verify Firebase Authentication is enabled in your project

---

## 🔗 Related Files

- App Configuration: `.env.local`
- Auth Page: `renderer/components/pages/AuthPage.jsx`
- Auth Store: `renderer/store/authStore.js`
- Firebase Module: `renderer/lib/firebaseAuth.js`

---

Ready to test? Update `.env.local` with your credentials and run `npm run dev` 🚀

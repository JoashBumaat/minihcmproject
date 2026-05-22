# ChronoHCM — Mini HCM Time Tracking System

A lightweight Human Capital Management (HCM) Time-In/Time-Out system built with **React**, **Node.js/Express**, and **Firebase** (Auth + Firestore).

---

## Features

- **User Registration & Login** via Firebase Auth (Email/Password)
- **Punch In / Punch Out** with real-time clock
- **Automatic computation** of:
  - Regular Hours (within scheduled shift)
  - Overtime (OT) — beyond shift end
  - Night Differential (ND) — work between 22:00–06:00
  - Late Arrivals — punch-in after shift start
  - Undertime — punch-out before shift end
- **Daily Summary Dashboard** with KPI cards
- **Weekly History Table** (last 7 days)
- **Admin Panel**:
  - Daily report for all employees
  - Weekly report for all employees
  - Edit individual punches (with automatic recomputation)
- **Per-user schedule** (start/end times) stored in Firestore

---

## Project Structure

```
mini-hcm/
├── src/
│   ├── firebase.js              # Firebase init
│   ├── main.jsx                 # React entry point
│   ├── App.jsx                  # Router + Auth guards
│   ├── index.css                # Global styles
│   ├── context/
│   │   └── AuthContext.jsx      # Auth state + register/login/logout
│   ├── hooks/
│   │   └── useAttendance.js     # Firestore punch hooks + daily summary
│   ├── utils/
│   │   └── hcmCompute.js        # Core computation logic
│   └── pages/
│       ├── AuthPage.jsx         # Login + Register UI
│       ├── Dashboard.jsx        # Employee dashboard
│       └── AdminPanel.jsx       # Admin reports + punch editor
├── backend/
│   ├── server.js                # Express API (server-side computation)
│   └── package.json
├── firestore.rules              # Firestore security rules
├── firestore.indexes.json       # Firestore composite indexes
├── firebase.json                # Firebase Hosting config
├── vite.config.js
└── package.json
```

---

## Setup Guide

### Step 1 — Create Firebase Project

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → give it a name (e.g. `mini-hcm`)
3. Enable **Google Analytics** (optional)

### Step 2 — Enable Firebase Services

**Authentication:**
- In Firebase Console → **Authentication** → **Get started**
- Enable **Email/Password** provider

**Firestore:**
- In Firebase Console → **Firestore Database** → **Create database**
- Choose **Start in test mode** (you'll apply rules later)
- Select a region (e.g. `asia-southeast1` for Philippines)

### Step 3 — Get Firebase Config

1. In Firebase Console → **Project Settings** (gear icon) → **Your apps**
2. Click **Add app** → Web (`</>`)
3. Register the app (name it `mini-hcm-web`)
4. Copy the `firebaseConfig` object

### Step 4 — Configure the Frontend

Open `src/firebase.js` and replace the placeholder config:

```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
};
```

### Step 5 — Install & Run the Frontend

```bash
# In the project root (mini-hcm/)
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### Step 6 — Deploy Firestore Rules & Indexes

Install Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
firebase use --add   # select your project
```

Deploy rules and indexes:

```bash
firebase deploy --only firestore
```

### Step 7 — Setup the Backend (Optional for API routes)

```bash
cd backend
npm install
```

Generate a Firebase Admin service account key:
1. Firebase Console → **Project Settings** → **Service Accounts**
2. Click **Generate new private key** → save as `backend/serviceAccountKey.json`

```bash
export GOOGLE_APPLICATION_CREDENTIALS="./serviceAccountKey.json"
npm start
# Server runs on http://localhost:3001
```

### Step 8 — Deploy Frontend to Firebase Hosting

```bash
# In project root
npm run build
firebase deploy --only hosting
```

---

## Backend API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/compute-daily` | Recompute daily summary for user+date |
| GET | `/api/weekly-report/:userId` | 7-day summary for one employee |
| GET | `/api/admin/daily-report?date=YYYY-MM-DD` | All employees for a date |
| GET | `/api/admin/weekly-report` | All employees, last 7 days |

---

## Firestore Data Model

```
users/{uid}
  name, email, role, timezone
  schedule: { start: "09:00", end: "18:00" }

attendance/{docId}
  userId, type ("in"|"out"), timestamp, date, pairedWith?

punchPairs/{docId}
  userId, date, timeIn, timeOut
  regularMinutes, otMinutes, ndMinutes, lateMinutes, undertimeMinutes, totalMinutes

dailySummary/{userId}_{date}
  userId, date
  regularMinutes, otMinutes, ndMinutes, lateMinutes, undertimeMinutes, totalMinutes
  punchCount, updatedAt
```

---

## Computation Logic

| Metric | Formula |
|--------|---------|
| **Regular** | Time worked within scheduled window |
| **Overtime** | Time worked after shift end |
| **Night Diff** | Minutes between 22:00–06:00 (minute-by-minute scan) |
| **Late** | `max(0, punchIn - scheduleStart)` |
| **Undertime** | `max(0, scheduleEnd - punchOut)` |

---

## Free Tier Notes

- **Firebase Auth** — free for all users
- **Firestore** — 1 GiB storage, 50K reads/day, 20K writes/day (free tier)
- **Firebase Hosting** — 10 GB/month bandwidth (free tier)
- **Backend** — Deploy free on [Render](https://render.com), [Railway](https://railway.app), or [Fly.io](https://fly.io)

---

## Demo Credentials (for testing)

Register two accounts:
1. `admin@company.com` / any password → set role to **Admin**
2. `employee@company.com` / any password → set role to **Employee**, schedule 09:00–18:00

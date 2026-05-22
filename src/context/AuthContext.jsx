// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

// ── Secondary Firebase app for registration ──────────────
// We use a SEPARATE auth instance just to create accounts.
// This way the main app's auth session is NEVER touched
// during registration — no auto-login ever happens.
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

function getSecondaryAuth() {
  const secondaryAppName = "secondary-register";
  const existingApps = getApps();
  const existing = existingApps.find((a) => a.name === secondaryAppName);
  if (existing) return getAuth(existing);

  // Get config from the primary app
  const primaryConfig = getApps().find((a) => a.name === "[DEFAULT]")?.options;
  const secondaryApp = initializeApp(primaryConfig, secondaryAppName);
  return getAuth(secondaryApp);
}
// ─────────────────────────────────────────────────────────

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser]   = useState(null);
  const [userProfile, setUserProfile]   = useState(null);
  const [loading,     setLoading]       = useState(true);

  // ── Register — uses secondary auth, main session untouched ──
  async function register(email, password, profileData) {
    const secondaryAuth = getSecondaryAuth();

    // Create account on the secondary auth instance
    const cred = await createUserWithEmailAndPassword(
      secondaryAuth,
      email,
      password
    );

    // Save profile to Firestore using the new UID
    await setDoc(doc(db, "users", cred.user.uid), {
      name:      profileData.name,
      email,
      role:      profileData.role || "employee",
      timezone:  profileData.timezone || "Asia/Manila",
      schedule:  profileData.schedule || { start: "09:00", end: "18:00" },
      createdAt: new Date().toISOString(),
    });

    // Sign out of the secondary auth — main session never changed
    await signOut(secondaryAuth);

    // Return the credential (email/name used by success screen)
    return cred;
  }

  // ── Login ─────────────────────────────────────────────────
  async function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  // ── Logout ────────────────────────────────────────────────
  async function logout() {
    return signOut(auth);
  }

  // ── Fetch Firestore profile ───────────────────────────────
  async function fetchUserProfile(uid) {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      setUserProfile({ id: uid, ...snap.data() });
    }
  }

  // ── Listen to main auth state ─────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        await fetchUserProfile(user.uid);
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const value = {
    currentUser,
    userProfile,
    register,
    login,
    logout,
    fetchUserProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

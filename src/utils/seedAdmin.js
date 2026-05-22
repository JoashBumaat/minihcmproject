// src/utils/seedAdmin.js
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

const ADMIN_EMAIL = "admin@company.com";
const ADMIN_PASSWORD = "admin123";

/**
 * Called once on app startup.
 * If the admin account doesn't exist yet in Firestore, it creates it.
 * Errors are swallowed silently so the app always loads.
 */
export async function seedAdminAccount() {
  try {
    // Check if admin profile already exists in Firestore
    // We store a flag doc so we only try to create once
    const flagRef = doc(db, "system", "adminSeeded");
    const flagSnap = await getDoc(flagRef);
    if (flagSnap.exists()) return; // already seeded

    // Try to create the Firebase Auth account
    let uid;
    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        ADMIN_EMAIL,
        ADMIN_PASSWORD
      );
      uid = cred.user.uid;
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        // Auth account exists but Firestore profile may not — sign in to get uid
        const cred = await signInWithEmailAndPassword(
          auth,
          ADMIN_EMAIL,
          ADMIN_PASSWORD
        );
        uid = cred.user.uid;
      } else {
        throw err;
      }
    }

    // Write Firestore profile
    await setDoc(doc(db, "users", uid), {
      name: "System Admin",
      email: ADMIN_EMAIL,
      role: "admin",
      timezone: "Asia/Manila",
      schedule: { start: "09:00", end: "18:00" },
      createdAt: new Date().toISOString(),
      isSystemAdmin: true,
    });

    // Mark as seeded
    await setDoc(flagRef, { seededAt: new Date().toISOString() });

    // Sign out after seeding so the app starts fresh at the login screen
    await auth.signOut();
  } catch (err) {
    // Fail silently — admin may already be fully set up
    console.warn("Admin seed skipped:", err.message);
  }
}

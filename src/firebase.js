// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// TODO: Replace with your own Firebase project config
// Go to https://console.firebase.google.com → your project → Project Settings → Your apps
const firebaseConfig = {
  apiKey: "AIzaSyB-Qt-_rqvjrP16Bkm7nYXSAaAgUJ0XepE",
  authDomain: "mini-hcm-24594.firebaseapp.com",
  projectId: "mini-hcm-24594",
  storageBucket: "mini-hcm-24594.firebasestorage.app",
  messagingSenderId: "910433913140",
  appId: "1:910433913140:web:420f7ed9ee96d650c23d61",
  measurementId: "G-HSB4XSEEYV"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;

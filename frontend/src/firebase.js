import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || "derma-3e199";
const firebaseAuthDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  // Always use the Firebase authDomain — signInWithPopup requires it for the OAuth flow.
  authDomain: firebaseAuthDomain,
  projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "derma-3e199.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "36719323160",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:36719323160:web:ebc7aee1ab104b9e01fb6d",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-PYTN35TF2H",
};

const requiredConfigKeys = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
];

export const hasFirebaseConfig = requiredConfigKeys.every((key) => firebaseConfig[key]);

const app = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const analyticsPromise = app
  ? isSupported().then((supported) => (supported ? getAnalytics(app) : null))
  : Promise.resolve(null);

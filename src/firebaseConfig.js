// src/firebaseConfig.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyANkJRYoCA1e2CsCoFslfnKJzgV-KlRHn8",
  authDomain: "planification-styro.firebaseapp.com",
  projectId: "planification-styro",
  storageBucket: "planification-styro.firebasestorage.app",
  messagingSenderId: "387018358469",
  appId: "1:387018358469:web:bf4436c734a15f69c3aac",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

export default app;
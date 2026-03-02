// src/firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyA28rAB3VDyylEX_MFRyqlZuAl8Nsxe2hs",
  authDomain: "inventaire-styro.firebaseapp.com",
  projectId: "inventaire-styro",
  storageBucket: "inventaire-styro.firebasestorage.app",
  messagingSenderId: "15818382324",
  appId: "1:15818382324:web:2d06f9ea3e693de0bc37a1",
  measurementId: "G-50XMPV7N2R"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
auth.tenantId = "Inventaire-oc1tn";
export const storage = getStorage(app);

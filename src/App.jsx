import React, { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "./firebaseConfig";

import Login from "./Login.jsx";
import PageRetourMateriaux from "./PageRetourMateriaux.jsx";
import PageTableauMoulure from "./PageTableauMoulure.jsx";
import PageTableauPanneaux from "./PageTableauPanneaux.jsx";
import Requisition from "./Requisition.jsx";
import Historique from "./Historique.jsx";
import Reglage from "./Reglage.jsx";

export default function App() {
  const [route, setRoute] = useState("ajout");
  const [user, setUser] = useState(undefined); // undefined = loading
  const [userProfile, setUserProfile] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u || null);
      setUserProfile(null);

      if (u) {
        await ensureUserProfile(u);
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user?.uid) return;

    const ref = doc(db, "users", user.uid);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setUserProfile({
            id: snap.id,
            ...snap.data(),
          });
        } else {
          setUserProfile(null);
        }
      },
      (e) => {
        console.error("Erreur lecture profil utilisateur:", e);
        setUserProfile(null);
      }
    );

    return () => unsub();
  }, [user]);

  async function ensureUserProfile(u) {
    const ref = doc(db, "users", u.uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      await setDoc(ref, {
        uid: u.uid,
        email: u.email || "",
        emailLower: (u.email || "").toLowerCase(),
        displayName: u.displayName || "",
        isAdmin: true,
        role: "admin",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });
      return;
    }

    await updateDoc(ref, {
      email: u.email || "",
      emailLower: (u.email || "").toLowerCase(),
      displayName: u.displayName || "",
      lastLoginAt: serverTimestamp(),
    });
  }

  if (user === undefined) {
    return (
      <div style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>
        Chargement...
      </div>
    );
  }

  if (user === null) {
    return <Login />;
  }

  // IMPORTANT:
  // Si le champ isAdmin n'existe pas encore, on considère admin par défaut.
  // Donc tout le monde est admin au début, puis tu peux en enlever dans Réglages.
  const isAdmin = userProfile?.isAdmin !== false;

  const allowedRoutes = isAdmin
    ? ["ajout", "moulures", "panneaux", "requisition", "historique", "reglage"]
    : ["ajout", "requisition"];

  const safeRoute = allowedRoutes.includes(route) ? route : "ajout";

  const tabBtn = (active) => ({
    height: 38,
    padding: "0 14px",
    border: "1px solid #9a9a9a",
    background: active ? "#fff200" : "#e6e6e6",
    fontWeight: 800,
    cursor: "pointer",
  });

  const topBtn = {
    height: 16,
    padding: "0 10px",
    border: "1px solid #9a9a9a",
    background: "#e6e6e6",
    fontWeight: 600,
    fontSize: 10,
    lineHeight: 1,
    cursor: "pointer",
  };

  const connectedLabel = user?.email ? user.email : "Utilisateur";

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Erreur signOut:", e);
      alert("Impossible de se déconnecter. Réessaie.");
    }
  };

  const TOPBAR_H = 20;

  return (
    <div
      style={{
        height: "100dvh",
        background: "#f2f2f2",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* BARRE TOP */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 60,
          background: "#f2f2f2",
          borderBottom: "1px solid #d5d5d5",
          height: TOPBAR_H,
          padding: "0 12px",
          fontFamily: "Arial, sans-serif",
          display: "flex",
          alignItems: "center",
          width: "100%",
          boxSizing: "border-box",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: "100%",
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
          }}
        >
          <div />

          <div style={{ textAlign: "center", fontWeight: 600, fontSize: 11 }}>
            Connecté: <span style={{ fontWeight: 500 }}>{connectedLabel}</span>

            {isAdmin ? (
              <span
                style={{
                  marginLeft: 8,
                  fontWeight: 900,
                  color: "#0a7a28",
                }}
              >
                ADMIN
              </span>
            ) : (
              <span
                style={{
                  marginLeft: 8,
                  fontWeight: 900,
                  color: "#a00000",
                }}
              >
                NON-ADMIN
              </span>
            )}
          </div>

          <div style={{ justifySelf: "end" }}>
            <button style={topBtn} onClick={handleLogout}>
              Déconnexion
            </button>
          </div>
        </div>
      </div>

      {/* MENU TOP */}
      <div
        style={{
          position: "sticky",
          top: TOPBAR_H,
          zIndex: 50,
          background: "#f2f2f2",
          borderBottom: "1px solid #d5d5d5",
          padding: "10px 12px",
          display: "flex",
          gap: 10,
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Arial, sans-serif",
          flexWrap: "wrap",
          width: "100%",
          boxSizing: "border-box",
          flexShrink: 0,
        }}
      >
        <button
          style={tabBtn(safeRoute === "ajout")}
          onClick={() => setRoute("ajout")}
        >
          Ajout
        </button>

        {isAdmin && (
          <>
            <button
              style={tabBtn(safeRoute === "moulures")}
              onClick={() => setRoute("moulures")}
            >
              Tableau moulures
            </button>

            <button
              style={tabBtn(safeRoute === "panneaux")}
              onClick={() => setRoute("panneaux")}
            >
              Tableau panneaux
            </button>
          </>
        )}

        <button
          style={tabBtn(safeRoute === "requisition")}
          onClick={() => setRoute("requisition")}
        >
          Réquisition
        </button>

        {isAdmin && (
          <>
            <button
              style={tabBtn(safeRoute === "historique")}
              onClick={() => setRoute("historique")}
            >
              Historique
            </button>

            <button
              style={tabBtn(safeRoute === "reglage")}
              onClick={() => setRoute("reglage")}
            >
              Réglages
            </button>
          </>
        )}
      </div>

      {/* CONTENU */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        {safeRoute === "moulures" && isAdmin ? (
          <PageTableauMoulure
            onRetour={() => setRoute("ajout")}
            onGoRequisition={() => setRoute("requisition")}
          />
        ) : safeRoute === "panneaux" && isAdmin ? (
          <PageTableauPanneaux onRetour={() => setRoute("ajout")} />
        ) : safeRoute === "requisition" ? (
          <Requisition onRetour={() => setRoute("ajout")} isAdmin={isAdmin} />
        ) : safeRoute === "historique" && isAdmin ? (
          <Historique onRetour={() => setRoute("ajout")} />
        ) : safeRoute === "reglage" && isAdmin ? (
          <Reglage currentUser={user} onRetour={() => setRoute("ajout")} />
        ) : (
          <PageRetourMateriaux />
        )}
      </div>
    </div>
  );
}
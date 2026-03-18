import React, { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebaseConfig";

import Login from "./Login.jsx";
import PageRetourMateriaux from "./PageRetourMateriaux.jsx";
import PageTableauMoulure from "./PageTableauMoulure.jsx";
import PageTableauPanneaux from "./PageTableauPanneaux.jsx";
import Requisition from "./Requisition.jsx";
import Historique from "./Historique.jsx";

export default function App() {
  const [route, setRoute] = useState("ajout"); // ajout | moulures | panneaux | requisition | historique
  const [user, setUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u || null));
    return () => unsub();
  }, []);

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
        <button style={tabBtn(route === "ajout")} onClick={() => setRoute("ajout")}>
          Ajout
        </button>

        <button
          style={tabBtn(route === "moulures")}
          onClick={() => setRoute("moulures")}
        >
          Tableau moulures
        </button>

        <button
          style={tabBtn(route === "panneaux")}
          onClick={() => setRoute("panneaux")}
        >
          Tableau panneaux
        </button>

        <button
          style={tabBtn(route === "requisition")}
          onClick={() => setRoute("requisition")}
        >
          Réquisition
        </button>

        <button
          style={tabBtn(route === "historique")}
          onClick={() => setRoute("historique")}
        >
          Historique
        </button>
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
        {route === "moulures" ? (
          <PageTableauMoulure
            onRetour={() => setRoute("ajout")}
            onGoRequisition={() => setRoute("requisition")}
          />
        ) : route === "panneaux" ? (
          <PageTableauPanneaux onRetour={() => setRoute("ajout")} />
        ) : route === "requisition" ? (
          <Requisition onRetour={() => setRoute("ajout")} />
        ) : route === "historique" ? (
          <Historique onRetour={() => setRoute("ajout")} />
        ) : (
          <PageRetourMateriaux />
        )}
      </div>
    </div>
  );
}
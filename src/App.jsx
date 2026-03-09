// src/App.jsx
import React, { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebaseConfig";

import Login from "./Login.jsx";
import PageRetourMateriaux from "./PageRetourMateriaux.jsx";
import PageTableauMoulure from "./PageTableauMoulure.jsx";
import PageTableauPanneaux from "./PageTableauPanneaux.jsx";

// ✅ NOUVEAU
import Requisition from "./Requisition.jsx";

export default function App() {
  const [route, setRoute] = useState("ajout"); // ajout | moulures | panneaux | requisition
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
    height: 34,
    padding: "0 14px",
    border: "1px solid #9a9a9a",
    background: "#e6e6e6",
    fontWeight: 800,
    cursor: "pointer",
  };

  const connectedLabel = user?.email ? user.email : "Utilisateur";

  const handleLogout = async () => {
    try {
      await signOut(auth);
      // onAuthStateChanged => user=null => retour Login
    } catch (e) {
      console.error("Erreur signOut:", e);
      alert("Impossible de se déconnecter. Réessaie.");
    }
  };

  // ✅ Hauteur demandée
  const TOPBAR_H = 40;

  return (
    <div style={{ minHeight: "100vh", background: "#f2f2f2" }}>
      {/* ✅ BARRE TOP (HAUTEUR 200px) */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 60,
          background: "#f2f2f2",
          borderBottom: "1px solid #d5d5d5",
          height: TOPBAR_H, // ✅ 200px de hauteur
          padding: "0 12px",
          fontFamily: "Arial, sans-serif",
          display: "flex",
          alignItems: "center", // centre verticalement le contenu
        }}
      >
        <div
          style={{
            width: "100%",
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr", // gauche | centre | droite
            alignItems: "center",
          }}
        >
          <div /> {/* gauche vide */}

          {/* ✅ CONNECTÉ AU CENTRE */}
          <div style={{ textAlign: "center", fontWeight: 800, fontSize: 18 }}>
            Connecté: <span style={{ fontWeight: 600 }}>{connectedLabel}</span>
          </div>

          {/* ✅ DÉCONNEXION À DROITE COMPLET */}
          <div style={{ justifySelf: "end" }}>
            <button style={topBtn} onClick={handleLogout}>
              Déconnexion
            </button>
          </div>
        </div>
      </div>

      {/* ✅ MENU TOP */}
      <div
        style={{
          position: "sticky",
          top: TOPBAR_H, // ✅ juste sous la barre 200px
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

        {/* ✅ NOUVEAU */}
        <button
          style={tabBtn(route === "requisition")}
          onClick={() => setRoute("requisition")}
        >
          Réquisition
        </button>
      </div>

      {/* ✅ PAGES */}
      {route === "moulures" ? (
        <PageTableauMoulure
          onRetour={() => setRoute("ajout")}
          onGoRequisition={() => setRoute("requisition")}
        />
      ) : route === "panneaux" ? (
        <PageTableauPanneaux onRetour={() => setRoute("ajout")} />
      ) : route === "requisition" ? (
        <Requisition onRetour={() => setRoute("ajout")} />
      ) : (
        <PageRetourMateriaux />
      )}
    </div>
  );
}
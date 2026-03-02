// src/App.jsx
import React, { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
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
    return <div style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>Chargement...</div>;
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

  return (
    <div style={{ minHeight: "100vh", background: "#f2f2f2" }}>
      {/* ✅ MENU TOP */}
      <div
        style={{
          position: "sticky",
          top: 0,
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

        <button style={tabBtn(route === "moulures")} onClick={() => setRoute("moulures")}>
          Tableau moulures
        </button>

        <button style={tabBtn(route === "panneaux")} onClick={() => setRoute("panneaux")}>
          Tableau panneaux
        </button>

        {/* ✅ NOUVEAU */}
        <button style={tabBtn(route === "requisition")} onClick={() => setRoute("requisition")}>
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
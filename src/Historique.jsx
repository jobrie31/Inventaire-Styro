import React from "react";

export default function Historique({ onRetour }) {
  return (
    <div
      style={{
        padding: 20,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <button
          onClick={onRetour}
          style={{
            height: 38,
            padding: "0 14px",
            border: "1px solid #9a9a9a",
            background: "#e6e6e6",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Retour
        </button>

        <div style={{ fontSize: 28, fontWeight: 800 }}>
          Historique
        </div>

        <div style={{ width: 90 }} />
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid #d5d5d5",
          borderRadius: 8,
          padding: 20,
          minHeight: 300,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>
          Page historique
        </div>

        <div style={{ color: "#555", fontSize: 15 }}>
          Ici, on pourra afficher l’historique des ajouts de moulures, panneaux,
          réquisitions, etc.
        </div>
      </div>
    </div>
  );
}
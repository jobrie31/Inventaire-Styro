// src/Requisition.jsx
import React, { useEffect, useMemo, useState } from "react";
import { db } from "./firebaseConfig";
import { CLIENT_ID } from "./appClient";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";

function fmtTS(ts) {
  try {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString("fr-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function Requisition({ onRetour }) {
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    const q = query(
      collection(db, "clients", CLIENT_ID, "requisitionsMoulures"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error(err)
    );
    return () => unsub();
  }, []);

  const selected = useMemo(() => rows.find((r) => r.id === selectedId), [rows, selectedId]);

  return (
    <div className="pageRM pageRM--full" style={{ background: "#f2f2f2" }}>
      <div className="topBar topBar--full">
        <div className="leftLinks">
          <button className="btn" style={{ width: 180, height: 34 }} onClick={onRetour}>
            ↩ Retour
          </button>
        </div>
        <div style={{ fontWeight: 900 }}>Réquisition</div>
      </div>

      <div className="tableZone tableZone--center">
        <div className="tableBox tableBox--full">
          <div
            className="tableHeader"
            style={{ gridTemplateColumns: "140px 160px 220px 110px 120px 1fr" }}
          >
            <div>ID</div>
            <div>Date</div>
            <div>Projet envoyé</div>
            <div>Items</div>
            <div>Statut</div>
            <div>Note</div>
          </div>

          <div className="tableScroll">
            {rows.length === 0 ? (
              <div className="tableBody" style={{ padding: 12 }}>
                (Aucune réquisition)
              </div>
            ) : (
              rows.map((r, idx) => {
                const isSel = r.id === selectedId;
                const zebra = idx % 2 === 1;
                const itemsCount = Array.isArray(r.items) ? r.items.length : 0;

                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "140px 160px 220px 110px 120px 1fr",
                      alignItems: "center",
                      borderBottom: "1px solid #eee",
                      background: isSel ? "#dfefff" : zebra ? "#f7f7f7" : "#fff",
                      cursor: "pointer",
                      padding: "8px 10px",
                      fontSize: 13,
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>{r.reqId || r.id}</div>
                    <div>{fmtTS(r.createdAt)}</div>
                    <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.projetEnvoye || ""}
                    </div>
                    <div style={{ textAlign: "center", fontWeight: 900 }}>{itemsCount}</div>
                    <div style={{ textAlign: "center", fontWeight: 900 }}>
                      {r.status || "—"}
                    </div>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", color: "#444" }}>
                      {r.note || ""}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {selected ? (
        <div style={{ padding: 12 }}>
          <div
            style={{
              background: "#fff",
              border: "1px solid #ddd",
              borderRadius: 12,
              padding: 12,
              fontFamily: "Arial, sans-serif",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 8 }}>
              Détails — {selected.reqId || selected.id}
            </div>
            <div style={{ fontSize: 13, color: "#333", marginBottom: 8 }}>
              <b>Projet envoyé:</b> {selected.projetEnvoye || ""} &nbsp;•&nbsp;
              <b>Statut:</b> {selected.status || ""}
            </div>

            <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 6 }}>Items:</div>
            <div style={{ display: "grid", gap: 6 }}>
              {(selected.items || []).map((it, i) => (
                <div
                  key={i}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 10,
                    padding: "8px 10px",
                    background: "#fafafa",
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 900 }}>
                    {it.materiel || "(sans matériel)"} — Qté demandée:{" "}
                    <span style={{ fontWeight: 900 }}>{it.quantiteDemande ?? ""}</span>
                  </div>
                  <div style={{ color: "#666" }}>
                    {it.categorie || ""} • {it.calibre || ""} • source: {it.projetSource || ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
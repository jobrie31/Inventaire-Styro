import React, { useEffect, useState } from "react";
import "./pageRetourMateriaux.css";
import { db } from "./firebaseConfig";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";

export default function PageTableauMoulure({ onRetour }) {
  const [banque, setBanque] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  // ✅ Modal image
  const [modalUrl, setModalUrl] = useState(null);

  useEffect(() => {
    const q = query(collection(db, "banqueMoulures"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => setBanque(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error(err)
    );
    return () => unsub();
  }, []);

  // ✅ ESC (si tu veux pas ESC, dis-moi et je l’enlève)
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") setModalUrl(null);
    }
    if (modalUrl) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalUrl]);

  return (
    <div className="pageRM pageRM--full">
      <div className="topBar topBar--full">
        <div className="leftLinks">
          <button className="btn" style={{ width: 180, height: 34 }} onClick={onRetour}>
            ↩ Retour (Ajout)
          </button>
        </div>
        <div style={{ fontWeight: 700 }}>Total: {banque.length}</div>
      </div>

      <div className="titleRow titleRow--full">
        <div />
        <div className="bigTitle">Tableau Moulure</div>
        <div />
      </div>

      <div className="tableZone tableZone--center">
        <div className="tableBox tableBox--full">
          <div
            className="tableHeader"
            style={{ gridTemplateColumns: "180px 120px 140px 160px 110px 110px 170px" }}
          >
            <div>Projet</div>
            <div>Date</div>
            <div>Catégorie</div>
            <div>Matériel</div>
            <div>Calibre</div>
            <div>Quantité</div>
            <div>Dessin</div>
          </div>

          <div className="tableScroll">
            {banque.length === 0 ? (
              <div className="tableBody" style={{ padding: 10 }}>
                (Banque vide)
              </div>
            ) : (
              banque.map((a) => {
                const selected = a.id === selectedId;
                return (
                  <div
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "180px 120px 140px 160px 110px 110px 170px",
                      alignItems: "center",
                      borderBottom: "1px solid #eee",
                      background: selected ? "#dfefff" : "#fff",
                      cursor: "pointer",
                      padding: "6px 8px",
                      fontSize: 13,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {a.projet || ""}
                    </div>
                    <div>{a.date || ""}</div>
                    <div>{a.categorie || ""}</div>
                    <div>{a.materiel || ""}</div>
                    <div style={{ textAlign: "center" }}>{a.calibre || ""}</div>
                    <div style={{ textAlign: "center", fontWeight: 700 }}>{a.quantite ?? ""}</div>

                    <div style={{ display: "flex", justifyContent: "center" }}>
                      {a.dessinUrl ? (
                        <img
                          src={a.dessinUrl}
                          alt="dessin"
                          loading="lazy"
                          decoding="async"
                          onClick={(e) => {
                            e.stopPropagation();
                            setModalUrl(a.dessinUrl);
                          }}
                          title="Cliquer pour agrandir"
                          style={{
                            width: 140,
                            height: 70,
                            objectFit: "contain",
                            border: "1px solid #ddd",
                            background: "#fff",
                            cursor: "zoom-in",
                          }}
                        />
                      ) : (
                        <span style={{ color: "#999" }}>—</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ✅ MODAL IMAGE — taille “raisonnable” (75% écran) + overlay non cliquable */}
      {modalUrl && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.9)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            boxSizing: "border-box",
          }}
        >
          {/* ✅ Bouton X propre (centré) */}
          <button
            onClick={() => setModalUrl(null)}
            aria-label="Fermer"
            title="Fermer"
            style={{
              position: "fixed",
              top: 14,
              right: 14,
              width: 46,
              height: 46,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.25)",
              background: "rgba(0,0,0,0.55)",
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
              fontWeight: 900,
              padding: 0,
              userSelect: "none",
            }}
          >
            ✕
          </button>

          {/* ✅ Image pas “trop grosse” */}
          <img
            src={modalUrl}
            alt="dessin agrandi"
            style={{
              width: "45vw",
              height: "45vh",
              maxWidth: "85vw",
              maxHeight: "85vh",
              objectFit: "contain",
              display: "block",
              borderRadius: 10,
              boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
              background: "transparent",
            }}
          />
        </div>
      )}
    </div>
  );
}

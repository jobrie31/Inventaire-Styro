import React, { useEffect, useMemo, useState } from "react";
import "./pageRetourMateriaux.css";
import { db } from "./firebaseConfig";
import { CLIENT_ID } from "./appClient";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";

export default function PageTableauMoulure({ onRetour, onGoRequisition }) {
  const [banque, setBanque] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const [modalUrl, setModalUrl] = useState(null);

  const [reqOpen, setReqOpen] = useState(false);
  const [reqSelected, setReqSelected] = useState(() => new Set());
  const [reqStep, setReqStep] = useState(1);
  const [reqQtyById, setReqQtyById] = useState({});
  const [reqProjetEnvoye, setReqProjetEnvoye] = useState("");
  const [reqNote, setReqNote] = useState("");
  const [reqSaving, setReqSaving] = useState(false);
  const [reqError, setReqError] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [editForm, setEditForm] = useState({
    id: "",
    projet: "",
    date: "",
    categorie: "",
    materiel: "",
    calibre: "",
    quantite: "",
    dessinUrl: "",
  });

  useEffect(() => {
    const q = query(
      collection(db, "clients", CLIENT_ID, "banqueMoulures"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => setBanque(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error(err)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") {
        setModalUrl(null);
        if (reqOpen) closeReq();
        if (editOpen) closeEdit();
      }
    }
    if (modalUrl || reqOpen || editOpen) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalUrl, reqOpen, editOpen]);

  function openReq() {
    setReqOpen(true);
    setReqStep(1);
    setReqSelected(new Set());
    setReqQtyById({});
    setReqProjetEnvoye("");
    setReqNote("");
    setReqSaving(false);
    setReqError("");
  }

  function closeReq() {
    setReqOpen(false);
    setReqStep(1);
    setReqSelected(new Set());
    setReqQtyById({});
    setReqProjetEnvoye("");
    setReqNote("");
    setReqSaving(false);
    setReqError("");
  }

  function toggleReqSelect(id) {
    setReqSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  const reqSelectedList = useMemo(() => {
    const ids = Array.from(reqSelected);
    const map = new Map(banque.map((x) => [x.id, x]));
    return ids.map((id) => map.get(id)).filter(Boolean);
  }, [reqSelected, banque]);

  function ensureQtyDefaults() {
    setReqQtyById((prev) => {
      const next = { ...prev };
      for (const it of reqSelectedList) {
        if (next[it.id] == null) next[it.id] = 1;
      }
      return next;
    });
  }

  function openEdit(row) {
    setEditForm({
      id: row.id || "",
      projet: row.projet || "",
      date: row.date || "",
      categorie: row.categorie || "",
      materiel: row.materiel || "",
      calibre: row.calibre || "",
      quantite: row.quantite ?? "",
      dessinUrl: row.dessinUrl || "",
    });
    setEditError("");
    setEditSaving(false);
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditSaving(false);
    setEditError("");
    setEditForm({
      id: "",
      projet: "",
      date: "",
      categorie: "",
      materiel: "",
      calibre: "",
      quantite: "",
      dessinUrl: "",
    });
  }

  function setEditField(name, value) {
    setEditForm((prev) => ({ ...prev, [name]: value }));
  }

  async function confirmerModification() {
    const id = String(editForm.id || "").trim();
    const projet = String(editForm.projet || "").trim();
    const date = String(editForm.date || "").trim();
    const categorie = String(editForm.categorie || "").trim();
    const materiel = String(editForm.materiel || "").trim();
    const calibre = String(editForm.calibre || "").trim();
    const dessinUrl = String(editForm.dessinUrl || "").trim();
    const quantiteNum = Number(editForm.quantite);

    if (!id) {
      setEditError("Document introuvable.");
      return;
    }
    if (!projet) {
      setEditError("Entre un projet.");
      return;
    }
    if (!date) {
      setEditError("Entre une date.");
      return;
    }
    if (!categorie) {
      setEditError("Entre une catégorie.");
      return;
    }
    if (!materiel) {
      setEditError("Entre un matériel.");
      return;
    }
    if (!calibre) {
      setEditError("Entre un calibre.");
      return;
    }
    if (!Number.isFinite(quantiteNum) || quantiteNum < 0) {
      setEditError("Entre une quantité valide.");
      return;
    }

    const ok = window.confirm("Confirmer les modifications de cette moulure ?");
    if (!ok) return;

    setEditSaving(true);
    setEditError("");

    try {
      await updateDoc(doc(db, "clients", CLIENT_ID, "banqueMoulures", id), {
        projet,
        date,
        categorie,
        materiel,
        calibre,
        quantite: quantiteNum,
        dessinUrl,
        updatedAt: serverTimestamp(),
      });
      closeEdit();
    } catch (e) {
      console.error(e);
      setEditError("Erreur lors de la modification.");
    } finally {
      setEditSaving(false);
    }
  }

  async function supprimerMoulure(id) {
    if (!id) return;

    const ok = window.confirm("Veux-tu vraiment supprimer cette moulure ?");
    if (!ok) return;

    setDeletingId(id);
    try {
      await deleteDoc(doc(db, "clients", CLIENT_ID, "banqueMoulures", id));
      if (selectedId === id) setSelectedId(null);
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la suppression.");
    } finally {
      setDeletingId(null);
    }
  }

  async function createReq() {
    setReqError("");
    if (reqSelected.size === 0) {
      setReqError("Sélectionne au moins 1 moulure.");
      return;
    }
    if (!String(reqProjetEnvoye || "").trim()) {
      setReqError("Entre le projet à envoyer.");
      return;
    }

    setReqSaving(true);
    try {
      const counterRef = doc(db, "clients", CLIENT_ID, "_counters", "reqMoulures");

      const { reqId, reqNum } = await runTransaction(db, async (tx) => {
        const snap = await tx.get(counterRef);
        const next = snap.exists() ? Number(snap.data()?.next ?? 1) : 1;
        const reqNum = Number.isFinite(next) && next > 0 ? next : 1;

        const reqId = `reqmoul${reqNum}`;
        tx.set(counterRef, { next: reqNum + 1 }, { merge: true });
        return { reqId, reqNum };
      });

      const items = reqSelectedList.map((it) => ({
        banqueId: it.id,
        projetSource: it.projet || "",
        date: it.date || "",
        categorie: it.categorie || "",
        materiel: it.materiel || "",
        calibre: it.calibre || "",
        dessinUrl: it.dessinUrl || "",
        quantiteDemande: Number(reqQtyById[it.id] ?? 1) || 1,
      }));

      const reqRef = doc(db, "clients", CLIENT_ID, "requisitionsMoulures", reqId);
      await setDoc(reqRef, {
        reqId,
        reqNum,
        type: "moulures",
        status: "brouillon",
        projetEnvoye: String(reqProjetEnvoye || "").trim(),
        note: String(reqNote || "").trim(),
        items,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      closeReq();

      if (typeof onGoRequisition === "function") {
        onGoRequisition(reqId);
      } else {
        alert(`Réquisition créée: ${reqId}`);
      }
    } catch (e) {
      console.error(e);
      setReqError("Erreur lors de la création de la réquisition.");
    } finally {
      setReqSaving(false);
    }
  }

  return (
    <div className="pageRM pageRM--full">
      <div className="topBar topBar--full">
        <div className="leftLinks">
          <button className="btn" style={{ width: 180, height: 34 }} onClick={onRetour}>
            ↩ Retour (Ajout)
          </button>
        </div>
      </div>

      <div className="titleRow titleRow--full">
        <div />
        <div
          className="bigTitle"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            width: "100%",
          }}
        >
          <span>Tableau Moulure</span>

          <button
            onClick={openReq}
            style={{
              height: 36,
              padding: "0 14px",
              borderRadius: 10,
              border: "1px solid #1e5eff",
              background: "#1e5eff",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 6px 14px rgba(30,94,255,0.18)",
              fontSize: 13,
            }}
            title="Créer une réquisition"
          >
            + Créer une réquisition
          </button>
        </div>
        <div />
      </div>

      <div className="tableZone tableZone--center">
        <div className="tableBox tableBox--full">
          <div
            className="tableHeader"
            style={{ gridTemplateColumns: "180px 120px 140px 160px 110px 110px 170px 170px" }}
          >
            <div>Projet</div>
            <div>Date</div>
            <div>Catégorie</div>
            <div>Matériel</div>
            <div>Calibre</div>
            <div>Quantité</div>
            <div>Dessin</div>
            <div style={{ textAlign: "center" }}>Actions</div>
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
                      gridTemplateColumns: "180px 120px 140px 160px 110px 110px 170px 170px",
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

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        gap: 8,
                      }}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(a);
                        }}
                        title="Modifier"
                        style={{
                          minWidth: 82,
                          height: 34,
                          borderRadius: 10,
                          border: "1px solid #1e5eff",
                          background: "#1e5eff",
                          color: "#fff",
                          fontWeight: 800,
                          fontSize: 12,
                          cursor: "pointer",
                          padding: "0 10px",
                        }}
                      >
                        Modifier
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          supprimerMoulure(a.id);
                        }}
                        disabled={deletingId === a.id}
                        title="Supprimer"
                        style={{
                          minWidth: 82,
                          height: 34,
                          borderRadius: 10,
                          border: "1px solid #d33",
                          background: deletingId === a.id ? "#ffd6d6" : "#ff5c5c",
                          color: "#fff",
                          fontWeight: 800,
                          fontSize: 12,
                          cursor: deletingId === a.id ? "default" : "pointer",
                          padding: "0 10px",
                        }}
                      >
                        {deletingId === a.id ? "..." : "Supprimer"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

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

      {editOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 10001,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            boxSizing: "border-box",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeEdit();
          }}
        >
          <div
            style={{
              width: "min(760px, 95vw)",
              maxHeight: "88vh",
              overflow: "auto",
              background: "#fff",
              borderRadius: 16,
              boxShadow: "0 18px 40px rgba(0,0,0,0.25)",
              border: "1px solid rgba(0,0,0,0.08)",
            }}
          >
            <div
              style={{
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid #eee",
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 16 }}>Modifier la moulure</div>

              <button
                onClick={closeEdit}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  border: "1px solid #eee",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: 18,
                  fontWeight: 900,
                }}
                title="Fermer"
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 16 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                }}
              >
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Projet</div>
                  <input
                    value={editForm.projet}
                    onChange={(e) => setEditField("projet", e.target.value)}
                    style={{
                      height: 38,
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      padding: "0 10px",
                      fontSize: 13,
                    }}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Date</div>
                  <input
                    type="date"
                    value={editForm.date}
                    onChange={(e) => setEditField("date", e.target.value)}
                    style={{
                      height: 38,
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      padding: "0 10px",
                      fontSize: 13,
                    }}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Catégorie</div>
                  <input
                    value={editForm.categorie}
                    onChange={(e) => setEditField("categorie", e.target.value)}
                    style={{
                      height: 38,
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      padding: "0 10px",
                      fontSize: 13,
                    }}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Matériel</div>
                  <input
                    value={editForm.materiel}
                    onChange={(e) => setEditField("materiel", e.target.value)}
                    style={{
                      height: 38,
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      padding: "0 10px",
                      fontSize: 13,
                    }}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Calibre</div>
                  <input
                    value={editForm.calibre}
                    onChange={(e) => setEditField("calibre", e.target.value)}
                    style={{
                      height: 38,
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      padding: "0 10px",
                      fontSize: 13,
                    }}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Quantité</div>
                  <input
                    type="number"
                    min={0}
                    value={editForm.quantite}
                    onChange={(e) => setEditField("quantite", e.target.value)}
                    style={{
                      height: 38,
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      padding: "0 10px",
                      fontSize: 13,
                    }}
                  />
                </div>

                <div style={{ display: "grid", gap: 6, gridColumn: "1 / -1" }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>URL du dessin</div>
                  <input
                    value={editForm.dessinUrl}
                    onChange={(e) => setEditField("dessinUrl", e.target.value)}
                    placeholder="https://..."
                    style={{
                      height: 38,
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      padding: "0 10px",
                      fontSize: 13,
                    }}
                  />
                </div>

                <div
                  style={{
                    gridColumn: "1 / -1",
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 12,
                    background: "#fafafa",
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>Aperçu du dessin</div>

                  {editForm.dessinUrl ? (
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <img
                        src={editForm.dessinUrl}
                        alt="aperçu dessin"
                        style={{
                          width: 220,
                          height: 120,
                          objectFit: "contain",
                          border: "1px solid #ddd",
                          background: "#fff",
                        }}
                      />
                    </div>
                  ) : (
                    <div style={{ color: "#777", fontSize: 13 }}>Aucun dessin.</div>
                  )}
                </div>
              </div>

              {editError ? (
                <div
                  style={{
                    marginTop: 14,
                    border: "1px solid #ffd2d2",
                    background: "#fff5f5",
                    color: "#c40000",
                    padding: 10,
                    borderRadius: 12,
                    fontWeight: 800,
                    fontSize: 13,
                  }}
                >
                  {editError}
                </div>
              ) : null}
            </div>

            <div
              style={{
                padding: 14,
                borderTop: "1px solid #eee",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <button
                onClick={closeEdit}
                disabled={editSaving}
                style={{
                  height: 38,
                  padding: "0 14px",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  background: "#fff",
                  cursor: editSaving ? "default" : "pointer",
                  fontWeight: 900,
                  opacity: editSaving ? 0.7 : 1,
                }}
              >
                Annuler
              </button>

              <button
                onClick={confirmerModification}
                disabled={editSaving}
                style={{
                  height: 38,
                  padding: "0 14px",
                  borderRadius: 12,
                  border: "1px solid #1e5eff",
                  background: "#1e5eff",
                  color: "#fff",
                  cursor: editSaving ? "default" : "pointer",
                  fontWeight: 900,
                  opacity: editSaving ? 0.7 : 1,
                }}
              >
                {editSaving ? "Enregistrement..." : "Confirmer les modifications"}
              </button>
            </div>
          </div>
        </div>
      )}

      {reqOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            boxSizing: "border-box",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeReq();
          }}
        >
          <div
            style={{
              width: "min(900px, 95vw)",
              maxHeight: "85vh",
              overflow: "auto",
              background: "#fff",
              borderRadius: 16,
              boxShadow: "0 18px 40px rgba(0,0,0,0.25)",
              border: "1px solid rgba(0,0,0,0.08)",
            }}
          >
            <div
              style={{
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid #eee",
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 16 }}>
                {reqStep === 1 ? "Créer une réquisition — Sélection" : "Créer une réquisition — Détails"}
              </div>
              <button
                onClick={closeReq}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  border: "1px solid #eee",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: 18,
                  fontWeight: 900,
                }}
                title="Fermer"
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 16 }}>
              {reqStep === 1 ? (
                <>
                  <div style={{ fontSize: 13, color: "#444", marginBottom: 10 }}>
                    Sélectionne une ou plusieurs moulures ici. Sélection: <b>{reqSelected.size}</b>
                  </div>

                  <div
                    style={{
                      border: "1px solid #eee",
                      borderRadius: 12,
                      overflow: "hidden",
                      background: "#fff",
                    }}
                  >
                    <div style={{ maxHeight: "45vh", overflow: "auto" }}>
                      {banque.length === 0 ? (
                        <div style={{ padding: 12, color: "#777" }}>(Banque vide)</div>
                      ) : (
                        banque.map((it) => {
                          const checked = reqSelected.has(it.id);
                          return (
                            <div
                              key={it.id}
                              onClick={() => toggleReqSelect(it.id)}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "28px 1fr 120px",
                                gap: 10,
                                alignItems: "center",
                                padding: "10px 12px",
                                borderBottom: "1px solid #f0f0f0",
                                cursor: "pointer",
                                background: checked ? "#eef5ff" : "#fff",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleReqSelect(it.id)}
                                onClick={(e) => e.stopPropagation()}
                                style={{ width: 18, height: 18 }}
                              />

                              <div style={{ overflow: "hidden" }}>
                                <div
                                  style={{
                                    fontWeight: 900,
                                    fontSize: 13,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {it.materiel || "(sans matériel)"}
                                </div>
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: "#666",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {it.categorie || ""} • {it.calibre || ""} • source: {it.projet || ""}
                                </div>
                              </div>

                              <div style={{ textAlign: "right", fontWeight: 900, fontSize: 13 }}>
                                Qté: {it.quantite ?? "—"}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {reqError ? (
                    <div
                      style={{
                        marginTop: 10,
                        border: "1px solid #ffd2d2",
                        background: "#fff5f5",
                        color: "#c40000",
                        padding: 10,
                        borderRadius: 12,
                        fontWeight: 800,
                        fontSize: 13,
                      }}
                    >
                      {reqError}
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <div style={{ display: "grid", gap: 12 }}>
                    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                      <div style={{ fontWeight: 900, marginBottom: 8 }}>Quantités demandées</div>
                      <div style={{ display: "grid", gap: 8 }}>
                        {reqSelectedList.map((it) => (
                          <div
                            key={it.id}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 120px",
                              gap: 10,
                              alignItems: "center",
                              padding: "8px 10px",
                              borderRadius: 12,
                              border: "1px solid #eee",
                              background: "#fff",
                            }}
                          >
                            <div style={{ fontSize: 13, overflow: "hidden" }}>
                              <div
                                style={{
                                  fontWeight: 900,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {it.materiel || "(sans matériel)"}
                              </div>
                              <div style={{ color: "#666", fontSize: 12 }}>
                                {it.categorie || ""} • {it.calibre || ""} • source: {it.projet || ""}
                              </div>
                            </div>
                            <input
                              type="number"
                              min={0}
                              value={reqQtyById[it.id] ?? 1}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setReqQtyById((p) => ({ ...p, [it.id]: Number.isFinite(v) ? v : 0 }));
                              }}
                              style={{
                                height: 34,
                                borderRadius: 10,
                                border: "1px solid #ddd",
                                padding: "0 10px",
                                fontWeight: 800,
                                textAlign: "center",
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                      <div style={{ fontWeight: 900, marginBottom: 8 }}>Projet à envoyer + note</div>

                      <div style={{ display: "grid", gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 800 }}>Projet à envoyer</div>
                        <input
                          value={reqProjetEnvoye}
                          onChange={(e) => setReqProjetEnvoye(e.target.value)}
                          placeholder="Ex: Projet ABC / Chantier X"
                          style={{
                            height: 36,
                            borderRadius: 10,
                            border: "1px solid #ddd",
                            padding: "0 10px",
                            fontSize: 13,
                          }}
                        />

                        <div style={{ fontSize: 13, fontWeight: 800, marginTop: 6 }}>Note</div>
                        <textarea
                          value={reqNote}
                          onChange={(e) => setReqNote(e.target.value)}
                          placeholder="Note (optionnel)"
                          rows={4}
                          style={{
                            borderRadius: 10,
                            border: "1px solid #ddd",
                            padding: 10,
                            fontSize: 13,
                            resize: "vertical",
                          }}
                        />
                      </div>
                    </div>

                    {reqError ? (
                      <div
                        style={{
                          border: "1px solid #ffd2d2",
                          background: "#fff5f5",
                          color: "#c40000",
                          padding: 10,
                          borderRadius: 12,
                          fontWeight: 800,
                          fontSize: 13,
                        }}
                      >
                        {reqError}
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>

            <div
              style={{
                padding: 14,
                borderTop: "1px solid #eee",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <button
                onClick={closeReq}
                style={{
                  height: 38,
                  padding: "0 14px",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                Annuler
              </button>

              <div style={{ display: "flex", gap: 10 }}>
                {reqStep === 2 ? (
                  <button
                    onClick={() => {
                      setReqError("");
                      setReqStep(1);
                    }}
                    disabled={reqSaving}
                    style={{
                      height: 38,
                      padding: "0 14px",
                      borderRadius: 12,
                      border: "1px solid #ddd",
                      background: "#fff",
                      cursor: "pointer",
                      fontWeight: 900,
                      opacity: reqSaving ? 0.6 : 1,
                    }}
                  >
                    ← Retour sélection
                  </button>
                ) : null}

                {reqStep === 1 ? (
                  <button
                    onClick={() => {
                      if (reqSelected.size === 0) {
                        setReqError("Sélectionne au moins 1 moulure.");
                        return;
                      }
                      setReqError("");
                      setReqStep(2);
                      ensureQtyDefaults();
                    }}
                    style={{
                      height: 38,
                      padding: "0 14px",
                      borderRadius: 12,
                      border: "1px solid #1e5eff",
                      background: "#1e5eff",
                      color: "#fff",
                      cursor: "pointer",
                      fontWeight: 900,
                    }}
                  >
                    Suivant →
                  </button>
                ) : (
                  <button
                    onClick={createReq}
                    disabled={reqSaving}
                    style={{
                      height: 38,
                      padding: "0 14px",
                      borderRadius: 12,
                      border: "1px solid #1e5eff",
                      background: "#1e5eff",
                      color: "#fff",
                      cursor: "pointer",
                      fontWeight: 900,
                      opacity: reqSaving ? 0.7 : 1,
                    }}
                  >
                    {reqSaving ? "Enregistrement..." : "Créer la réquisition"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
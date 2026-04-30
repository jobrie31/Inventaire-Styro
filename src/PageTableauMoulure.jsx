import React, { useEffect, useMemo, useState } from "react";
import "./pageRetourMateriaux.css";
import DessinCanvas from "./DessinCanvas";
import { db, storage } from "./firebaseConfig";
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
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import MouluresExcelButton from "./MouluresExcelButton.jsx";

const SECTIONS_COUR = ["", "1", "2", "3", "4", "5", "6"];

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
    sectionCour: "",
    quantite: "",
    dessinUrl: "",
    dessinPath: "",
  });

  const [drawEditOpen, setDrawEditOpen] = useState(false);
  const [drawMode, setDrawMode] = useState("line");
  const [drawClearSignal, setDrawClearSignal] = useState(0);
  const [drawUndoSignal, setDrawUndoSignal] = useState(0);
  const [editNewDessinPng, setEditNewDessinPng] = useState(null);

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
        if (drawEditOpen) closeDrawEdit();
        if (reqOpen) closeReq();
        if (editOpen) closeEdit();
      }
    }

    if (modalUrl || reqOpen || editOpen || drawEditOpen) {
      window.addEventListener("keydown", onKeyDown);
    }

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalUrl, reqOpen, editOpen, drawEditOpen]);

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
      sectionCour: row.sectionCour || "",
      quantite: row.quantite ?? "",
      dessinUrl: row.dessinUrl || "",
      dessinPath: row.dessinPath || "",
    });

    setEditNewDessinPng(null);
    setDrawMode("line");
    setDrawClearSignal((n) => n + 1);
    setDrawUndoSignal(0);

    setEditError("");
    setEditSaving(false);
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditSaving(false);
    setEditError("");
    setEditNewDessinPng(null);
    setDrawEditOpen(false);
    setEditForm({
      id: "",
      projet: "",
      date: "",
      categorie: "",
      materiel: "",
      calibre: "",
      sectionCour: "",
      quantite: "",
      dessinUrl: "",
      dessinPath: "",
    });
  }

  function openDrawEdit() {
    setDrawMode("line");
    setDrawClearSignal((n) => n + 1);
    setDrawUndoSignal(0);
    setEditNewDessinPng(null);
    setDrawEditOpen(true);
  }

  function closeDrawEdit() {
    setDrawEditOpen(false);
  }

  function confirmerNouveauDessin() {
    if (!editNewDessinPng) {
      alert("Fais un dessin avant de confirmer.");
      return;
    }
    setDrawEditOpen(false);
  }

  function setEditField(name, value) {
    setEditForm((prev) => ({ ...prev, [name]: value }));
  }

  async function uploadNewDessinIfNeeded(id) {
    if (!editNewDessinPng) {
      return {
        dessinUrl: String(editForm.dessinUrl || "").trim(),
        dessinPath: String(editForm.dessinPath || "").trim(),
      };
    }

    const isWebp = editNewDessinPng.startsWith("data:image/webp");
    const ext = isWebp ? "webp" : "jpg";
    const contentType = isWebp ? "image/webp" : "image/jpeg";

    const dessinPath = `clients/${CLIENT_ID}/banqueMoulures/${id}-edit-${Date.now()}.${ext}`;
    const storageRef = ref(storage, dessinPath);

    await uploadString(storageRef, editNewDessinPng, "data_url", {
      contentType,
      cacheControl: "public,max-age=31536000,immutable",
    });

    const dessinUrl = await getDownloadURL(storageRef);

    return { dessinUrl, dessinPath };
  }

  async function confirmerModification() {
    const id = String(editForm.id || "").trim();
    const projet = String(editForm.projet || "").trim();
    const date = String(editForm.date || "").trim();
    const categorie = String(editForm.categorie || "").trim();
    const materiel = String(editForm.materiel || "").trim();
    const calibre = String(editForm.calibre || "").trim();
    const sectionCour = String(editForm.sectionCour || "").trim();
    const quantiteNum = Number(editForm.quantite);

    if (!id) return setEditError("Document introuvable.");
    if (!projet) return setEditError("Entre un projet.");
    if (!date) return setEditError("Entre une date.");
    if (!categorie) return setEditError("Entre une catégorie.");
    if (!materiel) return setEditError("Entre un matériel.");
    if (!calibre) return setEditError("Entre un calibre.");
    if (!sectionCour) return setEditError("Choisis une section de cour.");
    if (!Number.isFinite(quantiteNum) || quantiteNum < 0) {
      return setEditError("Entre une quantité valide.");
    }

    const ok = window.confirm("Confirmer les modifications de cette moulure ?");
    if (!ok) return;

    setEditSaving(true);
    setEditError("");

    try {
      const { dessinUrl, dessinPath } = await uploadNewDessinIfNeeded(id);

      await updateDoc(doc(db, "clients", CLIENT_ID, "banqueMoulures", id), {
        projet,
        date,
        categorie,
        materiel,
        calibre,
        sectionCour,
        quantite: quantiteNum,
        dessinUrl,
        dessinPath,
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
        sectionCour: it.sectionCour || "",
        dessinUrl: it.dessinUrl || "",
        dessinPath: it.dessinPath || "",
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

  const gridCols = "170px 130px 120px 140px 170px 110px 110px 160px 190px";

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
            flexWrap: "wrap",
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

          <MouluresExcelButton rows={banque} />
        </div>
        <div />
      </div>

      <div
        className="tableZone tableZone--center"
        style={{
          width: "100%",
          maxWidth: "100vw",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div
          className="tableBox tableBox--full"
          style={{
            minWidth: 1250,
          }}
        >
          <div className="tableHeader" style={{ gridTemplateColumns: gridCols }}>
            <div>Projet</div>
            <div>Section cour</div>
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
                      gridTemplateColumns: gridCols,
                      alignItems: "center",
                      borderBottom: "1px solid #eee",
                      background: selected ? "#dfefff" : "#fff",
                      cursor: "pointer",
                      padding: "6px 8px",
                      fontSize: 13,
                      minWidth: 1250,
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

                    <div style={{ textAlign: "center", fontWeight: 800 }}>
                      {a.sectionCour || "—"}
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
                            width: 120,
                            height: 60,
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

                    <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
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
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Section de cour</div>
                  <select
                    value={editForm.sectionCour}
                    onChange={(e) => setEditField("sectionCour", e.target.value)}
                    style={{
                      height: 38,
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      padding: "0 10px",
                      fontSize: 13,
                      background: "#fff",
                    }}
                  >
                    {SECTIONS_COUR.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
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

                <div
                  style={{
                    display: "grid",
                    gap: 10,
                    gridColumn: "1 / -1",
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 12,
                    background: "#fafafa",
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Dessin</div>

                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                    <div>
                      {editNewDessinPng ? (
                        <img
                          src={editNewDessinPng}
                          alt="nouveau dessin"
                          style={{
                            width: 170,
                            height: 90,
                            objectFit: "contain",
                            border: "1px solid #ddd",
                            background: "#fff",
                          }}
                        />
                      ) : editForm.dessinUrl ? (
                        <img
                          src={editForm.dessinUrl}
                          alt="dessin actuel"
                          style={{
                            width: 170,
                            height: 90,
                            objectFit: "contain",
                            border: "1px solid #ddd",
                            background: "#fff",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 170,
                            height: 90,
                            border: "1px solid #ddd",
                            background: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#777",
                            fontSize: 13,
                          }}
                        >
                          Aucun dessin
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={openDrawEdit}
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
                      Remplacer le dessin
                    </button>

                    {editNewDessinPng ? (
                      <span style={{ color: "#168000", fontWeight: 800, fontSize: 13 }}>
                        Nouveau dessin prêt à enregistrer
                      </span>
                    ) : null}
                  </div>
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

      {drawEditOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            zIndex: 10002,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              width: "min(940px, 96vw)",
              background: "#fff",
              borderRadius: 16,
              boxShadow: "0 18px 40px rgba(0,0,0,0.3)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 14px",
                borderBottom: "1px solid #eee",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 900 }}>Remplacer le dessin</div>

              <button
                onClick={closeDrawEdit}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  border: "1px solid #eee",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: 18,
                  fontWeight: 900,
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                padding: 14,
                display: "grid",
                gridTemplateColumns: "1fr 170px",
                gap: 14,
                alignItems: "start",
              }}
            >
              <div
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  overflow: "hidden",
                  background: "#fff",
                  display: "flex",
                  justifyContent: "center",
                  padding: 8,
                }}
              >
                <DessinCanvas
                  mode={drawMode}
                  clearSignal={drawClearSignal}
                  undoSignal={drawUndoSignal}
                  width={620}
                  height={380}
                  onExportPNG={(dataUrl) => setEditNewDessinPng(dataUrl)}
                  penSize={5}
                />
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <button
                  className="btn"
                  onClick={() => setDrawMode("line")}
                  style={{
                    width: "100%",
                    border: "1px solid #ddd",
                    background: drawMode === "line" ? "#e8f0ff" : "#fff",
                    fontWeight: drawMode === "line" ? 800 : 700,
                  }}
                >
                  📏 Ligne droite
                </button>

                <button
                  className="btn"
                  onClick={() => setDrawMode("free")}
                  style={{
                    width: "100%",
                    border: "1px solid #ddd",
                    background: drawMode === "free" ? "#e8f0ff" : "#fff",
                    fontWeight: drawMode === "free" ? 800 : 700,
                  }}
                >
                  ✏️ Dessin libre
                </button>

                <button
                  className="btn"
                  onClick={() => setDrawMode("text")}
                  style={{
                    width: "100%",
                    border: "1px solid #ddd",
                    background: drawMode === "text" ? "#e8f0ff" : "#fff",
                    fontWeight: drawMode === "text" ? 800 : 700,
                  }}
                >
                  📝 Ajouter texte
                </button>

                <button className="btn" onClick={() => setDrawUndoSignal((n) => n + 1)}>
                  ↩ Retour
                </button>

                <button
                  className="btn"
                  onClick={() => {
                    setEditNewDessinPng(null);
                    setDrawClearSignal((n) => n + 1);
                  }}
                >
                  🗑️ Effacer dessin
                </button>

                <button
                  onClick={confirmerNouveauDessin}
                  style={{
                    marginTop: 12,
                    height: 40,
                    borderRadius: 12,
                    border: "1px solid #168000",
                    background: "#168000",
                    color: "#fff",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Utiliser ce dessin
                </button>
              </div>
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
                {reqStep === 1
                  ? "Créer une réquisition — Sélection"
                  : "Créer une réquisition — Détails"}
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
                    Sélectionne une ou plusieurs moulures ici. Sélection:{" "}
                    <b>{reqSelected.size}</b>
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
                                  {it.categorie || ""} • Calibre {it.calibre || ""} • Section{" "}
                                  {it.sectionCour || "—"} • source: {it.projet || ""}
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
                              {it.categorie || ""} • Calibre {it.calibre || ""} • Section{" "}
                              {it.sectionCour || "—"} • source: {it.projet || ""}
                            </div>
                          </div>

                          <input
                            type="number"
                            min={0}
                            value={reqQtyById[it.id] ?? 1}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setReqQtyById((p) => ({
                                ...p,
                                [it.id]: Number.isFinite(v) ? v : 0,
                              }));
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
                    <div style={{ fontWeight: 900, marginBottom: 8 }}>
                      Projet à envoyer + note
                    </div>

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
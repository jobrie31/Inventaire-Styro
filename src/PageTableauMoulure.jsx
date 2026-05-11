import React, { useEffect, useMemo, useState } from "react";
import "./pageRetourMateriaux.css";
import DessinCanvas from "./DessinCanvas";
import { db, storage, auth } from "./firebaseConfig";
import { CLIENT_ID } from "./appClient";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  serverTimestamp,
  deleteDoc,
  updateDoc,
  addDoc,
} from "firebase/firestore";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import MouluresExcelButton from "./MouluresExcelButton.jsx";
import MouluresRequisitionManager from "./MouluresRequisitionManager.jsx";

const SECTIONS_COUR = ["", "1", "2", "3", "4", "5", "6"];

function currentUserInfo() {
  const user = auth?.currentUser || null;

  return {
    uid: user?.uid || "",
    email: user?.email || "",
    name: user?.displayName || user?.email || "Utilisateur inconnu",
  };
}

function cleanValue(v) {
  if (v === undefined || v === null) return "";
  return v;
}

function sameValue(a, b) {
  return String(cleanValue(a)).trim() === String(cleanValue(b)).trim();
}

function buildChanges(before, after, fields) {
  const changes = {};

  fields.forEach((f) => {
    const b = cleanValue(before?.[f]);
    const a = cleanValue(after?.[f]);

    if (!sameValue(b, a)) {
      changes[f] = {
        before: b,
        after: a,
      };
    }
  });

  return changes;
}

function moulureShortLabel(m) {
  return [
    m.materiel || "Moulure",
    m.calibre ? `calibre ${m.calibre}` : "",
    m.quantite !== undefined && m.quantite !== "" ? `Qté ${m.quantite}` : "",
    m.sectionCour ? `Section ${m.sectionCour}` : "",
    m.projet ? `Projet ${m.projet}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export default function PageTableauMoulure({ onRetour, onGoRequisition }) {
  const [banque, setBanque] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [modalUrl, setModalUrl] = useState(null);

  const [filters, setFilters] = useState({
    projet: "",
    sectionCour: "",
    date: "",
    materiel: "",
    calibre: "",
  });

  const [deletingId, setDeletingId] = useState(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [oldRowBeforeEdit, setOldRowBeforeEdit] = useState(null);

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
        if (editOpen) closeEdit();
      }
    }

    if (modalUrl || editOpen || drawEditOpen) {
      window.addEventListener("keydown", onKeyDown);
    }

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalUrl, editOpen, drawEditOpen]);

  function setFilterField(name, value) {
    setFilters((prev) => ({ ...prev, [name]: value }));
  }

  function clearFilters() {
    setFilters({
      projet: "",
      sectionCour: "",
      date: "",
      materiel: "",
      calibre: "",
    });
  }

  function uniqueValues(field) {
    const values = banque
      .map((x) => String(x?.[field] ?? "").trim())
      .filter(Boolean);

    return Array.from(new Set(values)).sort((a, b) =>
      a.localeCompare(b, "fr", { numeric: true, sensitivity: "base" })
    );
  }

  const projetOptions = useMemo(() => uniqueValues("projet"), [banque]);
  const materielOptions = useMemo(() => uniqueValues("materiel"), [banque]);
  const calibreOptions = useMemo(() => uniqueValues("calibre"), [banque]);

  const filteredBanque = useMemo(() => {
    return banque.filter((a) => {
      const projetOk = !filters.projet || String(a.projet || "") === filters.projet;
      const sectionOk =
        !filters.sectionCour || String(a.sectionCour || "") === filters.sectionCour;
      const dateOk = !filters.date || String(a.date || "") === filters.date;
      const materielOk =
        !filters.materiel || String(a.materiel || "") === filters.materiel;
      const calibreOk = !filters.calibre || String(a.calibre || "") === filters.calibre;

      return projetOk && sectionOk && dateOk && materielOk && calibreOk;
    });
  }, [banque, filters]);

  function openEdit(row) {
    setOldRowBeforeEdit({ ...row });

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
    setOldRowBeforeEdit(null);

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

    const oldRow = oldRowBeforeEdit || banque.find((x) => x.id === id) || {};

    const ok = window.confirm("Confirmer les modifications de cette moulure ?");
    if (!ok) return;

    setEditSaving(true);
    setEditError("");

    try {
      const actor = currentUserInfo();
      const { dessinUrl, dessinPath } = await uploadNewDessinIfNeeded(id);

      const newData = {
        projet,
        date,
        categorie,
        materiel,
        calibre,
        sectionCour,
        quantite: quantiteNum,
        dessinUrl,
        dessinPath,
      };

      const afterForCompare = {
        ...oldRow,
        ...newData,
      };

      const compareFields = [
        "projet",
        "date",
        "categorie",
        "materiel",
        "calibre",
        "sectionCour",
        "quantite",
        "dessinUrl",
      ];

      const changes = buildChanges(oldRow, afterForCompare, compareFields);

      if (Object.keys(changes).length === 0) {
        closeEdit();
        return;
      }

      await updateDoc(doc(db, "clients", CLIENT_ID, "banqueMoulures", id), {
        ...newData,

        updatedByUid: actor.uid,
        updatedByEmail: actor.email,
        updatedByName: actor.name,

        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, "clients", CLIENT_ID, "historique"), {
        action: "moulure_modification",
        titre: "Moulure modifiée",
        module: "moulures",
        cibleId: id,
        cibleType: "banqueMoulures",
        description: `Moulure modifiée : ${moulureShortLabel(afterForCompare)}`,

        before: oldRow,
        after: afterForCompare,
        changes,

        updatedByUid: actor.uid,
        updatedByEmail: actor.email,
        updatedByName: actor.name,
        createdByUid: actor.uid,
        createdByEmail: actor.email,
        createdByName: actor.name,
        userEmail: actor.email,
        userName: actor.name,

        createdAt: serverTimestamp(),
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

  const gridCols = "170px 130px 120px 170px 110px 110px 160px 220px";
  const tableMinWidth = 1190;

  const filterInputStyle = {
    width: "100%",
    height: 32,
    borderRadius: 8,
    border: "1px solid #cfd8e3",
    padding: "0 8px",
    fontSize: 12,
    fontWeight: 700,
    boxSizing: "border-box",
    background: "#fff",
  };

  return (
    <MouluresRequisitionManager
      banque={banque}
      onGoRequisition={onGoRequisition}
    >
      {({
        reqMode,
        reqError,
        reqSaving,
        renderReqButtons,
        renderReqPanel,
        renderReqRowAction,
        getReqRowBackground,
        reqActionHeader,
      }) => (
        <div
          className="pageRM pageRM--full"
          style={{
            background: reqMode ? "#d9dde5" : undefined,
            transition: "background 0.2s ease",
          }}
        >
          <style>
            {`
              input[type="number"]::-webkit-outer-spin-button,
              input[type="number"]::-webkit-inner-spin-button {
                -webkit-appearance: none;
                margin: 0;
              }

              input[type="number"] {
                -moz-appearance: textfield;
                appearance: textfield;
              }

              .noNumberArrows::-webkit-outer-spin-button,
              .noNumberArrows::-webkit-inner-spin-button {
                -webkit-appearance: none;
                margin: 0;
              }

              .noNumberArrows {
                -moz-appearance: textfield;
                appearance: textfield;
              }
            `}
          </style>

          <div className="topBar topBar--full">
            <div className="leftLinks">
              <button
                className="btn"
                style={{ width: 180, height: 34 }}
                onClick={onRetour}
              >
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

              {renderReqButtons()}

              <MouluresExcelButton rows={filteredBanque} />
            </div>
            <div />
          </div>

          {reqMode ? renderReqPanel() : null}

          <div
            className="tableZone tableZone--center"
            style={{
              width: "100%",
              maxWidth: "100vw",
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
              padding: reqMode ? "12px" : undefined,
              boxSizing: "border-box",
            }}
          >
            <div
              className="tableBox tableBox--full"
              style={{
                minWidth: tableMinWidth,
                border: reqMode ? "3px solid #1e5eff" : undefined,
                boxShadow: reqMode
                  ? "0 0 0 9999px rgba(0,0,0,0.25), 0 18px 40px rgba(0,0,0,0.25)"
                  : undefined,
                borderRadius: reqMode ? 14 : undefined,
                overflow: "hidden",
                background: "#fff",
                position: "relative",
                zIndex: reqMode ? 2 : undefined,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: gridCols,
                  alignItems: "center",
                  gap: 0,
                  padding: "8px 8px",
                  borderBottom: "1px solid #d9e2ef",
                  background: "#f6f9ff",
                  minWidth: tableMinWidth,
                }}
              >
                <div style={{ paddingRight: 8 }}>
                  <select
                    value={filters.projet}
                    onChange={(e) => setFilterField("projet", e.target.value)}
                    style={filterInputStyle}
                  >
                    <option value="">Projet</option>
                    {projetOptions.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ paddingRight: 8 }}>
                  <select
                    value={filters.sectionCour}
                    onChange={(e) => setFilterField("sectionCour", e.target.value)}
                    style={filterInputStyle}
                  >
                    <option value="">Section cour</option>
                    {SECTIONS_COUR.filter(Boolean).map((s) => (
                      <option key={s} value={s}>
                        Section {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ paddingRight: 8 }}>
                  <input
                    type="date"
                    value={filters.date}
                    onChange={(e) => setFilterField("date", e.target.value)}
                    style={filterInputStyle}
                  />
                </div>

                <div style={{ paddingRight: 8 }}>
                  <select
                    value={filters.materiel}
                    onChange={(e) => setFilterField("materiel", e.target.value)}
                    style={filterInputStyle}
                  >
                    <option value="">Matériel</option>
                    {materielOptions.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ paddingRight: 8 }}>
                  <select
                    value={filters.calibre}
                    onChange={(e) => setFilterField("calibre", e.target.value)}
                    style={{ ...filterInputStyle, textAlign: "center" }}
                  >
                    <option value="">Calibre</option>
                    {calibreOptions.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div
                  style={{
                    textAlign: "center",
                    color: "#777",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  Quantité
                </div>

                <div
                  style={{
                    textAlign: "center",
                    color: "#777",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  Dessin
                </div>

                <div style={{ display: "flex", justifyContent: "center" }}>
                  <button
                    onClick={clearFilters}
                    style={{
                      height: 32,
                      padding: "0 12px",
                      borderRadius: 9,
                      border: "1px solid #cfd8e3",
                      background: "#fff",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 900,
                    }}
                    title="Réinitialiser les filtres"
                  >
                    Réinitialiser
                  </button>
                </div>
              </div>

              <div className="tableHeader" style={{ gridTemplateColumns: gridCols }}>
                <div>Projet</div>
                <div>Section cour</div>
                <div>Date</div>
                <div>Matériel</div>
                <div>Calibre</div>
                <div>Quantité</div>
                <div>Dessin</div>
                <div style={{ textAlign: "center" }}>{reqActionHeader}</div>
              </div>

              <div className="tableScroll">
                {filteredBanque.length === 0 ? (
                  <div className="tableBody" style={{ padding: 10 }}>
                    {banque.length === 0
                      ? "(Banque vide)"
                      : "(Aucun résultat avec les filtres)"}
                  </div>
                ) : (
                  filteredBanque.map((a) => {
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
                          background: getReqRowBackground(a, selected),
                          cursor: "pointer",
                          padding: "6px 8px",
                          fontSize: 13,
                          minWidth: tableMinWidth,
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
                        <div>{a.materiel || ""}</div>
                        <div style={{ textAlign: "center" }}>{a.calibre || ""}</div>
                        <div style={{ textAlign: "center", fontWeight: 700 }}>
                          {a.quantite ?? ""}
                        </div>

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

                        <div
                          style={{
                            display: "flex",
                            justifyContent: "center",
                            gap: 8,
                          }}
                        >
                          {reqMode ? (
                            renderReqRowAction(a)
                          ) : (
                            <>
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
                                  background:
                                    deletingId === a.id ? "#ffd6d6" : "#ff5c5c",
                                  color: "#fff",
                                  fontWeight: 800,
                                  fontSize: 12,
                                  cursor:
                                    deletingId === a.id ? "default" : "pointer",
                                  padding: "0 10px",
                                }}
                              >
                                {deletingId === a.id ? "..." : "Supprimer"}
                              </button>
                            </>
                          )}
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
                  <div style={{ fontWeight: 900, fontSize: 16 }}>
                    Modifier la moulure
                  </div>

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
                      <div style={{ fontWeight: 800, fontSize: 13 }}>
                        Section de cour
                      </div>
                      <select
                        value={editForm.sectionCour}
                        onChange={(e) =>
                          setEditField("sectionCour", e.target.value)
                        }
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

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 14,
                          flexWrap: "wrap",
                        }}
                      >
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
                          <span
                            style={{
                              color: "#168000",
                              fontWeight: 800,
                              fontSize: 13,
                            }}
                          >
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

                    <button
                      className="btn"
                      onClick={() => setDrawUndoSignal((n) => n + 1)}
                    >
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
        </div>
      )}
    </MouluresRequisitionManager>
  );
}
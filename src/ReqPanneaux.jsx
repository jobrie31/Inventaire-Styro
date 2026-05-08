import React, { useEffect, useState } from "react";
import { db } from "./firebaseConfig";
import { CLIENT_ID } from "./appClient";
import {
  collection,
  doc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import {
  actorEmail,
  actorName,
  currentUserInfo,
  fmtTS,
  getStatus,
  itemKey,
  longueurTexte,
  SECTIONS_COUR,
  todayISO,
} from "./requisitionUtils";

export default function ReqPanneaux({ selected, onTerminated }) {
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeMode, setCompleteMode] = useState("same");
  const [restantsByItem, setRestantsByItem] = useState({});
  const [completeNote, setCompleteNote] = useState("");
  const [completeSaving, setCompleteSaving] = useState(false);
  const [completeError, setCompleteError] = useState("");

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") {
        setCompleteOpen(false);
      }
    }

    if (completeOpen) {
      window.addEventListener("keydown", onKeyDown);
    }

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [completeOpen]);

  useEffect(() => {
    setCompleteOpen(false);
    setCompleteError("");
    setCompleteNote("");
    setCompleteMode("same");

    if (!selected || selected.collectionType !== "panneaux") {
      setRestantsByItem({});
      return;
    }

    const next = {};
    (selected.items || []).forEach((it, index) => {
      const k = itemKey(selected, it, index);
      const qty = Math.max(0, Number(it.quantiteDemande ?? 0) || 0);

      next[k] = {
        same: {
          longueurPieds: "",
          longueurPouces: "",
          sectionCour: "",
        },
        different: Array.from({ length: qty }, () => ({
          longueurPieds: "",
          longueurPouces: "",
          sectionCour: "",
        })),
      };
    });

    setRestantsByItem(next);
  }, [selected?.id]);

  function setRestantSameField(itemK, field, value) {
    setRestantsByItem((prev) => ({
      ...prev,
      [itemK]: {
        ...(prev[itemK] || {}),
        same: {
          ...((prev[itemK] || {}).same || {}),
          [field]: value,
        },
      },
    }));
  }

  function setRestantDifferentField(itemK, panneauIndex, field, value) {
    setRestantsByItem((prev) => {
      const itemData = prev[itemK] || {};
      const arr = Array.isArray(itemData.different) ? [...itemData.different] : [];

      arr[panneauIndex] = {
        ...(arr[panneauIndex] || {}),
        [field]: value,
      };

      return {
        ...prev,
        [itemK]: {
          ...itemData,
          different: arr,
        },
      };
    });
  }

  function setNoRestantSame(itemK) {
    setRestantsByItem((prev) => ({
      ...prev,
      [itemK]: {
        ...(prev[itemK] || {}),
        same: {
          ...((prev[itemK] || {}).same || {}),
          longueurPieds: "0",
          longueurPouces: "0",
          sectionCour: "",
        },
      },
    }));
  }

  function setNoRestantDifferent(itemK, panneauIndex) {
    setRestantsByItem((prev) => {
      const itemData = prev[itemK] || {};
      const arr = Array.isArray(itemData.different) ? [...itemData.different] : [];

      arr[panneauIndex] = {
        ...(arr[panneauIndex] || {}),
        longueurPieds: "0",
        longueurPouces: "0",
        sectionCour: "",
      };

      return {
        ...prev,
        [itemK]: {
          ...itemData,
          different: arr,
        },
      };
    });
  }

  function openCompletePopup() {
    if (!selected || selected.collectionType !== "panneaux") return;
    setCompleteError("");
    setCompleteOpen(true);
  }

  function closeCompletePopup() {
    if (completeSaving) return;
    setCompleteOpen(false);
    setCompleteError("");
  }

  function validateRestantForm(form, context) {
    const piedsRaw = String(form.longueurPieds ?? "").trim();
    const poucesRaw = String(form.longueurPouces ?? "").trim();
    const sectionCour = String(form.sectionCour || "").trim();

    if (piedsRaw === "") {
      return {
        ok: false,
        message: `Entre la longueur restante en pieds pour ${context}. Mets 0 s'il n'y a aucun restant.`,
      };
    }

    const pieds = Number(piedsRaw);
    const pouces = poucesRaw === "" ? 0 : Number(poucesRaw);

    if (!Number.isFinite(pieds) || pieds < 0) {
      return {
        ok: false,
        message: "La longueur restante en pieds doit être 0 ou plus.",
      };
    }

    if (!Number.isFinite(pouces) || pouces < 0 || pouces >= 12) {
      return {
        ok: false,
        message: "Les pouces restants doivent être entre 0 et 11.",
      };
    }

    const longueurTotale = pieds + pouces / 12;

    if (longueurTotale > 0 && !sectionCour) {
      return {
        ok: false,
        message: "Choisis une section dans la cour pour chaque panneau restant.",
      };
    }

    return {
      ok: true,
      pieds,
      pouces,
      sectionCour,
      longueurTotale,
    };
  }

  async function terminerRequisitionPanneaux() {
    if (!selected || selected.collectionType !== "panneaux") return;

    setCompleteError("");

    if (getStatus(selected) === "terminée") {
      setCompleteError("Cette réquisition est déjà terminée.");
      return;
    }

    const items = Array.isArray(selected.items) ? selected.items : [];
    const restants = [];

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const k = itemKey(selected, it, i);
      const itemForms = restantsByItem[k] || {};
      const qtyDemandee = Number(it.quantiteDemande ?? 0) || 0;

      if (completeMode === "same") {
        const validation = validateRestantForm(
          itemForms.same || {},
          `la ligne ${i + 1}`
        );

        if (!validation.ok) {
          setCompleteError(validation.message);
          return;
        }

        restants.push({
          banqueIdOrigine: it.banqueId || "",
          ligneIndex: i,
          mode: "same",
          projetSource: it.projetSource || "",
          quantiteRestante:
            validation.longueurTotale > 0 ? Math.max(0, qtyDemandee) : 0,
          longueurPieds: validation.pieds,
          longueurPouces: validation.pouces,
          sectionCour: validation.sectionCour,
          type: it.type || "",
          epaisseurPouces: it.epaisseurPouces || "",
          fabricant: it.fabricant || "",
          profile: it.profile || "",
          modele: it.modele || "",
          fini: it.fini || "",
          largeurPouces: it.largeurPouces ?? "",
          faceExterieure: it.faceExterieure || "",
          faceInterieure: it.faceInterieure || "",
          cree: validation.longueurTotale > 0 && qtyDemandee > 0,
        });
      } else {
        const panneauxRestants = Array.isArray(itemForms.different)
          ? itemForms.different
          : [];

        if (panneauxRestants.length !== qtyDemandee) {
          setCompleteError(
            "Le nombre de lignes restantes ne correspond pas à la quantité demandée."
          );
          return;
        }

        for (let pIndex = 0; pIndex < panneauxRestants.length; pIndex++) {
          const validation = validateRestantForm(
            panneauxRestants[pIndex] || {},
            `le panneau ${pIndex + 1} de la ligne ${i + 1}`
          );

          if (!validation.ok) {
            setCompleteError(validation.message);
            return;
          }

          restants.push({
            banqueIdOrigine: it.banqueId || "",
            ligneIndex: i,
            panneauIndex: pIndex,
            mode: "different",
            projetSource: it.projetSource || "",
            quantiteRestante: validation.longueurTotale > 0 ? 1 : 0,
            longueurPieds: validation.pieds,
            longueurPouces: validation.pouces,
            sectionCour: validation.sectionCour,
            type: it.type || "",
            epaisseurPouces: it.epaisseurPouces || "",
            fabricant: it.fabricant || "",
            profile: it.profile || "",
            modele: it.modele || "",
            fini: it.fini || "",
            largeurPouces: it.largeurPouces ?? "",
            faceExterieure: it.faceExterieure || "",
            faceInterieure: it.faceInterieure || "",
            cree: validation.longueurTotale > 0,
          });
        }
      }
    }

    const ok = window.confirm(
      "Confirmer la fin de cette réquisition et remettre les restants dans l'inventaire panneaux ?"
    );
    if (!ok) return;

    setCompleteSaving(true);

    try {
      const actor = currentUserInfo();

      const batch = writeBatch(db);
      const reqRef = doc(
        db,
        "clients",
        CLIENT_ID,
        "requisitionsPanneaux",
        selected.id
      );

      const createdRefs = [];

      restants.forEach((r) => {
        if (!r.cree || Number(r.quantiteRestante) <= 0) return;

        const newRef = doc(collection(db, "clients", CLIENT_ID, "banquePanneaux"));
        createdRefs.push(newRef.id);

        batch.set(newRef, {
          projet: selected.projetEnvoye || r.projetSource || "",
          sectionCour: r.sectionCour || "",
          date: todayISO(),
          type: r.type || "",
          epaisseurPouces: String(r.epaisseurPouces || ""),
          fabricant: r.fabricant || "",
          profile: r.profile || "",
          modele: r.modele || "",
          fini: r.fini || "",
          longueurPieds: Number(r.longueurPieds || 0),
          longueurPouces: Number(r.longueurPouces || 0),
          largeurPouces: Number(r.largeurPouces || 0),
          quantite: Number(r.quantiteRestante || 0),
          faceExterieure: r.faceExterieure || "",
          faceInterieure: r.faceInterieure || "",
          origine: "requisition",
          requisitionId: selected.reqId || selected.id,
          banqueIdOrigine: r.banqueIdOrigine || "",
          noteRetour: String(completeNote || "").trim(),

          createdByUid: actor.uid,
          createdByEmail: actor.email,
          createdByName: actor.name,
          updatedByUid: actor.uid,
          updatedByEmail: actor.email,
          updatedByName: actor.name,

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      batch.update(reqRef, {
        status: "terminée",
        restantsMode: completeMode,
        restants,
        restantsCreatedIds: createdRefs,
        noteRetour: String(completeNote || "").trim(),

        completedByUid: actor.uid,
        completedByEmail: actor.email,
        completedByName: actor.name,
        updatedByUid: actor.uid,
        updatedByEmail: actor.email,
        updatedByName: actor.name,

        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await batch.commit();

      setCompleteSaving(false);
      setCompleteError("");
      setCompleteOpen(false);

      if (typeof onTerminated === "function") {
        onTerminated();
      }

      alert("Réquisition terminée et restants remis dans l'inventaire.");
    } catch (e) {
      console.error(e);
      setCompleteError("Erreur lors de la finalisation de la réquisition.");
      setCompleteSaving(false);
    }
  }

  const panneauItemGridCols =
    "160px 95px 110px 100px 60px 125px 100px 100px 95px 110px 90px 95px 115px 105px 105px";
  const panneauItemMinWidth = 1565;

  const cellStyle = {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    padding: "8px 8px",
    boxSizing: "border-box",
    borderRight: "1px solid #e5e5e5",
    height: "100%",
    display: "flex",
    alignItems: "center",
  };

  const lastCellStyle = {
    ...cellStyle,
    borderRight: "none",
  };

  const centerCell = {
    ...cellStyle,
    justifyContent: "center",
    textAlign: "center",
    fontWeight: 800,
  };

  const detailHeaderCell = {
    ...cellStyle,
    fontWeight: 900,
    justifyContent: "center",
    textAlign: "center",
    background: "#f7f7f7",
  };

  const restantInputStyle = {
    width: "100%",
    height: 34,
    borderRadius: 9,
    border: "1px solid #ddd",
    padding: "0 8px",
    fontWeight: 800,
    fontSize: 13,
    boxSizing: "border-box",
  };

  const noRestButtonStyle = {
    height: 34,
    borderRadius: 9,
    border: "1px solid #d33",
    background: "#fff5f5",
    color: "#c40000",
    fontWeight: 900,
    fontSize: 12,
    cursor: "pointer",
    padding: "0 10px",
    whiteSpace: "nowrap",
  };

  if (!selected) return null;

  return (
    <>
      <div
        style={{
          padding: 12,
          width: "100%",
          maxWidth: "100vw",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 12,
            padding: 12,
            fontFamily: "Arial, sans-serif",
            boxShadow: "0 8px 20px rgba(0,0,0,0.06)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 10,
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 16 }}>
              Détails — {selected.reqId || selected.id}
            </div>

            <div
              style={{
                fontSize: 13,
                color: "#333",
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <span>
                <b>Type:</b> Panneaux
              </span>

              <span>
                <b>Projet envoyé:</b> {selected.projetEnvoye || ""}
              </span>

              <span>
                <b>Statut:</b> {getStatus(selected)}
              </span>

              <span>
                <b>Date:</b> {fmtTS(selected.createdAt)}
              </span>

              <span>
                <b>Créé par:</b> {actorName(selected, "created")}
              </span>

              {getStatus(selected) === "terminée" ? (
                <span>
                  <b>Terminé par:</b> {actorName(selected, "completed")}
                </span>
              ) : null}
            </div>
          </div>

          {actorEmail(selected, "created") ? (
            <div
              style={{
                marginBottom: 10,
                fontSize: 12,
                color: "#555",
                fontWeight: 800,
              }}
            >
              Email création: {actorEmail(selected, "created")}
              {getStatus(selected) === "terminée" &&
              actorEmail(selected, "completed") ? (
                <> &nbsp; | &nbsp; Email fermeture: {actorEmail(selected, "completed")}</>
              ) : null}
            </div>
          ) : null}

          {selected.note ? (
            <div
              style={{
                marginBottom: 12,
                border: "1px solid #eee",
                background: "#fafafa",
                borderRadius: 10,
                padding: "8px 10px",
                fontSize: 13,
                color: "#333",
              }}
            >
              <b>Note:</b> {selected.note}
            </div>
          ) : null}

          {selected.noteRetour ? (
            <div
              style={{
                marginBottom: 12,
                border: "1px solid #b7e3b7",
                background: "#f0fff0",
                borderRadius: 10,
                padding: "8px 10px",
                fontSize: 13,
                color: "#168000",
                fontWeight: 800,
              }}
            >
              <b>Note de fermeture:</b> {selected.noteRetour}
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 8,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 900 }}>
              Items dans la réquisition:
            </div>

            {getStatus(selected) !== "terminée" ? (
              <button
                onClick={openCompletePopup}
                style={{
                  height: 38,
                  padding: "0 16px",
                  borderRadius: 12,
                  border: "1px solid #168000",
                  background: "#168000",
                  color: "#fff",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Terminer la réquisition
              </button>
            ) : null}
          </div>

          <div
            style={{
              width: "100%",
              maxWidth: "100vw",
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
              border: "1px solid #e5e5e5",
              borderRadius: 12,
              overflowY: "hidden",
            }}
          >
            <div style={{ minWidth: panneauItemMinWidth, background: "#fff" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: panneauItemGridCols,
                  borderBottom: "1px solid #ddd",
                  fontSize: 13,
                  fontWeight: 900,
                }}
              >
                <div style={detailHeaderCell}>Projet source</div>
                <div style={detailHeaderCell}>Section</div>
                <div style={detailHeaderCell}>Date</div>
                <div style={detailHeaderCell}>Type</div>
                <div style={detailHeaderCell}>Ép.</div>
                <div style={detailHeaderCell}>Fabricant</div>
                <div style={detailHeaderCell}>Profile</div>
                <div style={detailHeaderCell}>Modèle</div>
                <div style={detailHeaderCell}>Fini</div>
                <div style={detailHeaderCell}>Longueur</div>
                <div style={detailHeaderCell}>Largeur</div>
                <div style={detailHeaderCell}>Qté avant</div>
                <div style={detailHeaderCell}>Qté demandée</div>
                <div style={detailHeaderCell}>Face ext.</div>
                <div style={{ ...detailHeaderCell, borderRight: "none" }}>
                  Face int.
                </div>
              </div>

              <div>
                {(selected.items || []).length === 0 ? (
                  <div style={{ padding: 12, color: "#777", fontSize: 13 }}>
                    (Aucun item dans cette réquisition)
                  </div>
                ) : (
                  (selected.items || []).map((it, i) => {
                    const zebra = i % 2 === 1;
                    const longTxt = longueurTexte(
                      it.longueurPieds,
                      it.longueurPouces
                    );

                    return (
                      <div
                        key={`${selected.key}-${i}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: panneauItemGridCols,
                          alignItems: "stretch",
                          borderBottom: "1px solid #eee",
                          background: zebra ? "#f7f7f7" : "#fff",
                          fontSize: 13,
                        }}
                      >
                        <div style={{ ...cellStyle, fontWeight: 800 }}>
                          {it.projetSource || ""}
                        </div>

                        <div style={centerCell}>{it.sectionCour || "—"}</div>

                        <div style={cellStyle}>{it.date || ""}</div>

                        <div style={{ ...cellStyle, fontWeight: 800 }}>
                          {it.type || ""}
                        </div>

                        <div style={centerCell}>{it.epaisseurPouces || ""}</div>

                        <div style={cellStyle}>{it.fabricant || ""}</div>
                        <div style={cellStyle}>{it.profile || ""}</div>
                        <div style={cellStyle}>{it.modele || ""}</div>
                        <div style={cellStyle}>{it.fini || ""}</div>

                        <div style={centerCell}>{longTxt}</div>

                        <div style={centerCell}>{it.largeurPouces || ""}</div>

                        <div style={centerCell}>
                          {it.quantiteStockAvant ?? it.quantiteStock ?? ""}
                        </div>

                        <div style={centerCell}>{it.quantiteDemande ?? ""}</div>

                        <div style={cellStyle}>{it.faceExterieure || ""}</div>
                        <div style={lastCellStyle}>{it.faceInterieure || ""}</div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {getStatus(selected) === "terminée" ? (
            <div
              style={{
                marginTop: 12,
                border: "1px solid #b7e3b7",
                background: "#f0fff0",
                color: "#168000",
                padding: 10,
                borderRadius: 10,
                fontWeight: 900,
              }}
            >
              Cette réquisition est terminée.
            </div>
          ) : null}
        </div>
      </div>

      {completeOpen && (
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
            if (e.target === e.currentTarget) closeCompletePopup();
          }}
        >
          <div
            style={{
              width: "min(1100px, 96vw)",
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
                Terminer la réquisition — {selected.reqId || selected.id}
              </div>

              <button
                onClick={closeCompletePopup}
                disabled={completeSaving}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  border: "1px solid #eee",
                  background: "#fff",
                  cursor: completeSaving ? "default" : "pointer",
                  fontSize: 18,
                  fontWeight: 900,
                  opacity: completeSaving ? 0.6 : 1,
                }}
                title="Fermer"
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 16, display: "grid", gap: 14 }}>
              <div
                style={{
                  border: "1px solid #e5e5e5",
                  background: "#f8fbff",
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 13,
                  color: "#333",
                  fontWeight: 800,
                }}
              >
                Pour chaque panneau utilisé, indique la longueur restante. Tu peux
                cliquer sur <b>Pas de reste</b> pour mettre automatiquement 0 pied
                et 0 pouce. Si la longueur restante est plus grande que 0, choisis
                la section dans la cour.
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 12,
                  justifyContent: "center",
                  alignItems: "center",
                  flexWrap: "wrap",
                  padding: 10,
                  borderRadius: 14,
                  background: "#f1f5f9",
                  border: "1px solid #e5e5e5",
                }}
              >
                <button
                  onClick={() => setCompleteMode("same")}
                  style={{
                    height: 52,
                    minWidth: 280,
                    padding: "0 18px",
                    borderRadius: 14,
                    border:
                      completeMode === "same"
                        ? "2px solid #168000"
                        : "1px solid #aaa",
                    background: completeMode === "same" ? "#168000" : "#fff",
                    color: completeMode === "same" ? "#fff" : "#111",
                    fontWeight: 1000,
                    fontSize: 16,
                    cursor: "pointer",
                    boxShadow:
                      completeMode === "same"
                        ? "0 8px 18px rgba(22,128,0,0.25)"
                        : "none",
                  }}
                >
                  Pareil pour chaque panneau
                </button>

                <button
                  onClick={() => setCompleteMode("different")}
                  style={{
                    height: 52,
                    minWidth: 280,
                    padding: "0 18px",
                    borderRadius: 14,
                    border:
                      completeMode === "different"
                        ? "2px solid #1e5eff"
                        : "1px solid #aaa",
                    background:
                      completeMode === "different" ? "#1e5eff" : "#fff",
                    color: completeMode === "different" ? "#fff" : "#111",
                    fontWeight: 1000,
                    fontSize: 16,
                    cursor: "pointer",
                    boxShadow:
                      completeMode === "different"
                        ? "0 8px 18px rgba(30,94,255,0.25)"
                        : "none",
                  }}
                >
                  Différent pour chaque panneau
                </button>
              </div>

              {(selected.items || []).map((it, i) => {
                const k = itemKey(selected, it, i);
                const itemForms = restantsByItem[k] || {};
                const sameForm = itemForms.same || {};
                const differentForms = Array.isArray(itemForms.different)
                  ? itemForms.different
                  : [];
                const longTxt = longueurTexte(it.longueurPieds, it.longueurPouces);
                const qtyDemandee = Number(it.quantiteDemande ?? 0) || 0;

                return (
                  <div
                    key={`complete-item-${k}`}
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: 14,
                      overflow: "hidden",
                      background: "#fff",
                    }}
                  >
                    <div
                      style={{
                        padding: "10px 12px",
                        background: "#0b3a78",
                        color: "#fff",
                        fontWeight: 900,
                        fontSize: 13,
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <span>
                        {it.type || "Panneau"} — {it.epaisseurPouces || ""}" —{" "}
                        {it.fabricant || ""} — {longTxt} x {it.largeurPouces || ""}
                      </span>

                      <span>
                        Nb de panneaux utilisés demandé: <b>{qtyDemandee}</b>
                      </span>
                    </div>

                    <div style={{ padding: 12, display: "grid", gap: 10 }}>
                      {completeMode === "same" ? (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "170px 1fr 1fr 1fr 125px",
                            gap: 10,
                            alignItems: "end",
                            border: "1px solid #eee",
                            borderRadius: 12,
                            padding: 10,
                            background: "#fff",
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 900,
                              fontSize: 13,
                              color: "#333",
                              paddingBottom: 8,
                            }}
                          >
                            Même restant pour les {qtyDemandee} panneaux
                          </div>

                          <div>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 900,
                                marginBottom: 4,
                              }}
                            >
                              Longueur restante pieds
                            </div>
                            <input
                              type="number"
                              min={0}
                              value={sameForm.longueurPieds ?? ""}
                              onChange={(e) =>
                                setRestantSameField(
                                  k,
                                  "longueurPieds",
                                  e.target.value
                                )
                              }
                              placeholder="Ex: 8 ou 0"
                              style={restantInputStyle}
                            />
                          </div>

                          <div>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 900,
                                marginBottom: 4,
                              }}
                            >
                              Pouces
                            </div>
                            <input
                              type="number"
                              min={0}
                              max={11}
                              value={sameForm.longueurPouces ?? ""}
                              onChange={(e) =>
                                setRestantSameField(
                                  k,
                                  "longueurPouces",
                                  e.target.value
                                )
                              }
                              placeholder="Ex: 6"
                              style={restantInputStyle}
                            />
                          </div>

                          <div>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 900,
                                marginBottom: 4,
                              }}
                            >
                              Section cour
                            </div>
                            <select
                              value={sameForm.sectionCour ?? ""}
                              onChange={(e) =>
                                setRestantSameField(
                                  k,
                                  "sectionCour",
                                  e.target.value
                                )
                              }
                              style={{
                                ...restantInputStyle,
                                background: "#fff",
                              }}
                            >
                              {SECTIONS_COUR.map((s) => (
                                <option key={s} value={s}>
                                  {s || "Choisir"}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 900,
                                marginBottom: 4,
                              }}
                            >
                              Aucun restant
                            </div>
                            <button
                              type="button"
                              onClick={() => setNoRestantSame(k)}
                              style={noRestButtonStyle}
                            >
                              Pas de reste
                            </button>
                          </div>
                        </div>
                      ) : differentForms.length === 0 ? (
                        <div style={{ color: "#777", fontSize: 13 }}>
                          Aucun panneau demandé pour cette ligne.
                        </div>
                      ) : (
                        differentForms.map((form, panneauIndex) => (
                          <div
                            key={`panel-${k}-${panneauIndex}`}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "120px 1fr 1fr 1fr 125px",
                              gap: 10,
                              alignItems: "end",
                              border: "1px solid #eee",
                              borderRadius: 12,
                              padding: 10,
                              background:
                                panneauIndex % 2 === 1 ? "#fafafa" : "#fff",
                            }}
                          >
                            <div
                              style={{
                                fontWeight: 900,
                                fontSize: 13,
                                color: "#333",
                                paddingBottom: 8,
                              }}
                            >
                              Panneau {panneauIndex + 1}
                            </div>

                            <div>
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 900,
                                  marginBottom: 4,
                                }}
                              >
                                Longueur restante pieds
                              </div>
                              <input
                                type="number"
                                min={0}
                                value={form.longueurPieds ?? ""}
                                onChange={(e) =>
                                  setRestantDifferentField(
                                    k,
                                    panneauIndex,
                                    "longueurPieds",
                                    e.target.value
                                  )
                                }
                                placeholder="Ex: 8 ou 0"
                                style={restantInputStyle}
                              />
                            </div>

                            <div>
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 900,
                                  marginBottom: 4,
                                }}
                              >
                                Pouces
                              </div>
                              <input
                                type="number"
                                min={0}
                                max={11}
                                value={form.longueurPouces ?? ""}
                                onChange={(e) =>
                                  setRestantDifferentField(
                                    k,
                                    panneauIndex,
                                    "longueurPouces",
                                    e.target.value
                                  )
                                }
                                placeholder="Ex: 6"
                                style={restantInputStyle}
                              />
                            </div>

                            <div>
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 900,
                                  marginBottom: 4,
                                }}
                              >
                                Section cour
                              </div>
                              <select
                                value={form.sectionCour ?? ""}
                                onChange={(e) =>
                                  setRestantDifferentField(
                                    k,
                                    panneauIndex,
                                    "sectionCour",
                                    e.target.value
                                  )
                                }
                                style={{
                                  ...restantInputStyle,
                                  background: "#fff",
                                }}
                              >
                                {SECTIONS_COUR.map((s) => (
                                  <option key={s} value={s}>
                                    {s || "Choisir"}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 900,
                                  marginBottom: 4,
                                }}
                              >
                                Aucun restant
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setNoRestantDifferent(k, panneauIndex)
                                }
                                style={noRestButtonStyle}
                              >
                                Pas de reste
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}

              <div
                style={{
                  border: "1px solid #eee",
                  borderRadius: 12,
                  padding: 12,
                  background: "#fff",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 6 }}>
                  Note de fermeture
                </div>
                <textarea
                  value={completeNote}
                  onChange={(e) => setCompleteNote(e.target.value)}
                  placeholder="Note optionnelle..."
                  rows={4}
                  style={{
                    width: "100%",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    padding: 10,
                    fontSize: 13,
                    resize: "vertical",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {completeError ? (
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
                  {completeError}
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
                onClick={closeCompletePopup}
                disabled={completeSaving}
                style={{
                  height: 38,
                  padding: "0 14px",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  background: "#fff",
                  cursor: completeSaving ? "default" : "pointer",
                  fontWeight: 900,
                  opacity: completeSaving ? 0.7 : 1,
                }}
              >
                Annuler
              </button>

              <button
                onClick={terminerRequisitionPanneaux}
                disabled={completeSaving}
                style={{
                  height: 42,
                  padding: "0 18px",
                  borderRadius: 12,
                  border: "1px solid #168000",
                  background: "#168000",
                  color: "#fff",
                  fontWeight: 900,
                  cursor: completeSaving ? "default" : "pointer",
                  opacity: completeSaving ? 0.7 : 1,
                }}
              >
                {completeSaving
                  ? "Enregistrement..."
                  : "Confirmer et remettre les restants"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
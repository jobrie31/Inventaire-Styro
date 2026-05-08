import React, { useEffect, useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "./firebaseConfig";
import { CLIENT_ID } from "./appClient";
import {
  actorName,
  currentUserInfo,
  fmtTS,
  getStatus,
} from "./requisitionUtils";

export default function ReqMoulures({
  selected,
  modalUrl,
  setModalUrl,
  isAdmin = false,
  onCloseDetail,
}) {
  const moulureItemGridCols = "230px 170px 250px 150px 170px 180px 260px";
  const moulureItemMinWidth = 1410;

  const [notePret, setNotePret] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setNotePret(selected?.pretChargementNote || "");
    setErr("");
    setSaving(false);
  }, [selected?.id, selected?.pretChargementNote]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") {
        setModalUrl(null);
      }
    }

    if (modalUrl) {
      window.addEventListener("keydown", onKeyDown);
    }

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalUrl, setModalUrl]);

  async function marquerPretChargement() {
    if (!selected?.id) return;

    const ok = window.confirm(
      "Confirmer que cette réquisition de moulures est prête pour le chargement ?"
    );
    if (!ok) return;

    setSaving(true);
    setErr("");

    try {
      const actor = currentUserInfo();

      await updateDoc(
        doc(db, "clients", CLIENT_ID, "requisitionsMoulures", selected.id),
        {
          status: "pret_chargement",
          pretChargementNote: String(notePret || "").trim(),

          pretChargementByUid: actor.uid,
          pretChargementByEmail: actor.email,
          pretChargementByName: actor.name,
          pretChargementAt: serverTimestamp(),

          updatedByUid: actor.uid,
          updatedByEmail: actor.email,
          updatedByName: actor.name,
          updatedAt: serverTimestamp(),
        }
      );

      setSaving(false);

      if (typeof onCloseDetail === "function") {
        onCloseDetail();
      }
    } catch (e) {
      console.error(e);
      setErr("Erreur lors du changement en prêt pour chargement.");
      setSaving(false);
    }
  }

  async function fermerRequisitionMoulure() {
    if (!selected?.id) return;

    if (!isAdmin) {
      setErr("Seulement un admin peut fermer la réquisition.");
      return;
    }

    const ok = window.confirm(
      "Confirmer la fermeture de cette réquisition de moulures ? Elle ira dans les req terminées."
    );
    if (!ok) return;

    setSaving(true);
    setErr("");

    try {
      const actor = currentUserInfo();

      await updateDoc(
        doc(db, "clients", CLIENT_ID, "requisitionsMoulures", selected.id),
        {
          status: "terminée",
          noteRetour: String(notePret || selected.pretChargementNote || "").trim(),

          completedByUid: actor.uid,
          completedByEmail: actor.email,
          completedByName: actor.name,
          completedAt: serverTimestamp(),

          updatedByUid: actor.uid,
          updatedByEmail: actor.email,
          updatedByName: actor.name,
          updatedAt: serverTimestamp(),
        }
      );

      setSaving(false);

      if (typeof onCloseDetail === "function") {
        onCloseDetail();
      }
    } catch (e) {
      console.error(e);
      setErr("Erreur lors de la fermeture de la réquisition.");
      setSaving(false);
    }
  }

  if (!selected) return null;

  const status = getStatus(selected);

  const hasNoteRequisition = String(selected?.note || "").trim() !== "";
  const hasNoteChargement =
    String(notePret || selected?.pretChargementNote || "").trim() !== "";

  const cellStyle = {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    padding: "14px 12px",
    boxSizing: "border-box",
    borderRight: "1px solid #cfd8e6",
    height: "100%",
    display: "flex",
    alignItems: "center",
    fontSize: 18,
  };

  const lastCellStyle = {
    ...cellStyle,
    borderRight: "none",
  };

  const centerCell = {
    ...cellStyle,
    justifyContent: "center",
    textAlign: "center",
    fontWeight: 900,
  };

  const centerLastCell = {
    ...lastCellStyle,
    justifyContent: "center",
    textAlign: "center",
    fontWeight: 900,
  };

  const qteDemandeeCell = {
    ...centerCell,
    background: "#d6fbe2",
    color: "#065f1f",
    border: "2px solid #52c878",
    fontSize: 24,
    fontWeight: 1000,
    boxShadow: "inset 0 0 0 999px rgba(34, 197, 94, 0.08)",
  };

  const detailHeaderCell = {
    ...cellStyle,
    fontWeight: 1000,
    justifyContent: "center",
    textAlign: "center",
    background: "#e8eef7",
    color: "#102033",
    fontSize: 17,
    borderRight: "1px solid #cfd8e6",
  };

  const qteDemandeeHeaderCell = {
    ...detailHeaderCell,
    background: "#bdf4cf",
    color: "#065f1f",
    borderRight: "1px solid #83d99b",
  };

  const infoBoxStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
    gap: 12,
    marginBottom: 18,
    padding: 16,
    borderRadius: 14,
    background: "#f8f8f8",
    border: "1px solid #e0e0e0",
  };

  const infoItemStyle = {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  };

  const infoLabelStyle = {
    fontSize: 15,
    fontWeight: 1000,
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  };

  const infoValueStyle = {
    fontSize: 23,
    fontWeight: 1000,
    color: "#111",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const noteRequisitionStyle = {
    marginBottom: 18,
    border: hasNoteRequisition ? "2px solid #2563eb" : "1px solid #eee",
    background: hasNoteRequisition ? "#eff6ff" : "#fafafa",
    borderRadius: 12,
    padding: "14px 16px",
    fontSize: 22,
    color: "#111",
    lineHeight: 1.45,
    fontWeight: 800,
    animation: hasNoteRequisition ? "noteBlueFlash 1.15s infinite" : "none",
  };

  const actionBoxStyle = {
    marginTop: 18,
    padding: 18,
    borderRadius: 16,
    background: status === "pret_chargement" ? "#eaffea" : "#f8fbff",
    border:
      status === "pret_chargement"
        ? "2px solid #168000"
        : hasNoteChargement
        ? "2px solid #2563eb"
        : "1px solid #dbeafe",
    display: "grid",
    gridTemplateColumns: "minmax(260px, 1fr) auto",
    gap: 16,
    alignItems: "end",
  };

  const noteInputStyle = {
    width: "100%",
    minHeight: 58,
    borderRadius: 12,
    border: hasNoteChargement ? "2px solid #2563eb" : "1px solid #ccc",
    background: hasNoteChargement ? "#eff6ff" : "#fff",
    color: "#111",
    padding: "12px 14px",
    fontSize: 20,
    fontWeight: 900,
    boxSizing: "border-box",
    resize: "vertical",
    outline: "none",
  };

  const greenBtnStyle = {
    height: 76,
    minWidth: 230,
    padding: "0 28px",
    borderRadius: 16,
    border: "2px solid #168000",
    background: "#168000",
    color: "#fff",
    fontWeight: 1000,
    fontSize: 28,
    cursor: saving ? "default" : "pointer",
    opacity: saving ? 0.7 : 1,
    whiteSpace: "nowrap",
    boxShadow: "0 8px 18px rgba(22,128,0,0.25)",
  };

  const orangeBtnStyle = {
    height: 76,
    minWidth: 230,
    padding: "0 28px",
    borderRadius: 16,
    border: "2px solid #d97706",
    background: "#d97706",
    color: "#fff",
    fontWeight: 1000,
    fontSize: 24,
    cursor: saving ? "default" : "pointer",
    opacity: saving ? 0.7 : 1,
    whiteSpace: "nowrap",
    boxShadow: "0 8px 18px rgba(217,119,6,0.25)",
  };

  return (
    <>
      <style>
        {`
          @keyframes noteBlueFlash {
            0% {
              background: #eff6ff;
              border-color: #93c5fd;
              box-shadow: 0 0 0 rgba(37, 99, 235, 0);
            }
            50% {
              background: #bfdbfe;
              border-color: #2563eb;
              box-shadow: 0 0 26px rgba(37, 99, 235, 0.65);
            }
            100% {
              background: #eff6ff;
              border-color: #93c5fd;
              box-shadow: 0 0 0 rgba(37, 99, 235, 0);
            }
          }
        `}
      </style>

      <div
        style={{
          padding: 18,
          width: "100%",
          maxWidth: "100vw",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 14,
            padding: 18,
            fontFamily: "Arial, sans-serif",
            boxShadow: "0 8px 20px rgba(0,0,0,0.06)",
          }}
        >
          <div
            style={{
              fontWeight: 1000,
              fontSize: 30,
              marginBottom: 16,
              lineHeight: 1.1,
            }}
          >
            Détails — {selected.reqId || selected.id}
          </div>

          <div style={infoBoxStyle}>
            <div style={infoItemStyle}>
              <div style={infoLabelStyle}>Demandé par</div>
              <div style={infoValueStyle} title={actorName(selected, "created")}>
                {actorName(selected, "created")}
              </div>
            </div>

            <div style={infoItemStyle}>
              <div style={infoLabelStyle}>Envoyé à</div>
              <div style={infoValueStyle} title={selected.projetEnvoye || ""}>
                {selected.projetEnvoye || "—"}
              </div>
            </div>

            <div style={infoItemStyle}>
              <div style={infoLabelStyle}>Statut</div>
              <div
                style={{
                  ...infoValueStyle,
                  color:
                    status === "terminée"
                      ? "#168000"
                      : status === "pret_chargement"
                      ? "#168000"
                      : "#d97706",
                }}
              >
                {status === "pret_chargement" ? "Prêt à charger" : status}
              </div>
            </div>

            <div style={infoItemStyle}>
              <div style={infoLabelStyle}>Date</div>
              <div style={infoValueStyle}>
                {fmtTS(selected.createdAt) || "—"}
              </div>
            </div>
          </div>

          {err ? (
            <div
              style={{
                marginBottom: 18,
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid #ffcaca",
                background: "#fff2f2",
                color: "#b00000",
                fontSize: 17,
                fontWeight: 900,
              }}
            >
              {err}
            </div>
          ) : null}

          {selected.note ? (
            <div style={noteRequisitionStyle}>
              <b>Note:</b> {selected.note}
            </div>
          ) : null}

          {selected.noteRetour ? (
            <div
              style={{
                marginBottom: 18,
                border: "1px solid #b7e3b7",
                background: "#f0fff0",
                borderRadius: 12,
                padding: "14px 16px",
                fontSize: 20,
                color: "#168000",
                fontWeight: 900,
                lineHeight: 1.45,
              }}
            >
              <b>Note de fermeture:</b> {selected.noteRetour}
            </div>
          ) : null}

          <div
            style={{
              fontSize: 23,
              fontWeight: 1000,
              marginBottom: 12,
            }}
          >
            Items dans la réquisition
          </div>

          <div
            style={{
              width: "100%",
              maxWidth: "100vw",
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
              border: "2px solid #b8c7dc",
              borderRadius: 16,
              background: "#f8fbff",
              boxShadow: "0 8px 22px rgba(15, 23, 42, 0.10)",
            }}
          >
            <div style={{ minWidth: moulureItemMinWidth, background: "#fff" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: moulureItemGridCols,
                  borderBottom: "1px solid #cfd8e6",
                  fontWeight: 1000,
                }}
              >
                <div style={detailHeaderCell}>Projet source</div>
                <div style={detailHeaderCell}>Section cour</div>
                <div style={detailHeaderCell}>Matériel</div>
                <div style={detailHeaderCell}>Calibre</div>
                <div style={detailHeaderCell}>Qté en stock</div>
                <div style={qteDemandeeHeaderCell}>Qté demandée</div>
                <div style={{ ...detailHeaderCell, borderRight: "none" }}>
                  Dessin
                </div>
              </div>

              <div>
                {(selected.items || []).length === 0 ? (
                  <div style={{ padding: 18, color: "#777", fontSize: 18 }}>
                    (Aucun item dans cette réquisition)
                  </div>
                ) : (
                  (selected.items || []).map((it, i) => {
                    const zebra = i % 2 === 1;

                    const qteStock =
                      it.quantiteStockAvant ??
                      it.quantiteStock ??
                      it.quantiteEnStock ??
                      it.quantite ??
                      "";

                    return (
                      <div
                        key={`${selected.key}-${i}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: moulureItemGridCols,
                          alignItems: "center",
                          borderBottom: "1px solid #d9e2ef",
                          background: zebra ? "#f1f6ff" : "#ffffff",
                          minHeight: 125,
                        }}
                      >
                        <div style={{ ...cellStyle, fontWeight: 900 }}>
                          {it.projetSource || ""}
                        </div>

                        <div style={centerCell}>{it.sectionCour || "—"}</div>

                        <div style={{ ...cellStyle, fontWeight: 900 }}>
                          {it.materiel || ""}
                        </div>

                        <div style={centerCell}>{it.calibre || ""}</div>

                        <div style={centerCell}>{qteStock}</div>

                        <div style={qteDemandeeCell}>
                          {it.quantiteDemande ?? ""}
                        </div>

                        <div
                          style={{
                            ...centerLastCell,
                            padding: 8,
                          }}
                        >
                          {it.dessinUrl ? (
                            <img
                              src={it.dessinUrl}
                              alt="dessin"
                              loading="lazy"
                              decoding="async"
                              onClick={(e) => {
                                e.stopPropagation();
                                setModalUrl(it.dessinUrl);
                              }}
                              title="Cliquer pour agrandir"
                              style={{
                                width: 210,
                                height: 112,
                                objectFit: "contain",
                                border: "1px solid #cfd8e6",
                                background: "#fff",
                                cursor: "zoom-in",
                                boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
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

          {status !== "terminée" ? (
            <div style={actionBoxStyle}>
              <div>
                <div
                  style={{
                    fontSize: 30,
                    fontWeight: 1000,
                    marginBottom: 12,
                    color: status === "pret_chargement" ? "#168000" : "#0b3a78",
                    lineHeight: 1.15,
                  }}
                >
                  Prêt à envoyer vers {selected.projetEnvoye || "—"}
                </div>

                <textarea
                  value={notePret}
                  onChange={(e) => setNotePret(e.target.value)}
                  placeholder="Écris une note ici..."
                  style={noteInputStyle}
                  disabled={saving}
                />
              </div>

              {status === "pret_chargement" ? (
                isAdmin ? (
                  <button
                    type="button"
                    onClick={fermerRequisitionMoulure}
                    disabled={saving}
                    style={orangeBtnStyle}
                  >
                    {saving ? "Enregistrement..." : "Fermer la req"}
                  </button>
                ) : (
                  <div
                    style={{
                      minHeight: 76,
                      padding: "0 22px",
                      borderRadius: 16,
                      border: "1px solid #b7e3b7",
                      background: "#f0fff0",
                      color: "#168000",
                      fontWeight: 1000,
                      fontSize: 20,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                      whiteSpace: "nowrap",
                    }}
                  >
                    En attente de fermeture par un admin
                  </div>
                )
              ) : (
                <button
                  type="button"
                  onClick={marquerPretChargement}
                  disabled={saving}
                  style={greenBtnStyle}
                >
                  {saving ? "..." : "Prêt"}
                </button>
              )}
            </div>
          ) : null}
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
              width: "75vw",
              height: "75vh",
              maxWidth: "94vw",
              maxHeight: "90vh",
              objectFit: "contain",
              display: "block",
              borderRadius: 10,
              boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
              background: "transparent",
            }}
          />
        </div>
      )}
    </>
  );
}
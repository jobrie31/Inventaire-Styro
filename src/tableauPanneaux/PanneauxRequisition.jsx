import React from "react";

export default function PanneauxRequisition({ ctx }) {
  const {
    reqStartOpen,
    closeReqStart,

    reqLongueurPieds,
    setReqLongueurPieds,
    reqLongueurPouces,
    setReqLongueurPouces,
    reqError,
    confirmerStartReqMode,

    reqConfirmOpen,
    closeReqConfirm,
    reqSelectedList,
    reqProjetEnvoye,
    setReqProjetEnvoye,
    reqNote,
    setReqNote,
    reqQtyById,
    setReqQtyById,
    reqSaving,
    createReqPanneaux,

    morceauxPossibles,
    perteOptimisation,
  } = ctx;

  function fmtLongueur(row) {
    const p = row?.longueurPieds ?? "";
    const po = row?.longueurPouces ?? 0;
    if (p === "" || p === null || p === undefined) return "—";
    return `${p} pi ${po || 0} po`;
  }

  function fmtPerte(v) {
    if (!Number.isFinite(v)) return "—";

    const totalPouces = Math.round(Number(v) * 12);
    const pieds = Math.floor(totalPouces / 12);
    const pouces = totalPouces % 12;

    if (pieds <= 0 && pouces <= 0) return `0 po`;
    if (pieds <= 0) return `${pouces} po`;
    if (pouces <= 0) return `${pieds} pi`;

    return `${pieds} pi ${pouces} po`;
  }

  function openOutlookRequisitionPanneauxEmail({ reqId }) {
    const to = "entrepot@styro.ca";

    const subject = encodeURIComponent(
      `Réquisition panneaux ${reqId || ""}`.trim()
    );

    const body = encodeURIComponent(
      `Salut les gars,

J'ai envoyé une réquisition de panneaux dans l'inventaire Styro.

Merci de bien aller traiter la demande.

Numéro de réquisition : ${reqId || "-"}
Projet à envoyer : ${String(reqProjetEnvoye || "").trim() || "-"}

${String(reqNote || "").trim() ? `Note :\n${String(reqNote || "").trim()}\n\n` : ""}Merci.`
    );

    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  }

  async function handleCreateReqPanneauxAvecEmail() {
    try {
      const result = await createReqPanneaux();

      if (!result || result === false) {
        return;
      }

      openOutlookRequisitionPanneauxEmail({
        reqId: result.reqId,
      });
    } catch (e) {
      console.error(e);
    }
  }

  const inputStyle = {
    height: 42,
    borderRadius: 10,
    border: "1px solid #ddd",
    padding: "0 10px",
    fontSize: 15,
    fontWeight: 900,
    boxSizing: "border-box",
    textAlign: "center",
    width: "100%",
  };

  const labelStyle = {
    fontSize: 13,
    fontWeight: 1000,
    textAlign: "center",
    marginBottom: 5,
  };

  if (!reqStartOpen && !reqConfirmOpen) return null;

  return (
    <>
      {reqStartOpen && (
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
        >
          <div
            style={{
              width: "min(520px, 95vw)",
              background: "#fff",
              borderRadius: 18,
              boxShadow: "0 18px 40px rgba(0,0,0,0.28)",
              border: "1px solid rgba(0,0,0,0.08)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "16px 18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid #eee",
                background: "#f8fbff",
              }}
            >
              <div style={{ fontWeight: 1000, fontSize: 21 }}>
                Réquisition panneaux
              </div>

              <button
                onClick={closeReqStart}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  border: "1px solid #eee",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: 20,
                  fontWeight: 1000,
                }}
                title="Fermer"
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 18, display: "grid", gap: 16 }}>
              <div
                style={{
                  border: "1px solid #dbeafe",
                  background: "#f8fbff",
                  borderRadius: 14,
                  padding: 12,
                  color: "#0b3a78",
                  fontWeight: 900,
                  fontSize: 14,
                  lineHeight: 1.35,
                  textAlign: "center",
                }}
              >
                Entre seulement la longueur voulue. Après, le tableau affichera
                les panneaux compatibles. Tu pourras utiliser les filtres déjà
                existants pour choisir le fabricant, type, épaisseur, etc.
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 0.75fr",
                  gap: 12,
                  alignItems: "end",
                }}
              >
                <div>
                  <div style={labelStyle}>Longueur voulue - pieds</div>
                  <input
                    type="number"
                    min={1}
                    value={reqLongueurPieds}
                    onChange={(e) => setReqLongueurPieds(e.target.value)}
                    style={inputStyle}
                    placeholder="ex: 10"
                  />
                </div>

                <div>
                  <div style={labelStyle}>Pouces</div>
                  <input
                    type="number"
                    min={0}
                    max={11}
                    value={reqLongueurPouces}
                    onChange={(e) => setReqLongueurPouces(e.target.value)}
                    style={inputStyle}
                    placeholder="0"
                  />
                </div>
              </div>

              {reqError ? (
                <div
                  style={{
                    border: "1px solid #ffd2d2",
                    background: "#fff5f5",
                    color: "#c40000",
                    padding: 12,
                    borderRadius: 12,
                    fontWeight: 900,
                    fontSize: 14,
                    textAlign: "center",
                  }}
                >
                  {reqError}
                </div>
              ) : null}
            </div>

            <div
              style={{
                padding: 16,
                borderTop: "1px solid #eee",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <button
                onClick={closeReqStart}
                style={{
                  height: 40,
                  padding: "0 16px",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                Annuler
              </button>

              <button
                onClick={confirmerStartReqMode}
                style={{
                  height: 42,
                  padding: "0 18px",
                  borderRadius: 12,
                  border: "1px solid #1e5eff",
                  background: "#1e5eff",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 1000,
                }}
              >
                Voir dans le tableau
              </button>
            </div>
          </div>
        </div>
      )}

      {reqConfirmOpen && (
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
        >
          <div
            style={{
              width: "min(1000px, 95vw)",
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
                Confirmer la réquisition panneaux
              </div>

              <button
                onClick={closeReqConfirm}
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

            <div style={{ padding: 16, display: "grid", gap: 12 }}>
              <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>
                  Panneaux choisis
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  {reqSelectedList.map((it) => {
                    const possible = morceauxPossibles(it);
                    const perte = perteOptimisation(it);

                    return (
                      <div
                        key={it.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 120px 130px 130px",
                          gap: 10,
                          alignItems: "center",
                          padding: "8px 10px",
                          border: "1px solid #eee",
                          borderRadius: 10,
                          background: "#fafafa",
                        }}
                      >
                        <div style={{ fontWeight: 900 }}>
                          {it.type || "Panneau"} {it.epaisseurPouces || ""}" —{" "}
                          {it.fabricant || ""} — {fmtLongueur(it)}
                        </div>

                        <div style={{ textAlign: "center", fontWeight: 900 }}>
                          x{possible} morceaux
                        </div>

                        <div style={{ textAlign: "center", fontWeight: 900 }}>
                          Perte {fmtPerte(perte)}
                        </div>

                        <input
                          type="number"
                          min={1}
                          value={reqQtyById[it.id] ?? 1}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setReqQtyById((prev) => ({
                              ...prev,
                              [it.id]: Number.isFinite(v) ? v : 1,
                            }));
                          }}
                          style={{
                            width: "100%",
                            height: 34,
                            borderRadius: 8,
                            border: "1px solid #ccc",
                            textAlign: "center",
                            fontWeight: 900,
                          }}
                          title="Quantité de panneaux à sortir"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 900 }}>Envoyé à</div>

                <input
                  value={reqProjetEnvoye}
                  onChange={(e) => setReqProjetEnvoye(e.target.value)}
                  placeholder="Projet / chantier / destination"
                  style={{
                    height: 40,
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    padding: "0 10px",
                    fontSize: 14,
                    fontWeight: 800,
                  }}
                />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 900 }}>Note</div>

                <textarea
                  value={reqNote}
                  onChange={(e) => setReqNote(e.target.value)}
                  placeholder="Note optionnelle"
                  style={{
                    minHeight: 80,
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    padding: 10,
                    fontSize: 14,
                    fontWeight: 700,
                    resize: "vertical",
                  }}
                />
              </div>
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
                onClick={closeReqConfirm}
                disabled={reqSaving}
                style={{
                  height: 38,
                  padding: "0 14px",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  background: "#fff",
                  cursor: reqSaving ? "default" : "pointer",
                  fontWeight: 900,
                }}
              >
                Annuler
              </button>

              <button
                onClick={handleCreateReqPanneauxAvecEmail}
                disabled={reqSaving}
                style={{
                  height: 40,
                  padding: "0 18px",
                  borderRadius: 12,
                  border: "1px solid #168000",
                  background: "#168000",
                  color: "#fff",
                  cursor: reqSaving ? "default" : "pointer",
                  fontWeight: 1000,
                  opacity: reqSaving ? 0.7 : 1,
                }}
              >
                {reqSaving ? "Création..." : "Créer la réquisition"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
import React from "react";

export default function PanneauxTable({ ctx }) {
  const {
    reqMode,
    showPrix = true,
    cols,
    lastCell,
    baseCell,
    loading,
    filtered,
    reqSelected,
    reqConfirmed,
    reqQtyById,
    settings,
    mult,
    editingId,
    editRow,
    prixUnitaire,
    calcPC,
    calcValeur,
    divOrNull,
    money,
    num,
    toggleCheckedRow,
    checkingId,
    onEditChange,
    sectionsCour,
    types,
    eps,
    setReqQtyById,
    setReqQtyPanneau,
    confirmerPanneauReq,
    retirerPanneauReq,
    choisirPanneauPourReq,
    saveEdit,
    savingEditId,
    cancelEdit,
    startEdit,
    supprimerRow,
    deletingId,
    reqSaving,
    reqLongueurVoulue,
    morceauxPossibles,
    perteOptimisation,
  } = ctx;

  const inputMini = {
    width: "100%",
    minWidth: 0,
    height: 24,
    fontSize: 11,
    padding: "0 4px",
    border: "1px solid #bdbdbd",
    background: "#fff",
    boxSizing: "border-box",
    textAlign: "center",
    fontWeight: 800,
  };

  const normalCenteredCell = {
    ...baseCell,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.15,
    borderRight: "1px solid #bfc5ce",
  };

  const importantTextCell = {
    fontSize: 14,
    fontWeight: 1000,
    lineHeight: 1.15,
  };

  const importantCenterCell = {
    ...baseCell,
    ...importantTextCell,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    borderRight: "1px solid #bfc5ce",
  };

  const qteCellStyle = {
    ...baseCell,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    fontSize: 16,
    fontWeight: 1000,
    color: "#064f17",
    background: "rgba(217, 251, 227, 0.75)",
    borderRight: "1px solid #bfc5ce",
  };

  const prixCellStyle = {
    ...baseCell,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    fontSize: 12,
    fontWeight: 800,
    borderRight: "1px solid #bfc5ce",
  };

  const optCellStyle = {
    ...baseCell,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    fontSize: 12,
    fontWeight: 1000,
    borderRight: "1px solid #bfc5ce",
    background: "#fed7aa",
    color: "#7c2d12",
  };

  const qtnTotalCellStyle = {
    ...baseCell,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    fontSize: 17,
    fontWeight: 1000,
    borderRight: "1px solid #bfc5ce",
    background: "#39ff14",
    color: "#003b00",
    animation: "flashQtnTotal 1.05s ease-in-out infinite",
    boxShadow: "inset 0 0 14px rgba(0, 255, 0, 0.55)",
  };

  const pertePanneauCellStyle = {
    ...baseCell,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    fontSize: 12,
    fontWeight: 1000,
    borderRight: "1px solid #bfc5ce",
    background: "#fff7ed",
    color: "#9a3412",
  };

  const tableHeaders = [
    "✓",
    "Projet",
    "Section cour",
    "Date",
    "Type",
    "Ép.",
    "Fabricant",
    "Profile",
    "Modèle",
    "Fini",
    "Longueur",
    "Largeur",
    "Qté",
    "Face ext.",
    "Face int.",
    ...(reqMode ? ["Optimisation", "Qtn total", "Perte / panneau"] : []),
    ...(showPrix
      ? ["Prix unit.", "PC", "Valeur", "Vente min.", "Sug. sans", "Sug. avec"]
      : []),
    reqMode ? "Action" : "Actions",
  ];

  function formatPerte(v) {
    if (!Number.isFinite(v)) return "—";

    const totalPouces = Math.round(Number(v) * 12);
    const pieds = Math.floor(totalPouces / 12);
    const pouces = totalPouces % 12;

    if (pieds <= 0 && pouces <= 0) return `0 po`;
    if (pieds <= 0) return `${pouces} po`;
    if (pouces <= 0) return `${pieds} pi`;

    return `${pieds} pi ${pouces} po`;
  }

  function changeReqQty(id, value) {
    if (typeof setReqQtyPanneau === "function") {
      setReqQtyPanneau(id, value);
      return;
    }

    const v = Number(value);
    setReqQtyById((prev) => ({
      ...prev,
      [id]: value === "" ? "" : Number.isFinite(v) ? v : 1,
    }));
  }

  return (
    <div
      className="tableZone tableZone--center"
      style={{
        paddingTop: 0,
        paddingLeft: reqMode ? 12 : undefined,
        paddingRight: reqMode ? 12 : undefined,
        boxSizing: "border-box",
      }}
    >
      <style>
        {`
          @keyframes flashQtnTotal {
            0% {
              background: #39ff14;
              transform: scale(1);
              box-shadow: inset 0 0 8px rgba(0, 255, 0, 0.35), 0 0 0 rgba(57, 255, 20, 0);
            }
            50% {
              background: #b6ff00;
              transform: scale(1.04);
              box-shadow: inset 0 0 20px rgba(0, 255, 0, 0.75), 0 0 16px rgba(57, 255, 20, 0.75);
            }
            100% {
              background: #39ff14;
              transform: scale(1);
              box-shadow: inset 0 0 8px rgba(0, 255, 0, 0.35), 0 0 0 rgba(57, 255, 20, 0);
            }
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

      <div
        className="tableBox tableBox--wide"
        style={{
          height: "calc(100vh - 220px)",
          overflow: "hidden",
          border: reqMode ? "3px solid #1e5eff" : "1px solid #c4c8cf",
          boxShadow: reqMode
            ? "0 0 0 9999px rgba(0,0,0,0.25), 0 18px 40px rgba(0,0,0,0.25)"
            : "0 5px 16px rgba(0,0,0,0.08)",
          borderRadius: reqMode ? 14 : 10,
          background: "#fff",
          position: "relative",
          zIndex: reqMode ? 2 : undefined,
        }}
      >
        <div
          className="tableScroll"
          style={{
            height: "100%",
            overflowY: "auto",
            overflowX: "hidden",
            padding: 0,
            scrollbarGutter: "stable",
          }}
        >
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 2,
              display: "grid",
              gridTemplateColumns: cols,
              alignItems: "stretch",
              width: "100%",
              boxSizing: "border-box",
              background: "#0b3a78",
              color: "#fff",
              borderBottom: "3px solid #0a2f60",
              fontSize: 11,
            }}
          >
            {tableHeaders.map((h, idx, arr) => (
              <div
                key={`${h}-${idx}`}
                style={{
                  ...(idx === arr.length - 1 ? lastCell : baseCell),
                  fontWeight: 900,
                  fontSize: 11,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  boxSizing: "border-box",
                  minHeight: 46,
                  borderRight:
                    idx === arr.length - 1
                      ? "none"
                      : "1px solid rgba(255,255,255,0.22)",
                }}
              >
                {h}
              </div>
            ))}
          </div>

          {loading ? (
            <div
              style={{
                padding: 12,
                fontSize: 14,
                fontWeight: 800,
                textAlign: "center",
              }}
            >
              Chargement...
            </div>
          ) : filtered.length === 0 ? (
            <div
              style={{
                padding: 12,
                fontSize: 14,
                fontWeight: 800,
                textAlign: "center",
              }}
            >
              {reqMode
                ? "(Aucun panneau compatible avec cette optimisation)"
                : "(Aucune donnée)"}
            </div>
          ) : (
            filtered.map((r, i) => {
              const isEditing = editingId === r.id;
              const chosen = reqSelected.has(r.id);
              const confirmed = reqConfirmed?.has?.(r.id) === true;
              const checked = r.checked === true;
              const reqQty = reqQtyById[r.id] ?? 1;
              const stock = Number(r.quantite ?? 0);
              const reqQtyNumber = Number(reqQty);
              const qtyInvalid = !Number.isFinite(reqQtyNumber) || reqQtyNumber <= 0;
              const qtyTooHigh = Number.isFinite(stock) && reqQtyNumber > stock;

              const rowForCalc = isEditing
                ? {
                    ...r,
                    ...editRow,
                    longueurPieds: Number(editRow?.longueurPieds ?? 0),
                    longueurPouces: Number(editRow?.longueurPouces ?? 0),
                    largeurPouces: Number(editRow?.largeurPouces ?? 0),
                    quantite: Number(editRow?.quantite ?? 0),
                  }
                : r;

              const prix = prixUnitaire(rowForCalc, settings);
              const pc = calcPC(rowForCalc);
              const val = calcValeur(pc, prix);
              const pvMin = divOrNull(prix, mult?.venteMin || 0.9);
              const psSans = divOrNull(prix, mult?.sugSans || 0.88);
              const psAvec = divOrNull(prix, mult?.sugAvec || 0.85);

              const longTxt =
                rowForCalc.longueurPieds != null &&
                rowForCalc.longueurPieds !== ""
                  ? `${rowForCalc.longueurPieds},${String(
                      rowForCalc.longueurPouces ?? 0
                    )}`
                  : "";

              const possible = reqMode ? morceauxPossibles(r) : 0;
              const perte = reqMode ? perteOptimisation(r) : null;
              const qtnTotal =
                reqMode && Number.isFinite(Number(r.quantite))
                  ? Number(r.quantite) * (Number(possible) || 0)
                  : 0;

              const rowBg = confirmed
                ? "#d9ffd4"
                : chosen
                ? "#fff8d8"
                : checked
                ? "#ffe66d"
                : i % 2 === 1
                ? "#dfe3e8"
                : "#ffffff";

              return (
                <div
                  key={r.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: cols,
                    alignItems: "stretch",
                    width: "100%",
                    boxSizing: "border-box",
                    borderBottom: "2px solid #c5cbd3",
                    fontSize: 12,
                    background: rowBg,
                    minHeight: 42,
                  }}
                >
                  <div
                    style={{
                      ...normalCenteredCell,
                      padding: 0,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={checkingId === r.id}
                      onChange={() => toggleCheckedRow(r)}
                      title="Marquer cette ligne"
                      style={{
                        width: 16,
                        height: 16,
                        cursor: checkingId === r.id ? "default" : "pointer",
                      }}
                    />
                  </div>

                  <div style={{ ...normalCenteredCell, fontWeight: 900 }}>
                    {isEditing ? (
                      <input
                        style={inputMini}
                        value={editRow?.projet ?? ""}
                        onChange={(e) => onEditChange("projet", e.target.value)}
                      />
                    ) : (
                      r.projet || ""
                    )}
                  </div>

                  <div style={normalCenteredCell}>
                    {isEditing ? (
                      <select
                        style={inputMini}
                        value={editRow?.sectionCour ?? ""}
                        onChange={(e) =>
                          onEditChange("sectionCour", e.target.value)
                        }
                      >
                        {sectionsCour.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : (
                      r.sectionCour || ""
                    )}
                  </div>

                  <div style={normalCenteredCell}>
                    {isEditing ? (
                      <input
                        type="date"
                        style={inputMini}
                        value={editRow?.date ?? ""}
                        onChange={(e) => onEditChange("date", e.target.value)}
                      />
                    ) : (
                      r.date || ""
                    )}
                  </div>

                  <div style={{ ...importantCenterCell }}>
                    {isEditing ? (
                      <select
                        style={inputMini}
                        value={editRow?.type ?? ""}
                        onChange={(e) => onEditChange("type", e.target.value)}
                      >
                        {types.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    ) : (
                      r.type || ""
                    )}
                  </div>

                  <div style={importantCenterCell}>
                    {isEditing ? (
                      <select
                        style={inputMini}
                        value={editRow?.epaisseurPouces ?? ""}
                        onChange={(e) =>
                          onEditChange("epaisseurPouces", e.target.value)
                        }
                      >
                        {eps.map((epp) => (
                          <option key={epp} value={epp}>
                            {epp}
                          </option>
                        ))}
                      </select>
                    ) : (
                      r.epaisseurPouces || ""
                    )}
                  </div>

                  <div style={importantCenterCell}>
                    {isEditing ? (
                      <input
                        style={inputMini}
                        value={editRow?.fabricant ?? ""}
                        onChange={(e) =>
                          onEditChange("fabricant", e.target.value)
                        }
                      />
                    ) : (
                      r.fabricant || ""
                    )}
                  </div>

                  <div style={normalCenteredCell}>
                    {isEditing ? (
                      <input
                        style={inputMini}
                        value={editRow?.profile ?? ""}
                        onChange={(e) => onEditChange("profile", e.target.value)}
                      />
                    ) : (
                      r.profile || ""
                    )}
                  </div>

                  <div style={normalCenteredCell}>
                    {isEditing ? (
                      <input
                        style={inputMini}
                        value={editRow?.modele ?? ""}
                        onChange={(e) => onEditChange("modele", e.target.value)}
                      />
                    ) : (
                      r.modele || ""
                    )}
                  </div>

                  <div style={normalCenteredCell}>
                    {isEditing ? (
                      <input
                        style={inputMini}
                        value={editRow?.fini ?? ""}
                        onChange={(e) => onEditChange("fini", e.target.value)}
                      />
                    ) : (
                      r.fini || ""
                    )}
                  </div>

                  <div
                    style={{
                      ...importantCenterCell,
                      gap: 2,
                    }}
                  >
                    {isEditing ? (
                      <>
                        <input
                          style={inputMini}
                          value={editRow?.longueurPieds ?? ""}
                          onChange={(e) =>
                            onEditChange("longueurPieds", e.target.value)
                          }
                          inputMode="numeric"
                          placeholder="pi"
                        />

                        <input
                          style={inputMini}
                          value={editRow?.longueurPouces ?? ""}
                          onChange={(e) =>
                            onEditChange("longueurPouces", e.target.value)
                          }
                          inputMode="numeric"
                          placeholder="po"
                        />
                      </>
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          textAlign: "center",
                          fontSize: 15,
                          fontWeight: 1000,
                        }}
                      >
                        {longTxt}
                      </div>
                    )}
                  </div>

                  <div style={importantCenterCell}>
                    {isEditing ? (
                      <input
                        style={inputMini}
                        value={editRow?.largeurPouces ?? ""}
                        onChange={(e) =>
                          onEditChange("largeurPouces", e.target.value)
                        }
                        inputMode="numeric"
                      />
                    ) : (
                      r.largeurPouces || ""
                    )}
                  </div>

                  <div style={qteCellStyle}>
                    {isEditing ? (
                      <input
                        style={inputMini}
                        value={editRow?.quantite ?? ""}
                        onChange={(e) => onEditChange("quantite", e.target.value)}
                        inputMode="numeric"
                      />
                    ) : (
                      r.quantite ?? ""
                    )}
                  </div>

                  <div style={normalCenteredCell}>
                    {isEditing ? (
                      <input
                        style={inputMini}
                        value={editRow?.faceExterieure ?? ""}
                        onChange={(e) =>
                          onEditChange("faceExterieure", e.target.value)
                        }
                      />
                    ) : (
                      r.faceExterieure || ""
                    )}
                  </div>

                  <div style={normalCenteredCell}>
                    {isEditing ? (
                      <input
                        style={inputMini}
                        value={editRow?.faceInterieure ?? ""}
                        onChange={(e) =>
                          onEditChange("faceInterieure", e.target.value)
                        }
                      />
                    ) : (
                      r.faceInterieure || ""
                    )}
                  </div>

                  {reqMode ? (
                    <>
                      <div style={optCellStyle}>
                        <div
                          style={{
                            display: "grid",
                            gap: 2,
                            width: "100%",
                            lineHeight: 1.15,
                          }}
                        >
                          <div
                            style={{
                              color: "#0b3a78",
                              fontWeight: 1000,
                              fontSize: 13,
                            }}
                          >
                            x{possible || 0} morceaux
                          </div>
                        </div>
                      </div>

                      <div style={qtnTotalCellStyle}>
                        {Number.isFinite(qtnTotal) ? qtnTotal : 0}
                      </div>

                      <div style={pertePanneauCellStyle}>
                        {Number.isFinite(perte) ? (
                          <div
                            style={{
                              display: "grid",
                              gap: 2,
                              lineHeight: 1.15,
                            }}
                          >
                            <div>{formatPerte(perte)}</div>
                            <div style={{ fontSize: 10 }}>par panneau</div>
                          </div>
                        ) : (
                          "—"
                        )}
                      </div>
                    </>
                  ) : null}

                  {showPrix ? (
                    <>
                      <div style={prixCellStyle}>{money(prix)}</div>
                      <div style={prixCellStyle}>{num(pc, 2)}</div>
                      <div style={prixCellStyle}>{money(val)}</div>
                      <div style={prixCellStyle}>{money(pvMin)}</div>
                      <div style={prixCellStyle}>{money(psSans)}</div>
                      <div style={prixCellStyle}>{money(psAvec)}</div>
                    </>
                  ) : null}

                  <div
                    style={{
                      ...lastCell,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                      gap: 4,
                      flexWrap: "wrap",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    {reqMode ? (
                      chosen ? (
                        <>
                          <div
                            style={{
                              width: "100%",
                              color: confirmed ? "#168000" : "#8a6d00",
                              fontWeight: 1000,
                              fontSize: 12,
                            }}
                          >
                            {confirmed ? "Confirmé" : "Choisi"}
                          </div>

                          <input
                            className="noNumberArrows"
                            type="number"
                            min={1}
                            value={reqQty}
                            disabled={reqSaving}
                            onChange={(e) => changeReqQty(r.id, e.target.value)}
                            style={{
                              width: 42,
                              height: 24,
                              fontSize: 11,
                              padding: 0,
                              textAlign: "center",
                              fontWeight: 900,
                              border:
                                qtyInvalid || qtyTooHigh
                                  ? "2px solid #d33"
                                  : confirmed
                                  ? "2px solid #168000"
                                  : "1px solid #888",
                              borderRadius: 4,
                              background: "#fff",
                            }}
                            title="Quantité de panneaux à sortir"
                          />

                          {confirmed ? (
                            <div
                              style={{
                                minWidth: 72,
                                height: 24,
                                borderRadius: 6,
                                border: "1px solid #168000",
                                background: "#e8ffe5",
                                color: "#168000",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 11,
                                fontWeight: 1000,
                                padding: "0 5px",
                                boxSizing: "border-box",
                              }}
                              title="Panneau confirmé"
                            >
                              ✓ Confirmé
                            </div>
                          ) : (
                            <button
                              className="btn"
                              style={{
                                width: 72,
                                height: 24,
                                fontSize: 11,
                                padding: 0,
                                border:
                                  reqSaving || qtyInvalid || qtyTooHigh
                                    ? "1px solid #aaa"
                                    : "1px solid #168000",
                                background:
                                  reqSaving || qtyInvalid || qtyTooHigh
                                    ? "#e5e7eb"
                                    : "#168000",
                                color:
                                  reqSaving || qtyInvalid || qtyTooHigh
                                    ? "#666"
                                    : "#fff",
                                fontWeight: 900,
                                cursor:
                                  reqSaving || qtyInvalid || qtyTooHigh
                                    ? "not-allowed"
                                    : "pointer",
                              }}
                              onClick={() => confirmerPanneauReq(r.id)}
                              disabled={reqSaving || qtyInvalid || qtyTooHigh}
                              title={
                                qtyTooHigh
                                  ? `Stock insuffisant. Stock: ${stock}`
                                  : "Confirmer ce panneau"
                              }
                            >
                              Confirmer
                            </button>
                          )}
                        </>
                      ) : (
                        <button
                          className="btn"
                          style={{
                            width: 66,
                            height: 24,
                            fontSize: 11,
                            padding: 0,
                            border: "1px solid #168000",
                            background: "#168000",
                            color: "#fff",
                            fontWeight: 900,
                          }}
                          onClick={() => choisirPanneauPourReq(r.id)}
                          disabled={reqSaving}
                          title="Choisir"
                        >
                          Choisir
                        </button>
                      )
                    ) : isEditing ? (
                      <>
                        <button
                          className="btn"
                          style={{
                            width: 54,
                            height: 24,
                            fontSize: 11,
                            padding: 0,
                            border: "1px solid #888",
                            background: "#d9f2d9",
                          }}
                          onClick={() => saveEdit(r.id)}
                          disabled={savingEditId === r.id}
                          title="Enregistrer"
                        >
                          {savingEditId === r.id ? "..." : "OK"}
                        </button>

                        <button
                          className="btn"
                          style={{
                            width: 58,
                            height: 24,
                            fontSize: 11,
                            padding: 0,
                            border: "1px solid #888",
                            background: "#f0f0f0",
                          }}
                          onClick={cancelEdit}
                          title="Annuler"
                        >
                          Annuler
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn"
                          style={{
                            width: 58,
                            height: 24,
                            fontSize: 11,
                            padding: 0,
                            border: "1px solid #888",
                            background: "#e8f0ff",
                          }}
                          onClick={() => startEdit(r)}
                          title="Modifier"
                        >
                          Modifier
                        </button>

                        <button
                          className="btnRed"
                          style={{
                            width: 22,
                            height: 22,
                            minWidth: 22,
                            fontSize: 12,
                            fontWeight: 800,
                            padding: 0,
                            lineHeight: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                          onClick={() => supprimerRow(r.id)}
                          disabled={deletingId === r.id}
                          title="Supprimer"
                        >
                          {deletingId === r.id ? "…" : "×"}
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
  );
}
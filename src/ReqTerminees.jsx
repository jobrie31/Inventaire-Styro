import React from "react";
import { actorName, fmtTS, getStatus } from "./requisitionUtils";

export default function ReqTerminees({
  rows,
  selectedKey,
  setSelectedKey,
  showTerminees,
  isAdmin = false,
}) {
  const reqGridCols = "180px 160px 210px 360px 220px 1fr";

  const headerCellStyle = {
    padding: "14px 12px",
    fontSize: 18,
    fontWeight: 1000,
    borderRight: "1px solid #ddd",
    background: "#f7f7f7",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
  };

  const rowCellStyle = {
    padding: "16px 12px",
    fontSize: 18,
    minHeight: 58,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    borderRight: "1px solid #eee",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    boxSizing: "border-box",
  };

  const centerCellStyle = {
    ...rowCellStyle,
    justifyContent: "center",
    textAlign: "center",
    fontWeight: 1000,
  };

  return (
    <>
      <style>
        {`
          @keyframes reqReadyFlash {
            0% { background: #ffffff; }
            50% { background: #bff7c8; }
            100% { background: #ffffff; }
          }
        `}
      </style>

      <div
        style={{
          width: "100%",
          textAlign: "center",
          padding: "18px 12px 12px",
          boxSizing: "border-box",
          fontWeight: 1000,
          fontSize: 26,
          color: showTerminees ? "#168000" : "#0b3a78",
        }}
      >
        {showTerminees ? "Réquisitions terminées" : "Réquisitions actives"}
      </div>

      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "center",
          padding: "0 18px 24px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            width: "min(1500px, 96vw)",
            background: "#fff",
            border: "1px solid #d5d5d5",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
            fontFamily: "Arial, sans-serif",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: reqGridCols,
              borderBottom: "1px solid #d5d5d5",
            }}
          >
            <div style={headerCellStyle}>ID</div>
            <div style={headerCellStyle}>Type</div>
            <div style={headerCellStyle}>Date</div>
            <div style={headerCellStyle}>Envoyé à:</div>
            <div style={headerCellStyle}>Statut</div>
            <div style={{ ...headerCellStyle, borderRight: "none" }}>
              Fait par
            </div>
          </div>

          <div>
            {rows.length === 0 ? (
              <div
                style={{
                  padding: 22,
                  fontSize: 18,
                  fontWeight: 800,
                  color: "#777",
                  textAlign: "center",
                }}
              >
                {showTerminees
                  ? "(Aucune réquisition terminée)"
                  : "(Aucune réquisition active)"}
              </div>
            ) : (
              rows.map((r, idx) => {
                const isSel = r.key === selectedKey;
                const zebra = idx % 2 === 1;

                const typeLabel =
                  r.collectionType === "panneaux" ? "Panneaux" : "Moulures";

                const status = getStatus(r);
                const isPretChargement = status === "pret_chargement";
                const isDemande = status === "demande";

                const statusLabel = isPretChargement
                  ? "Prêt à charger"
                  : status;

                const faitPar =
                  status === "terminée"
                    ? actorName(r, "completed")
                    : actorName(r, "created");

                const shouldFlashGreen =
                  !showTerminees &&
                  ((isPretChargement && isAdmin) || (isDemande && !isAdmin));

                return (
                  <div
                    key={r.key}
                    onClick={() => setSelectedKey(r.key)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: reqGridCols,
                      alignItems: "stretch",
                      borderBottom: "1px solid #eee",
                      background: isSel
                        ? "#dfefff"
                        : zebra
                        ? "#f7f7f7"
                        : "#fff",
                      cursor: "pointer",
                      minHeight: 64,
                      animation: shouldFlashGreen
                        ? "reqReadyFlash 1.1s infinite"
                        : "none",
                    }}
                  >
                    <div
                      style={{
                        ...centerCellStyle,
                        fontWeight: 1000,
                      }}
                      title={r.reqId || r.id}
                    >
                      {r.reqId || r.id}
                    </div>

                    <div
                      style={{
                        ...centerCellStyle,
                        color:
                          r.collectionType === "panneaux"
                            ? "#0b3a78"
                            : "#168000",
                      }}
                    >
                      {typeLabel}
                    </div>

                    <div style={centerCellStyle}>{fmtTS(r.createdAt)}</div>

                    <div
                      style={{
                        ...centerCellStyle,
                        fontWeight: 1000,
                      }}
                      title={r.projetEnvoye || ""}
                    >
                      {r.projetEnvoye || ""}
                    </div>

                    <div
                      style={{
                        ...centerCellStyle,
                        color:
                          status === "terminée"
                            ? "#168000"
                            : isPretChargement
                            ? "#168000"
                            : "#d97706",
                      }}
                    >
                      {statusLabel}
                    </div>

                    <div
                      style={{
                        ...centerCellStyle,
                        borderRight: "none",
                        fontWeight: 1000,
                        color:
                          faitPar === "Utilisateur non enregistré"
                            ? "#999"
                            : "#111",
                      }}
                      title={faitPar}
                    >
                      {faitPar}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}
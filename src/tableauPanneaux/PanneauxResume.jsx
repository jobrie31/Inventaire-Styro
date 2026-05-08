import React from "react";

export default function PanneauxResume({ ctx }) {
  const { showResume, resumeRows, resumeTotal, moneyZero } = ctx;

  return (
    <>
      {showResume && (
        <div
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "center",
            padding: "0 14px 14px 14px",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              width: "min(900px, 100%)",
              border: "2px solid #000",
              background: "#d6e1ef",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                textAlign: "center",
                fontSize: 34,
                fontWeight: 800,
                padding: "8px 12px",
                background: "#8fb1d9",
                borderBottom: "2px solid #000",
              }}
            >
              Inventaire Panneaux
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "160px 145px 1fr",
                borderBottom: "2px solid #000",
                background: "#8fb1d9",
                fontWeight: 800,
                fontSize: 18,
              }}
            >
              <div
                style={{
                  padding: "4px 8px",
                  borderRight: "2px solid #000",
                  textAlign: "center",
                }}
              >
                Type
              </div>
              <div
                style={{
                  padding: "4px 8px",
                  borderRight: "2px solid #000",
                  textAlign: "center",
                }}
              >
                Épaisseur
              </div>
              <div style={{ padding: "4px 8px", textAlign: "center" }}>
                Valeur en stock total
              </div>
            </div>

            {resumeRows.map((row, idx) => (
              <div
                key={`${row.type}-${row.ep}-${idx}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "160px 145px 1fr",
                  borderBottom: "2px solid #000",
                  background: "#b8c9de",
                  fontSize: 16,
                }}
              >
                <div
                  style={{
                    padding: "4px 8px",
                    borderRight: "2px solid #000",
                    textAlign: "center",
                  }}
                >
                  {row.type}
                </div>

                <div
                  style={{
                    padding: "4px 8px",
                    borderRight: "2px solid #000",
                    textAlign: "center",
                  }}
                >
                  {row.ep}
                </div>

                <div
                  style={{
                    padding: "4px 10px",
                    textAlign: "right",
                    fontWeight: 400,
                  }}
                >
                  {row.hasError ? "#VALEUR!" : moneyZero(row.total)}
                </div>
              </div>
            ))}

            <div
              style={{
                height: 28,
                background: "#efefef",
                borderBottom: "2px solid #000",
              }}
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "305px 1fr",
                background: "#b8c9de",
              }}
            >
              <div
                style={{
                  padding: "8px 10px",
                  borderRight: "2px solid #000",
                  background: "#8fb1d9",
                  fontSize: 24,
                  fontWeight: 800,
                  textAlign: "center",
                }}
              >
                Valeur totale
              </div>

              <div
                style={{
                  padding: "8px 12px",
                  textAlign: "right",
                  fontSize: 22,
                }}
              >
                {resumeTotal.hasError ? "#VALEUR!" : moneyZero(resumeTotal.total)}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

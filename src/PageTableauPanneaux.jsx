// src/PageTableauPanneaux.jsx
import React, { useEffect, useMemo, useState } from "react";
import "./pageRetourMateriaux.css";
import { db } from "./firebaseConfig";
import { CLIENT_ID } from "./appClient";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  doc,
  deleteDoc,
} from "firebase/firestore";
import PanneauxRéglages from "./PanneauxRéglages.jsx";

function money(n) {
  if (n === null || n === undefined || n === "") return "";
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  return x.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

function moneyZero(n) {
  const x = Number(n ?? 0);
  return x.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

function num(n, d = 2) {
  if (n === null || n === undefined || n === "") return "";
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  return x.toLocaleString("fr-CA", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

function asFloat(v) {
  const x = Number(String(v ?? "").replace(",", "."));
  return Number.isNaN(x) ? 0 : x;
}

function normLower(s) {
  return String(s ?? "").trim().toLowerCase();
}

function fabAliasLower(s) {
  const v = normLower(s);
  if (v === "melt-span") return "metl-span";
  return v;
}

function lengthFeet(row) {
  const pieds = Number(row.longueurPieds);
  const pouces = Number(row.longueurPouces ?? 0);
  if (!Number.isFinite(pieds)) return 0;
  const p = Number.isFinite(pouces) ? pouces : 0;
  return pieds + p / 12;
}

const DEFAULT_SETTINGS = {
  multipliers: { venteMin: 0.9, sugSans: 0.88, sugAvec: 0.85 },
  priceRules: [],
};

const RESUME_GROUPS = [
  { type: "Grade B", ep: '3"' },
  { type: "Grade B", ep: '4"' },
  { type: "Grade B", ep: '5"' },
  { type: "Grade B", ep: '6"' },
  { type: "Grade B", ep: '7"' },
  { type: "Grade B", ep: '8"' },

  { type: "Neuf", ep: '3"' },
  { type: "Neuf", ep: '4"' },
  { type: "Neuf", ep: '5"' },
  { type: "Neuf", ep: '6"' },
  { type: "Neuf", ep: '7"' },
  { type: "Neuf", ep: '8"' },

  { type: "ROXUL", ep: `4'', 5'', 6'', 7''` },
];

function prixUnitaire(row, settings) {
  const type = normLower(row.type);
  const ep = Number(row.epaisseurPouces);
  const fab = fabAliasLower(row.fabricant);

  const rules = Array.isArray(settings?.priceRules) ? settings.priceRules : [];
  for (const r of rules) {
    const rType = normLower(r.type);
    if (rType && rType !== type) continue;

    const eps = Array.isArray(r.epaisseurs)
      ? r.epaisseurs.map(Number).filter(Number.isFinite)
      : [];
    if (eps.length && !eps.includes(ep)) continue;

    const fabs = Array.isArray(r.fabricants)
      ? r.fabricants.map(fabAliasLower).filter(Boolean)
      : [];
    if (fabs.length && !fabs.includes(fab)) continue;

    const price = Number(r.price);
    return Number.isFinite(price) ? price : null;
  }
  return null;
}

function calcPC(row) {
  const L = lengthFeet(row);
  const W = Number(row.largeurPouces) / 12;
  const Q = Number(row.quantite ?? 0);
  if (!Number.isFinite(L) || !Number.isFinite(W) || !Number.isFinite(Q)) return 0;
  return L * W * Q;
}

function calcValeur(pc, prix) {
  if (!Number.isFinite(prix)) return null;
  return pc * prix;
}

function divOrNull(prix, dflt) {
  if (!Number.isFinite(prix)) return null;
  const d = Number(dflt);
  return prix / (Number.isFinite(d) && d > 0 ? d : 1);
}

function rowMatchesResumeGroup(row, group) {
  const type = String(row.type || "").trim().toLowerCase();
  const ep = Number(row.epaisseurPouces);

  if (type !== String(group.type).trim().toLowerCase()) return false;

  if (group.type.toLowerCase() === "roxul") {
    return [4, 5, 6, 7].includes(ep);
  }

  const wantedEp = Number(String(group.ep).replace(/"/g, ""));
  return ep === wantedEp;
}

export default function PageTableauPanneaux() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [fProjet, setFProjet] = useState("");
  const [fType, setFType] = useState("");
  const [fEp, setFEp] = useState("");
  const [fFab, setFFab] = useState("");

  const [showSettings, setShowSettings] = useState(false);
  const [showResume, setShowResume] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    const q = query(
      collection(db, "clients", CLIENT_ID, "banquePanneaux"),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(
      q,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setRows([]);
        setLoading(false);
      }
    );
  }, []);

  useEffect(() => {
    const ref = doc(db, "clients", CLIENT_ID, "reglages", "panneaux");
    return onSnapshot(
      ref,
      (snap) => {
        const d = snap.data();
        if (!d) return;
        setSettings({
          multipliers: d.multipliers || DEFAULT_SETTINGS.multipliers,
          priceRules: Array.isArray(d.priceRules) ? d.priceRules : [],
        });
      },
      (err) => console.error(err)
    );
  }, []);

  const projets = useMemo(
    () => ["", ...Array.from(new Set(rows.map((r) => r.projet).filter(Boolean))).sort()],
    [rows]
  );
  const types = useMemo(
    () => ["", ...Array.from(new Set(rows.map((r) => r.type).filter(Boolean))).sort()],
    [rows]
  );
  const eps = useMemo(() => {
    const s = new Set();
    rows.forEach((r) => r.epaisseurPouces && s.add(String(r.epaisseurPouces)));
    return ["", ...Array.from(s).sort((a, b) => asFloat(a) - asFloat(b))];
  }, [rows]);
  const fabs = useMemo(
    () => ["", ...Array.from(new Set(rows.map((r) => r.fabricant).filter(Boolean))).sort()],
    [rows]
  );

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (fProjet && String(r.projet || "") !== fProjet) return false;
      if (fType && String(r.type || "") !== fType) return false;
      if (fEp && String(r.epaisseurPouces || "") !== fEp) return false;
      if (fFab && String(r.fabricant || "") !== fFab) return false;
      return true;
    });
  }, [rows, fProjet, fType, fEp, fFab]);

  const resumeRows = useMemo(() => {
    return RESUME_GROUPS.map((group) => {
      const matches = rows.filter((r) => rowMatchesResumeGroup(r, group));

      if (matches.length === 0) {
        return {
          ...group,
          total: 0,
          hasError: false,
        };
      }

      let total = 0;
      let hasError = false;

      for (const row of matches) {
        const prix = prixUnitaire(row, settings);
        const pc = calcPC(row);
        const valeur = calcValeur(pc, prix);

        if (valeur === null || !Number.isFinite(valeur)) {
          hasError = true;
        } else {
          total += valeur;
        }
      }

      return {
        ...group,
        total,
        hasError,
      };
    });
  }, [rows, settings]);

  const resumeTotal = useMemo(() => {
    const hasError = resumeRows.some((r) => r.hasError);
    const total = resumeRows.reduce((acc, r) => acc + (Number(r.total) || 0), 0);
    return { hasError, total };
  }, [resumeRows]);

  const cols =
    "1.1fr .8fr .7fr .55fr .85fr .95fr .55fr .7fr .95fr .95fr .7fr .55fr .85fr .85fr .95fr .95fr .75fr";

  const baseCell = {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
    padding: "6px 6px",
    borderRight: "1px solid #d9d9d9",
  };

  const lastCell = {
    ...baseCell,
    borderRight: "none",
  };

  const mult = settings?.multipliers || DEFAULT_SETTINGS.multipliers;

  async function supprimerRow(rowId) {
    if (!rowId) return;
    const ok = window.confirm("Supprimer ce panneau?");
    if (!ok) return;

    setDeletingId(rowId);
    try {
      await deleteDoc(doc(db, "clients", CLIENT_ID, "banquePanneaux", rowId));
    } catch (e) {
      console.error(e);
      alert("❌ Suppression impossible: " + (e?.message || String(e)));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="pageRM pageRM--full">
      {showSettings && <PanneauxRéglages onClose={() => setShowSettings(false)} />}

      <div className="titleRow titleRow--full" style={{ paddingTop: 12 }}>
        <div />
        <div
          className="bigTitle"
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "center",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          Inventaire panneaux

          <button
            className="btn"
            style={{ width: 140, height: 34 }}
            onClick={() => setShowSettings(true)}
          >
            Réglages
          </button>

          <button
            className="btn"
            style={{
              width: 140,
              height: 34,
              background: showResume ? "#d9e8ff" : "#e6e6e6",
              border: "1px solid #9a9a9a",
              fontWeight: 800,
            }}
            onClick={() => setShowResume((v) => !v)}
          >
            {showResume ? "Fermer résumé" : "Résumé"}
          </button>
        </div>
        <div />
      </div>

      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "center",
          padding: "0 14px 10px 14px",
        }}
      >
        <div
          style={{
            width: "min(1600px, 100%)",
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr",
            gap: 10,
          }}
        >
          <div>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Projet</div>
            <select
              className="selectGray"
              style={{ width: "100%" }}
              value={fProjet}
              onChange={(e) => setFProjet(e.target.value)}
            >
              {projets.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Type</div>
            <select
              className="selectGray"
              style={{ width: "100%" }}
              value={fType}
              onChange={(e) => setFType(e.target.value)}
            >
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Épaisseur</div>
            <select
              className="selectGray"
              style={{ width: "100%" }}
              value={fEp}
              onChange={(e) => setFEp(e.target.value)}
            >
              {eps.map((epp) => (
                <option key={epp} value={epp}>
                  {epp}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Fabricant</div>
            <select
              className="selectGray"
              style={{ width: "100%" }}
              value={fFab}
              onChange={(e) => setFFab(e.target.value)}
            >
              {fabs.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

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
              <div style={{ padding: "4px 8px", borderRight: "2px solid #000", textAlign: "center" }}>
                Type
              </div>
              <div style={{ padding: "4px 8px", borderRight: "2px solid #000", textAlign: "center" }}>
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

      <div className="tableZone tableZone--center" style={{ paddingTop: 0 }}>
        <div
          className="tableBox tableBox--wide"
          style={{
            height: "calc(100vh - 220px)",
            overflow: "hidden",
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
                borderBottom: "2px solid #0a2f60",
                fontSize: 12,
              }}
            >
              {[
                "Projet",
                "Date",
                "Type",
                "Ép.",
                "Fabricant",
                "Longueur",
                "Largeur",
                "Qté",
                "Face ext.",
                "Face int.",
                "Prix unit.",
                "PC",
                "Valeur",
                "Vente min.",
                "Sug. sans",
                "Sug. avec",
                "Actions",
              ].map((h, idx, arr) => (
                <div
                  key={h}
                  style={{
                    ...(idx === arr.length - 1 ? lastCell : baseCell),
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    boxSizing: "border-box",
                    minHeight: 36,
                  }}
                >
                  {h}
                </div>
              ))}
            </div>

            {loading ? (
              <div style={{ padding: 12 }}>Chargement...</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 12 }}>(Aucune donnée)</div>
            ) : (
              filtered.map((r, i) => {
                const prix = prixUnitaire(r, settings);
                const pc = calcPC(r);
                const val = calcValeur(pc, prix);
                const pvMin = divOrNull(prix, mult?.venteMin || 0.9);
                const psSans = divOrNull(prix, mult?.sugSans || 0.88);
                const psAvec = divOrNull(prix, mult?.sugAvec || 0.85);

                const longTxt =
                  r.longueurPieds != null
                    ? `${r.longueurPieds},${String(r.longueurPouces ?? 0)}`
                    : "";

                const rowBg = i % 2 === 1 ? "#f4f4f4" : "#fff";

                return (
                  <div
                    key={r.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: cols,
                      alignItems: "center",
                      width: "100%",
                      boxSizing: "border-box",
                      borderBottom: "1px solid #d9d9d9",
                      fontSize: 12,
                      background: rowBg,
                    }}
                  >
                    <div style={{ ...baseCell, fontWeight: 800, boxSizing: "border-box" }}>
                      {r.projet || ""}
                    </div>
                    <div style={{ ...baseCell, boxSizing: "border-box" }}>{r.date || ""}</div>
                    <div style={{ ...baseCell, boxSizing: "border-box" }}>{r.type || ""}</div>
                    <div style={{ ...baseCell, textAlign: "center", boxSizing: "border-box" }}>
                      {r.epaisseurPouces || ""}
                    </div>
                    <div style={{ ...baseCell, boxSizing: "border-box" }}>
                      {r.fabricant || ""}
                    </div>
                    <div style={{ ...baseCell, textAlign: "center", boxSizing: "border-box" }}>
                      {longTxt}
                    </div>
                    <div style={{ ...baseCell, textAlign: "center", boxSizing: "border-box" }}>
                      {r.largeurPouces || ""}
                    </div>
                    <div
                      style={{
                        ...baseCell,
                        textAlign: "center",
                        fontWeight: 800,
                        boxSizing: "border-box",
                      }}
                    >
                      {r.quantite ?? ""}
                    </div>
                    <div style={{ ...baseCell, boxSizing: "border-box" }}>
                      {r.faceExterieure || ""}
                    </div>
                    <div style={{ ...baseCell, boxSizing: "border-box" }}>
                      {r.faceInterieure || ""}
                    </div>

                    <div
                      style={{
                        ...baseCell,
                        textAlign: "right",
                        fontWeight: 800,
                        boxSizing: "border-box",
                      }}
                    >
                      {money(prix)}
                    </div>
                    <div style={{ ...baseCell, textAlign: "right", boxSizing: "border-box" }}>
                      {num(pc, 2)}
                    </div>
                    <div
                      style={{
                        ...baseCell,
                        textAlign: "right",
                        fontWeight: 800,
                        boxSizing: "border-box",
                      }}
                    >
                      {money(val)}
                    </div>
                    <div style={{ ...baseCell, textAlign: "right", boxSizing: "border-box" }}>
                      {money(pvMin)}
                    </div>
                    <div style={{ ...baseCell, textAlign: "right", boxSizing: "border-box" }}>
                      {money(psSans)}
                    </div>
                    <div style={{ ...baseCell, textAlign: "right", boxSizing: "border-box" }}>
                      {money(psAvec)}
                    </div>

                    <div style={{ ...lastCell, textAlign: "center", boxSizing: "border-box" }}>
                      <button
                        className="btnRed"
                        style={{ width: 110, height: 28, fontSize: 12 }}
                        onClick={() => supprimerRow(r.id)}
                        disabled={deletingId === r.id}
                        title="Supprimer"
                      >
                        {deletingId === r.id ? "..." : "Supprimer"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
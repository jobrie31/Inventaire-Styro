// src/PageTableauPanneaux.jsx
import React, { useEffect, useMemo, useState } from "react";
import "./pageRetourMateriaux.css";
import { db } from "./firebaseConfig";
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
function num(n, d = 2) {
  if (n === null || n === undefined || n === "") return "";
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  return x.toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
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

function prixUnitaire(row, settings) {
  const type = normLower(row.type);
  const ep = Number(row.epaisseurPouces);
  const fab = fabAliasLower(row.fabricant);

  const rules = Array.isArray(settings?.priceRules) ? settings.priceRules : [];
  for (const r of rules) {
    const rType = normLower(r.type);
    if (rType && rType !== type) continue;

    const eps = Array.isArray(r.epaisseurs) ? r.epaisseurs.map(Number).filter(Number.isFinite) : [];
    if (eps.length && !eps.includes(ep)) continue;

    const fabs = Array.isArray(r.fabricants) ? r.fabricants.map(fabAliasLower).filter(Boolean) : [];
    if (fabs.length && !fabs.includes(fab)) continue;

    const price = Number(r.price);
    return Number.isFinite(price) ? price : null;
  }
  return null; // pas de match => vide
}

export default function PageTableauPanneaux() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [fProjet, setFProjet] = useState("");
  const [fType, setFType] = useState("");
  const [fEp, setFEp] = useState("");
  const [fFab, setFFab] = useState("");

  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    const q = query(collection(db, "banquePanneaux"), orderBy("createdAt", "desc"));
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
    const ref = doc(db, "reglages", "panneaux");
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

  const projets = useMemo(() => ["", ...Array.from(new Set(rows.map((r) => r.projet).filter(Boolean))).sort()], [rows]);
  const types = useMemo(() => ["", ...Array.from(new Set(rows.map((r) => r.type).filter(Boolean))).sort()], [rows]);
  const eps = useMemo(() => {
    const s = new Set();
    rows.forEach((r) => r.epaisseurPouces && s.add(String(r.epaisseurPouces)));
    return ["", ...Array.from(s).sort((a, b) => asFloat(a) - asFloat(b))];
  }, [rows]);
  const fabs = useMemo(() => ["", ...Array.from(new Set(rows.map((r) => r.fabricant).filter(Boolean))).sort()], [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (fProjet && String(r.projet || "") !== fProjet) return false;
      if (fType && String(r.type || "") !== fType) return false;
      if (fEp && String(r.epaisseurPouces || "") !== fEp) return false;
      if (fFab && String(r.fabricant || "") !== fFab) return false;
      return true;
    });
  }, [rows, fProjet, fType, fEp, fFab]);

  // ✅ colonnes responsive
  const cols =
    "1.1fr .8fr .7fr .55fr .85fr .95fr .55fr .7fr .95fr .95fr .7fr .55fr .85fr .85fr .95fr .95fr .75fr";

  const baseCell = {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
    padding: "6px 6px",
    borderRight: "1px solid #d9d9d9", // ✅ lignes verticales
  };

  const lastCell = {
    ...baseCell,
    borderRight: "none",
  };

  const mult = settings?.multipliers || DEFAULT_SETTINGS.multipliers;

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

  async function supprimerRow(rowId) {
    if (!rowId) return;
    const ok = window.confirm("Supprimer ce panneau?");
    if (!ok) return;

    setDeletingId(rowId);
    try {
      await deleteDoc(doc(db, "banquePanneaux", rowId));
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
        <div className="bigTitle" style={{ display: "flex", gap: 10, justifyContent: "center", alignItems: "center" }}>
          Inventaire panneaux
          <button className="btn" style={{ width: 140, height: 34 }} onClick={() => setShowSettings(true)}>
            Réglages
          </button>
        </div>
        <div />
      </div>

      {/* Filtres */}
      <div style={{ width: "100%", display: "flex", justifyContent: "center", padding: "0 14px 10px 14px" }}>
        <div style={{ width: "min(1600px, 100%)", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Projet</div>
            <select className="selectGray" style={{ width: "100%" }} value={fProjet} onChange={(e) => setFProjet(e.target.value)}>
              {projets.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Type</div>
            <select className="selectGray" style={{ width: "100%" }} value={fType} onChange={(e) => setFType(e.target.value)}>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Épaisseur</div>
            <select className="selectGray" style={{ width: "100%" }} value={fEp} onChange={(e) => setFEp(e.target.value)}>
              {eps.map((epp) => (
                <option key={epp} value={epp}>
                  {epp}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Fabricant</div>
            <select className="selectGray" style={{ width: "100%" }} value={fFab} onChange={(e) => setFFab(e.target.value)}>
              {fabs.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tableau */}
      <div className="tableZone tableZone--center" style={{ paddingTop: 0 }}>
        <div className="tableBox tableBox--wide" style={{ height: "calc(100vh - 220px)", overflowX: "hidden" }}>
          {/* Header */}
          <div
            className="tableHeader"
            style={{
              position: "sticky",
              top: 0,
              zIndex: 2,
              background: "#0b3a78",
              color: "#fff",
              borderBottom: "2px solid #0a2f60",
              gridTemplateColumns: cols,
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
              <div key={h} style={idx === arr.length - 1 ? lastCell : baseCell}>
                {h}
              </div>
            ))}
          </div>

          <div className="tableScroll" style={{ padding: 0, overflowX: "hidden" }}>
            {loading ? (
              <div className="tableBody" style={{ padding: 12 }}>
                Chargement...
              </div>
            ) : filtered.length === 0 ? (
              <div className="tableBody" style={{ padding: 12 }}>
                (Aucune donnée)
              </div>
            ) : (
              filtered.map((r, i) => {
                const prix = prixUnitaire(r, settings);
                const pc = calcPC(r);
                const val = calcValeur(pc, prix);
                const pvMin = divOrNull(prix, mult?.venteMin || 0.9);
                const psSans = divOrNull(prix, mult?.sugSans || 0.88);
                const psAvec = divOrNull(prix, mult?.sugAvec || 0.85);

                const longTxt = r.longueurPieds != null ? `${r.longueurPieds},${String(r.longueurPouces ?? 0)}` : "";

                const rowBg = i % 2 === 1 ? "#f4f4f4" : "#fff"; // ✅ 1 ligne sur 2 gris pâle

                return (
                  <div
                    key={r.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: cols,
                      alignItems: "center",
                      borderBottom: "1px solid #d9d9d9",
                      fontSize: 12,
                      background: rowBg,
                    }}
                  >
                    <div style={{ ...baseCell, fontWeight: 800 }}>{r.projet || ""}</div>
                    <div style={baseCell}>{r.date || ""}</div>
                    <div style={baseCell}>{r.type || ""}</div>
                    <div style={{ ...baseCell, textAlign: "center" }}>{r.epaisseurPouces || ""}</div>
                    <div style={baseCell}>{r.fabricant || ""}</div>
                    <div style={{ ...baseCell, textAlign: "center" }}>{longTxt}</div>
                    <div style={{ ...baseCell, textAlign: "center" }}>{r.largeurPouces || ""}</div>
                    <div style={{ ...baseCell, textAlign: "center", fontWeight: 800 }}>{r.quantite ?? ""}</div>
                    <div style={baseCell}>{r.faceExterieure || ""}</div>
                    <div style={baseCell}>{r.faceInterieure || ""}</div>

                    <div style={{ ...baseCell, textAlign: "right", fontWeight: 800 }}>{money(prix)}</div>
                    <div style={{ ...baseCell, textAlign: "right" }}>{num(pc, 2)}</div>
                    <div style={{ ...baseCell, textAlign: "right", fontWeight: 800 }}>{money(val)}</div>
                    <div style={{ ...baseCell, textAlign: "right" }}>{money(pvMin)}</div>
                    <div style={{ ...baseCell, textAlign: "right" }}>{money(psSans)}</div>
                    <div style={{ ...baseCell, textAlign: "right" }}>{money(psAvec)}</div>

                    <div style={{ ...lastCell, textAlign: "center" }}>
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
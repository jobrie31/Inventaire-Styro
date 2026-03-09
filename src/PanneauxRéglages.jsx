import React, { useEffect, useMemo, useState } from "react";
import { db } from "./firebaseConfig";
import { CLIENT_ID } from "./appClient";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";

function normStr(s) {
  return String(s ?? "").trim();
}
function parseNumFR(v) {
  const x = Number(String(v ?? "").replace(",", ".").trim());
  return Number.isFinite(x) ? x : 0;
}
function splitList(s) {
  return String(s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}
function joinList(arr) {
  return (arr || []).join(", ");
}

const DEFAULT_SETTINGS = {
  multipliers: { venteMin: 0.9, sugSans: 0.88, sugAvec: 0.85 },
  priceRules: [
    { id: "gb-3", type: "Grade B", epaisseurs: [3], fabricants: ["Norbec", "Metl-Span", "Awip", "Kingspan"], price: 2.0 },
    { id: "gb-4", type: "Grade B", epaisseurs: [4], fabricants: ["Norbec", "Metl-Span", "Awip", "Kingspan"], price: 3.0 },
    { id: "gb-5", type: "Grade B", epaisseurs: [5], fabricants: ["Norbec", "Metl-Span", "Awip", "Kingspan"], price: 3.5 },
    { id: "gb-6", type: "Grade B", epaisseurs: [6], fabricants: ["Norbec", "Metl-Span", "Awip", "Kingspan"], price: 3.75 },

    { id: "n-nor-3", type: "Neuf", epaisseurs: [3], fabricants: ["Norbec"], price: 8.23 },
    { id: "n-nor-4", type: "Neuf", epaisseurs: [4], fabricants: ["Norbec"], price: 9.75 },
    { id: "n-met-3", type: "Neuf", epaisseurs: [3], fabricants: ["Metl-Span"], price: 8.15 },
    { id: "n-awi-3", type: "Neuf", epaisseurs: [3], fabricants: ["Awip"], price: 7.96 },
    { id: "n-awi-4", type: "Neuf", epaisseurs: [4], fabricants: ["Awip"], price: 8.84 },

    { id: "rox-4-7", type: "Roxul", epaisseurs: [4, 5, 6, 7], fabricants: [], price: 8.5 },
  ],
};

export default function PanneauxRéglages({ onClose }) {
  const refDoc = useMemo(
    () => doc(db, "clients", CLIENT_ID, "reglages", "panneaux"),
    []
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [multipliers, setMultipliers] = useState(DEFAULT_SETTINGS.multipliers);
  const [rules, setRules] = useState(DEFAULT_SETTINGS.priceRules);

  useEffect(() => {
    const unsub = onSnapshot(
      refDoc,
      (snap) => {
        const d = snap.data();
        if (d?.multipliers) setMultipliers(d.multipliers);
        if (Array.isArray(d?.priceRules)) setRules(d.priceRules);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [refDoc]);

  function addRule() {
    const id = `r-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setRules((prev) => [{ id, type: "", epaisseurs: [], fabricants: [], price: 0 }, ...prev]);
  }

  function delRule(id) {
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  function updateRule(id, patch) {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function save() {
    setSaving(true);
    try {
      const cleaned = rules.map((r) => ({
        id: r.id || `r-${Date.now()}`,
        type: normStr(r.type),
        epaisseurs: (r.epaisseurs || []).map((x) => Number(x)).filter((x) => Number.isFinite(x)),
        fabricants: (r.fabricants || []).map((x) => normStr(x)).filter(Boolean),
        price: Number(r.price) || 0,
      }));

      await setDoc(
        refDoc,
        {
          multipliers: {
            venteMin: Number(multipliers.venteMin) || 0.9,
            sugSans: Number(multipliers.sugSans) || 0.88,
            sugAvec: Number(multipliers.sugAvec) || 0.85,
          },
          priceRules: cleaned,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      alert("✅ Réglages panneaux enregistrés.");
      onClose?.();
    } catch (e) {
      console.error(e);
      alert("❌ Erreur réglages: " + (e?.message || String(e)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        fontFamily: "Arial, sans-serif",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(1100px, 100%)",
          maxHeight: "90vh",
          overflow: "auto",
          background: "#fff",
          border: "1px solid #cfcfcf",
          borderRadius: 8,
          boxShadow: "0 12px 30px rgba(0,0,0,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "12px 14px",
            borderBottom: "1px solid #e6e6e6",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 18 }}>Réglages — Panneaux</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" style={{ height: 36, width: 110 }} onClick={onClose}>
              Fermer
            </button>
            <button className="btnBlue" style={{ height: 36, width: 140 }} onClick={save} disabled={saving || loading}>
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </div>

        <div style={{ padding: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Ratios</div>

          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 220px 1fr 220px 1fr", gap: 10, alignItems: "center" }}>
            <div style={{ fontWeight: 700 }}>Vente minimum (÷)</div>
            <input
              className="inputSmall"
              style={{ width: "100%" }}
              value={String(multipliers.venteMin ?? "")}
              onChange={(e) => setMultipliers((m) => ({ ...m, venteMin: parseNumFR(e.target.value) }))}
            />

            <div style={{ fontWeight: 700 }}>Suggéré sans coupe (÷)</div>
            <input
              className="inputSmall"
              style={{ width: "100%" }}
              value={String(multipliers.sugSans ?? "")}
              onChange={(e) => setMultipliers((m) => ({ ...m, sugSans: parseNumFR(e.target.value) }))}
            />

            <div style={{ fontWeight: 700 }}>Suggéré avec coupe (÷)</div>
            <input
              className="inputSmall"
              style={{ width: "100%" }}
              value={String(multipliers.sugAvec ?? "")}
              onChange={(e) => setMultipliers((m) => ({ ...m, sugAvec: parseNumFR(e.target.value) }))}
            />
          </div>

          <div style={{ height: 16 }} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div style={{ fontWeight: 900 }}>Règles de prix unitaire</div>
            <button className="btnGreen" style={{ height: 36, width: 160 }} onClick={addRule}>
              + Ajouter règle
            </button>
          </div>

          <div style={{ marginTop: 10, border: "1px solid #ddd" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "170px 190px 280px 140px 110px",
                background: "#f3f3f3",
                fontWeight: 900,
                padding: "8px 10px",
                borderBottom: "1px solid #ddd",
              }}
            >
              <div>Type</div>
              <div>Épaisseurs</div>
              <div>Fabricants</div>
              <div>Prix</div>
              <div>Action</div>
            </div>

            {rules.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "170px 190px 280px 140px 110px",
                  gap: 8,
                  alignItems: "center",
                  padding: "8px 10px",
                  borderBottom: "1px solid #eee",
                }}
              >
                <input
                  className="inputWide"
                  style={{ width: "100%", height: 28 }}
                  value={r.type ?? ""}
                  onChange={(e) => updateRule(r.id, { type: e.target.value })}
                />

                <input
                  className="inputWide"
                  style={{ width: "100%", height: 28 }}
                  value={joinList(r.epaisseurs ?? [])}
                  onChange={(e) =>
                    updateRule(r.id, {
                      epaisseurs: splitList(e.target.value)
                        .map(parseNumFR)
                        .filter((x) => Number.isFinite(x) && x > 0),
                    })
                  }
                />

                <input
                  className="inputWide"
                  style={{ width: "100%", height: 28 }}
                  value={joinList(r.fabricants ?? [])}
                  onChange={(e) => updateRule(r.id, { fabricants: splitList(e.target.value) })}
                />

                <input
                  className="inputWide"
                  style={{ width: "100%", height: 28 }}
                  value={String(r.price ?? "")}
                  onChange={(e) => updateRule(r.id, { price: parseNumFR(e.target.value) })}
                />

                <button className="btnRed" style={{ width: "100%", height: 32 }} onClick={() => delRule(r.id)}>
                  Supprimer
                </button>
              </div>
            ))}

            {rules.length === 0 && <div style={{ padding: 12, color: "#666" }}>Aucune règle. Clique “Ajouter règle”.</div>}
          </div>

          <div style={{ height: 10 }} />
          <div style={{ color: "#666", fontSize: 12 }}>
            Notes:
            <br />• Les règles sont testées dans l’ordre (la première qui match gagne).
            <br />• Fabricants vide = match tous les fabricants.
            <br />• Épaisseurs vide = match toutes les épaisseurs.
          </div>
        </div>
      </div>
    </div>
  );
}
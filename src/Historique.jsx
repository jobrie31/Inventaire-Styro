import React, { useEffect, useMemo, useState } from "react";
import { db } from "./firebaseConfig";
import { CLIENT_ID } from "./appClient";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";

const HISTORIQUE_START_DATE = new Date("2026-05-04T00:00:00");

function fmtTS(ts) {
  try {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);

    return d.toLocaleString("fr-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function tsMillis(ts) {
  try {
    if (!ts) return 0;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.getTime();
  } catch {
    return 0;
  }
}

function sameTime(a, b) {
  const ta = tsMillis(a);
  const tb = tsMillis(b);
  if (!ta || !tb) return false;
  return Math.abs(ta - tb) < 2000;
}

function fmtLongueur(pieds, pouces) {
  const p = pieds === null || pieds === undefined || pieds === "" ? "" : String(pieds);
  const po =
    pouces === null || pouces === undefined || pouces === "" ? "0" : String(pouces);

  if (!p) return "";
  return `${p} pi ${po} po`;
}

function panneauLabel(p, options = {}) {
  const showQuantite = options.showQuantite !== false;

  return [
    p.type || "Panneau",
    p.epaisseurPouces ? `${p.epaisseurPouces}"` : "",
    p.fabricant || "",
    fmtLongueur(p.longueurPieds, p.longueurPouces),
    p.largeurPouces ? `x ${p.largeurPouces} po` : "",
    p.sectionCour ? `Section ${p.sectionCour}` : "",
    p.projet ? `Projet ${p.projet}` : "",
    p.profile ? `Profile ${p.profile}` : "",
    p.modele ? `Modèle ${p.modele}` : "",
    p.fini ? `Fini ${p.fini}` : "",
    p.faceExterieure ? `Face ext. ${p.faceExterieure}` : "",
    p.faceInterieure ? `Face int. ${p.faceInterieure}` : "",
    showQuantite && p.quantite !== undefined && p.quantite !== "" ? `Qté ${p.quantite}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function moulureLabel(m, options = {}) {
  const showQuantite = options.showQuantite !== false;

  return [
    m.materiel || "Moulure",
    m.calibre ? `calibre ${m.calibre}` : "",
    m.sectionCour ? `Section ${m.sectionCour}` : "",
    m.projet ? `Projet ${m.projet}` : "",
    showQuantite && m.quantite !== undefined && m.quantite !== "" ? `Qté ${m.quantite}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function reqItemsLabel(req) {
  const items = Array.isArray(req.items) ? req.items : [];

  if (items.length === 0) return "aucun item demandé";

  const isPanneaux = req.type === "panneaux" || req.collectionType === "panneaux";

  return items
    .map((it, index) => {
      const qty = it.quantiteDemande ?? "";
      const prefix = `Ligne ${index + 1} — Demandé ${qty || "?"} x`;

      if (isPanneaux) {
        const label = panneauLabel(
          {
            projet: it.projetSource || "",
            sectionCour: it.sectionCour || "",
            type: it.type || "",
            epaisseurPouces: it.epaisseurPouces || "",
            fabricant: it.fabricant || "",
            profile: it.profile || "",
            modele: it.modele || "",
            fini: it.fini || "",
            longueurPieds: it.longueurPieds ?? "",
            longueurPouces: it.longueurPouces ?? "",
            largeurPouces: it.largeurPouces ?? "",
            faceExterieure: it.faceExterieure || "",
            faceInterieure: it.faceInterieure || "",
          },
          { showQuantite: false }
        );

        const stockTxt =
          it.quantiteStockAvant !== undefined && it.quantiteStockApres !== undefined
            ? `Stock ${it.quantiteStockAvant} → ${it.quantiteStockApres}`
            : it.quantiteStockAvant !== undefined
            ? `Stock avant ${it.quantiteStockAvant}`
            : "";

        return [prefix, label, stockTxt].filter(Boolean).join(" — ");
      }

      const label = moulureLabel(
        {
          projet: it.projetSource || "",
          sectionCour: it.sectionCour || "",
          materiel: it.materiel || "",
          calibre: it.calibre || "",
        },
        { showQuantite: false }
      );

      const stockTxt =
        it.quantiteStockAvant !== undefined && it.quantiteStockApres !== undefined
          ? `Stock ${it.quantiteStockAvant} → ${it.quantiteStockApres}`
          : it.quantiteStockAvant !== undefined
          ? `Stock avant ${it.quantiteStockAvant}`
          : "";

      return [prefix, label, stockTxt].filter(Boolean).join(" — ");
    })
    .join(" | ");
}

function reqRestantsLabel(req) {
  const restants = Array.isArray(req.restants) ? req.restants : [];
  const restantsCrees = restants.filter((x) => x && x.cree);

  if (restantsCrees.length === 0) {
    return "Aucun restant remis dans le tableau panneaux";
  }

  return restantsCrees
    .map((x, index) => {
      const qty = x.quantiteRestante ?? "";
      const label = panneauLabel(
        {
          projet: req.projetEnvoye || x.projetSource || "",
          sectionCour: x.sectionCour || "",
          type: x.type || "",
          epaisseurPouces: x.epaisseurPouces || "",
          fabricant: x.fabricant || "",
          profile: x.profile || "",
          modele: x.modele || "",
          fini: x.fini || "",
          longueurPieds: x.longueurPieds ?? "",
          longueurPouces: x.longueurPouces ?? "",
          largeurPouces: x.largeurPouces ?? "",
          faceExterieure: x.faceExterieure || "",
          faceInterieure: x.faceInterieure || "",
        },
        { showQuantite: false }
      );

      return `Restant ${index + 1} — Remis ${qty || "?"} x — ${label}`;
    })
    .join(" | ");
}

function userFromDoc(doc, mode = "created") {
  if (mode === "updated") {
    return (
      doc.updatedByName ||
      doc.updatedByEmail ||
      doc.modifiedByName ||
      doc.modifiedByEmail ||
      doc.userName ||
      doc.userEmail ||
      "Utilisateur non enregistré"
    );
  }

  if (mode === "completed") {
    return (
      doc.completedByName ||
      doc.completedByEmail ||
      doc.updatedByName ||
      doc.updatedByEmail ||
      doc.userName ||
      doc.userEmail ||
      "Utilisateur non enregistré"
    );
  }

  return (
    doc.createdByName ||
    doc.createdByEmail ||
    doc.userName ||
    doc.userEmail ||
    "Utilisateur non enregistré"
  );
}

function actionColor(action) {
  const a = String(action || "").toLowerCase();

  if (a.includes("ajout")) return "#0b3a78";
  if (a.includes("creation")) return "#0b3a78";
  if (a.includes("création")) return "#0b3a78";
  if (a.includes("termin")) return "#168000";
  if (a.includes("modif")) return "#d97706";
  if (a.includes("suppression")) return "#c40000";

  return "#333";
}

function moduleLabel(module) {
  const m = String(module || "").toLowerCase();

  if (m === "panneaux") return "Panneaux";
  if (m === "moulures") return "Moulures";
  if (m === "requisitions") return "Réquisitions";

  return module || "";
}

function normalizeStatus(req) {
  if (!req) return "";
  if (req.collectionType === "panneaux" && req.status === "brouillon") return "demande";
  return req.status || "demande";
}

function prettyFieldName(key) {
  const map = {
    projet: "Projet",
    projetSource: "Projet source",
    projetEnvoye: "Projet envoyé",
    date: "Date",
    categorie: "Catégorie",
    type: "Type",
    materiel: "Matériel",
    calibre: "Calibre",
    sectionCour: "Section cour",
    epaisseurPouces: "Épaisseur",
    fabricant: "Fabricant",
    profile: "Profile",
    modele: "Modèle",
    fini: "Fini",
    longueurPieds: "Longueur pieds",
    longueurPouces: "Longueur pouces",
    largeurPouces: "Largeur",
    quantite: "Quantité",
    quantiteStock: "Quantité stock",
    quantiteStockAvant: "Quantité avant",
    quantiteStockApres: "Quantité après",
    quantiteDemande: "Quantité demandée",
    faceExterieure: "Face extérieure",
    faceInterieure: "Face intérieure",
    status: "Statut",
    note: "Note",
    noteRetour: "Note de fermeture",
    dessinUrl: "Dessin",
    dessinPath: "Chemin dessin",
  };

  if (map[key]) return map[key];

  return String(key || "")
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim();
}

function formatDiffValue(v) {
  if (v === null || v === undefined || v === "") return "—";

  if (typeof v === "object") {
    if (v?.toDate) return fmtTS(v);
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }

  return String(v);
}

function sameValue(a, b) {
  return formatDiffValue(a) === formatDiffValue(b);
}

function flattenObject(obj, prefix = "") {
  const out = {};

  if (!obj || typeof obj !== "object") return out;

  Object.keys(obj).forEach((key) => {
    const value = obj[key];
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !value.toDate
    ) {
      Object.assign(out, flattenObject(value, fullKey));
    } else {
      out[fullKey] = value;
    }
  });

  return out;
}

function getDiffRowsFromRecord(record) {
  if (!record) return [];

  const details = record.details || record;

  const rawChanges =
    record.changes ||
    record.modifications ||
    record.differences ||
    record.diff ||
    record.changedFields ||
    details.changes ||
    details.modifications ||
    details.differences ||
    details.diff ||
    details.changedFields ||
    null;

  if (Array.isArray(rawChanges)) {
    return rawChanges
      .map((c) => {
        const field =
          c.field ||
          c.key ||
          c.name ||
          c.champ ||
          c.label ||
          c.titre ||
          "";

        const before =
          c.before ??
          c.old ??
          c.oldValue ??
          c.avant ??
          c.valeurAvant ??
          c.from ??
          "";

        const after =
          c.after ??
          c.new ??
          c.newValue ??
          c.apres ??
          c.valeurApres ??
          c.to ??
          "";

        return {
          field,
          before,
          after,
        };
      })
      .filter((r) => r.field && !sameValue(r.before, r.after));
  }

  if (rawChanges && typeof rawChanges === "object") {
    return Object.keys(rawChanges)
      .map((field) => {
        const c = rawChanges[field] || {};
        return {
          field,
          before:
            c.before ??
            c.old ??
            c.oldValue ??
            c.avant ??
            c.valeurAvant ??
            "",
          after:
            c.after ??
            c.new ??
            c.newValue ??
            c.apres ??
            c.valeurApres ??
            "",
        };
      })
      .filter((r) => r.field && !sameValue(r.before, r.after));
  }

  const before =
    record.before ||
    record.beforeData ||
    record.oldData ||
    record.dataBefore ||
    record.avant ||
    record.valeursAvant ||
    details.before ||
    details.beforeData ||
    details.oldData ||
    details.dataBefore ||
    details.avant ||
    details.valeursAvant ||
    null;

  const after =
    record.after ||
    record.afterData ||
    record.newData ||
    record.dataAfter ||
    record.apres ||
    record.valeursApres ||
    details.after ||
    details.afterData ||
    details.newData ||
    details.dataAfter ||
    details.apres ||
    details.valeursApres ||
    null;

  if (!before || !after) return [];

  const b = flattenObject(before);
  const a = flattenObject(after);
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]));

  return keys
    .map((field) => ({
      field,
      before: b[field],
      after: a[field],
    }))
    .filter((r) => !sameValue(r.before, r.after));
}

function isModificationRow(row) {
  const blob = `${row?.action || ""} ${row?.titre || ""}`.toLowerCase();
  return blob.includes("modif");
}

export default function Historique({ onRetour }) {
  const [logs, setLogs] = useState([]);
  const [panneaux, setPanneaux] = useState([]);
  const [moulures, setMoulures] = useState([]);
  const [reqPanneaux, setReqPanneaux] = useState([]);
  const [reqMoulures, setReqMoulures] = useState([]);

  const [selectedId, setSelectedId] = useState(null);
  const [filtreModule, setFiltreModule] = useState("");
  const [filtreTexte, setFiltreTexte] = useState("");

  useEffect(() => {
    const q = query(
      collection(db, "clients", CLIENT_ID, "historique"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setLogs(
          snap.docs.map((d) => ({
            id: `log-${d.id}`,
            realId: d.id,
            source: "historique",
            ...d.data(),
          }))
        );
      },
      (err) => {
        console.warn("Aucune collection historique ou permission manquante:", err);
        setLogs([]);
      }
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, "clients", CLIENT_ID, "banquePanneaux"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setPanneaux(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => {
        console.error("Erreur banquePanneaux:", err);
        setPanneaux([]);
      }
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, "clients", CLIENT_ID, "banqueMoulures"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setMoulures(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => {
        console.error("Erreur banqueMoulures:", err);
        setMoulures([]);
      }
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, "clients", CLIENT_ID, "requisitionsPanneaux"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setReqPanneaux(
          snap.docs.map((d) => ({
            id: d.id,
            collectionType: "panneaux",
            ...d.data(),
          }))
        );
      },
      (err) => {
        console.error("Erreur requisitionsPanneaux:", err);
        setReqPanneaux([]);
      }
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, "clients", CLIENT_ID, "requisitionsMoulures"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setReqMoulures(
          snap.docs.map((d) => ({
            id: d.id,
            collectionType: "moulures",
            ...d.data(),
          }))
        );
      },
      (err) => {
        console.error("Erreur requisitionsMoulures:", err);
        setReqMoulures([]);
      }
    );

    return () => unsub();
  }, []);

  const virtualRows = useMemo(() => {
    const out = [];

    panneaux.forEach((p) => {
      if (p.createdAt) {
        out.push({
          id: `panneau-ajout-${p.id}`,
          source: "auto",
          createdAt: p.createdAt,
          action: "panneau_ajout",
          titre: "Panneau ajouté",
          module: "panneaux",
          cibleId: p.id,
          cibleType: "banquePanneaux",
          description: `Panneau ajouté : ${panneauLabel(p)}`,
          userName: userFromDoc(p, "created"),
          userEmail: p.createdByEmail || p.userEmail || "",
          details: p,
        });
      }

      if (p.updatedAt && !sameTime(p.updatedAt, p.createdAt)) {
        out.push({
          id: `panneau-modif-${p.id}`,
          source: "auto",
          createdAt: p.updatedAt,
          action: "panneau_modification",
          titre: "Panneau modifié",
          module: "panneaux",
          cibleId: p.id,
          cibleType: "banquePanneaux",
          description: `Panneau modifié : ${panneauLabel(p)}`,
          userName: userFromDoc(p, "updated"),
          userEmail: p.updatedByEmail || p.userEmail || "",
          details: p,
        });
      }
    });

    moulures.forEach((m) => {
      if (m.createdAt) {
        out.push({
          id: `moulure-ajout-${m.id}`,
          source: "auto",
          createdAt: m.createdAt,
          action: "moulure_ajout",
          titre: "Moulure ajoutée",
          module: "moulures",
          cibleId: m.id,
          cibleType: "banqueMoulures",
          description: `Moulure ajoutée : ${moulureLabel(m)}`,
          userName: userFromDoc(m, "created"),
          userEmail: m.createdByEmail || m.userEmail || "",
          details: m,
        });
      }

      if (m.updatedAt && !sameTime(m.updatedAt, m.createdAt)) {
        out.push({
          id: `moulure-modif-${m.id}`,
          source: "auto",
          createdAt: m.updatedAt,
          action: "moulure_modification",
          titre: "Moulure modifiée",
          module: "moulures",
          cibleId: m.id,
          cibleType: "banqueMoulures",
          description: `Moulure modifiée : ${moulureLabel(m)}`,
          userName: userFromDoc(m, "updated"),
          userEmail: m.updatedByEmail || m.userEmail || "",
          details: m,
        });
      }
    });

    reqPanneaux.forEach((r) => {
      if (r.createdAt) {
        const demandeExacte = reqItemsLabel({
          ...r,
          collectionType: "panneaux",
        });

        out.push({
          id: `reqpan-creation-${r.id}`,
          source: "auto",
          createdAt: r.createdAt,
          action: "requisition_panneaux_creation",
          titre: "Réquisition panneaux créée",
          module: "requisitions",
          cibleId: r.id,
          cibleType: "requisitionsPanneaux",
          description: `Réquisition ${r.reqId || r.id} créée — ${demandeExacte}`,
          userName: userFromDoc(r, "created"),
          userEmail: r.createdByEmail || r.userEmail || "",
          details: r,
        });
      }

      if (normalizeStatus(r) === "terminée" && r.completedAt) {
        const demandeExacte = reqItemsLabel({
          ...r,
          collectionType: "panneaux",
        });

        const remisExact = reqRestantsLabel(r);

        out.push({
          id: `reqpan-terminee-${r.id}`,
          source: "auto",
          createdAt: r.completedAt,
          action: "requisition_panneaux_terminee",
          titre: "Réquisition panneaux terminée",
          module: "requisitions",
          cibleId: r.id,
          cibleType: "requisitionsPanneaux",
          description: `Réquisition ${r.reqId || r.id} terminée — Demandé: ${demandeExacte} — Remis dans le tableau: ${remisExact}`,
          userName: userFromDoc(r, "completed"),
          userEmail: r.completedByEmail || r.updatedByEmail || r.userEmail || "",
          details: r,
        });
      }
    });

    reqMoulures.forEach((r) => {
      if (r.createdAt) {
        const demandeExacte = reqItemsLabel({
          ...r,
          collectionType: "moulures",
        });

        out.push({
          id: `reqmoul-creation-${r.id}`,
          source: "auto",
          createdAt: r.createdAt,
          action: "requisition_moulures_creation",
          titre: "Réquisition moulures créée",
          module: "requisitions",
          cibleId: r.id,
          cibleType: "requisitionsMoulures",
          description: `Réquisition ${r.reqId || r.id} créée — ${demandeExacte}`,
          userName: userFromDoc(r, "created"),
          userEmail: r.createdByEmail || r.userEmail || "",
          details: r,
        });
      }
    });

    return out;
  }, [panneaux, moulures, reqPanneaux, reqMoulures]);

  const rows = useMemo(() => {
    const normalizedLogs = logs.map((r) => ({
      ...r,
      userName: r.userName || r.userEmail || "Utilisateur non enregistré",
    }));

    return [...normalizedLogs, ...virtualRows].sort((a, b) => {
      return tsMillis(b.createdAt) - tsMillis(a.createdAt);
    });
  }, [logs, virtualRows]);

  const modules = useMemo(() => {
    return [
      "",
      ...Array.from(new Set(rows.map((r) => r.module).filter(Boolean))).sort(),
    ];
  }, [rows]);

  const filtered = useMemo(() => {
    const search = String(filtreTexte || "").trim().toLowerCase();
    const startMs = HISTORIQUE_START_DATE.getTime();

    return rows.filter((r) => {
      if (tsMillis(r.createdAt) < startMs) return false;

      if (filtreModule && r.module !== filtreModule) return false;

      if (search) {
        const blob = [
          r.titre,
          r.action,
          r.description,
          r.module,
          r.cibleId,
          r.cibleType,
          r.userName,
          r.userEmail,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!blob.includes(search)) return false;
      }

      return true;
    });
  }, [rows, filtreModule, filtreTexte]);

  const selected = useMemo(() => {
    return rows.find((r) => r.id === selectedId);
  }, [rows, selectedId]);

  const selectedDiffRows = useMemo(() => {
    return getDiffRowsFromRecord(selected);
  }, [selected]);

  const cols = "170px 150px 230px 1fr 240px";
  const diffCols = "220px 1fr 1fr";

  const detailHeaderCell = {
    padding: "9px 8px",
    fontWeight: 900,
    background: "#f7f7f7",
    borderRight: "1px solid #e5e5e5",
    textAlign: "center",
  };

  const diffCell = {
    padding: "9px 8px",
    borderRight: "1px solid #eee",
    minWidth: 0,
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        padding: 20,
        fontFamily: "Arial, sans-serif",
        background: "#f2f2f2",
        minHeight: "100vh",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "180px 1fr 180px",
          alignItems: "center",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <button
          onClick={onRetour}
          style={{
            height: 38,
            padding: "0 14px",
            border: "1px solid #9a9a9a",
            background: "#e6e6e6",
            fontWeight: 800,
            cursor: "pointer",
            borderRadius: 8,
          }}
        >
          ↩ Retour
        </button>

        <div style={{ fontSize: 30, fontWeight: 900, textAlign: "center" }}>
          Historique
        </div>

        <div
          style={{
            textAlign: "right",
            fontWeight: 900,
            color: "#333",
            fontSize: 13,
          }}
        >
          {filtered.length} action(s)
        </div>
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid #d5d5d5",
          borderRadius: 12,
          padding: 12,
          marginBottom: 14,
          display: "grid",
          gridTemplateColumns: "220px 1fr",
          gap: 12,
          alignItems: "end",
        }}
      >
        <div>
          <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 5 }}>
            Module
          </div>

          <select
            value={filtreModule}
            onChange={(e) => setFiltreModule(e.target.value)}
            style={{
              width: "100%",
              height: 38,
              borderRadius: 9,
              border: "1px solid #bbb",
              padding: "0 10px",
              fontWeight: 800,
              background: "#fff",
            }}
          >
            {modules.map((m) => (
              <option key={m} value={m}>
                {m ? moduleLabel(m) : "Tous"}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 5 }}>
            Recherche
          </div>

          <input
            value={filtreTexte}
            onChange={(e) => setFiltreTexte(e.target.value)}
            placeholder="Chercher un panneau, moulure, réquisition, utilisateur, projet..."
            style={{
              width: "100%",
              height: 38,
              borderRadius: 9,
              border: "1px solid #bbb",
              padding: "0 10px",
              fontWeight: 700,
              boxSizing: "border-box",
            }}
          />
        </div>
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid #d5d5d5",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: cols,
            background: "#0b3a78",
            color: "#fff",
            fontWeight: 900,
            fontSize: 13,
          }}
        >
          <div style={{ padding: "10px 8px", borderRight: "1px solid #315c93" }}>
            Date
          </div>
          <div style={{ padding: "10px 8px", borderRight: "1px solid #315c93" }}>
            Module
          </div>
          <div style={{ padding: "10px 8px", borderRight: "1px solid #315c93" }}>
            Action
          </div>
          <div style={{ padding: "10px 8px", borderRight: "1px solid #315c93" }}>
            Description exacte
          </div>
          <div style={{ padding: "10px 8px" }}>
            Fait par
          </div>
        </div>

        <div
          style={{
            maxHeight: "48vh",
            overflow: "auto",
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: 14, color: "#777", fontSize: 14 }}>
              (Aucun historique)
            </div>
          ) : (
            filtered.map((r, idx) => {
              const isSel = r.id === selectedId;
              const zebra = idx % 2 === 1;

              return (
                <div
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: cols,
                    alignItems: "center",
                    borderBottom: "1px solid #eee",
                    background: isSel ? "#dfefff" : zebra ? "#f7f7f7" : "#fff",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  <div
                    style={{
                      padding: "9px 8px",
                      borderRight: "1px solid #eee",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtTS(r.createdAt)}
                  </div>

                  <div
                    style={{
                      padding: "9px 8px",
                      borderRight: "1px solid #eee",
                      fontWeight: 900,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {moduleLabel(r.module)}
                  </div>

                  <div
                    style={{
                      padding: "9px 8px",
                      borderRight: "1px solid #eee",
                      fontWeight: 900,
                      color: actionColor(r.action || r.titre),
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={r.titre || r.action || ""}
                  >
                    {r.titre || r.action || ""}
                  </div>

                  <div
                    style={{
                      padding: "9px 8px",
                      borderRight: "1px solid #eee",
                      fontWeight: 800,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={r.description || ""}
                  >
                    {r.description || ""}
                  </div>

                  <div
                    style={{
                      padding: "9px 8px",
                      fontWeight: 800,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color:
                        r.userName === "Utilisateur non enregistré"
                          ? "#999"
                          : "#111",
                    }}
                    title={r.userName || r.userEmail || ""}
                  >
                    {r.userName || r.userEmail || "Utilisateur non enregistré"}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {selected ? (
        <div
          style={{
            marginTop: 14,
            background: "#fff",
            border: "1px solid #d5d5d5",
            borderRadius: 12,
            padding: 14,
            boxShadow: "0 8px 20px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 17, marginBottom: 10 }}>
            Détails de l’action
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "160px 1fr",
              gap: "7px 12px",
              fontSize: 13,
              alignItems: "start",
            }}
          >
            <div style={{ fontWeight: 900 }}>Date</div>
            <div>{fmtTS(selected.createdAt)}</div>

            <div style={{ fontWeight: 900 }}>Action</div>
            <div style={{ fontWeight: 900, color: actionColor(selected.action) }}>
              {selected.titre || selected.action}
            </div>

            <div style={{ fontWeight: 900 }}>Description exacte</div>
            <div style={{ fontWeight: 800, whiteSpace: "pre-wrap" }}>
              {selected.description || ""}
            </div>

            <div style={{ fontWeight: 900 }}>Module</div>
            <div>{moduleLabel(selected.module)}</div>

            <div style={{ fontWeight: 900 }}>Cible</div>
            <div>
              {selected.cibleType || ""}{" "}
              {selected.cibleId ? `/ ${selected.cibleId}` : ""}
            </div>

            <div style={{ fontWeight: 900 }}>Fait par</div>
            <div>{selected.userName || selected.userEmail || "Utilisateur non enregistré"}</div>

            <div style={{ fontWeight: 900 }}>Email</div>
            <div>{selected.userEmail || ""}</div>

            <div style={{ fontWeight: 900 }}>Source</div>
            <div>
              {selected.source === "auto"
                ? "Déduit automatiquement depuis les documents"
                : "Journal historique"}
            </div>
          </div>

          {isModificationRow(selected) ? (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>
                Avant / Après
              </div>

              {selectedDiffRows.length === 0 ? (
                <div
                  style={{
                    border: "1px solid #ffe1a6",
                    background: "#fff8e8",
                    color: "#8a5a00",
                    padding: 12,
                    borderRadius: 10,
                    fontWeight: 800,
                    fontSize: 13,
                  }}
                >
                  Aucune donnée avant/après enregistrée pour cette modification.
                  Pour voir la différence exacte, il faut que le code qui modifie
                  le panneau ou la moulure enregistre les champs <b>avant</b> et{" "}
                  <b>après</b> dans l’historique.
                </div>
              ) : (
                <div
                  style={{
                    border: "1px solid #d6e4ff",
                    borderRadius: 12,
                    overflow: "hidden",
                    background: "#fff",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: diffCols,
                      fontSize: 13,
                      borderBottom: "1px solid #d6e4ff",
                    }}
                  >
                    <div style={detailHeaderCell}>Champ</div>
                    <div style={detailHeaderCell}>Avant</div>
                    <div style={{ ...detailHeaderCell, borderRight: "none" }}>
                      Après
                    </div>
                  </div>

                  {selectedDiffRows.map((r, idx) => (
                    <div
                      key={`${r.field}-${idx}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: diffCols,
                        background: idx % 2 === 1 ? "#fff" : "#fbfdff",
                        borderBottom: "1px solid #edf2ff",
                        fontSize: 13,
                      }}
                    >
                      <div style={{ ...diffCell, fontWeight: 900 }}>
                        {prettyFieldName(r.field)}
                      </div>

                      <div
                        style={{
                          ...diffCell,
                          color: "#b42318",
                          fontWeight: 800,
                        }}
                      >
                        {formatDiffValue(r.before)}
                      </div>

                      <div
                        style={{
                          ...diffCell,
                          borderRight: "none",
                          color: "#168000",
                          fontWeight: 800,
                        }}
                      >
                        {formatDiffValue(r.after)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
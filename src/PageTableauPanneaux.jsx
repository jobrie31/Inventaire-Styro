import React, { useEffect, useMemo, useState } from "react";
import "./pageRetourMateriaux.css";
import { db, auth } from "./firebaseConfig";
import { CLIENT_ID } from "./appClient";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  doc,
  deleteDoc,
  updateDoc,
  runTransaction,
  serverTimestamp,
  addDoc,
} from "firebase/firestore";
import PanneauxRéglages from "./PanneauxRéglages.jsx";
import zoneTerrainPanneaux from "./assets/zone-terrain-panneaux.png";
import PanneauxExcelButton from "./PanneauxExcelButton.jsx";
import PanneauxResume from "./tableauPanneaux/PanneauxResume.jsx";
import PanneauxTable from "./tableauPanneaux/PanneauxTable.jsx";
import PanneauxRequisition from "./tableauPanneaux/PanneauxRequisition.jsx";

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

function currentUserInfo() {
  const user = auth?.currentUser || null;

  return {
    uid: user?.uid || "",
    email: user?.email || "",
    name: user?.displayName || user?.email || "Utilisateur inconnu",
  };
}

function fmtLongueur(pieds, pouces) {
  const p =
    pieds === null || pieds === undefined || pieds === "" ? "" : String(pieds);
  const po =
    pouces === null || pouces === undefined || pouces === ""
      ? "0"
      : String(pouces);

  if (!p) return "";
  return `${p} pi ${po} po`;
}

function panneauShortLabel(p) {
  return [
    p.type || "Panneau",
    p.epaisseurPouces ? `${p.epaisseurPouces}"` : "",
    p.fabricant || "",
    fmtLongueur(p.longueurPieds, p.longueurPouces),
    p.largeurPouces ? `x ${p.largeurPouces} po` : "",
    p.quantite !== undefined && p.quantite !== "" ? `Qté ${p.quantite}` : "",
    p.sectionCour ? `Section ${p.sectionCour}` : "",
    p.projet ? `Projet ${p.projet}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function cleanValue(v) {
  if (v === undefined || v === null) return "";
  return v;
}

function sameValue(a, b) {
  return String(cleanValue(a)).trim() === String(cleanValue(b)).trim();
}

function buildChanges(before, after, fields) {
  const changes = {};

  fields.forEach((f) => {
    const b = cleanValue(before?.[f]);
    const a = cleanValue(after?.[f]);

    if (!sameValue(b, a)) {
      changes[f] = {
        before: b,
        after: a,
      };
    }
  });

  return changes;
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

function isPosNumberStr(x) {
  const s = String(x ?? "").trim();
  if (!s) return false;
  const n = Number(s);
  return !Number.isNaN(n) && n > 0;
}

export default function PageTableauPanneaux() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [fProjet, setFProjet] = useState("");
  const [fLongueur, setFLongueur] = useState("");
  const [fType, setFType] = useState("");
  const [fEp, setFEp] = useState("");
  const [fFab, setFFab] = useState("");
  const [fProfile, setFProfile] = useState("");
  const [fModele, setFModele] = useState("");
  const [fFini, setFFini] = useState("");

  const [showSettings, setShowSettings] = useState(false);
  const [showResume, setShowResume] = useState(false);
  const [showPrix, setShowPrix] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [deletingId, setDeletingId] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [savingEditId, setSavingEditId] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [oldRowBeforeEdit, setOldRowBeforeEdit] = useState(null);

  const [checkingId, setCheckingId] = useState(null);

  const [reqMode, setReqMode] = useState(false);
  const [reqStartOpen, setReqStartOpen] = useState(false);
  const [reqConfirmOpen, setReqConfirmOpen] = useState(false);
  const [reqSelected, setReqSelected] = useState(() => new Set());
  const [reqConfirmed, setReqConfirmed] = useState(() => new Set());
  const [reqQtyById, setReqQtyById] = useState({});
  const [reqProjetEnvoye, setReqProjetEnvoye] = useState("");
  const [reqNote, setReqNote] = useState("");
  const [reqSaving, setReqSaving] = useState(false);
  const [reqError, setReqError] = useState("");

  const [reqFabricant, setReqFabricant] = useState("");
  const [reqType, setReqType] = useState("");
  const [reqEpaisseur, setReqEpaisseur] = useState("");
  const [reqLongueurPieds, setReqLongueurPieds] = useState("");
  const [reqLongueurPouces, setReqLongueurPouces] = useState("");

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

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") {
        if (reqStartOpen) closeReqStart();
        if (reqConfirmOpen) closeReqConfirm();
      }
    }

    if (reqStartOpen || reqConfirmOpen) {
      window.addEventListener("keydown", onKeyDown);
    }

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [reqStartOpen, reqConfirmOpen]);

  const projets = useMemo(
    () => ["", ...Array.from(new Set(rows.map((r) => r.projet).filter(Boolean))).sort()],
    [rows]
  );

  const sectionsCour = useMemo(
    () =>
      [
        "",
        ...Array.from(new Set(rows.map((r) => r.sectionCour).filter(Boolean))).sort(
          (a, b) => Number(a) - Number(b)
        ),
      ],
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

  const profiles = useMemo(
    () => ["", ...Array.from(new Set(rows.map((r) => r.profile).filter(Boolean))).sort()],
    [rows]
  );

  const modeles = useMemo(
    () => ["", ...Array.from(new Set(rows.map((r) => r.modele).filter(Boolean))).sort()],
    [rows]
  );

  const finis = useMemo(
    () => ["", ...Array.from(new Set(rows.map((r) => r.fini).filter(Boolean))).sort()],
    [rows]
  );

  const longueursFiltres = [
    { value: "", label: "" },
    { value: "moins-10", label: "Moins de 10'" },
    { value: "10-20", label: "10' à 20'" },
    { value: "20-30", label: "20' à 30'" },
    { value: "30-40", label: "30' à 40'" },
    { value: "40-50", label: "40' à 50'" },
  ];

  const reqLongueurVoulue = useMemo(() => {
    const pieds = Number(reqLongueurPieds);
    const poucesRaw = String(reqLongueurPouces ?? "").trim();
    const pouces = poucesRaw === "" ? 0 : Number(poucesRaw);

    if (!Number.isFinite(pieds) || pieds <= 0) return null;
    if (!Number.isFinite(pouces) || pouces < 0 || pouces >= 12) return null;

    return pieds + pouces / 12;
  }, [reqLongueurPieds, reqLongueurPouces]);

  function morceauxPossibles(row) {
    if (!reqLongueurVoulue || reqLongueurVoulue <= 0) return 0;

    const L = lengthFeet(row);
    if (!Number.isFinite(L) || L <= 0) return 0;

    return Math.floor(L / reqLongueurVoulue);
  }

  function perteOptimisation(row) {
    const possible = morceauxPossibles(row);
    if (!possible || !reqLongueurVoulue) return Infinity;

    return lengthFeet(row) - possible * reqLongueurVoulue;
  }

  const optimisationRows = useMemo(() => {
    if (!reqLongueurVoulue) return [];

    return rows
      .filter((r) => {
        if (morceauxPossibles(r) <= 0) return false;
        return Number(r.quantite ?? 0) > 0;
      })
      .map((r) => ({
        ...r,
        morceauxPossible: morceauxPossibles(r),
        perte: perteOptimisation(r),
      }))
      .sort((a, b) => {
        if (a.perte !== b.perte) return a.perte - b.perte;
        if (b.morceauxPossible !== a.morceauxPossible) {
          return b.morceauxPossible - a.morceauxPossible;
        }
        return lengthFeet(a) - lengthFeet(b);
      });
  }, [rows, reqLongueurVoulue]);

  const filtered = useMemo(() => {
    const result = rows.filter((r) => {
      if (fProjet && String(r.projet || "") !== fProjet) return false;

      if (fLongueur) {
        const L = lengthFeet(r);

        if (!Number.isFinite(L)) return false;

        if (fLongueur === "moins-10" && !(L < 10)) return false;
        if (fLongueur === "10-20" && !(L >= 10 && L < 20)) return false;
        if (fLongueur === "20-30" && !(L >= 20 && L < 30)) return false;
        if (fLongueur === "30-40" && !(L >= 30 && L < 40)) return false;
        if (fLongueur === "40-50" && !(L >= 40 && L <= 50)) return false;
      }

      if (fType && String(r.type || "") !== fType) return false;
      if (fEp && String(r.epaisseurPouces || "") !== fEp) return false;
      if (fFab && String(r.fabricant || "") !== fFab) return false;
      if (fProfile && String(r.profile || "") !== fProfile) return false;
      if (fModele && String(r.modele || "") !== fModele) return false;
      if (fFini && String(r.fini || "") !== fFini) return false;

      if (reqMode) {
        if (!reqLongueurVoulue) return false;
        if (morceauxPossibles(r) <= 0) return false;
        if (Number(r.quantite ?? 0) <= 0) return false;
      }

      return true;
    });

    if (reqMode && reqLongueurVoulue) {
      return [...result].sort((a, b) => {
        const wa = perteOptimisation(a);
        const wb = perteOptimisation(b);

        if (wa !== wb) return wa - wb;

        const pa = morceauxPossibles(a);
        const pb = morceauxPossibles(b);

        if (pb !== pa) return pb - pa;

        return lengthFeet(a) - lengthFeet(b);
      });
    }

    return result;
  }, [
    rows,
    fProjet,
    fLongueur,
    fType,
    fEp,
    fFab,
    fProfile,
    fModele,
    fFini,
    reqMode,
    reqLongueurVoulue,
  ]);

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

  const reqSelectedList = useMemo(() => {
    const ids = Array.from(reqSelected);
    const map = new Map(rows.map((x) => [x.id, x]));
    return ids.map((id) => map.get(id)).filter(Boolean);
  }, [reqSelected, rows]);

  const colsAvecPrix = reqMode
    ? "38px 1.2fr 0.75fr 0.8fr 0.75fr 0.45fr 0.9fr 0.8fr 0.8fr 0.8fr 0.7fr 0.6fr 0.5fr 0.75fr 0.75fr 0.9fr 0.75fr 0.9fr 0.8fr 0.55fr 0.75fr 0.75fr 0.75fr 0.75fr 1fr"
    : "38px 1.2fr 0.75fr 0.8fr 0.75fr 0.45fr 0.9fr 0.8fr 0.8fr 0.8fr 0.7fr 0.6fr 0.5fr 0.75fr 0.75fr 0.8fr 0.55fr 0.75fr 0.75fr 0.75fr 0.75fr 1fr";

  const colsSansPrix = reqMode
    ? "38px 1.3fr 0.8fr 0.85fr 0.8fr 0.5fr 1fr 0.9fr 0.9fr 0.9fr 0.8fr 0.7fr 0.55fr 0.9fr 0.9fr 0.9fr 0.75fr 0.9fr 1fr"
    : "38px 1.3fr 0.8fr 0.85fr 0.8fr 0.5fr 1fr 0.9fr 0.9fr 0.9fr 0.8fr 0.7fr 0.55fr 0.9fr 0.9fr 1fr";

  const cols = showPrix ? colsAvecPrix : colsSansPrix;

  const baseCell = {
    overflow: "hidden",
    textOverflow: "clip",
    whiteSpace: "normal",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    minWidth: 0,
    padding: "5px 4px",
    borderRight: "1px solid #d9d9d9",
    boxSizing: "border-box",
    lineHeight: 1.15,
  };

  const lastCell = {
    ...baseCell,
    borderRight: "none",
  };

  const mult = settings?.multipliers || DEFAULT_SETTINGS.multipliers;

  async function toggleCheckedRow(row) {
    if (!row?.id) return;

    setCheckingId(row.id);

    try {
      const actor = currentUserInfo();

      await updateDoc(doc(db, "clients", CLIENT_ID, "banquePanneaux", row.id), {
        checked: !(row.checked === true),
        checkedAt: serverTimestamp(),
        checkedByUid: actor.uid,
        checkedByEmail: actor.email,
        checkedByName: actor.name,
      });
    } catch (e) {
      console.error(e);
      alert("Impossible d'enregistrer le crochet.");
    } finally {
      setCheckingId(null);
    }
  }

  function startReqMode() {
    setReqStartOpen(true);
    setReqMode(false);
    setReqConfirmOpen(false);
    setReqSelected(new Set());
    setReqConfirmed(new Set());
    setReqQtyById({});
    setReqProjetEnvoye("");
    setReqNote("");
    setReqSaving(false);
    setReqError("");
    setReqFabricant("");
    setReqType("");
    setReqEpaisseur("");
    setReqLongueurPieds("");
    setReqLongueurPouces("");
    cancelEdit();
  }

  function closeReqStart() {
    setReqStartOpen(false);
    setReqError("");
  }

  function confirmerStartReqMode() {
    const pieds = Number(reqLongueurPieds);
    const poucesRaw = String(reqLongueurPouces ?? "").trim();
    const pouces = poucesRaw === "" ? 0 : Number(poucesRaw);

    if (!Number.isFinite(pieds) || pieds <= 0) {
      setReqError("Entre une longueur en pieds valide.");
      return;
    }

    if (!Number.isFinite(pouces) || pouces < 0 || pouces >= 12) {
      setReqError("Les pouces doivent être entre 0 et 11.");
      return;
    }

    setReqError("");
    setReqStartOpen(false);
    setReqMode(true);
  }

  function cancelReqMode() {
    setReqMode(false);
    setReqStartOpen(false);
    setReqConfirmOpen(false);
    setReqSelected(new Set());
    setReqConfirmed(new Set());
    setReqQtyById({});
    setReqProjetEnvoye("");
    setReqNote("");
    setReqSaving(false);
    setReqError("");
    setReqFabricant("");
    setReqType("");
    setReqEpaisseur("");
    setReqLongueurPieds("");
    setReqLongueurPouces("");
  }

  function closeReqConfirm() {
    setReqConfirmOpen(false);
    setReqSaving(false);
    setReqError("");
  }

  function choisirPanneauPourReq(id) {
    setReqSelected((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    setReqConfirmed((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    setReqQtyById((prev) => ({
      ...prev,
      [id]: prev[id] ?? 1,
    }));

    setReqError("");
  }

  function setReqQtyPanneau(id, rawValue) {
    const v = Number(rawValue);

    setReqQtyById((prev) => ({
      ...prev,
      [id]: rawValue === "" ? "" : Number.isFinite(v) ? v : 1,
    }));

    setReqConfirmed((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    setReqError("");
  }

  function confirmerPanneauReq(id) {
    const row = rows.find((x) => x.id === id);
    const qty = Number(reqQtyById[id] ?? 1);
    const stock = Number(row?.quantite ?? 0);

    if (!Number.isFinite(qty) || qty <= 0) {
      setReqError("Entre une quantité plus grande que 0 avant de confirmer.");
      return;
    }

    if (Number.isFinite(stock) && qty > stock) {
      setReqError(`Quantité insuffisante. Stock disponible: ${stock}.`);
      return;
    }

    setReqConfirmed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    setReqError("");
  }

  function choisirMeilleurPanneau() {
    const best = optimisationRows[0];

    if (!best?.id) {
      setReqError("Aucun panneau compatible trouvé pour cette optimisation.");
      return;
    }

    setReqSelected(new Set([best.id]));
    setReqConfirmed(new Set());
    setReqQtyById({ [best.id]: 1 });
    setReqError("");
    setReqStartOpen(false);
    setReqMode(true);
  }

  function retirerPanneauReq(id) {
    setReqSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    setReqConfirmed((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    setReqQtyById((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function terminerSelectionReq() {
    if (reqSelected.size === 0) {
      setReqError("Choisis au moins 1 panneau.");
      return;
    }

    const notConfirmed = Array.from(reqSelected).filter(
      (id) => !reqConfirmed.has(id)
    );

    if (notConfirmed.length > 0) {
      setReqError("Confirme chaque panneau choisi avant de terminer la sélection.");
      return;
    }

    const invalidQty = reqSelectedList.some((it) => {
      const q = Number(reqQtyById[it.id]);
      return !Number.isFinite(q) || q <= 0;
    });

    if (invalidQty) {
      setReqError("Toutes les quantités doivent être plus grandes que 0.");
      return;
    }

    setReqError("");
    setReqConfirmOpen(true);
  }

  async function createReqPanneaux() {
    setReqError("");

    if (reqSelected.size === 0) {
      setReqError("Choisis au moins 1 panneau.");
      return false;
    }

    const notConfirmed = Array.from(reqSelected).filter(
      (id) => !reqConfirmed.has(id)
    );

    if (notConfirmed.length > 0) {
      setReqError("Confirme chaque panneau choisi avant de créer la réquisition.");
      return false;
    }

    if (!String(reqProjetEnvoye || "").trim()) {
      setReqError("Entre le projet à envoyer.");
      return false;
    }

    const invalidQty = reqSelectedList.some((it) => {
      const q = Number(reqQtyById[it.id]);
      return !Number.isFinite(q) || q <= 0;
    });

    if (invalidQty) {
      setReqError("Toutes les quantités doivent être plus grandes que 0.");
      return false;
    }

    setReqSaving(true);

    try {
      const actor = currentUserInfo();
      const counterRef = doc(db, "clients", CLIENT_ID, "_counters", "reqPanneaux");

      const { reqId, reqNum } = await runTransaction(db, async (tx) => {
        const counterSnap = await tx.get(counterRef);
        const next = counterSnap.exists() ? Number(counterSnap.data()?.next ?? 1) : 1;
        const reqNum = Number.isFinite(next) && next > 0 ? next : 1;
        const reqId = `reqpan${reqNum}`;

        const itemRefs = reqSelectedList.map((it) => ({
          item: it,
          ref: doc(db, "clients", CLIENT_ID, "banquePanneaux", it.id),
          qtyDemandee: Number(reqQtyById[it.id] ?? 1) || 1,
        }));

        const itemSnaps = [];

        for (const x of itemRefs) {
          const snap = await tx.get(x.ref);
          itemSnaps.push({ ...x, snap });
        }

        for (const x of itemSnaps) {
          if (!x.snap.exists()) {
            throw new Error(`Le panneau ${x.item.id} n'existe plus.`);
          }

          const data = x.snap.data();
          const stockActuel = Number(data.quantite ?? 0);

          if (!Number.isFinite(stockActuel)) {
            throw new Error(`Quantité invalide pour le panneau ${x.item.id}.`);
          }

          if (x.qtyDemandee > stockActuel) {
            throw new Error(
              `Quantité insuffisante pour ${data.type || "panneau"} ${
                data.epaisseurPouces || ""
              }". Stock: ${stockActuel}, demandé: ${x.qtyDemandee}.`
            );
          }
        }

        const items = itemSnaps.map((x) => {
          const data = x.snap.data();
          const rowLength = lengthFeet(data);
          const possible =
            reqLongueurVoulue && reqLongueurVoulue > 0
              ? Math.floor(rowLength / reqLongueurVoulue)
              : 0;
          const perte =
            reqLongueurVoulue && possible > 0
              ? rowLength - possible * reqLongueurVoulue
              : null;
          const qteStockAvant = Number(data.quantite ?? 0) || 0;

          return {
            banqueId: x.item.id,
            projetSource: data.projet || "",
            sectionCour: data.sectionCour || "",
            date: data.date || "",
            type: data.type || "",
            epaisseurPouces: data.epaisseurPouces || "",
            fabricant: data.fabricant || "",
            profile: data.profile || "",
            modele: data.modele || "",
            fini: data.fini || "",
            longueurPieds: data.longueurPieds ?? "",
            longueurPouces: data.longueurPouces ?? "",
            largeurPouces: data.largeurPouces ?? "",
            faceExterieure: data.faceExterieure || "",
            faceInterieure: data.faceInterieure || "",
            quantiteStockAvant: qteStockAvant,
            quantiteStockApres: qteStockAvant - x.qtyDemandee,
            quantiteDemande: x.qtyDemandee,

            optimisationLongueurDemandee: reqLongueurVoulue || null,
            optimisationMorceauxPossibles: possible,
            optimisationQuantiteTotalePossible: qteStockAvant * possible,
            optimisationPertePieds: perte,
            optimisationPerteParPanneauPieds: perte,
            optimisationFabricantDemande: "",
            optimisationTypeDemande: "",
            optimisationEpaisseurDemande: "",
          };
        });

        const reqRef = doc(db, "clients", CLIENT_ID, "requisitionsPanneaux", reqId);
        const histRef = doc(collection(db, "clients", CLIENT_ID, "historique"));

        tx.set(counterRef, { next: reqNum + 1 }, { merge: true });

        tx.set(reqRef, {
          reqId,
          reqNum,
          type: "panneaux",
          status: "demande",
          projetEnvoye: String(reqProjetEnvoye || "").trim(),
          note: String(reqNote || "").trim(),
          items,

          courrielOuvert: true,
          courrielDestinataire: "entrepot@styro.ca",

          optimisation: {
            fabricant: "",
            type: "",
            epaisseur: "",
            longueurPieds: reqLongueurPieds || "",
            longueurPouces: reqLongueurPouces || "",
            longueurTotalePieds: reqLongueurVoulue || null,
          },

          createdByUid: actor.uid,
          createdByEmail: actor.email,
          createdByName: actor.name,
          updatedByUid: actor.uid,
          updatedByEmail: actor.email,
          updatedByName: actor.name,

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        tx.set(histRef, {
          action: "requisition_panneaux_creation",
          titre: "Réquisition panneaux créée",
          module: "requisitions",
          cibleId: reqId,
          cibleType: "requisitionsPanneaux",
          description: `Réquisition ${reqId} créée avec ${items.length} ligne(s)`,
          reqId,
          items,
          courrielOuvert: true,
          courrielDestinataire: "entrepot@styro.ca",

          createdByUid: actor.uid,
          createdByEmail: actor.email,
          createdByName: actor.name,
          userEmail: actor.email,
          userName: actor.name,

          createdAt: serverTimestamp(),
        });

        for (const x of itemSnaps) {
          const data = x.snap.data();
          const stockActuel = Number(data.quantite ?? 0);
          const nouveauStock = stockActuel - x.qtyDemandee;

          tx.update(x.ref, {
            quantite: nouveauStock,
            updatedByUid: actor.uid,
            updatedByEmail: actor.email,
            updatedByName: actor.name,
            updatedAt: serverTimestamp(),
          });
        }

        return { reqId, reqNum };
      });

      cancelReqMode();

      return {
        reqId,
        reqNum,
      };
    } catch (e) {
      console.error(e);
      setReqError(e?.message || "Erreur lors de la création de la réquisition.");
      return false;
    } finally {
      setReqSaving(false);
    }
  }

  function startEdit(r) {
    if (reqMode) return;

    setEditingId(r.id);
    setOldRowBeforeEdit({ ...r });

    setEditRow({
      projet: r.projet || "",
      sectionCour: r.sectionCour || "",
      date: r.date || "",
      type: r.type || "",
      epaisseurPouces: r.epaisseurPouces || "",
      fabricant: r.fabricant || "",
      profile: r.profile || "",
      modele: r.modele || "",
      fini: r.fini || "",
      longueurPieds: r.longueurPieds ?? "",
      longueurPouces: r.longueurPouces ?? "",
      largeurPouces: r.largeurPouces ?? "",
      quantite: r.quantite ?? "",
      faceExterieure: r.faceExterieure || "",
      faceInterieure: r.faceInterieure || "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditRow(null);
    setOldRowBeforeEdit(null);
  }

  function onEditChange(field, value) {
    setEditRow((prev) => ({ ...prev, [field]: value }));
  }

  async function saveEdit(rowId) {
    if (!editRow) return;

    const oldRow = oldRowBeforeEdit || rows.find((r) => r.id === rowId) || {};

    const projet = String(editRow.projet || "").trim();
    if (!projet) return alert("Projet obligatoire.");

    if (!editRow.type) return alert("Type obligatoire.");
    if (!editRow.epaisseurPouces) return alert("Épaisseur obligatoire.");
    if (!editRow.fabricant) return alert("Fabricant obligatoire.");

    if (!isPosNumberStr(editRow.longueurPieds)) {
      return alert("Longueur pieds doit être > 0.");
    }

    const longPoucesStr = String(editRow.longueurPouces ?? "").trim();
    const longPoucesNum = longPoucesStr === "" ? 0 : Number(longPoucesStr);

    if (Number.isNaN(longPoucesNum) || longPoucesNum < 0 || longPoucesNum >= 12) {
      return alert("Longueur pouces doit être entre 0 et 11.");
    }

    if (!isPosNumberStr(editRow.largeurPouces)) {
      return alert("Largeur doit être > 0.");
    }

    if (!isPosNumberStr(editRow.quantite)) {
      return alert("Quantité doit être > 0.");
    }

    const newData = {
      projet,
      sectionCour: String(editRow.sectionCour || "").trim(),
      date: String(editRow.date || "").trim(),
      type: String(editRow.type || "").trim(),
      epaisseurPouces: String(editRow.epaisseurPouces || "").trim(),
      fabricant: String(editRow.fabricant || "").trim(),
      profile: String(editRow.profile || "").trim(),
      modele: String(editRow.modele || "").trim(),
      fini: String(editRow.fini || "").trim(),
      longueurPieds: Number(editRow.longueurPieds),
      longueurPouces: longPoucesNum,
      largeurPouces: Number(editRow.largeurPouces),
      quantite: Number(editRow.quantite),
      faceExterieure: String(editRow.faceExterieure || "").trim(),
      faceInterieure: String(editRow.faceInterieure || "").trim(),
    };

    const compareFields = [
      "projet",
      "sectionCour",
      "date",
      "type",
      "epaisseurPouces",
      "fabricant",
      "profile",
      "modele",
      "fini",
      "longueurPieds",
      "longueurPouces",
      "largeurPouces",
      "quantite",
      "faceExterieure",
      "faceInterieure",
    ];

    const afterForCompare = {
      ...oldRow,
      ...newData,
    };

    const changes = buildChanges(oldRow, afterForCompare, compareFields);

    if (Object.keys(changes).length === 0) {
      cancelEdit();
      return;
    }

    setSavingEditId(rowId);

    try {
      const actor = currentUserInfo();

      await updateDoc(doc(db, "clients", CLIENT_ID, "banquePanneaux", rowId), {
        ...newData,
        updatedByUid: actor.uid,
        updatedByEmail: actor.email,
        updatedByName: actor.name,
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, "clients", CLIENT_ID, "historique"), {
        action: "panneau_modification",
        titre: "Panneau modifié",
        module: "panneaux",
        cibleId: rowId,
        cibleType: "banquePanneaux",
        description: `Panneau modifié : ${panneauShortLabel(afterForCompare)}`,

        before: oldRow,
        after: afterForCompare,
        changes,

        updatedByUid: actor.uid,
        updatedByEmail: actor.email,
        updatedByName: actor.name,
        createdByUid: actor.uid,
        createdByEmail: actor.email,
        createdByName: actor.name,
        userEmail: actor.email,
        userName: actor.name,

        createdAt: serverTimestamp(),
      });

      setEditingId(null);
      setEditRow(null);
      setOldRowBeforeEdit(null);
    } catch (e) {
      console.error(e);
      alert("❌ Modification impossible: " + (e?.message || String(e)));
    } finally {
      setSavingEditId(null);
    }
  }

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

  const panneauCtx = {
    showResume,
    showPrix,
    resumeRows,
    resumeTotal,
    moneyZero,
    reqMode,
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
    fabs,
    setReqQtyById,
    setReqQtyPanneau,
    confirmerPanneauReq,
    retirerPanneauReq,
    choisirPanneauPourReq,
    choisirMeilleurPanneau,
    saveEdit,
    savingEditId,
    cancelEdit,
    startEdit,
    supprimerRow,
    deletingId,
    reqStartOpen,
    closeReqStart,
    reqFabricant,
    setReqFabricant,
    reqType,
    setReqType,
    reqEpaisseur,
    setReqEpaisseur,
    reqLongueurPieds,
    setReqLongueurPieds,
    reqLongueurPouces,
    setReqLongueurPouces,
    reqLongueurVoulue,
    morceauxPossibles,
    perteOptimisation,
    optimisationRows,
    reqError,
    confirmerStartReqMode,
    reqConfirmOpen,
    closeReqConfirm,
    reqSelectedList,
    reqProjetEnvoye,
    setReqProjetEnvoye,
    reqNote,
    setReqNote,
    reqSaving,
    createReqPanneaux,
  };

  const filterLabelStyle = {
    fontWeight: 900,
    marginBottom: 4,
    textAlign: "center",
  };

  const filterSelectStyle = {
    width: "100%",
    textAlign: "center",
    textAlignLast: "center",
    fontWeight: 800,
  };

  return (
    <div
      className="pageRM pageRM--full"
      style={{
        background: reqMode ? "#d9dde5" : undefined,
        transition: "background 0.2s ease",
      }}
    >
      {showSettings && <PanneauxRéglages onClose={() => setShowSettings(false)} />}

      <div
        className="titleRow titleRow--full"
        style={{
          paddingTop: 12,
          position: "relative",
          zIndex: reqMode ? 120 : undefined,
        }}
      >
        <div />

        <div
          className="bigTitle"
          style={{
            display: "flex",
            gap: 18,
            justifyContent: "center",
            alignItems: "center",
            width: "100%",
            flexWrap: "wrap",
            position: "relative",
            zIndex: reqMode ? 120 : undefined,
          }}
        >
          <img
            src={zoneTerrainPanneaux}
            alt="Zones du terrain"
            style={{
              width: 400,
              height: 300,
              objectFit: "cover",
              borderRadius: 10,
              border: "2px solid #222",
              background: "#fff",
              flexShrink: 0,
            }}
          />

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              minWidth: 0,
              position: "relative",
              zIndex: reqMode ? 120 : undefined,
            }}
          >
            <div
              style={{
                fontSize: 34,
                fontWeight: 900,
                textAlign: "center",
                lineHeight: 1.1,
                whiteSpace: "nowrap",
              }}
            >
              Inventaire panneaux
            </div>

            <div
              style={{
                display: "flex",
                gap: 12,
                justifyContent: "center",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <button
                className="btn"
                style={{ width: 140, height: 34 }}
                onClick={() => setShowSettings(true)}
              >
                Réglages
              </button>

              <PanneauxExcelButton
                rows={filtered}
                prixUnitaire={prixUnitaire}
                settings={settings}
              />

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

              <button
                className="btn"
                style={{
                  width: 170,
                  height: 34,
                  background: showPrix ? "#d9f2d9" : "#ffe2e2",
                  border: showPrix ? "1px solid #168000" : "1px solid #c40000",
                  color: showPrix ? "#064f17" : "#9b0000",
                  fontWeight: 900,
                  whiteSpace: "nowrap",
                }}
                onClick={() => setShowPrix((v) => !v)}
              >
                {showPrix ? "Masquer prix" : "Afficher prix"}
              </button>

              {!reqMode ? (
                <button
                  className="btn"
                  style={{
                    width: 230,
                    minWidth: 230,
                    height: 34,
                    background: "#1e5eff",
                    color: "#fff",
                    border: "1px solid #1e5eff",
                    fontWeight: 900,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                  onClick={startReqMode}
                >
                  + Réquisition
                </button>
              ) : (
                <button
                  className="btn"
                  style={{
                    width: 110,
                    minWidth: 110,
                    height: 34,
                    background: "#fff",
                    color: "#d33",
                    border: "1px solid #d33",
                    fontWeight: 900,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                  onClick={cancelReqMode}
                >
                  Annuler
                </button>
              )}
            </div>

            {reqMode ? (
              <button
                className="btn"
                style={{
                  marginTop: 10,
                  width: 500,
                  maxWidth: "94vw",
                  minHeight: 68,
                  background: "#00a51f",
                  color: "#ffffff",
                  border: "3px solid #006d14",
                  borderRadius: 18,
                  fontWeight: 1000,
                  fontSize: 28,
                  letterSpacing: "0.2px",
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  position: "relative",
                  zIndex: 160,
                  boxShadow: "0 8px 18px rgba(0,0,0,0.28)",
                  textShadow: "0 1px 3px rgba(0,0,0,0.25)",
                }}
                onClick={terminerSelectionReq}
              >
                ✅ Terminer la sélection ({reqConfirmed.size}/{reqSelected.size})
              </button>
            ) : null}
          </div>
        </div>

        <div />
      </div>

      {reqMode ? (
        <div
          style={{
            margin: "0 auto 10px auto",
            width: "fit-content",
            maxWidth: "calc(100vw - 24px)",
            border: "2px solid #facc15",
            background: "#fff8d8",
            color: "#4d3b00",
            padding: "8px 18px",
            borderRadius: 12,
            fontWeight: 900,
            fontSize: 13,
            boxSizing: "border-box",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            position: "relative",
            zIndex: 140,
            boxShadow: "0 0 16px rgba(250, 204, 21, 0.55)",
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 900 }}>
            Longueur voulue :
          </span>

          <span
            style={{
              fontSize: 22,
              fontWeight: 1000,
              color: "#0b3a78",
              background: "#ffffff",
              border: "1px solid #facc15",
              borderRadius: 10,
              padding: "4px 12px",
              lineHeight: 1,
            }}
          >
            {reqLongueurPieds || "?"} pi {reqLongueurPouces || 0} po
          </span>

          {reqError ? (
            <span
              style={{
                color: "#c40000",
                fontWeight: 1000,
                marginLeft: 8,
              }}
            >
              {reqError}
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "center",
          padding: "0 14px 10px 14px",
          position: "relative",
          zIndex: reqMode ? 140 : undefined,
          filter: reqMode
            ? "drop-shadow(0 0 14px rgba(255,255,255,0.9))"
            : undefined,
        }}
      >
        <div
          style={{
            width: "min(1600px, 100%)",
            display: "grid",
            gridTemplateColumns: "repeat(8, minmax(0, 1fr))",
            gap: 10,
            background: reqMode ? "rgba(255,255,255,0.96)" : undefined,
            padding: reqMode ? 10 : undefined,
            borderRadius: reqMode ? 14 : undefined,
            border: reqMode ? "2px solid rgba(255,255,255,0.9)" : undefined,
            boxShadow: reqMode
              ? "0 0 28px rgba(255,255,255,0.95), 0 8px 22px rgba(0,0,0,0.18)"
              : undefined,
          }}
        >
          <div>
            <div style={filterLabelStyle}>Projet</div>
            <select
              className="selectGray"
              style={filterSelectStyle}
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
            <div style={filterLabelStyle}>Longueur</div>
            <select
              className="selectGray"
              style={filterSelectStyle}
              value={fLongueur}
              onChange={(e) => setFLongueur(e.target.value)}
            >
              {longueursFiltres.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={filterLabelStyle}>Type</div>
            <select
              className="selectGray"
              style={filterSelectStyle}
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
            <div style={filterLabelStyle}>Épaisseur</div>
            <select
              className="selectGray"
              style={filterSelectStyle}
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
            <div style={filterLabelStyle}>Fabricant</div>
            <select
              className="selectGray"
              style={filterSelectStyle}
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

          <div>
            <div style={filterLabelStyle}>Profile</div>
            <select
              className="selectGray"
              style={filterSelectStyle}
              value={fProfile}
              onChange={(e) => setFProfile(e.target.value)}
            >
              {profiles.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={filterLabelStyle}>Modèle</div>
            <select
              className="selectGray"
              style={filterSelectStyle}
              value={fModele}
              onChange={(e) => setFModele(e.target.value)}
            >
              {modeles.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={filterLabelStyle}>Fini</div>
            <select
              className="selectGray"
              style={filterSelectStyle}
              value={fFini}
              onChange={(e) => setFFini(e.target.value)}
            >
              {finis.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <PanneauxResume ctx={panneauCtx} />

      <PanneauxTable ctx={panneauCtx} />

      <PanneauxRequisition ctx={panneauCtx} />
    </div>
  );
}
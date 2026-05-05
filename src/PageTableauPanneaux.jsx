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
  setDoc,
  addDoc,
} from "firebase/firestore";
import PanneauxRéglages from "./PanneauxRéglages.jsx";
import zoneTerrainPanneaux from "./assets/zone-terrain-panneaux.png";
import PanneauxExcelButton from "./PanneauxExcelButton.jsx";

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
  const p = pieds === null || pieds === undefined || pieds === "" ? "" : String(pieds);
  const po =
    pouces === null || pouces === undefined || pouces === "" ? "0" : String(pouces);

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
  const [fSectionCour, setFSectionCour] = useState("");
  const [fType, setFType] = useState("");
  const [fEp, setFEp] = useState("");
  const [fFab, setFFab] = useState("");
  const [fProfile, setFProfile] = useState("");
  const [fModele, setFModele] = useState("");
  const [fFini, setFFini] = useState("");

  const [showSettings, setShowSettings] = useState(false);
  const [showResume, setShowResume] = useState(false);
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
  const [reqQtyById, setReqQtyById] = useState({});
  const [reqProjetEnvoye, setReqProjetEnvoye] = useState("");
  const [reqNote, setReqNote] = useState("");
  const [reqSaving, setReqSaving] = useState(false);
  const [reqError, setReqError] = useState("");

  const [reqNombrePanneaux, setReqNombrePanneaux] = useState("");
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

  const filtered = useMemo(() => {
    const nbRaw = String(reqNombrePanneaux ?? "").trim();
    const nbDemande = nbRaw === "" ? null : Number(nbRaw);

    const piedsDemande = Number(reqLongueurPieds);
    const poucesDemandeRaw = String(reqLongueurPouces ?? "").trim();
    const poucesDemande = poucesDemandeRaw === "" ? 0 : Number(poucesDemandeRaw);

    const reqQtyFilter =
      reqMode && nbDemande !== null && Number.isFinite(nbDemande) && nbDemande > 0
        ? nbDemande
        : null;

    const reqLengthFilter =
      reqMode &&
      Number.isFinite(piedsDemande) &&
      piedsDemande > 0 &&
      Number.isFinite(poucesDemande) &&
      poucesDemande >= 0
        ? piedsDemande + poucesDemande / 12
        : null;

    const result = rows.filter((r) => {
      if (fProjet && String(r.projet || "") !== fProjet) return false;
      if (fSectionCour && String(r.sectionCour || "") !== fSectionCour) return false;
      if (fType && String(r.type || "") !== fType) return false;
      if (fEp && String(r.epaisseurPouces || "") !== fEp) return false;
      if (fFab && String(r.fabricant || "") !== fFab) return false;
      if (fProfile && String(r.profile || "") !== fProfile) return false;
      if (fModele && String(r.modele || "") !== fModele) return false;
      if (fFini && String(r.fini || "") !== fFini) return false;

      if (reqQtyFilter !== null) {
        const stock = Number(r.quantite ?? 0);
        if (!Number.isFinite(stock) || stock < reqQtyFilter) return false;
      }

      if (reqLengthFilter !== null) {
        const longueur = lengthFeet(r);
        if (!Number.isFinite(longueur) || longueur < reqLengthFilter) return false;
      }

      return true;
    });

    if (reqLengthFilter !== null) {
      return [...result].sort((a, b) => {
        const la = lengthFeet(a);
        const lb = lengthFeet(b);

        const diffA = Math.abs(la - reqLengthFilter);
        const diffB = Math.abs(lb - reqLengthFilter);

        if (diffA !== diffB) return diffA - diffB;

        return la - lb;
      });
    }

    return result;
  }, [
    rows,
    fProjet,
    fSectionCour,
    fType,
    fEp,
    fFab,
    fProfile,
    fModele,
    fFini,
    reqMode,
    reqNombrePanneaux,
    reqLongueurPieds,
    reqLongueurPouces,
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

  const cols =
    "38px 1.2fr 0.75fr 0.8fr 0.75fr 0.45fr 0.9fr 0.8fr 0.8fr 0.8fr 0.7fr 0.6fr 0.5fr 0.75fr 0.75fr 0.8fr 0.55fr 0.75fr 0.75fr 0.75fr 0.75fr 1fr";

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

  const inputMini = {
    width: "100%",
    minWidth: 0,
    height: 22,
    fontSize: 10,
    padding: "0 4px",
    border: "1px solid #bdbdbd",
    background: "#fff",
    boxSizing: "border-box",
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
    setReqQtyById({});
    setReqProjetEnvoye("");
    setReqNote("");
    setReqSaving(false);
    setReqError("");
    setReqNombrePanneaux("");
    setReqLongueurPieds("");
    setReqLongueurPouces("");
    cancelEdit();
  }

  function closeReqStart() {
    setReqStartOpen(false);
    setReqError("");
  }

  function confirmerStartReqMode() {
    const nbRaw = String(reqNombrePanneaux ?? "").trim();
    const nb = nbRaw === "" ? null : Number(nbRaw);

    const pieds = Number(reqLongueurPieds);
    const poucesRaw = String(reqLongueurPouces ?? "").trim();
    const pouces = poucesRaw === "" ? 0 : Number(poucesRaw);

    if (nbRaw !== "" && (!Number.isFinite(nb) || nb <= 0)) {
      setReqError("Entre un nombre de panneaux valide ou laisse la case vide.");
      return;
    }

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
    setReqQtyById({});
    setReqProjetEnvoye("");
    setReqNote("");
    setReqSaving(false);
    setReqError("");
    setReqNombrePanneaux("");
    setReqLongueurPieds("");
    setReqLongueurPouces("");
  }

  function closeReqConfirm() {
    setReqConfirmOpen(false);
    setReqSaving(false);
    setReqError("");
  }

  function choisirPanneauPourReq(id) {
    const nbRaw = String(reqNombrePanneaux ?? "").trim();
    const nb = nbRaw === "" ? null : Number(nbRaw);
    const qtyDefault = Number.isFinite(nb) && nb > 0 ? nb : 1;

    setReqSelected((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    setReqQtyById((prev) => ({
      ...prev,
      [id]: prev[id] ?? qtyDefault,
    }));
  }

  function retirerPanneauReq(id) {
    setReqSelected((prev) => {
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

    setReqError("");
    setReqConfirmOpen(true);
  }

  async function createReqPanneaux() {
    setReqError("");

    if (reqSelected.size === 0) {
      setReqError("Choisis au moins 1 panneau.");
      return;
    }

    if (!String(reqProjetEnvoye || "").trim()) {
      setReqError("Entre le projet à envoyer.");
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
            quantiteStockAvant: Number(data.quantite ?? 0) || 0,
            quantiteStockApres: (Number(data.quantite ?? 0) || 0) - x.qtyDemandee,
            quantiteDemande: x.qtyDemandee,
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
      alert(`Réquisition créée: ${reqId}`);
    } catch (e) {
      console.error(e);
      setReqError(e?.message || "Erreur lors de la création de la réquisition.");
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
          zIndex: reqMode ? 50 : undefined,
        }}
      >
        <style>
          {`
            @keyframes pulseTerminerSelection {
              0% {
                transform: scale(1);
                box-shadow: 0 0 0 rgba(22, 128, 0, 0.0);
                opacity: 1;
              }
              50% {
                transform: scale(1.035);
                box-shadow: 0 0 22px rgba(22, 128, 0, 0.45);
                opacity: 0.88;
              }
              100% {
                transform: scale(1);
                box-shadow: 0 0 0 rgba(22, 128, 0, 0.0);
                opacity: 1;
              }
            }
          `}
        </style>

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
            zIndex: reqMode ? 50 : undefined,
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
              zIndex: reqMode ? 50 : undefined,
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

              {!reqMode ? (
                <button
                  className="btn"
                  style={{
                    width: 210,
                    minWidth: 210,
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
                  + Créer réquisition
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
                  marginTop: 6,
                  width: 360,
                  maxWidth: "90vw",
                  minHeight: 54,
                  background: "#168000",
                  color: "#fff",
                  border: "2px solid #0f6500",
                  borderRadius: 14,
                  fontWeight: 1000,
                  fontSize: 22,
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  animation: "pulseTerminerSelection 1.8s ease-in-out infinite",
                  position: "relative",
                  zIndex: 80,
                  boxShadow: "0 0 22px rgba(22,128,0,0.45)",
                }}
                onClick={terminerSelectionReq}
              >
                Terminer la sélection ({reqSelected.size})
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
            width: "min(1600px, calc(100vw - 24px))",
            border: "1px solid #f1c40f",
            background: "#fff8d8",
            color: "#4d3b00",
            padding: "10px 12px",
            borderRadius: 12,
            fontWeight: 900,
            fontSize: 13,
            boxSizing: "border-box",
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span>
            Mode réquisition actif : le tableau montre seulement les panneaux avec au moins{" "}
            <b>{reqNombrePanneaux || "?"}</b> en stock et une longueur minimum de{" "}
            <b>
              {reqLongueurPieds || "?"} pi {reqLongueurPouces || 0} po
            </b>
            . Clique sur <b>Choisir</b>, puis sur <b>Terminer la sélection</b>.
          </span>

          {reqError ? <span style={{ color: "#c40000" }}>{reqError}</span> : null}
        </div>
      ) : null}

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
            gridTemplateColumns: "repeat(8, minmax(0, 1fr))",
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
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Section dans la cour</div>
            <select
              className="selectGray"
              style={{ width: "100%" }}
              value={fSectionCour}
              onChange={(e) => setFSectionCour(e.target.value)}
            >
              {sectionsCour.map((s) => (
                <option key={s} value={s}>
                  {s}
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

          <div>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Profile</div>
            <select
              className="selectGray"
              style={{ width: "100%" }}
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
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Modèle</div>
            <select
              className="selectGray"
              style={{ width: "100%" }}
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
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Fini</div>
            <select
              className="selectGray"
              style={{ width: "100%" }}
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

      <div
        className="tableZone tableZone--center"
        style={{
          paddingTop: 0,
          paddingLeft: reqMode ? 12 : undefined,
          paddingRight: reqMode ? 12 : undefined,
          boxSizing: "border-box",
        }}
      >
        <div
          className="tableBox tableBox--wide"
          style={{
            height: "calc(100vh - 220px)",
            overflow: "hidden",
            border: reqMode ? "3px solid #1e5eff" : undefined,
            boxShadow: reqMode
              ? "0 0 0 9999px rgba(0,0,0,0.25), 0 18px 40px rgba(0,0,0,0.25)"
              : undefined,
            borderRadius: reqMode ? 14 : undefined,
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
                borderBottom: "2px solid #0a2f60",
                fontSize: 10,
              }}
            >
              {[
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
                "Prix unit.",
                "PC",
                "Valeur",
                "Vente min.",
                "Sug. sans",
                "Sug. avec",
                reqMode ? "Choisir" : "Actions",
              ].map((h, idx, arr) => (
                <div
                  key={`${h}-${idx}`}
                  style={{
                    ...(idx === arr.length - 1 ? lastCell : baseCell),
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    boxSizing: "border-box",
                    minHeight: 42,
                  }}
                >
                  {h}
                </div>
              ))}
            </div>

            {loading ? (
              <div style={{ padding: 12 }}>Chargement...</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 12 }}>
                {reqMode
                  ? "(Aucun panneau ne correspond au nombre et à la longueur demandés)"
                  : "(Aucune donnée)"}
              </div>
            ) : (
              filtered.map((r, i) => {
                const isEditing = editingId === r.id;
                const chosen = reqSelected.has(r.id);
                const checked = r.checked === true;
                const reqQty = reqQtyById[r.id] ?? 1;

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
                  rowForCalc.longueurPieds != null && rowForCalc.longueurPieds !== ""
                    ? `${rowForCalc.longueurPieds},${String(rowForCalc.longueurPouces ?? 0)}`
                    : "";

                const rowBg = chosen
                  ? "#e9ffe6"
                  : checked
                  ? "#fff3a6"
                  : i % 2 === 1
                  ? "#f4f4f4"
                  : "#fff";

                return (
                  <div
                    key={r.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: cols,
                      alignItems: "stretch",
                      width: "100%",
                      boxSizing: "border-box",
                      borderBottom: "1px solid #d9d9d9",
                      fontSize: 10,
                      background: rowBg,
                    }}
                  >
                    <div
                      style={{
                        ...baseCell,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
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

                    <div style={{ ...baseCell, fontWeight: 800 }}>
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

                    <div
                      style={{
                        ...baseCell,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {isEditing ? (
                        <select
                          style={inputMini}
                          value={editRow?.sectionCour ?? ""}
                          onChange={(e) => onEditChange("sectionCour", e.target.value)}
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

                    <div style={baseCell}>
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

                    <div style={baseCell}>
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

                    <div
                      style={{
                        ...baseCell,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {isEditing ? (
                        <select
                          style={inputMini}
                          value={editRow?.epaisseurPouces ?? ""}
                          onChange={(e) => onEditChange("epaisseurPouces", e.target.value)}
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

                    <div style={baseCell}>
                      {isEditing ? (
                        <input
                          style={inputMini}
                          value={editRow?.fabricant ?? ""}
                          onChange={(e) => onEditChange("fabricant", e.target.value)}
                        />
                      ) : (
                        r.fabricant || ""
                      )}
                    </div>

                    <div style={baseCell}>
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

                    <div style={baseCell}>
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

                    <div style={baseCell}>
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

                    <div style={{ ...baseCell, display: "flex", gap: 2 }}>
                      {isEditing ? (
                        <>
                          <input
                            style={inputMini}
                            value={editRow?.longueurPieds ?? ""}
                            onChange={(e) => onEditChange("longueurPieds", e.target.value)}
                            inputMode="numeric"
                            placeholder="pi"
                          />
                          <input
                            style={inputMini}
                            value={editRow?.longueurPouces ?? ""}
                            onChange={(e) => onEditChange("longueurPouces", e.target.value)}
                            inputMode="numeric"
                            placeholder="po"
                          />
                        </>
                      ) : (
                        <div style={{ width: "100%", textAlign: "center" }}>{longTxt}</div>
                      )}
                    </div>

                    <div
                      style={{
                        ...baseCell,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {isEditing ? (
                        <input
                          style={inputMini}
                          value={editRow?.largeurPouces ?? ""}
                          onChange={(e) => onEditChange("largeurPouces", e.target.value)}
                          inputMode="numeric"
                        />
                      ) : (
                        r.largeurPouces || ""
                      )}
                    </div>

                    <div
                      style={{
                        ...baseCell,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                      }}
                    >
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

                    <div style={baseCell}>
                      {isEditing ? (
                        <input
                          style={inputMini}
                          value={editRow?.faceExterieure ?? ""}
                          onChange={(e) => onEditChange("faceExterieure", e.target.value)}
                        />
                      ) : (
                        r.faceExterieure || ""
                      )}
                    </div>

                    <div style={baseCell}>
                      {isEditing ? (
                        <input
                          style={inputMini}
                          value={editRow?.faceInterieure ?? ""}
                          onChange={(e) => onEditChange("faceInterieure", e.target.value)}
                        />
                      ) : (
                        r.faceInterieure || ""
                      )}
                    </div>

                    <div
                      style={{
                        ...baseCell,
                        textAlign: "right",
                        fontWeight: 800,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                      }}
                    >
                      {money(prix)}
                    </div>

                    <div
                      style={{
                        ...baseCell,
                        textAlign: "right",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                      }}
                    >
                      {num(pc, 2)}
                    </div>

                    <div
                      style={{
                        ...baseCell,
                        textAlign: "right",
                        fontWeight: 800,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                      }}
                    >
                      {money(val)}
                    </div>

                    <div
                      style={{
                        ...baseCell,
                        textAlign: "right",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                      }}
                    >
                      {money(pvMin)}
                    </div>

                    <div
                      style={{
                        ...baseCell,
                        textAlign: "right",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                      }}
                    >
                      {money(psSans)}
                    </div>

                    <div
                      style={{
                        ...baseCell,
                        textAlign: "right",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                      }}
                    >
                      {money(psAvec)}
                    </div>

                    <div
                      style={{
                        ...lastCell,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 4,
                        flexWrap: "wrap",
                      }}
                    >
                      {reqMode ? (
                        chosen ? (
                          <>
                            <input
                              type="number"
                              min={1}
                              value={reqQty}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setReqQtyById((prev) => ({
                                  ...prev,
                                  [r.id]: Number.isFinite(v) ? v : 1,
                                }));
                              }}
                              style={{
                                width: 42,
                                height: 22,
                                fontSize: 10,
                                padding: 0,
                                textAlign: "center",
                                fontWeight: 900,
                                border: "1px solid #888",
                                borderRadius: 4,
                              }}
                              title="Quantité demandée"
                            />

                            <button
                              className="btn"
                              style={{
                                width: 52,
                                height: 22,
                                fontSize: 10,
                                padding: 0,
                                border: "1px solid #d33",
                                background: "#fff",
                                color: "#d33",
                                fontWeight: 900,
                              }}
                              onClick={() => retirerPanneauReq(r.id)}
                              title="Retirer"
                            >
                              Retirer
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn"
                            style={{
                              width: 62,
                              height: 22,
                              fontSize: 10,
                              padding: 0,
                              border: "1px solid #168000",
                              background: "#168000",
                              color: "#fff",
                              fontWeight: 900,
                            }}
                            onClick={() => choisirPanneauPourReq(r.id)}
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
                              width: 52,
                              height: 22,
                              fontSize: 10,
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
                              width: 52,
                              height: 22,
                              fontSize: 10,
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
                              width: 54,
                              height: 22,
                              fontSize: 10,
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
                              width: 20,
                              height: 20,
                              minWidth: 20,
                              fontSize: 11,
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
          onClick={(e) => {
            if (e.target === e.currentTarget) closeReqStart();
          }}
        >
          <div
            style={{
              width: "min(520px, 95vw)",
              background: "#fff",
              borderRadius: 16,
              boxShadow: "0 18px 40px rgba(0,0,0,0.25)",
              border: "1px solid rgba(0,0,0,0.08)",
              overflow: "hidden",
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
                Nouvelle réquisition panneaux
              </div>

              <button
                onClick={closeReqStart}
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

            <div style={{ padding: 16, display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 900 }}>
                  Nombre de panneaux voulu
                </div>

                <input
                  type="number"
                  min={1}
                  value={reqNombrePanneaux}
                  onChange={(e) => setReqNombrePanneaux(e.target.value)}
                  placeholder="Optionnel"
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
                <div style={{ fontSize: 13, fontWeight: 900 }}>
                  Longueur minimum voulue
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>
                      Pieds
                    </div>
                    <input
                      type="number"
                      min={1}
                      value={reqLongueurPieds}
                      onChange={(e) => setReqLongueurPieds(e.target.value)}
                      style={{
                        width: "100%",
                        height: 40,
                        borderRadius: 10,
                        border: "1px solid #ddd",
                        padding: "0 10px",
                        fontSize: 14,
                        fontWeight: 800,
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>
                      Pouces
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={11}
                      value={reqLongueurPouces}
                      onChange={(e) => setReqLongueurPouces(e.target.value)}
                      style={{
                        width: "100%",
                        height: 40,
                        borderRadius: 10,
                        border: "1px solid #ddd",
                        padding: "0 10px",
                        fontSize: 14,
                        fontWeight: 800,
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                </div>
              </div>

              {reqError ? (
                <div
                  style={{
                    border: "1px solid #ffd2d2",
                    background: "#fff5f5",
                    color: "#c40000",
                    padding: 10,
                    borderRadius: 12,
                    fontWeight: 800,
                    fontSize: 13,
                  }}
                >
                  {reqError}
                </div>
              ) : null}
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
                onClick={closeReqStart}
                style={{
                  height: 38,
                  padding: "0 14px",
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
                  height: 38,
                  padding: "0 16px",
                  borderRadius: 12,
                  border: "1px solid #1e5eff",
                  background: "#1e5eff",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                Confirmer
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
          onClick={(e) => {
            if (e.target === e.currentTarget) closeReqConfirm();
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
                    const longTxt =
                      it.longueurPieds != null && it.longueurPieds !== ""
                        ? `${it.longueurPieds},${String(it.longueurPouces ?? 0)}`
                        : "";

                    return (
                      <div
                        key={it.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 120px",
                          gap: 10,
                          alignItems: "center",
                          padding: "8px 10px",
                          borderRadius: 12,
                          border: "1px solid #eee",
                          background: "#fff",
                        }}
                      >
                        <div style={{ fontSize: 13, overflow: "hidden" }}>
                          <div
                            style={{
                              fontWeight: 900,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {it.type || "(sans type)"} — {it.epaisseurPouces || ""}" —{" "}
                            {it.fabricant || ""}
                          </div>

                          <div style={{ color: "#666", fontSize: 12 }}>
                            Projet source: {it.projet || ""} • Section {it.sectionCour || "—"} •{" "}
                            {longTxt} x {it.largeurPouces || ""} • Stock: {it.quantite ?? ""}
                          </div>

                          <div style={{ color: "#666", fontSize: 12 }}>
                            Profile: {it.profile || "—"} • Modèle: {it.modele || "—"} • Fini:{" "}
                            {it.fini || "—"}
                          </div>
                        </div>

                        <input
                          type="number"
                          min={1}
                          value={reqQtyById[it.id] ?? 1}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setReqQtyById((p) => ({
                              ...p,
                              [it.id]: Number.isFinite(v) ? v : 1,
                            }));
                          }}
                          style={{
                            height: 34,
                            borderRadius: 10,
                            border: "1px solid #ddd",
                            padding: "0 10px",
                            fontWeight: 800,
                            textAlign: "center",
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>
                  Projet à envoyer + note
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>Projet à envoyer</div>
                  <input
                    value={reqProjetEnvoye}
                    onChange={(e) => setReqProjetEnvoye(e.target.value)}
                    style={{
                      height: 36,
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      padding: "0 10px",
                      fontSize: 13,
                    }}
                  />

                  <div style={{ fontSize: 13, fontWeight: 800, marginTop: 6 }}>Note</div>
                  <textarea
                    value={reqNote}
                    onChange={(e) => setReqNote(e.target.value)}
                    placeholder="Note (optionnel)"
                    rows={4}
                    style={{
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      padding: 10,
                      fontSize: 13,
                      resize: "vertical",
                    }}
                  />
                </div>
              </div>

              {reqError ? (
                <div
                  style={{
                    border: "1px solid #ffd2d2",
                    background: "#fff5f5",
                    color: "#c40000",
                    padding: 10,
                    borderRadius: 12,
                    fontWeight: 800,
                    fontSize: 13,
                  }}
                >
                  {reqError}
                </div>
              ) : null}
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
                  opacity: reqSaving ? 0.7 : 1,
                }}
              >
                Retour sélection
              </button>

              <button
                onClick={createReqPanneaux}
                disabled={reqSaving}
                style={{
                  height: 38,
                  padding: "0 14px",
                  borderRadius: 12,
                  border: "1px solid #1e5eff",
                  background: "#1e5eff",
                  color: "#fff",
                  cursor: reqSaving ? "default" : "pointer",
                  fontWeight: 900,
                  opacity: reqSaving ? 0.7 : 1,
                }}
              >
                {reqSaving ? "Enregistrement..." : "Créer la réquisition"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
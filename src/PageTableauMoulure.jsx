import React, { useEffect, useMemo, useState } from "react";
import "./pageRetourMateriaux.css";
import DessinCanvas from "./DessinCanvas";
import { db, storage, auth } from "./firebaseConfig";
import { CLIENT_ID } from "./appClient";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
  deleteDoc,
  updateDoc,
  addDoc,
} from "firebase/firestore";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import MouluresExcelButton from "./MouluresExcelButton.jsx";

const SECTIONS_COUR = ["", "1", "2", "3", "4", "5", "6"];

function currentUserInfo() {
  const user = auth?.currentUser || null;

  return {
    uid: user?.uid || "",
    email: user?.email || "",
    name: user?.displayName || user?.email || "Utilisateur inconnu",
  };
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

function moulureShortLabel(m) {
  return [
    m.materiel || "Moulure",
    m.calibre ? `calibre ${m.calibre}` : "",
    m.quantite !== undefined && m.quantite !== "" ? `Qté ${m.quantite}` : "",
    m.sectionCour ? `Section ${m.sectionCour}` : "",
    m.projet ? `Projet ${m.projet}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export default function PageTableauMoulure({ onRetour, onGoRequisition }) {
  const [banque, setBanque] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [modalUrl, setModalUrl] = useState(null);

  const [filters, setFilters] = useState({
    projet: "",
    sectionCour: "",
    date: "",
    materiel: "",
    calibre: "",
  });

  const [reqMode, setReqMode] = useState(false);
  const [reqConfirmOpen, setReqConfirmOpen] = useState(false);
  const [reqSelected, setReqSelected] = useState(() => new Set());
  const [reqQtyById, setReqQtyById] = useState({});
  const [reqProjetEnvoye, setReqProjetEnvoye] = useState("");
  const [reqNote, setReqNote] = useState("");
  const [reqSaving, setReqSaving] = useState(false);
  const [reqError, setReqError] = useState("");

  const [deletingId, setDeletingId] = useState(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [oldRowBeforeEdit, setOldRowBeforeEdit] = useState(null);

  const [editForm, setEditForm] = useState({
    id: "",
    projet: "",
    date: "",
    categorie: "",
    materiel: "",
    calibre: "",
    sectionCour: "",
    quantite: "",
    dessinUrl: "",
    dessinPath: "",
  });

  const [drawEditOpen, setDrawEditOpen] = useState(false);
  const [drawMode, setDrawMode] = useState("line");
  const [drawClearSignal, setDrawClearSignal] = useState(0);
  const [drawUndoSignal, setDrawUndoSignal] = useState(0);
  const [editNewDessinPng, setEditNewDessinPng] = useState(null);

  useEffect(() => {
    const q = query(
      collection(db, "clients", CLIENT_ID, "banqueMoulures"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => setBanque(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error(err)
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") {
        setModalUrl(null);
        if (drawEditOpen) closeDrawEdit();
        if (reqConfirmOpen) closeReqConfirm();
        if (editOpen) closeEdit();
      }
    }

    if (modalUrl || reqConfirmOpen || editOpen || drawEditOpen) {
      window.addEventListener("keydown", onKeyDown);
    }

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalUrl, reqConfirmOpen, editOpen, drawEditOpen]);

  function setFilterField(name, value) {
    setFilters((prev) => ({ ...prev, [name]: value }));
  }

  function clearFilters() {
    setFilters({
      projet: "",
      sectionCour: "",
      date: "",
      materiel: "",
      calibre: "",
    });
  }

  function uniqueValues(field) {
    const values = banque
      .map((x) => String(x?.[field] ?? "").trim())
      .filter(Boolean);

    return Array.from(new Set(values)).sort((a, b) =>
      a.localeCompare(b, "fr", { numeric: true, sensitivity: "base" })
    );
  }

  const projetOptions = useMemo(() => uniqueValues("projet"), [banque]);
  const materielOptions = useMemo(() => uniqueValues("materiel"), [banque]);
  const calibreOptions = useMemo(() => uniqueValues("calibre"), [banque]);

  const filteredBanque = useMemo(() => {
    return banque.filter((a) => {
      const projetOk = !filters.projet || String(a.projet || "") === filters.projet;
      const sectionOk =
        !filters.sectionCour || String(a.sectionCour || "") === filters.sectionCour;
      const dateOk = !filters.date || String(a.date || "") === filters.date;
      const materielOk =
        !filters.materiel || String(a.materiel || "") === filters.materiel;
      const calibreOk = !filters.calibre || String(a.calibre || "") === filters.calibre;

      return projetOk && sectionOk && dateOk && materielOk && calibreOk;
    });
  }, [banque, filters]);

  function startReqMode() {
    setReqMode(true);
    setReqConfirmOpen(false);
    setReqSelected(new Set());
    setReqQtyById({});
    setReqProjetEnvoye("");
    setReqNote("");
    setReqSaving(false);
    setReqError("");
  }

  function cancelReqMode() {
    setReqMode(false);
    setReqConfirmOpen(false);
    setReqSelected(new Set());
    setReqQtyById({});
    setReqProjetEnvoye("");
    setReqNote("");
    setReqSaving(false);
    setReqError("");
  }

  function closeReqConfirm() {
    setReqConfirmOpen(false);
    setReqSaving(false);
    setReqError("");
  }

  function choisirMoulurePourReq(id) {
    setReqSelected((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    setReqQtyById((prev) => ({
      ...prev,
      [id]: prev[id] ?? 1,
    }));
  }

  function retirerMoulureReq(id) {
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
      setReqError("Choisis au moins 1 moulure.");
      return;
    }

    setReqError("");
    setReqConfirmOpen(true);
  }

  const reqSelectedList = useMemo(() => {
    const ids = Array.from(reqSelected);
    const map = new Map(banque.map((x) => [x.id, x]));
    return ids.map((id) => map.get(id)).filter(Boolean);
  }, [reqSelected, banque]);

  function openEdit(row) {
    setOldRowBeforeEdit({ ...row });

    setEditForm({
      id: row.id || "",
      projet: row.projet || "",
      date: row.date || "",
      categorie: row.categorie || "",
      materiel: row.materiel || "",
      calibre: row.calibre || "",
      sectionCour: row.sectionCour || "",
      quantite: row.quantite ?? "",
      dessinUrl: row.dessinUrl || "",
      dessinPath: row.dessinPath || "",
    });

    setEditNewDessinPng(null);
    setDrawMode("line");
    setDrawClearSignal((n) => n + 1);
    setDrawUndoSignal(0);

    setEditError("");
    setEditSaving(false);
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditSaving(false);
    setEditError("");
    setEditNewDessinPng(null);
    setDrawEditOpen(false);
    setOldRowBeforeEdit(null);
    setEditForm({
      id: "",
      projet: "",
      date: "",
      categorie: "",
      materiel: "",
      calibre: "",
      sectionCour: "",
      quantite: "",
      dessinUrl: "",
      dessinPath: "",
    });
  }

  function openDrawEdit() {
    setDrawMode("line");
    setDrawClearSignal((n) => n + 1);
    setDrawUndoSignal(0);
    setEditNewDessinPng(null);
    setDrawEditOpen(true);
  }

  function closeDrawEdit() {
    setDrawEditOpen(false);
  }

  function confirmerNouveauDessin() {
    if (!editNewDessinPng) {
      alert("Fais un dessin avant de confirmer.");
      return;
    }

    setDrawEditOpen(false);
  }

  function setEditField(name, value) {
    setEditForm((prev) => ({ ...prev, [name]: value }));
  }

  async function uploadNewDessinIfNeeded(id) {
    if (!editNewDessinPng) {
      return {
        dessinUrl: String(editForm.dessinUrl || "").trim(),
        dessinPath: String(editForm.dessinPath || "").trim(),
      };
    }

    const isWebp = editNewDessinPng.startsWith("data:image/webp");
    const ext = isWebp ? "webp" : "jpg";
    const contentType = isWebp ? "image/webp" : "image/jpeg";

    const dessinPath = `clients/${CLIENT_ID}/banqueMoulures/${id}-edit-${Date.now()}.${ext}`;
    const storageRef = ref(storage, dessinPath);

    await uploadString(storageRef, editNewDessinPng, "data_url", {
      contentType,
      cacheControl: "public,max-age=31536000,immutable",
    });

    const dessinUrl = await getDownloadURL(storageRef);

    return { dessinUrl, dessinPath };
  }

  async function confirmerModification() {
    const id = String(editForm.id || "").trim();
    const projet = String(editForm.projet || "").trim();
    const date = String(editForm.date || "").trim();
    const categorie = String(editForm.categorie || "").trim();
    const materiel = String(editForm.materiel || "").trim();
    const calibre = String(editForm.calibre || "").trim();
    const sectionCour = String(editForm.sectionCour || "").trim();
    const quantiteNum = Number(editForm.quantite);

    if (!id) return setEditError("Document introuvable.");
    if (!projet) return setEditError("Entre un projet.");
    if (!date) return setEditError("Entre une date.");
    if (!categorie) return setEditError("Entre une catégorie.");
    if (!materiel) return setEditError("Entre un matériel.");
    if (!calibre) return setEditError("Entre un calibre.");
    if (!sectionCour) return setEditError("Choisis une section de cour.");
    if (!Number.isFinite(quantiteNum) || quantiteNum < 0) {
      return setEditError("Entre une quantité valide.");
    }

    const oldRow = oldRowBeforeEdit || banque.find((x) => x.id === id) || {};

    const ok = window.confirm("Confirmer les modifications de cette moulure ?");
    if (!ok) return;

    setEditSaving(true);
    setEditError("");

    try {
      const actor = currentUserInfo();
      const { dessinUrl, dessinPath } = await uploadNewDessinIfNeeded(id);

      const newData = {
        projet,
        date,
        categorie,
        materiel,
        calibre,
        sectionCour,
        quantite: quantiteNum,
        dessinUrl,
        dessinPath,
      };

      const afterForCompare = {
        ...oldRow,
        ...newData,
      };

      const compareFields = [
        "projet",
        "date",
        "categorie",
        "materiel",
        "calibre",
        "sectionCour",
        "quantite",
        "dessinUrl",
      ];

      const changes = buildChanges(oldRow, afterForCompare, compareFields);

      if (Object.keys(changes).length === 0) {
        closeEdit();
        return;
      }

      await updateDoc(doc(db, "clients", CLIENT_ID, "banqueMoulures", id), {
        ...newData,

        updatedByUid: actor.uid,
        updatedByEmail: actor.email,
        updatedByName: actor.name,

        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, "clients", CLIENT_ID, "historique"), {
        action: "moulure_modification",
        titre: "Moulure modifiée",
        module: "moulures",
        cibleId: id,
        cibleType: "banqueMoulures",
        description: `Moulure modifiée : ${moulureShortLabel(afterForCompare)}`,

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

      closeEdit();
    } catch (e) {
      console.error(e);
      setEditError("Erreur lors de la modification.");
    } finally {
      setEditSaving(false);
    }
  }

  async function supprimerMoulure(id) {
    if (!id) return;

    const ok = window.confirm("Veux-tu vraiment supprimer cette moulure ?");
    if (!ok) return;

    setDeletingId(id);

    try {
      await deleteDoc(doc(db, "clients", CLIENT_ID, "banqueMoulures", id));
      if (selectedId === id) setSelectedId(null);
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la suppression.");
    } finally {
      setDeletingId(null);
    }
  }

  async function createReq() {
    setReqError("");

    if (reqSelected.size === 0) {
      setReqError("Choisis au moins 1 moulure.");
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
      const counterRef = doc(db, "clients", CLIENT_ID, "_counters", "reqMoulures");

      const { reqId, reqNum } = await runTransaction(db, async (tx) => {
        const counterSnap = await tx.get(counterRef);
        const next = counterSnap.exists() ? Number(counterSnap.data()?.next ?? 1) : 1;
        const reqNum = Number.isFinite(next) && next > 0 ? next : 1;
        const reqId = `reqmoul${reqNum}`;

        const itemRefs = reqSelectedList.map((it) => ({
          item: it,
          ref: doc(db, "clients", CLIENT_ID, "banqueMoulures", it.id),
          qtyDemandee: Number(reqQtyById[it.id] ?? 1) || 1,
        }));

        const itemSnaps = [];

        for (const x of itemRefs) {
          const snap = await tx.get(x.ref);
          itemSnaps.push({ ...x, snap });
        }

        for (const x of itemSnaps) {
          if (!x.snap.exists()) {
            throw new Error(`La moulure ${x.item.id} n'existe plus.`);
          }

          const data = x.snap.data();
          const stockActuel = Number(data.quantite ?? 0);

          if (!Number.isFinite(stockActuel)) {
            throw new Error(`Quantité invalide pour la moulure ${x.item.id}.`);
          }

          if (x.qtyDemandee > stockActuel) {
            throw new Error(
              `Quantité insuffisante pour ${data.materiel || "moulure"}. Stock: ${stockActuel}, demandé: ${x.qtyDemandee}.`
            );
          }
        }

        const items = itemSnaps.map((x) => {
          const data = x.snap.data();

          return {
            banqueId: x.item.id,
            projetSource: data.projet || "",
            date: data.date || "",
            categorie: data.categorie || "",
            materiel: data.materiel || "",
            calibre: data.calibre || "",
            sectionCour: data.sectionCour || "",
            dessinUrl: data.dessinUrl || "",
            dessinPath: data.dessinPath || "",
            quantiteStockAvant: Number(data.quantite ?? 0) || 0,
            quantiteStockApres: (Number(data.quantite ?? 0) || 0) - x.qtyDemandee,
            quantiteDemande: x.qtyDemandee,
          };
        });

        const reqRef = doc(db, "clients", CLIENT_ID, "requisitionsMoulures", reqId);
        const histRef = doc(collection(db, "clients", CLIENT_ID, "historique"));

        tx.set(counterRef, { next: reqNum + 1 }, { merge: true });

        tx.set(reqRef, {
          reqId,
          reqNum,
          type: "moulures",
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
          action: "requisition_moulures_creation",
          titre: "Réquisition moulures créée",
          module: "requisitions",
          cibleId: reqId,
          cibleType: "requisitionsMoulures",
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

      if (typeof onGoRequisition === "function") {
        onGoRequisition(reqId);
      } else {
        alert(`Réquisition créée: ${reqId}`);
      }
    } catch (e) {
      console.error(e);
      setReqError(e?.message || "Erreur lors de la création de la réquisition.");
    } finally {
      setReqSaving(false);
    }
  }

  const gridCols = "170px 130px 120px 170px 110px 110px 160px 190px";
  const tableMinWidth = 1160;

  const filterInputStyle = {
    width: "100%",
    height: 32,
    borderRadius: 8,
    border: "1px solid #cfd8e3",
    padding: "0 8px",
    fontSize: 12,
    fontWeight: 700,
    boxSizing: "border-box",
    background: "#fff",
  };

  return (
    <div
      className="pageRM pageRM--full"
      style={{
        background: reqMode ? "#d9dde5" : undefined,
        transition: "background 0.2s ease",
      }}
    >
      <div className="topBar topBar--full">
        <div className="leftLinks">
          <button className="btn" style={{ width: 180, height: 34 }} onClick={onRetour}>
            ↩ Retour (Ajout)
          </button>
        </div>
      </div>

      <div className="titleRow titleRow--full">
        <div />
        <div
          className="bigTitle"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            width: "100%",
            flexWrap: "wrap",
          }}
        >
          <span>Tableau Moulure</span>

          {!reqMode ? (
            <button
              onClick={startReqMode}
              style={{
                height: 36,
                padding: "0 14px",
                borderRadius: 10,
                border: "1px solid #1e5eff",
                background: "#1e5eff",
                color: "#fff",
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 6px 14px rgba(30,94,255,0.18)",
                fontSize: 13,
              }}
              title="Créer une réquisition"
            >
              + Créer une réquisition
            </button>
          ) : (
            <>
              <button
                onClick={terminerSelectionReq}
                style={{
                  height: 36,
                  padding: "0 14px",
                  borderRadius: 10,
                  border: "1px solid #168000",
                  background: "#168000",
                  color: "#fff",
                  fontWeight: 900,
                  cursor: "pointer",
                  boxShadow: "0 6px 14px rgba(22,128,0,0.18)",
                  fontSize: 13,
                }}
              >
                Terminer la sélection ({reqSelected.size})
              </button>

              <button
                onClick={cancelReqMode}
                style={{
                  height: 36,
                  padding: "0 14px",
                  borderRadius: 10,
                  border: "1px solid #d33",
                  background: "#fff",
                  color: "#d33",
                  fontWeight: 900,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Annuler
              </button>
            </>
          )}

          <MouluresExcelButton rows={filteredBanque} />
        </div>
        <div />
      </div>

      {reqMode ? (
        <div
          style={{
            margin: "0 auto 10px auto",
            width: "min(1160px, calc(100vw - 24px))",
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
            Mode réquisition actif : clique sur <b>Choisir</b>, entre la quantité,
            puis clique sur <b>Terminer la sélection</b>.
          </span>

          {reqError ? <span style={{ color: "#c40000" }}>{reqError}</span> : null}
        </div>
      ) : null}

      <div
        className="tableZone tableZone--center"
        style={{
          width: "100%",
          maxWidth: "100vw",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
          padding: reqMode ? "12px" : undefined,
          boxSizing: "border-box",
        }}
      >
        <div
          className="tableBox tableBox--full"
          style={{
            minWidth: tableMinWidth,
            opacity: reqMode ? 1 : 1,
            border: reqMode ? "3px solid #1e5eff" : undefined,
            boxShadow: reqMode
              ? "0 0 0 9999px rgba(0,0,0,0.25), 0 18px 40px rgba(0,0,0,0.25)"
              : undefined,
            borderRadius: reqMode ? 14 : undefined,
            overflow: "hidden",
            background: "#fff",
            position: "relative",
            zIndex: reqMode ? 2 : undefined,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: gridCols,
              alignItems: "center",
              gap: 0,
              padding: "8px 8px",
              borderBottom: "1px solid #d9e2ef",
              background: "#f6f9ff",
              minWidth: tableMinWidth,
            }}
          >
            <div style={{ paddingRight: 8 }}>
              <select
                value={filters.projet}
                onChange={(e) => setFilterField("projet", e.target.value)}
                style={filterInputStyle}
              >
                <option value="">Projet</option>
                {projetOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ paddingRight: 8 }}>
              <select
                value={filters.sectionCour}
                onChange={(e) => setFilterField("sectionCour", e.target.value)}
                style={filterInputStyle}
              >
                <option value="">Section cour</option>
                {SECTIONS_COUR.filter(Boolean).map((s) => (
                  <option key={s} value={s}>
                    Section {s}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ paddingRight: 8 }}>
              <input
                type="date"
                value={filters.date}
                onChange={(e) => setFilterField("date", e.target.value)}
                style={filterInputStyle}
              />
            </div>

            <div style={{ paddingRight: 8 }}>
              <select
                value={filters.materiel}
                onChange={(e) => setFilterField("materiel", e.target.value)}
                style={filterInputStyle}
              >
                <option value="">Matériel</option>
                {materielOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ paddingRight: 8 }}>
              <select
                value={filters.calibre}
                onChange={(e) => setFilterField("calibre", e.target.value)}
                style={{ ...filterInputStyle, textAlign: "center" }}
              >
                <option value="">Calibre</option>
                {calibreOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ textAlign: "center", color: "#777", fontSize: 12, fontWeight: 800 }}>
              Quantité
            </div>

            <div style={{ textAlign: "center", color: "#777", fontSize: 12, fontWeight: 800 }}>
              Dessin
            </div>

            <div style={{ display: "flex", justifyContent: "center" }}>
              <button
                onClick={clearFilters}
                style={{
                  height: 32,
                  padding: "0 12px",
                  borderRadius: 9,
                  border: "1px solid #cfd8e3",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 900,
                }}
                title="Réinitialiser les filtres"
              >
                Réinitialiser
              </button>
            </div>
          </div>

          <div className="tableHeader" style={{ gridTemplateColumns: gridCols }}>
            <div>Projet</div>
            <div>Section cour</div>
            <div>Date</div>
            <div>Matériel</div>
            <div>Calibre</div>
            <div>Quantité</div>
            <div>Dessin</div>
            <div style={{ textAlign: "center" }}>{reqMode ? "Choisir" : "Actions"}</div>
          </div>

          <div className="tableScroll">
            {filteredBanque.length === 0 ? (
              <div className="tableBody" style={{ padding: 10 }}>
                {banque.length === 0 ? "(Banque vide)" : "(Aucun résultat avec les filtres)"}
              </div>
            ) : (
              filteredBanque.map((a) => {
                const selected = a.id === selectedId;
                const chosen = reqSelected.has(a.id);
                const qty = reqQtyById[a.id] ?? 1;

                return (
                  <div
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: gridCols,
                      alignItems: "center",
                      borderBottom: "1px solid #eee",
                      background: chosen ? "#e9ffe6" : selected ? "#dfefff" : "#fff",
                      cursor: "pointer",
                      padding: "6px 8px",
                      fontSize: 13,
                      minWidth: tableMinWidth,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {a.projet || ""}
                    </div>

                    <div style={{ textAlign: "center", fontWeight: 800 }}>
                      {a.sectionCour || "—"}
                    </div>

                    <div>{a.date || ""}</div>
                    <div>{a.materiel || ""}</div>
                    <div style={{ textAlign: "center" }}>{a.calibre || ""}</div>
                    <div style={{ textAlign: "center", fontWeight: 700 }}>{a.quantite ?? ""}</div>

                    <div style={{ display: "flex", justifyContent: "center" }}>
                      {a.dessinUrl ? (
                        <img
                          src={a.dessinUrl}
                          alt="dessin"
                          loading="lazy"
                          decoding="async"
                          onClick={(e) => {
                            e.stopPropagation();
                            setModalUrl(a.dessinUrl);
                          }}
                          title="Cliquer pour agrandir"
                          style={{
                            width: 120,
                            height: 60,
                            objectFit: "contain",
                            border: "1px solid #ddd",
                            background: "#fff",
                            cursor: "zoom-in",
                          }}
                        />
                      ) : (
                        <span style={{ color: "#999" }}>—</span>
                      )}
                    </div>

                    <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                      {reqMode ? (
                        chosen ? (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                              flexWrap: "wrap",
                            }}
                          >
                            <input
                              type="number"
                              min={1}
                              value={qty}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setReqQtyById((prev) => ({
                                  ...prev,
                                  [a.id]: Number.isFinite(v) ? v : 1,
                                }));
                              }}
                              style={{
                                width: 58,
                                height: 32,
                                borderRadius: 9,
                                border: "1px solid #bbb",
                                textAlign: "center",
                                fontWeight: 900,
                                fontSize: 12,
                              }}
                              title="Quantité demandée"
                            />

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                retirerMoulureReq(a.id);
                              }}
                              title="Retirer"
                              style={{
                                height: 32,
                                borderRadius: 9,
                                border: "1px solid #d33",
                                background: "#fff",
                                color: "#d33",
                                fontWeight: 900,
                                fontSize: 12,
                                cursor: "pointer",
                                padding: "0 8px",
                              }}
                            >
                              Retirer
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              choisirMoulurePourReq(a.id);
                            }}
                            title="Choisir"
                            style={{
                              minWidth: 82,
                              height: 34,
                              borderRadius: 10,
                              border: "1px solid #168000",
                              background: "#168000",
                              color: "#fff",
                              fontWeight: 900,
                              fontSize: 12,
                              cursor: "pointer",
                              padding: "0 10px",
                            }}
                          >
                            Choisir
                          </button>
                        )
                      ) : (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(a);
                            }}
                            title="Modifier"
                            style={{
                              minWidth: 82,
                              height: 34,
                              borderRadius: 10,
                              border: "1px solid #1e5eff",
                              background: "#1e5eff",
                              color: "#fff",
                              fontWeight: 800,
                              fontSize: 12,
                              cursor: "pointer",
                              padding: "0 10px",
                            }}
                          >
                            Modifier
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              supprimerMoulure(a.id);
                            }}
                            disabled={deletingId === a.id}
                            title="Supprimer"
                            style={{
                              minWidth: 82,
                              height: 34,
                              borderRadius: 10,
                              border: "1px solid #d33",
                              background: deletingId === a.id ? "#ffd6d6" : "#ff5c5c",
                              color: "#fff",
                              fontWeight: 800,
                              fontSize: 12,
                              cursor: deletingId === a.id ? "default" : "pointer",
                              padding: "0 10px",
                            }}
                          >
                            {deletingId === a.id ? "..." : "Supprimer"}
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

      {modalUrl && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.9)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            boxSizing: "border-box",
          }}
        >
          <button
            onClick={() => setModalUrl(null)}
            aria-label="Fermer"
            title="Fermer"
            style={{
              position: "fixed",
              top: 14,
              right: 14,
              width: 46,
              height: 46,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.25)",
              background: "rgba(0,0,0,0.55)",
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
              fontWeight: 900,
              padding: 0,
              userSelect: "none",
            }}
          >
            ✕
          </button>

          <img
            src={modalUrl}
            alt="dessin agrandi"
            style={{
              width: "45vw",
              height: "45vh",
              maxWidth: "85vw",
              maxHeight: "85vh",
              objectFit: "contain",
              display: "block",
              borderRadius: 10,
              boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
              background: "transparent",
            }}
          />
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
              width: "min(900px, 95vw)",
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
                Confirmer la réquisition
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
                  Moulures choisies
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  {reqSelectedList.map((it) => (
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
                          {it.materiel || "(sans matériel)"}
                        </div>

                        <div style={{ color: "#666", fontSize: 12 }}>
                          {it.categorie || ""} • Calibre {it.calibre || ""} • Section{" "}
                          {it.sectionCour || "—"} • source: {it.projet || ""}
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
                  ))}
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
                    placeholder="Ex: Projet ABC / Chantier X"
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
                onClick={createReq}
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

      {editOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 10001,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              width: "min(760px, 95vw)",
              maxHeight: "88vh",
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
              <div style={{ fontWeight: 900, fontSize: 16 }}>Modifier la moulure</div>

              <button
                onClick={closeEdit}
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

            <div style={{ padding: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Projet</div>
                  <input
                    value={editForm.projet}
                    onChange={(e) => setEditField("projet", e.target.value)}
                    style={{
                      height: 38,
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      padding: "0 10px",
                      fontSize: 13,
                    }}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Date</div>
                  <input
                    type="date"
                    value={editForm.date}
                    onChange={(e) => setEditField("date", e.target.value)}
                    style={{
                      height: 38,
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      padding: "0 10px",
                      fontSize: 13,
                    }}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Catégorie</div>
                  <input
                    value={editForm.categorie}
                    onChange={(e) => setEditField("categorie", e.target.value)}
                    style={{
                      height: 38,
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      padding: "0 10px",
                      fontSize: 13,
                    }}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Matériel</div>
                  <input
                    value={editForm.materiel}
                    onChange={(e) => setEditField("materiel", e.target.value)}
                    style={{
                      height: 38,
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      padding: "0 10px",
                      fontSize: 13,
                    }}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Calibre</div>
                  <input
                    value={editForm.calibre}
                    onChange={(e) => setEditField("calibre", e.target.value)}
                    style={{
                      height: 38,
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      padding: "0 10px",
                      fontSize: 13,
                    }}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Section de cour</div>
                  <select
                    value={editForm.sectionCour}
                    onChange={(e) => setEditField("sectionCour", e.target.value)}
                    style={{
                      height: 38,
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      padding: "0 10px",
                      fontSize: 13,
                      background: "#fff",
                    }}
                  >
                    {SECTIONS_COUR.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Quantité</div>
                  <input
                    type="number"
                    min={0}
                    value={editForm.quantite}
                    onChange={(e) => setEditField("quantite", e.target.value)}
                    style={{
                      height: 38,
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      padding: "0 10px",
                      fontSize: 13,
                    }}
                  />
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 10,
                    gridColumn: "1 / -1",
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 12,
                    background: "#fafafa",
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Dessin</div>

                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                    <div>
                      {editNewDessinPng ? (
                        <img
                          src={editNewDessinPng}
                          alt="nouveau dessin"
                          style={{
                            width: 170,
                            height: 90,
                            objectFit: "contain",
                            border: "1px solid #ddd",
                            background: "#fff",
                          }}
                        />
                      ) : editForm.dessinUrl ? (
                        <img
                          src={editForm.dessinUrl}
                          alt="dessin actuel"
                          style={{
                            width: 170,
                            height: 90,
                            objectFit: "contain",
                            border: "1px solid #ddd",
                            background: "#fff",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 170,
                            height: 90,
                            border: "1px solid #ddd",
                            background: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#777",
                            fontSize: 13,
                          }}
                        >
                          Aucun dessin
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={openDrawEdit}
                      style={{
                        height: 38,
                        padding: "0 14px",
                        borderRadius: 12,
                        border: "1px solid #1e5eff",
                        background: "#1e5eff",
                        color: "#fff",
                        cursor: "pointer",
                        fontWeight: 900,
                      }}
                    >
                      Remplacer le dessin
                    </button>

                    {editNewDessinPng ? (
                      <span style={{ color: "#168000", fontWeight: 800, fontSize: 13 }}>
                        Nouveau dessin prêt à enregistrer
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {editError ? (
                <div
                  style={{
                    marginTop: 14,
                    border: "1px solid #ffd2d2",
                    background: "#fff5f5",
                    color: "#c40000",
                    padding: 10,
                    borderRadius: 12,
                    fontWeight: 800,
                    fontSize: 13,
                  }}
                >
                  {editError}
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
                onClick={closeEdit}
                disabled={editSaving}
                style={{
                  height: 38,
                  padding: "0 14px",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  background: "#fff",
                  cursor: editSaving ? "default" : "pointer",
                  fontWeight: 900,
                  opacity: editSaving ? 0.7 : 1,
                }}
              >
                Annuler
              </button>

              <button
                onClick={confirmerModification}
                disabled={editSaving}
                style={{
                  height: 38,
                  padding: "0 14px",
                  borderRadius: 12,
                  border: "1px solid #1e5eff",
                  background: "#1e5eff",
                  color: "#fff",
                  cursor: editSaving ? "default" : "pointer",
                  fontWeight: 900,
                  opacity: editSaving ? 0.7 : 1,
                }}
              >
                {editSaving ? "Enregistrement..." : "Confirmer les modifications"}
              </button>
            </div>
          </div>
        </div>
      )}

      {drawEditOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            zIndex: 10002,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              width: "min(940px, 96vw)",
              background: "#fff",
              borderRadius: 16,
              boxShadow: "0 18px 40px rgba(0,0,0,0.3)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 14px",
                borderBottom: "1px solid #eee",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 900 }}>Remplacer le dessin</div>

              <button
                onClick={closeDrawEdit}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  border: "1px solid #eee",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: 18,
                  fontWeight: 900,
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                padding: 14,
                display: "grid",
                gridTemplateColumns: "1fr 170px",
                gap: 14,
                alignItems: "start",
              }}
            >
              <div
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  overflow: "hidden",
                  background: "#fff",
                  display: "flex",
                  justifyContent: "center",
                  padding: 8,
                }}
              >
                <DessinCanvas
                  mode={drawMode}
                  clearSignal={drawClearSignal}
                  undoSignal={drawUndoSignal}
                  width={620}
                  height={380}
                  onExportPNG={(dataUrl) => setEditNewDessinPng(dataUrl)}
                  penSize={5}
                />
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <button
                  className="btn"
                  onClick={() => setDrawMode("line")}
                  style={{
                    width: "100%",
                    border: "1px solid #ddd",
                    background: drawMode === "line" ? "#e8f0ff" : "#fff",
                    fontWeight: drawMode === "line" ? 800 : 700,
                  }}
                >
                  📏 Ligne droite
                </button>

                <button
                  className="btn"
                  onClick={() => setDrawMode("free")}
                  style={{
                    width: "100%",
                    border: "1px solid #ddd",
                    background: drawMode === "free" ? "#e8f0ff" : "#fff",
                    fontWeight: drawMode === "free" ? 800 : 700,
                  }}
                >
                  ✏️ Dessin libre
                </button>

                <button
                  className="btn"
                  onClick={() => setDrawMode("text")}
                  style={{
                    width: "100%",
                    border: "1px solid #ddd",
                    background: drawMode === "text" ? "#e8f0ff" : "#fff",
                    fontWeight: drawMode === "text" ? 800 : 700,
                  }}
                >
                  📝 Ajouter texte
                </button>

                <button className="btn" onClick={() => setDrawUndoSignal((n) => n + 1)}>
                  ↩ Retour
                </button>

                <button
                  className="btn"
                  onClick={() => {
                    setEditNewDessinPng(null);
                    setDrawClearSignal((n) => n + 1);
                  }}
                >
                  🗑️ Effacer dessin
                </button>

                <button
                  onClick={confirmerNouveauDessin}
                  style={{
                    marginTop: 12,
                    height: 40,
                    borderRadius: 12,
                    border: "1px solid #168000",
                    background: "#168000",
                    color: "#fff",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Utiliser ce dessin
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
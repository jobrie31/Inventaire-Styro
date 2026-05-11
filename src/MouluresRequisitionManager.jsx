import React, { useMemo, useState } from "react";
import { db, auth } from "./firebaseConfig";
import { CLIENT_ID } from "./appClient";
import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

function currentUserInfo() {
  const user = auth?.currentUser || null;

  return {
    uid: user?.uid || "",
    email: user?.email || "",
    name: user?.displayName || user?.email || "Utilisateur inconnu",
  };
}

function openOutlookRequisitionEmail({ reqId, reqProjetEnvoye, reqNote }) {
  const to = "entrepot@styro.ca";

  const subject = encodeURIComponent(`Réquisition moulures ${reqId}`);

  const body = encodeURIComponent(
    `Salut les gars,

J'ai envoyé une réquisition de moulures dans l'inventaire Styro.

Merci de bien aller traiter la demande.

Numéro de réquisition : ${reqId}
Projet à envoyer : ${String(reqProjetEnvoye || "").trim() || "-"}

${String(reqNote || "").trim() ? `Note :\n${String(reqNote || "").trim()}\n\n` : ""}Merci.`
  );

  window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
}

export default function MouluresRequisitionManager({
  banque = [],
  onGoRequisition,
  children,
}) {
  const [reqMode, setReqMode] = useState(false);
  const [reqSelected, setReqSelected] = useState(() => new Set());
  const [reqConfirmed, setReqConfirmed] = useState(() => new Set());
  const [reqQtyById, setReqQtyById] = useState({});
  const [reqProjetEnvoye, setReqProjetEnvoye] = useState("");
  const [reqNote, setReqNote] = useState("");
  const [reqSaving, setReqSaving] = useState(false);
  const [reqError, setReqError] = useState("");

  const reqSelectedList = useMemo(() => {
    const ids = Array.from(reqSelected);
    const map = new Map(banque.map((x) => [x.id, x]));
    return ids.map((id) => map.get(id)).filter(Boolean);
  }, [reqSelected, banque]);

  const reqActionHeader = reqMode ? "Réquisition" : "Actions";

  function startReqMode() {
    setReqMode(true);
    setReqSelected(new Set());
    setReqConfirmed(new Set());
    setReqQtyById({});
    setReqProjetEnvoye("");
    setReqNote("");
    setReqSaving(false);
    setReqError("");
  }

  function cancelReqMode() {
    setReqMode(false);
    setReqSelected(new Set());
    setReqConfirmed(new Set());
    setReqQtyById({});
    setReqProjetEnvoye("");
    setReqNote("");
    setReqSaving(false);
    setReqError("");
  }

  function choisirMoulurePourReq(id) {
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

  function setReqQty(id, rawValue) {
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

  function confirmerLigneReq(id) {
    const row = banque.find((x) => x.id === id);
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

  function getReqRowBackground(row, selected) {
    if (!reqMode) return selected ? "#dfefff" : "#fff";

    const chosen = reqSelected.has(row.id);
    const confirmed = reqConfirmed.has(row.id);

    if (confirmed) return "#d9ffd4";
    if (chosen) return "#fff8d8";
    if (selected) return "#dfefff";

    return "#fff";
  }

  function validateBeforeCreate() {
    if (reqSelected.size === 0) {
      setReqError("Choisis au moins 1 moulure.");
      return false;
    }

    const notConfirmed = Array.from(reqSelected).filter(
      (id) => !reqConfirmed.has(id)
    );

    if (notConfirmed.length > 0) {
      setReqError("Confirme chaque ligne choisie avant de terminer la sélection.");
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

    if (!String(reqProjetEnvoye || "").trim()) {
      setReqError("Entre le projet à envoyer avant de terminer la sélection.");
      return false;
    }

    return true;
  }

  async function terminerSelectionReq() {
    setReqError("");

    if (!validateBeforeCreate()) return;

    setReqSaving(true);

    try {
      const actor = currentUserInfo();
      const counterRef = doc(db, "clients", CLIENT_ID, "_counters", "reqMoulures");

      const { reqId, reqNum, items } = await runTransaction(db, async (tx) => {
        const counterSnap = await tx.get(counterRef);
        const next = counterSnap.exists()
          ? Number(counterSnap.data()?.next ?? 1)
          : 1;

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
              `Quantité insuffisante pour ${
                data.materiel || "moulure"
              }. Stock: ${stockActuel}, demandé: ${x.qtyDemandee}.`
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
            quantiteStockApres:
              (Number(data.quantite ?? 0) || 0) - x.qtyDemandee,
            quantiteDemande: x.qtyDemandee,
          };
        });

        const reqRef = doc(
          db,
          "clients",
          CLIENT_ID,
          "requisitionsMoulures",
          reqId
        );

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

          courrielOuvert: true,
          courrielDestinataire: "entrepot@styro.ca",

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

        return { reqId, reqNum, items };
      });

      openOutlookRequisitionEmail({
        reqId,
        reqProjetEnvoye,
        reqNote,
      });

      cancelReqMode();

      if (typeof onGoRequisition === "function") {
        onGoRequisition(reqId);
      }
    } catch (e) {
      console.error(e);
      setReqError(e?.message || "Erreur lors de la création de la réquisition.");
    } finally {
      setReqSaving(false);
    }
  }

  function renderReqButtons() {
    if (!reqMode) {
      return (
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
      );
    }

    return (
      <>
        <button
          onClick={terminerSelectionReq}
          disabled={reqSaving}
          style={{
            height: 36,
            padding: "0 14px",
            borderRadius: 10,
            border: "1px solid #168000",
            background: reqSaving ? "#9ca3af" : "#168000",
            color: "#fff",
            fontWeight: 900,
            cursor: reqSaving ? "default" : "pointer",
            boxShadow: "0 6px 14px rgba(22,128,0,0.18)",
            fontSize: 13,
            opacity: reqSaving ? 0.75 : 1,
          }}
        >
          {reqSaving
            ? "Création..."
            : `Terminer la sélection (${reqConfirmed.size}/${reqSelected.size})`}
        </button>

        <button
          onClick={cancelReqMode}
          disabled={reqSaving}
          style={{
            height: 36,
            padding: "0 14px",
            borderRadius: 10,
            border: "1px solid #d33",
            background: "#fff",
            color: "#d33",
            fontWeight: 900,
            cursor: reqSaving ? "default" : "pointer",
            fontSize: 13,
            opacity: reqSaving ? 0.6 : 1,
          }}
        >
          Annuler
        </button>
      </>
    );
  }

  function renderReqPanel() {
    return (
      <div
        style={{
          margin: "0 auto 10px auto",
          width: "min(1190px, calc(100vw - 24px))",
          border: "1px solid #f1c40f",
          background: "#fff8d8",
          color: "#4d3b00",
          padding: "10px 12px",
          borderRadius: 12,
          fontWeight: 900,
          fontSize: 13,
          boxSizing: "border-box",
          display: "grid",
          gap: 10,
        }}
      >
        <div>
          Mode réquisition actif : clique sur <b>Choisir</b>, ajuste la quantité,
          clique sur <b>Confirmer</b>, puis clique sur <b>Terminer la sélection</b>.
          Outlook va ouvrir un courriel à <b>entrepot@styro.ca</b>.
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(220px, 1fr) minmax(220px, 1fr)",
            gap: 10,
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: 5 }}>
            <label style={{ fontSize: 12, fontWeight: 900 }}>
              Projet à envoyer
            </label>

            <input
              value={reqProjetEnvoye}
              onChange={(e) => setReqProjetEnvoye(e.target.value)}
              placeholder="Ex: Projet ABC / Chantier X"
              disabled={reqSaving}
              style={{
                height: 36,
                borderRadius: 10,
                border: "1px solid #d6c36a",
                padding: "0 10px",
                fontSize: 13,
                fontWeight: 800,
                background: "#fff",
              }}
            />
          </div>

          <div style={{ display: "grid", gap: 5 }}>
            <label style={{ fontSize: 12, fontWeight: 900 }}>
              Note optionnelle
            </label>

            <input
              value={reqNote}
              onChange={(e) => setReqNote(e.target.value)}
              placeholder="Note optionnelle"
              disabled={reqSaving}
              style={{
                height: 36,
                borderRadius: 10,
                border: "1px solid #d6c36a",
                padding: "0 10px",
                fontSize: 13,
                fontWeight: 800,
                background: "#fff",
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
              padding: 9,
              borderRadius: 10,
              fontWeight: 900,
              fontSize: 13,
            }}
          >
            {reqError}
          </div>
        ) : null}
      </div>
    );
  }

  function renderReqRowAction(row) {
    const chosen = reqSelected.has(row.id);
    const confirmed = reqConfirmed.has(row.id);
    const qty = reqQtyById[row.id] ?? 1;
    const stock = Number(row.quantite ?? 0);
    const qtyNumber = Number(qty);
    const qtyInvalid = !Number.isFinite(qtyNumber) || qtyNumber <= 0;
    const qtyTooHigh = Number.isFinite(stock) && qtyNumber > stock;

    if (!chosen) {
      return (
        <button
          onClick={(e) => {
            e.stopPropagation();
            choisirMoulurePourReq(row.id);
          }}
          disabled={reqSaving}
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
            cursor: reqSaving ? "default" : "pointer",
            padding: "0 10px",
            opacity: reqSaving ? 0.7 : 1,
          }}
        >
          Choisir
        </button>
      );
    }

    return (
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
          disabled={reqSaving}
          onChange={(e) => setReqQty(row.id, e.target.value)}
          style={{
            width: 58,
            height: 32,
            borderRadius: 9,
            border:
              qtyInvalid || qtyTooHigh
                ? "2px solid #d33"
                : confirmed
                ? "2px solid #168000"
                : "1px solid #bbb",
            background: "#fff",
            textAlign: "center",
            fontWeight: 900,
            fontSize: 12,
          }}
          title="Quantité demandée"
        />

        {confirmed ? (
          <div
            style={{
              height: 32,
              minWidth: 92,
              borderRadius: 9,
              border: "1px solid #168000",
              background: "#e8ffe5",
              color: "#168000",
              fontWeight: 950,
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 8px",
              boxSizing: "border-box",
            }}
            title="Ligne confirmée"
          >
            ✓ Confirmé
          </div>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              confirmerLigneReq(row.id);
            }}
            disabled={reqSaving || qtyInvalid || qtyTooHigh}
            title={
              qtyTooHigh
                ? `Stock insuffisant. Stock: ${stock}`
                : "Confirmer cette ligne"
            }
            style={{
              height: 32,
              borderRadius: 9,
              border:
                reqSaving || qtyInvalid || qtyTooHigh
                  ? "1px solid #aaa"
                  : "1px solid #168000",
              background:
                reqSaving || qtyInvalid || qtyTooHigh ? "#e5e7eb" : "#168000",
              color: reqSaving || qtyInvalid || qtyTooHigh ? "#666" : "#fff",
              fontWeight: 900,
              fontSize: 12,
              cursor:
                reqSaving || qtyInvalid || qtyTooHigh
                  ? "not-allowed"
                  : "pointer",
              padding: "0 8px",
            }}
          >
            Confirmer
          </button>
        )}
      </div>
    );
  }

  return children({
    reqMode,
    reqError,
    reqSaving,
    reqSelected,
    reqConfirmed,
    reqQtyById,
    reqSelectedList,
    reqActionHeader,
    renderReqButtons,
    renderReqPanel,
    renderReqRowAction,
    getReqRowBackground,
  });
}
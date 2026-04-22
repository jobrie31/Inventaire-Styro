import React, { useMemo, useState } from "react";
import "./pageRetourMateriaux.css";
import DessinCanvas from "./DessinCanvas";

import { db, storage } from "./firebaseConfig";
import { CLIENT_ID } from "./appClient";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import zoneTerrainPanneaux from "./assets/zone-terrain-panneaux.png";

function formatDateYYYYMMDD(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const MATERIELS = ["Blanc Embossé", "Blanc Lisse", "Galvanisé", "Grade B"];
const CALIBRES = Array.from({ length: (28 - 12) / 2 + 1 }, (_, i) => String(12 + i * 2));

// ✅ Panneaux
const PANNEAUX_TYPES = ["", "Neuf", "Grade B", "Roxul"];
const PANNEAUX_EPAISSEURS = ["", "2", "3", "4", "5", "6", "7", "8"];
const PANNEAUX_FABRICANTS = ["", "Norbec", "Melt-Span", "Awip", "Kingspan", "Autre"];
const PANNEAUX_SECTIONS_COUR = ["", "1", "2", "3", "4", "5", "6"];

function isPosNumberStr(x) {
  const s = String(x ?? "").trim();
  if (!s) return false;
  const n = Number(s);
  return !Number.isNaN(n) && n > 0;
}

export default function PageRetourMateriaux() {
  const today = useMemo(() => formatDateYYYYMMDD(new Date()), []);
  const [date, setDate] = useState(today);
  const [projet, setProjet] = useState("");

  // ✅ neutre au départ
  const [categorie, setCategorie] = useState("");

  // ---- Moulures ----
  const [materiel, setMateriel] = useState("");
  const [calibre, setCalibre] = useState("");

  // ---- Panneaux ----
  const [pType, setPType] = useState("");
  const [pEpaisseur, setPEpaisseur] = useState("");
  const [pFabricant, setPFabricant] = useState("");
  const [pFabricantAutre, setPFabricantAutre] = useState("");
  const [pProfile, setPProfile] = useState("");
  const [pModele, setPModele] = useState("");
  const [pFini, setPFini] = useState("");
  const [pSectionCour, setPSectionCour] = useState("");
  const [pLongPieds, setPLongPieds] = useState("");
  const [pLongPouces, setPLongPouces] = useState("");
  const [pLargeurPouces, setPLargeurPouces] = useState("");
  const [pFaceExt, setPFaceExt] = useState("");
  const [pFaceInt, setPFaceInt] = useState("");

  // ---- Commun ----
  const [qteStock, setQteStock] = useState("");

  // ✅ dessin (moulures seulement)
  const [mode, setMode] = useState("line");
  const [clearSignal, setClearSignal] = useState(0);
  const [undoSignal, setUndoSignal] = useState(0);
  const penSize = 5;
  const [dernierDessinPng, setDernierDessinPng] = useState(null);

  const [articles, setArticles] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const articleCols = "170px 110px 120px minmax(260px, 1fr) 90px 110px";

  const articleBaseCell = {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
    padding: "6px 8px",
    borderRight: "1px solid #e6e6e6",
    boxSizing: "border-box",
  };

  const articleLastCell = {
    ...articleBaseCell,
    borderRight: "none",
  };

  function resetForm() {
    setQteStock("");
    setSelectedId(null);

    // moulures
    setMateriel("");
    setCalibre("");
    setDernierDessinPng(null);
    setMode("line");
    setClearSignal((n) => n + 1);

    // panneaux
    setPType("");
    setPEpaisseur("");
    setPFabricant("");
    setPFabricantAutre("");
    setPProfile("");
    setPModele("");
    setPFini("");
    setPSectionCour("");
    setPLongPieds("");
    setPLongPouces("");
    setPLargeurPouces("");
    setPFaceExt("");
    setPFaceInt("");
  }

  function onChangeCategorie(next) {
    setCategorie(next);
    resetForm();
  }

  function ajouterArticle() {
    if (!categorie) {
      return alert("Choisis une catégorie pour commencer.");
    }

    const p = projet.trim();
    if (!p) return alert("Entre un projet.");

    if (!isPosNumberStr(qteStock)) return alert("Entre une quantité valide (> 0).");
    const qNum = Number(String(qteStock).trim());

    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    if (categorie === "Moulures") {
      if (!materiel) return alert("Choisis un matériel.");
      if (!calibre) return alert("Choisis un calibre.");

      const newItem = {
        id,
        projet: p,
        date,
        categorie: "Moulures",
        quantite: qNum,
        dessinPng: dernierDessinPng || null,
        materiel,
        calibre,
      };

      setArticles((prev) => [newItem, ...prev]);
      resetForm();
      return;
    }

    if (categorie === "Panneaux") {
      if (!pType) return alert("Choisis un type.");
      if (!pEpaisseur) return alert("Choisis une épaisseur.");
      if (!pFabricant) return alert("Choisis un fabricant.");
      if (!pSectionCour) return alert("Choisis une section dans la cour.");

      const fabricantFinal =
        pFabricant === "Autre" ? String(pFabricantAutre || "").trim() : pFabricant;

      if (pFabricant === "Autre" && !fabricantFinal) {
        return alert("Entre le fabricant (Autre).");
      }

      if (!isPosNumberStr(pLongPieds)) {
        return alert("Entre une longueur (pieds) valide (> 0).");
      }
      const lp = Number(String(pLongPieds).trim());

      const longPoucesStr = String(pLongPouces ?? "").trim();
      const longPoucesNum = longPoucesStr === "" ? 0 : Number(longPoucesStr);
      if (Number.isNaN(longPoucesNum) || longPoucesNum < 0 || longPoucesNum >= 12) {
        return alert("Longueur (pouces) doit être entre 0 et 11.");
      }

      if (!isPosNumberStr(pLargeurPouces)) {
        return alert("Entre une largeur (pouces) valide (> 0).");
      }
      const largeurNum = Number(String(pLargeurPouces).trim());

      const newItem = {
        id,
        projet: p,
        date,
        categorie: "Panneaux",
        quantite: qNum,
        dessinPng: null,
        type: pType,
        epaisseurPouces: pEpaisseur,
        fabricant: fabricantFinal,
        profile: pProfile.trim(),
        modele: pModele.trim(),
        fini: pFini.trim(),
        sectionCour: pSectionCour,
        longueurPieds: lp,
        longueurPouces: longPoucesNum,
        largeurPouces: largeurNum,
        faceExterieure: pFaceExt.trim(),
        faceInterieure: pFaceInt.trim(),
      };

      setArticles((prev) => [newItem, ...prev]);
      resetForm();
      return;
    }

    alert("Catégorie non gérée (Seulement Moulures/Panneaux).");
  }

  function retirerArticle() {
    if (!articles.length) return;

    if (selectedId) {
      setArticles((prev) => prev.filter((a) => a.id !== selectedId));
      setSelectedId(null);
      return;
    }

    setArticles((prev) => prev.slice(1));
  }

  async function enregistrerDansExcel() {
    if (isSaving) return;
    if (!articles.length) return alert("Rien à enregistrer.");

    setIsSaving(true);
    try {
      for (const a of articles) {
        let dessinUrl = null;
        let dessinPath = null;

        const isPanneaux = a.categorie === "Panneaux";
        const storageFolder = isPanneaux ? "banquePanneaux" : "banqueMoulures";
        const firestoreCollection = isPanneaux ? "banquePanneaux" : "banqueMoulures";

        // ✅ upload dessin seulement moulures
        if (!isPanneaux && a.dessinPng) {
          const isWebp = a.dessinPng.startsWith("data:image/webp");
          const ext = isWebp ? "webp" : "jpg";
          const contentType = isWebp ? "image/webp" : "image/jpeg";

          dessinPath = `clients/${CLIENT_ID}/${storageFolder}/${a.id}.${ext}`;
          const storageRef = ref(storage, dessinPath);

          await uploadString(storageRef, a.dessinPng, "data_url", {
            contentType,
            cacheControl: "public,max-age=31536000,immutable",
          });

          dessinUrl = await getDownloadURL(storageRef);
        }

        const payload = {
          projet: a.projet,
          date: a.date,
          categorie: a.categorie,
          quantite: a.quantite,
          dessinUrl,
          dessinPath,
          createdAt: serverTimestamp(),
        };

        if (a.categorie === "Moulures") {
          payload.materiel = a.materiel;
          payload.calibre = a.calibre;
        }

        if (a.categorie === "Panneaux") {
          payload.type = a.type;
          payload.epaisseurPouces = a.epaisseurPouces;
          payload.fabricant = a.fabricant;
          payload.profile = a.profile || "";
          payload.modele = a.modele || "";
          payload.fini = a.fini || "";
          payload.sectionCour = a.sectionCour;
          payload.longueurPieds = a.longueurPieds;
          payload.longueurPouces = a.longueurPouces;
          payload.largeurPouces = a.largeurPouces;
          payload.faceExterieure = a.faceExterieure || "";
          payload.faceInterieure = a.faceInterieure || "";
        }

        await addDoc(collection(db, "clients", CLIENT_ID, firestoreCollection), payload);
      }

      setArticles([]);
      setSelectedId(null);
      alert("✅ Enregistré dans Firebase.");
    } catch (err) {
      console.error("🔥 Firebase error FULL:", err);
      alert("❌ Firebase: " + (err?.code || "no-code") + " — " + (err?.message || String(err)));
    } finally {
      setIsSaving(false);
    }
  }

  const title =
    categorie === "Panneaux"
      ? "Ajout Panneaux"
      : categorie === "Moulures"
      ? "Ajout Moulures"
      : "Ajout matériaux";

  const showDessin = categorie === "Moulures";
  const showZonePanneaux = categorie === "Panneaux";

  return (
    <div className="pageRM pageRM--full">
      <div className="titleRow titleRow--full" style={{ paddingTop: 12 }}>
        <div />
        <div className="bigTitle">{title}</div>
        <div />
      </div>

      <div className="mainRow mainRow--full">
        <div className="mainRowInner">
          <div className="leftPanel">
            <label>Catégorie:</label>
            <select
              className="selectYellow"
              value={categorie}
              onChange={(e) => onChangeCategorie(e.target.value)}
            >
              <option value="">Choisir une catégorie</option>
              <option value="Moulures">Moulures</option>
              <option value="Panneaux">Panneaux</option>
              <option value="Quincaillerie">Quincaillerie</option>
              <option value="Autre">Autre</option>
            </select>

            <div className="fieldRow" style={{ marginTop: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700, width: 90 }}>Date:</div>
              <input
                className="inputSmall"
                style={{ width: 125 }}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="fieldRow" style={{ marginTop: 14 }}>
              <div style={{ fontSize: 18, fontWeight: 700, width: 90 }}>Projet:</div>
              <input
                className="inputWide"
                value={projet}
                onChange={(e) => setProjet(e.target.value)}
              />
            </div>

            {categorie === "Panneaux" && (
              <div className="fieldRow" style={{ marginTop: 14 }}>
                <div style={{ fontSize: 18, fontWeight: 700, width: 140 }}>
                  Section dans la cour:
                </div>
                <select
                  className="selectGray"
                  style={{ width: 180 }}
                  value={pSectionCour}
                  onChange={(e) => setPSectionCour(e.target.value)}
                >
                  {PANNEAUX_SECTIONS_COUR.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ height: 18 }} />

            {!categorie && (
              <div className="neutralBox">
                Choisis une catégorie pour commencer.
              </div>
            )}

            {categorie === "Moulures" && (
              <>
                <div className="fieldRow" style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, width: 90 }}>Matériel:</div>
                  <select
                    className="selectGray"
                    value={materiel}
                    onChange={(e) => setMateriel(e.target.value)}
                  >
                    <option value=""></option>
                    {MATERIELS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="fieldRow" style={{ marginTop: 24 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, width: 90 }}>Calibre:</div>
                  <select
                    className="selectGray"
                    value={calibre}
                    onChange={(e) => setCalibre(e.target.value)}
                  >
                    <option value=""></option>
                    {CALIBRES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {categorie === "Panneaux" && (
              <>
                <div className="fieldRow" style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, width: 90 }}>Type:</div>
                  <select
                    className="selectGray"
                    value={pType}
                    onChange={(e) => setPType(e.target.value)}
                  >
                    {PANNEAUX_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="fieldRow" style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, width: 90 }}>Épaisseur:</div>
                  <select
                    className="selectGray"
                    value={pEpaisseur}
                    onChange={(e) => setPEpaisseur(e.target.value)}
                  >
                    {PANNEAUX_EPAISSEURS.map((ep) => (
                      <option key={ep} value={ep}>
                        {ep}
                      </option>
                    ))}
                  </select>
                  <div style={{ fontWeight: 700 }}>Pouces</div>
                </div>

                <div className="fieldRow" style={{ marginTop: 18, alignItems: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, width: 90 }}>Fabricant:</div>
                  <select
                    className="selectGray"
                    value={pFabricant}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPFabricant(v);
                      if (v !== "Autre") setPFabricantAutre("");
                    }}
                  >
                    {PANNEAUX_FABRICANTS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>

                {pFabricant === "Autre" && (
                  <div className="fieldRow" style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, width: 90 }}></div>
                    <input
                      className="inputWide"
                      style={{ width: 200 }}
                      placeholder="Écrire fabricant..."
                      value={pFabricantAutre}
                      onChange={(e) => setPFabricantAutre(e.target.value)}
                    />
                  </div>
                )}

                <div className="fieldRow" style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, width: 90 }}>Profile:</div>
                  <input
                    className="inputWide"
                    style={{ width: 200 }}
                    value={pProfile}
                    onChange={(e) => setPProfile(e.target.value)}
                  />
                </div>

                <div className="fieldRow" style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, width: 90 }}>Modèle:</div>
                  <input
                    className="inputWide"
                    style={{ width: 200 }}
                    value={pModele}
                    onChange={(e) => setPModele(e.target.value)}
                  />
                </div>

                <div className="fieldRow" style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, width: 90 }}>Fini:</div>
                  <input
                    className="inputWide"
                    style={{ width: 200 }}
                    value={pFini}
                    onChange={(e) => setPFini(e.target.value)}
                  />
                </div>

                <div className="fieldRow" style={{ marginTop: 20, gap: 8 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, width: 90 }}>Longueur:</div>
                  <input
                    className="inputSmall"
                    style={{ width: 70 }}
                    value={pLongPieds}
                    onChange={(e) => setPLongPieds(e.target.value)}
                    inputMode="numeric"
                  />
                  <div style={{ fontWeight: 700 }}>Pieds</div>
                  <input
                    className="inputSmall"
                    style={{ width: 70 }}
                    value={pLongPouces}
                    onChange={(e) => setPLongPouces(e.target.value)}
                    inputMode="numeric"
                  />
                  <div style={{ fontWeight: 700 }}>Pouces</div>
                </div>

                <div className="fieldRow" style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, width: 90 }}>Largeur:</div>
                  <input
                    className="inputSmall"
                    style={{ width: 110 }}
                    value={pLargeurPouces}
                    onChange={(e) => setPLargeurPouces(e.target.value)}
                    inputMode="numeric"
                  />
                  <div style={{ fontWeight: 700 }}>Pouces</div>
                </div>

                <div className="fieldRow" style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, width: 140 }}>
                    Face extérieure:
                  </div>
                  <input
                    className="inputWide"
                    style={{ width: 180 }}
                    value={pFaceExt}
                    onChange={(e) => setPFaceExt(e.target.value)}
                  />
                </div>

                <div className="fieldRow" style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, width: 140 }}>
                    Face intérieure:
                  </div>
                  <input
                    className="inputWide"
                    style={{ width: 180 }}
                    value={pFaceInt}
                    onChange={(e) => setPFaceInt(e.target.value)}
                  />
                </div>
              </>
            )}

            {!!categorie && (
              <div className="fieldRow" style={{ marginTop: 28 }}>
                <div style={{ fontSize: 16, fontWeight: 700, width: 140 }}>Quantité en stock:</div>
                <input
                  className="inputSmall"
                  value={qteStock}
                  onChange={(e) => setQteStock(e.target.value)}
                  inputMode="numeric"
                />
              </div>
            )}
          </div>

          {showDessin ? (
            <div className="canvasWrap canvasWrap--full">
              <DessinCanvas
                mode={mode}
                clearSignal={clearSignal}
                undoSignal={undoSignal}
                width={620}
                height={380}
                onExportPNG={(dataUrl) => setDernierDessinPng(dataUrl)}
                penSize={penSize}
              />
            </div>
          ) : showZonePanneaux ? (
            <div
              className="canvasWrap canvasWrap--full"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 8,
                boxSizing: "border-box",
              }}
            >
              <img
                src={zoneTerrainPanneaux}
                alt="Zones du terrain extérieur"
                style={{
                  width: "100%",
                  height: "100%",
                  maxWidth: 620,
                  maxHeight: 380,
                  objectFit: "contain",
                  border: "2px solid #222",
                  borderRadius: 8,
                  background: "#fff",
                }}
              />
            </div>
          ) : (
            <div className="canvasWrap canvasWrap--full">
              {!categorie ? <div className="canvasPlaceholder">Choisis une catégorie</div> : <div />}
            </div>
          )}

          {showDessin ? (
            <div className="rightPanel">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button
                  className="btn"
                  onClick={() => setMode("line")}
                  style={{
                    width: "100%",
                    border: "1px solid #ddd",
                    background: mode === "line" ? "#e8f0ff" : "#fff",
                    fontWeight: mode === "line" ? 800 : 700,
                  }}
                >
                  📏 Ligne droite
                </button>

                <button
                  className="btn"
                  onClick={() => setMode("free")}
                  style={{
                    width: "100%",
                    border: "1px solid #ddd",
                    background: mode === "free" ? "#e8f0ff" : "#fff",
                    fontWeight: mode === "free" ? 800 : 700,
                  }}
                >
                  ✏️ Dessin libre
                </button>

                <button
                  className="btn"
                  onClick={() => setMode("text")}
                  style={{
                    width: "100%",
                    border: "1px solid #ddd",
                    background: mode === "text" ? "#e8f0ff" : "#fff",
                    fontWeight: mode === "text" ? 800 : 700,
                  }}
                >
                  📝 Ajouter texte
                </button>

                <button className="btn" onClick={() => setUndoSignal((n) => n + 1)}>
                  ↩ Retour
                </button>

                <button className="btn" onClick={() => setClearSignal((n) => n + 1)}>
                  🗑️ Effacer dessin
                </button>
              </div>
            </div>
          ) : (
            <div className="rightPanel" />
          )}
        </div>
      </div>

      <div className="bottomRow bottomRow--full">
        <div className="bottomRowInner">
          <div className="bottomLeftBtns">
            <button className="btnGreen" onClick={ajouterArticle}>
              Ajouter article
            </button>
            <button className="btnRed" onClick={retirerArticle}>
              Retirer article
            </button>
          </div>

          <div className="bottomRightBtn">
            <button className="btnBlue" onClick={enregistrerDansExcel} disabled={isSaving}>
              {isSaving ? "Enregistrement..." : "Enregistrer dans le tableau"}
            </button>
          </div>
        </div>
      </div>

      <div className="tableZone tableZone--center">
        <div
          className="tableBox tableBox--wide"
          style={{
            height: 220,
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
                gridTemplateColumns: articleCols,
                alignItems: "stretch",
                width: "100%",
                boxSizing: "border-box",
                fontSize: 13,
                fontWeight: 700,
                borderBottom: "1px solid #e0e0e0",
                background: "#fff",
              }}
            >
              {["Projet", "Date", "Catégorie", "Détails", "Quantité", "Dessin"].map(
                (h, idx, arr) => (
                  <div
                    key={h}
                    style={{
                      ...(idx === arr.length - 1 ? articleLastCell : articleBaseCell),
                      display: "flex",
                      alignItems: "center",
                      minHeight: 40,
                    }}
                  >
                    {h}
                  </div>
                )
              )}
            </div>

            {articles.length === 0 ? (
              <div className="tableBody" style={{ padding: 10 }}>
                (Tableau vide pour l’instant — ajoute un article)
              </div>
            ) : (
              articles.map((a, idx) => {
                const selected = a.id === selectedId;
                const rowBg = selected ? "#dfefff" : idx % 2 === 1 ? "#f8f8f8" : "#fff";

                return (
                  <div
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: articleCols,
                      alignItems: "center",
                      width: "100%",
                      boxSizing: "border-box",
                      borderBottom: "1px solid #eee",
                      background: rowBg,
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    <div style={{ ...articleBaseCell, fontWeight: 700 }}>{a.projet}</div>
                    <div style={articleBaseCell}>{a.date}</div>
                    <div style={articleBaseCell}>{a.categorie}</div>

                    <div style={articleBaseCell}>
                      {a.categorie === "Moulures"
                        ? `${a.materiel || ""} — Calibre ${a.calibre || ""}`
                        : (() => {
                            const len = `${a.longueurPieds ?? ""}' ${a.longueurPouces ?? 0}"`;
                            return `${a.type || ""} — ${a.epaisseurPouces || ""}" — ${
                              a.fabricant || ""
                            } — Profile:${a.profile || "-"} — Modèle:${a.modele || "-"} — Fini:${
                              a.fini || "-"
                            } — Section:${a.sectionCour || "-"} — L:${len} x l:${
                              a.largeurPouces || ""
                            }" — Ext:${a.faceExterieure || "-"} / Int:${a.faceInterieure || "-"}`;
                          })()}
                    </div>

                    <div style={{ ...articleBaseCell, textAlign: "center", fontWeight: 700 }}>
                      {a.quantite}
                    </div>

                    <div
                      style={{
                        ...articleLastCell,
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      {a.dessinPng ? (
                        <img
                          src={a.dessinPng}
                          alt="dessin"
                          loading="lazy"
                          decoding="async"
                          style={{
                            width: 96,
                            height: 44,
                            objectFit: "contain",
                            border: "1px solid #ddd",
                            background: "#fff",
                          }}
                        />
                      ) : (
                        <span style={{ color: "#999" }}>—</span>
                      )}
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
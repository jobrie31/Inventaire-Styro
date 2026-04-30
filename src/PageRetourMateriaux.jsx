import React, { useEffect, useMemo, useState } from "react";
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

const MOULURES_SECTIONS_COUR = ["", "1", "2", "3", "4", "5", "6"];

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
  const [categorie, setCategorie] = useState("");

  const [viewportW, setViewportW] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1400
  );

  useEffect(() => {
    function onResize() {
      setViewportW(window.innerWidth);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isIPad = viewportW <= 1180;

  const layout = {
    leftWidth: isIPad ? 270 : 340,
    canvasWidth: isIPad ? 470 : 620,
    canvasHeight: isIPad ? 300 : 380,
    rightWidth: isIPad ? 130 : 170,
    gap: isIPad ? 8 : 14,
    labelFontBig: isIPad ? 15 : 18,
    labelFont: isIPad ? 13 : 16,
    inputWide: isIPad ? 160 : 200,
    selectWidth: isIPad ? 150 : undefined,
  };

  // ---- Moulures ----
  const [materiel, setMateriel] = useState("");
  const [calibre, setCalibre] = useState("");
  const [mSectionCour, setMSectionCour] = useState("");

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

  const [qteStock, setQteStock] = useState("");

  const [mode, setMode] = useState("line");
  const [clearSignal, setClearSignal] = useState(0);
  const [undoSignal, setUndoSignal] = useState(0);
  const penSize = 5;
  const [dernierDessinPng, setDernierDessinPng] = useState(null);

  const [articles, setArticles] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const articleCols = isIPad
    ? "130px 95px 105px minmax(210px, 1fr) 75px 90px"
    : "170px 110px 120px minmax(260px, 1fr) 90px 110px";

  const articleBaseCell = {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
    padding: isIPad ? "5px 6px" : "6px 8px",
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

    setMateriel("");
    setCalibre("");
    setMSectionCour("");
    setDernierDessinPng(null);
    setMode("line");
    setClearSignal((n) => n + 1);

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
    if (!categorie) return alert("Choisis une catégorie pour commencer.");

    const p = projet.trim();
    if (!p) return alert("Entre un projet.");

    if (!isPosNumberStr(qteStock)) return alert("Entre une quantité valide (> 0).");
    const qNum = Number(String(qteStock).trim());

    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    if (categorie === "Moulures") {
      if (!materiel) return alert("Choisis un matériel.");
      if (!calibre) return alert("Choisis un calibre.");
      if (!mSectionCour) return alert("Choisis une section de cour.");

      const newItem = {
        id,
        projet: p,
        date,
        categorie: "Moulures",
        quantite: qNum,
        dessinPng: dernierDessinPng || null,
        materiel,
        calibre,
        sectionCour: mSectionCour,
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

      if (!isPosNumberStr(pLongPieds)) return alert("Entre une longueur (pieds) valide (> 0).");
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
          payload.sectionCour = a.sectionCour;
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
    <div
      className="pageRM pageRM--full"
      style={{
        overflowX: "hidden",
        maxWidth: "100vw",
      }}
    >
      <div className="titleRow titleRow--full" style={{ paddingTop: 8 }}>
        <div />
        <div className="bigTitle" style={{ fontSize: isIPad ? 30 : undefined }}>
          {title}
        </div>
        <div />
      </div>

      <div
        className="mainRow mainRow--full"
        style={{
          overflowX: "hidden",
          width: "100%",
        }}
      >
        <div
          className="mainRowInner"
          style={{
            width: "100%",
            maxWidth: "100vw",
            boxSizing: "border-box",
            display: "grid",
            gridTemplateColumns: `${layout.leftWidth}px ${layout.canvasWidth}px ${layout.rightWidth}px`,
            gap: layout.gap,
            alignItems: "start",
            justifyContent: "center",
            padding: isIPad ? "0 6px" : undefined,
            overflowX: "hidden",
          }}
        >
          <div
            className="leftPanel"
            style={{
              width: layout.leftWidth,
              minWidth: 0,
              boxSizing: "border-box",
            }}
          >
            <label>Catégorie:</label>
            <select
              className="selectYellow"
              value={categorie}
              onChange={(e) => onChangeCategorie(e.target.value)}
              style={{ maxWidth: "100%" }}
            >
              <option value="">Choisir une catégorie</option>
              <option value="Moulures">Moulures</option>
              <option value="Panneaux">Panneaux</option>
              <option value="Quincaillerie">Quincaillerie</option>
              <option value="Autre">Autre</option>
            </select>

            <div className="fieldRow" style={{ marginTop: isIPad ? 10 : 16 }}>
              <div style={{ fontSize: layout.labelFontBig, fontWeight: 700, width: 75 }}>Date:</div>
              <input
                className="inputSmall"
                style={{ width: 125 }}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="fieldRow" style={{ marginTop: isIPad ? 10 : 14 }}>
              <div style={{ fontSize: layout.labelFontBig, fontWeight: 700, width: 75 }}>
                Projet:
              </div>
              <input
                className="inputWide"
                style={{ width: layout.inputWide }}
                value={projet}
                onChange={(e) => setProjet(e.target.value)}
              />
            </div>

            {categorie === "Panneaux" && (
              <div className="fieldRow" style={{ marginTop: 10 }}>
                <div style={{ fontSize: layout.labelFont, fontWeight: 700, width: 110 }}>
                  Section dans la cour:
                </div>
                <select
                  className="selectGray"
                  style={{ width: 140 }}
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

            <div style={{ height: isIPad ? 8 : 18 }} />

            {!categorie && <div className="neutralBox">Choisis une catégorie pour commencer.</div>}

            {categorie === "Moulures" && (
              <>
                <div className="fieldRow" style={{ marginTop: 10 }}>
                  <div style={{ fontSize: layout.labelFont, fontWeight: 700, width: 88 }}>
                    Matériel:
                  </div>
                  <select
                    className="selectGray"
                    value={materiel}
                    onChange={(e) => setMateriel(e.target.value)}
                    style={{ width: layout.selectWidth }}
                  >
                    <option value=""></option>
                    {MATERIELS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="fieldRow" style={{ marginTop: isIPad ? 14 : 24 }}>
                  <div style={{ fontSize: layout.labelFont, fontWeight: 700, width: 88 }}>
                    Calibre:
                  </div>
                  <select
                    className="selectGray"
                    value={calibre}
                    onChange={(e) => setCalibre(e.target.value)}
                    style={{ width: layout.selectWidth }}
                  >
                    <option value=""></option>
                    {CALIBRES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="fieldRow" style={{ marginTop: isIPad ? 14 : 24 }}>
                  <div style={{ fontSize: layout.labelFont, fontWeight: 700, width: 110 }}>
                    Section de cour:
                  </div>
                  <select
                    className="selectGray"
                    value={mSectionCour}
                    onChange={(e) => setMSectionCour(e.target.value)}
                    style={{ width: isIPad ? 90 : undefined }}
                  >
                    {MOULURES_SECTIONS_COUR.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {categorie === "Panneaux" && (
              <>
                <div className="fieldRow" style={{ marginTop: 8 }}>
                  <div style={{ fontSize: layout.labelFont, fontWeight: 700, width: 75 }}>
                    Type:
                  </div>
                  <select
                    className="selectGray"
                    value={pType}
                    onChange={(e) => setPType(e.target.value)}
                    style={{ width: layout.selectWidth }}
                  >
                    {PANNEAUX_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="fieldRow" style={{ marginTop: 12 }}>
                  <div style={{ fontSize: layout.labelFont, fontWeight: 700, width: 75 }}>
                    Épaisseur:
                  </div>
                  <select
                    className="selectGray"
                    value={pEpaisseur}
                    onChange={(e) => setPEpaisseur(e.target.value)}
                    style={{ width: 80 }}
                  >
                    {PANNEAUX_EPAISSEURS.map((ep) => (
                      <option key={ep} value={ep}>
                        {ep}
                      </option>
                    ))}
                  </select>
                  <div style={{ fontWeight: 700, fontSize: isIPad ? 12 : undefined }}>Pouces</div>
                </div>

                <div className="fieldRow" style={{ marginTop: 12, alignItems: "center" }}>
                  <div style={{ fontSize: layout.labelFont, fontWeight: 700, width: 75 }}>
                    Fabricant:
                  </div>
                  <select
                    className="selectGray"
                    value={pFabricant}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPFabricant(v);
                      if (v !== "Autre") setPFabricantAutre("");
                    }}
                    style={{ width: layout.selectWidth }}
                  >
                    {PANNEAUX_FABRICANTS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>

                {pFabricant === "Autre" && (
                  <div className="fieldRow" style={{ marginTop: 8 }}>
                    <div style={{ width: 75 }}></div>
                    <input
                      className="inputWide"
                      style={{ width: layout.inputWide }}
                      placeholder="Écrire fabricant..."
                      value={pFabricantAutre}
                      onChange={(e) => setPFabricantAutre(e.target.value)}
                    />
                  </div>
                )}

                {[
                  ["Profile:", pProfile, setPProfile],
                  ["Modèle:", pModele, setPModele],
                  ["Fini:", pFini, setPFini],
                ].map(([label, value, setter]) => (
                  <div className="fieldRow" style={{ marginTop: 8 }} key={label}>
                    <div style={{ fontSize: layout.labelFont, fontWeight: 700, width: 75 }}>
                      {label}
                    </div>
                    <input
                      className="inputWide"
                      style={{ width: layout.inputWide }}
                      value={value}
                      onChange={(e) => setter(e.target.value)}
                    />
                  </div>
                ))}

                <div className="fieldRow" style={{ marginTop: 12, gap: 6 }}>
                  <div style={{ fontSize: layout.labelFont, fontWeight: 700, width: 75 }}>
                    Longueur:
                  </div>
                  <input
                    className="inputSmall"
                    style={{ width: 55 }}
                    value={pLongPieds}
                    onChange={(e) => setPLongPieds(e.target.value)}
                    inputMode="numeric"
                  />
                  <div style={{ fontWeight: 700, fontSize: 12 }}>Pi</div>
                  <input
                    className="inputSmall"
                    style={{ width: 55 }}
                    value={pLongPouces}
                    onChange={(e) => setPLongPouces(e.target.value)}
                    inputMode="numeric"
                  />
                  <div style={{ fontWeight: 700, fontSize: 12 }}>Po</div>
                </div>

                <div className="fieldRow" style={{ marginTop: 12 }}>
                  <div style={{ fontSize: layout.labelFont, fontWeight: 700, width: 75 }}>
                    Largeur:
                  </div>
                  <input
                    className="inputSmall"
                    style={{ width: 90 }}
                    value={pLargeurPouces}
                    onChange={(e) => setPLargeurPouces(e.target.value)}
                    inputMode="numeric"
                  />
                  <div style={{ fontWeight: 700, fontSize: 12 }}>Pouces</div>
                </div>

                <div className="fieldRow" style={{ marginTop: 12 }}>
                  <div style={{ fontSize: layout.labelFont, fontWeight: 700, width: 110 }}>
                    Face extérieure:
                  </div>
                  <input
                    className="inputWide"
                    style={{ width: 145 }}
                    value={pFaceExt}
                    onChange={(e) => setPFaceExt(e.target.value)}
                  />
                </div>

                <div className="fieldRow" style={{ marginTop: 10 }}>
                  <div style={{ fontSize: layout.labelFont, fontWeight: 700, width: 110 }}>
                    Face intérieure:
                  </div>
                  <input
                    className="inputWide"
                    style={{ width: 145 }}
                    value={pFaceInt}
                    onChange={(e) => setPFaceInt(e.target.value)}
                  />
                </div>
              </>
            )}

            {!!categorie && (
              <div className="fieldRow" style={{ marginTop: isIPad ? 16 : 28 }}>
                <div style={{ fontSize: layout.labelFont, fontWeight: 700, width: 120 }}>
                  Quantité en stock:
                </div>
                <input
                  className="inputSmall"
                  style={{ width: 85 }}
                  value={qteStock}
                  onChange={(e) => setQteStock(e.target.value)}
                  inputMode="numeric"
                />
              </div>
            )}
          </div>

          {showDessin ? (
            <div
              className="canvasWrap canvasWrap--full"
              style={{
                width: layout.canvasWidth,
                height: layout.canvasHeight,
                minWidth: 0,
                boxSizing: "border-box",
              }}
            >
              <DessinCanvas
                mode={mode}
                clearSignal={clearSignal}
                undoSignal={undoSignal}
                width={layout.canvasWidth}
                height={layout.canvasHeight}
                onExportPNG={(dataUrl) => setDernierDessinPng(dataUrl)}
                penSize={penSize}
              />
            </div>
          ) : showZonePanneaux ? (
            <div
              className="canvasWrap canvasWrap--full"
              style={{
                width: layout.canvasWidth,
                height: layout.canvasHeight,
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
                  objectFit: "contain",
                  border: "2px solid #222",
                  borderRadius: 8,
                  background: "#fff",
                }}
              />
            </div>
          ) : (
            <div
              className="canvasWrap canvasWrap--full"
              style={{
                width: layout.canvasWidth,
                height: layout.canvasHeight,
                minWidth: 0,
              }}
            >
              {!categorie ? <div className="canvasPlaceholder">Choisis une catégorie</div> : <div />}
            </div>
          )}

          {showDessin ? (
            <div
              className="rightPanel"
              style={{
                width: layout.rightWidth,
                minWidth: 0,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: isIPad ? 6 : 8 }}>
                {[
                  ["line", "📏 Ligne droite"],
                  ["free", "✏️ Dessin libre"],
                  ["text", "📝 Ajouter texte"],
                ].map(([m, label]) => (
                  <button
                    key={m}
                    className="btn"
                    onClick={() => setMode(m)}
                    style={{
                      width: "100%",
                      border: "1px solid #ddd",
                      background: mode === m ? "#e8f0ff" : "#fff",
                      fontWeight: mode === m ? 800 : 700,
                      fontSize: isIPad ? 12 : undefined,
                      padding: isIPad ? "6px 4px" : undefined,
                    }}
                  >
                    {label}
                  </button>
                ))}

                <button
                  className="btn"
                  onClick={() => setUndoSignal((n) => n + 1)}
                  style={{ fontSize: isIPad ? 12 : undefined, padding: isIPad ? "6px 4px" : undefined }}
                >
                  ↩ Retour
                </button>

                <button
                  className="btn"
                  onClick={() => setClearSignal((n) => n + 1)}
                  style={{ fontSize: isIPad ? 12 : undefined, padding: isIPad ? "6px 4px" : undefined }}
                >
                  🗑️ Effacer dessin
                </button>
              </div>
            </div>
          ) : (
            <div className="rightPanel" style={{ width: layout.rightWidth, minWidth: 0 }} />
          )}
        </div>
      </div>

      <div className="bottomRow bottomRow--full" style={{ overflowX: "hidden" }}>
        <div className="bottomRowInner" style={{ maxWidth: "100vw", boxSizing: "border-box" }}>
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

      <div className="tableZone tableZone--center" style={{ overflowX: "hidden" }}>
        <div
          className="tableBox tableBox--wide"
          style={{
            height: isIPad ? 190 : 220,
            overflow: "hidden",
            maxWidth: "calc(100vw - 16px)",
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
                fontSize: isIPad ? 12 : 13,
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
                      minHeight: 36,
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
                      fontSize: isIPad ? 12 : 13,
                    }}
                  >
                    <div style={{ ...articleBaseCell, fontWeight: 700 }}>{a.projet}</div>
                    <div style={articleBaseCell}>{a.date}</div>
                    <div style={articleBaseCell}>{a.categorie}</div>

                    <div style={articleBaseCell}>
                      {a.categorie === "Moulures"
                        ? `${a.materiel || ""} — Calibre ${a.calibre || ""} — Section:${
                            a.sectionCour || "-"
                          }`
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
                            width: isIPad ? 74 : 96,
                            height: isIPad ? 36 : 44,
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
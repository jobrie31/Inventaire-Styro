// src/PageRetourMateriaux.jsx
import React, { useMemo, useState } from "react";
import "./pageRetourMateriaux.css";
import DessinCanvas from "./DessinCanvas";

import { db, storage } from "./firebaseConfig";
import { CLIENT_ID } from "./appClient";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadString, getDownloadURL } from "firebase/storage";

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
const PANNEAUX_EPAISSEURS = ["", "3", "4", "5", "6", "7", "8"];
const PANNEAUX_FABRICANTS = ["", "Norbec", "Melt-Span", "Awip", "Kingspan", "Autre"];

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

  const [categorie, setCategorie] = useState("Moulures");

  // ---- Moulures ----
  const [materiel, setMateriel] = useState("");
  const [calibre, setCalibre] = useState("");

  // ---- Panneaux ----
  const [pType, setPType] = useState("");
  const [pEpaisseur, setPEpaisseur] = useState("");
  const [pFabricant, setPFabricant] = useState("");
  const [pFabricantAutre, setPFabricantAutre] = useState("");
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

  function resetForm() {
    setQteStock("");
    setSelectedId(null);

    // moulures
    setMateriel("");
    setCalibre("");
    setDernierDessinPng(null);
    setClearSignal((n) => n + 1);

    // panneaux
    setPType("");
    setPEpaisseur("");
    setPFabricant("");
    setPFabricantAutre("");
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

      const fabricantFinal = pFabricant === "Autre" ? String(pFabricantAutre || "").trim() : pFabricant;
      if (pFabricant === "Autre" && !fabricantFinal) return alert("Entre le fabricant (Autre).");

      if (!isPosNumberStr(pLongPieds)) return alert("Entre une longueur (pieds) valide (> 0).");
      const lp = Number(String(pLongPieds).trim());

      const longPoucesStr = String(pLongPouces ?? "").trim();
      const longPoucesNum = longPoucesStr === "" ? 0 : Number(longPoucesStr);
      if (Number.isNaN(longPoucesNum) || longPoucesNum < 0 || longPoucesNum >= 12) {
        return alert("Longueur (pouces) doit être entre 0 et 11.");
      }

      if (!isPosNumberStr(pLargeurPouces)) return alert("Entre une largeur (pouces) valide (> 0).");
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
          payload.longueurPieds = a.longueurPieds;
          payload.longueurPouces = a.longueurPouces;
          payload.largeurPouces = a.largeurPouces;
          payload.faceExterieure = a.faceExterieure || "";
          payload.faceInterieure = a.faceInterieure || "";
        }

        await addDoc(
          collection(db, "clients", CLIENT_ID, firestoreCollection),
          payload
        );
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

  const title = categorie === "Panneaux" ? "Ajout Panneaux" : "Ajout Moulures";
  const showDessin = categorie === "Moulures";

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
            <div className="fieldRow" style={{ marginTop: 6 }}>
              <div style={{ fontSize: 18, fontWeight: 700, width: 60 }}>Date:</div>
              <input className="inputSmall" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            <div className="fieldRow" style={{ marginTop: 14 }}>
              <div style={{ fontSize: 18, fontWeight: 700, width: 60 }}>Projet:</div>
              <input className="inputWide" value={projet} onChange={(e) => setProjet(e.target.value)} />
            </div>

            <label>Catégorie:</label>
            <select className="selectYellow" value={categorie} onChange={(e) => onChangeCategorie(e.target.value)}>
              <option>Moulures</option>
              <option>Panneaux</option>
              <option>Quincaillerie</option>
              <option>Autre</option>
            </select>

            <div style={{ height: 18 }} />

            {categorie === "Moulures" && (
              <>
                <div className="fieldRow" style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, width: 90 }}>Matériel:</div>
                  <select className="selectGray" value={materiel} onChange={(e) => setMateriel(e.target.value)}>
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
                  <select className="selectGray" value={calibre} onChange={(e) => setCalibre(e.target.value)}>
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
                  <select className="selectGray" value={pType} onChange={(e) => setPType(e.target.value)}>
                    {PANNEAUX_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="fieldRow" style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, width: 90 }}>Épaisseur:</div>
                  <select className="selectGray" value={pEpaisseur} onChange={(e) => setPEpaisseur(e.target.value)}>
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
                  <div style={{ fontSize: 16, fontWeight: 700, width: 140 }}>Face extérieure:</div>
                  <input
                    className="inputWide"
                    style={{ width: 180 }}
                    value={pFaceExt}
                    onChange={(e) => setPFaceExt(e.target.value)}
                  />
                </div>

                <div className="fieldRow" style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, width: 140 }}>Face intérieure:</div>
                  <input
                    className="inputWide"
                    style={{ width: 180 }}
                    value={pFaceInt}
                    onChange={(e) => setPFaceInt(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="fieldRow" style={{ marginTop: 28 }}>
              <div style={{ fontSize: 16, fontWeight: 700, width: 140 }}>Quantité en stock:</div>
              <input className="inputSmall" value={qteStock} onChange={(e) => setQteStock(e.target.value)} inputMode="numeric" />
            </div>
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
          ) : (
            <div className="canvasWrap canvasWrap--full" />
          )}

          {showDessin ? (
            <div className="rightPanel">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button className="btn" onClick={() => setMode("line")} style={{ width: "100%", border: "1px solid #ddd", background: mode === "line" ? "#e8f0ff" : "#fff", fontWeight: mode === "line" ? 800 : 700 }}>
                  📏 Ligne droite
                </button>
                <button className="btn" onClick={() => setMode("free")} style={{ width: "100%", border: "1px solid #ddd", background: mode === "free" ? "#e8f0ff" : "#fff", fontWeight: mode === "free" ? 800 : 700 }}>
                  ✏️ Dessin libre
                </button>
                <button className="btn" onClick={() => setMode("text")} style={{ width: "100%", border: "1px solid #ddd", background: mode === "text" ? "#e8f0ff" : "#fff", fontWeight: mode === "text" ? 800 : 700 }}>
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
              {isSaving ? "Enregistrement..." : "Enregistrer dans Firebase"}
            </button>
          </div>
        </div>
      </div>

      <div className="tableZone tableZone--center">
        <div className="tableBox tableBox--wide">
          <div className="tableHeader">
            <div>Projet</div>
            <div>Date</div>
            <div>Catégorie</div>
            <div>Détails</div>
            <div>Quantité</div>
            <div>Dessin</div>
          </div>

          <div className="tableScroll tableScroll--fixed">
            {articles.length === 0 ? (
              <div className="tableBody" style={{ padding: 10 }}>(Tableau vide pour l’instant — ajoute un article)</div>
            ) : (
              articles.map((a) => {
                const selected = a.id === selectedId;
                return (
                  <div
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "170px 110px 120px minmax(260px, 1fr) 90px 110px",
                      alignItems: "center",
                      borderBottom: "1px solid #eee",
                      background: selected ? "#dfefff" : "#fff",
                      cursor: "pointer",
                      padding: "6px 8px",
                      fontSize: 13,
                      gap: 6,
                    }}
                  >
                    <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.projet}</div>
                    <div>{a.date}</div>
                    <div>{a.categorie}</div>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.categorie === "Moulures"
                        ? `${a.materiel || ""} — Calibre ${a.calibre || ""}`
                        : (() => {
                            const len = `${a.longueurPieds ?? ""}' ${a.longueurPouces ?? 0}"`;
                            return `${a.type || ""} — ${a.epaisseurPouces || ""}" — ${a.fabricant || ""} — L:${len} x l:${a.largeurPouces || ""}" — Ext:${a.faceExterieure || "-"} / Int:${a.faceInterieure || "-"}`;
                          })()}
                    </div>
                    <div style={{ textAlign: "center", fontWeight: 700 }}>{a.quantite}</div>
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      {a.dessinPng ? (
                        <img
                          src={a.dessinPng}
                          alt="dessin"
                          loading="lazy"
                          decoding="async"
                          style={{ width: 96, height: 44, objectFit: "contain", border: "1px solid #ddd", background: "#fff" }}
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
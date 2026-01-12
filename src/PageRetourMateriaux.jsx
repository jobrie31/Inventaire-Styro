import React, { useMemo, useState } from "react";
import "./pageRetourMateriaux.css";
import DessinCanvas from "./DessinCanvas";

import { db, storage } from "./firebaseConfig";
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

export default function PageRetourMateriaux({ onGoTableau }) {
  const today = useMemo(() => formatDateYYYYMMDD(new Date()), []);
  const [date, setDate] = useState(today);
  const [projet, setProjet] = useState("");

  const [categorie, setCategorie] = useState("Moulures");

  const [materiel, setMateriel] = useState("");
  const [calibre, setCalibre] = useState("");
  const [qteStock, setQteStock] = useState("");

  // ✅ default = line
  const [mode, setMode] = useState("line"); // free | line | text

  const [clearSignal, setClearSignal] = useState(0);
  const [undoSignal, setUndoSignal] = useState(0);

  // ✅ crayon toujours gros
  const penSize = 5;

  const [dernierDessinPng, setDernierDessinPng] = useState(null);

  const [articles, setArticles] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const [isSaving, setIsSaving] = useState(false);

  function setModeLine() {
    setMode("line");
  }
  function setModeFree() {
    setMode("free");
  }
  function setModeText() {
    setMode("text");
  }

  function undoLast() {
    setUndoSignal((n) => n + 1);
  }

  function ajouterArticle() {
    const p = projet.trim();
    if (!p) return alert("Entre un projet.");
    if (categorie !== "Moulures") return alert("La catégorie doit être Moulures.");
    if (!materiel) return alert("Choisis un matériel.");
    if (!calibre) return alert("Choisis un calibre.");

    const qStr = String(qteStock).trim();
    const qNum = Number(qStr);
    if (!qStr || Number.isNaN(qNum) || qNum <= 0) return alert("Entre une quantité valide (> 0 ).");

    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const newItem = {
      id,
      projet: p,
      date,
      categorie: "Moulures",
      materiel,
      calibre,
      quantite: qNum,
      dessinPng: dernierDessinPng || null,
    };

    setArticles((prev) => [newItem, ...prev]);

    setMateriel("");
    setCalibre("");
    setQteStock("");
    setDernierDessinPng(null);
    setClearSignal((n) => n + 1);
    setSelectedId(null);
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

        if (a.dessinPng) {
          const isWebp = a.dessinPng.startsWith("data:image/webp");
          const ext = isWebp ? "webp" : "jpg";
          const contentType = isWebp ? "image/webp" : "image/jpeg";

          dessinPath = `banqueMoulures/${a.id}.${ext}`;
          const storageRef = ref(storage, dessinPath);

          await uploadString(storageRef, a.dessinPng, "data_url", {
            contentType,
            cacheControl: "public,max-age=31536000,immutable",
          });

          dessinUrl = await getDownloadURL(storageRef);
        }

        await addDoc(collection(db, "banqueMoulures"), {
          projet: a.projet,
          date: a.date,
          categorie: a.categorie,
          materiel: a.materiel,
          calibre: a.calibre,
          quantite: a.quantite,
          dessinUrl,
          dessinPath,
          createdAt: serverTimestamp(),
        });
      }

      setArticles([]);
      setSelectedId(null);

      alert("✅ Enregistré dans Firebase (banqueMoulures).");
      onGoTableau?.();
    } catch (err) {
      console.error("🔥 Firebase error FULL:", err);
      alert("❌ Firebase: " + (err?.code || "no-code") + " — " + (err?.message || String(err)));
    } finally {
      setIsSaving(false);
    }
  }

  const btnModeStyle = (active) => ({
    width: "100%",
    border: "1px solid #ddd",
    background: active ? "#e8f0ff" : "#fff",
    fontWeight: active ? 800 : 700,
  });

  return (
    <div className="pageRM pageRM--full">
      <div className="topBar topBar--full">
        <div className="leftLinks">
          <button
            className="btn"
            style={{ width: 180, height: 34 }}
            onClick={() => (onGoTableau ? onGoTableau() : alert("Navigation"))}
          >
            Navigation
          </button>
          <span>Aide</span>
        </div>
        <div />
      </div>

      <div className="titleRow titleRow--full">
        <div />
        <div className="bigTitle">Ajout Moulures</div>
        <div />
      </div>

      <div className="mainRow mainRow--full">
        <div className="mainRowInner">
          {/* LEFT */}
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
            <select className="selectYellow" value={categorie} onChange={(e) => setCategorie(e.target.value)}>
              <option>Moulures</option>
              <option>Panneaux</option>
              <option>Quincaillerie</option>
              <option>Autre</option>
            </select>

            <div style={{ height: 18 }} />

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

            <div className="fieldRow" style={{ marginTop: 28 }}>
              <div style={{ fontSize: 16, fontWeight: 700, width: 140 }}>Quantité en stock:</div>
              <input
                className="inputSmall"
                value={qteStock}
                onChange={(e) => setQteStock(e.target.value)}
                inputMode="numeric"
              />
            </div>
          </div>

          {/* CENTER */}
          <div className="canvasWrap canvasWrap--full">
            <DessinCanvas
              mode={mode}
              clearSignal={clearSignal}
              undoSignal={undoSignal}
              width={760}
              height={520}
              onExportPNG={(dataUrl) => setDernierDessinPng(dataUrl)}
              penSize={penSize}
            />
          </div>

          {/* RIGHT */}
          <div className="rightPanel">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="btn" onClick={setModeLine} style={btnModeStyle(mode === "line")}>
                📏 Ligne droite
              </button>

              <button className="btn" onClick={setModeFree} style={btnModeStyle(mode === "free")}>
                ✏️ Dessin libre
              </button>

              <button className="btn" onClick={setModeText} style={btnModeStyle(mode === "text")}>
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
        </div>
      </div>

      {/* Bottom buttons */}
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
              {isSaving ? "Enregistrement..." : "Enregistrer dans Excel"}
            </button>
          </div>
        </div>
      </div>

      {/* Table zone */}
      <div className="tableZone tableZone--center">
        <div className="tableBox tableBox--wide">
          <div className="tableHeader" style={{ gridTemplateColumns: "180px 120px 140px 160px 110px 110px 120px" }}>
            <div>Projet</div>
            <div>Date</div>
            <div>Catégorie</div>
            <div>Matériel</div>
            <div>Calibre</div>
            <div>Quantité</div>
            <div>Dessin</div>
          </div>

          <div className="tableScroll tableScroll--fixed">
            {articles.length === 0 ? (
              <div className="tableBody" style={{ padding: 10 }}>
                (Tableau vide pour l’instant — ajoute un article)
              </div>
            ) : (
              articles.map((a) => {
                const selected = a.id === selectedId;
                return (
                  <div
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "180px 120px 140px 160px 110px 110px 120px",
                      alignItems: "center",
                      borderBottom: "1px solid #eee",
                      background: selected ? "#dfefff" : "#fff",
                      cursor: "pointer",
                      padding: "6px 8px",
                      fontSize: 13,
                    }}
                  >
                    <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.projet}
                    </div>
                    <div>{a.date}</div>
                    <div>{a.categorie}</div>
                    <div>{a.materiel}</div>
                    <div style={{ textAlign: "center" }}>{a.calibre}</div>
                    <div style={{ textAlign: "center", fontWeight: 700 }}>{a.quantite}</div>
                    <div style={{ display: "flex", justifyContent: "center" }}>
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

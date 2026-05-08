import React, { useEffect, useMemo, useState } from "react";
import { db } from "./firebaseConfig";
import { CLIENT_ID } from "./appClient";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";

import ReqTerminees from "./ReqTerminees.jsx";
import ReqMoulures from "./ReqMoulures.jsx";
import ReqPanneaux from "./ReqPanneaux.jsx";
import { getStatus, tsMillis } from "./requisitionUtils";

export default function Requisition({ onRetour, isAdmin = false }) {
  const [mouluresRows, setMouluresRows] = useState([]);
  const [panneauxRows, setPanneauxRows] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [modalUrl, setModalUrl] = useState(null);

  const [showTerminees, setShowTerminees] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "clients", CLIENT_ID, "requisitionsMoulures"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setMouluresRows(
          snap.docs.map((d) => ({
            id: d.id,
            collectionType: "moulures",
            collectionName: "requisitionsMoulures",
            key: `moulures-${d.id}`,
            ...d.data(),
          }))
        );
      },
      (err) => console.error(err)
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
        setPanneauxRows(
          snap.docs.map((d) => ({
            id: d.id,
            collectionType: "panneaux",
            collectionName: "requisitionsPanneaux",
            key: `panneaux-${d.id}`,
            ...d.data(),
          }))
        );
      },
      (err) => console.error(err)
    );

    return () => unsub();
  }, []);

  const allRows = useMemo(() => {
    return [...mouluresRows, ...panneauxRows].sort((a, b) => {
      return tsMillis(b.createdAt) - tsMillis(a.createdAt);
    });
  }, [mouluresRows, panneauxRows]);

  const activeRows = useMemo(() => {
    return allRows.filter((r) => getStatus(r) !== "terminée");
  }, [allRows]);

  const termineesRows = useMemo(() => {
    return allRows.filter((r) => getStatus(r) === "terminée");
  }, [allRows]);

  const rows = useMemo(() => {
    return showTerminees ? termineesRows : activeRows;
  }, [showTerminees, termineesRows, activeRows]);

  const selected = useMemo(() => {
    return rows.find((r) => r.key === selectedKey);
  }, [rows, selectedKey]);

  useEffect(() => {
    if (selectedKey && !rows.some((r) => r.key === selectedKey)) {
      setSelectedKey(null);
    }
  }, [rows, selectedKey]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") {
        setSelectedKey(null);
        setModalUrl(null);
      }
    }

    if (selectedKey) {
      window.addEventListener("keydown", onKeyDown);
    }

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedKey]);

  function handleTerminated() {
    setSelectedKey(null);
    setModalUrl(null);
    setShowTerminees(true);
  }

  function closeDetailPopup() {
    setSelectedKey(null);
    setModalUrl(null);
  }

  return (
    <div className="pageRM pageRM--full" style={{ background: "#f2f2f2" }}>
      <div className="topBar topBar--full">
        <div className="leftLinks">
          <button
            className="btn"
            style={{ width: 180, height: 34 }}
            onClick={onRetour}
          >
            ↩ Retour
          </button>
        </div>

        <div style={{ fontWeight: 900 }}>Réquisition</div>

        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 10,
            paddingRight: 12,
          }}
        >
          <button
            onClick={() => {
              setShowTerminees((v) => !v);
              setSelectedKey(null);
              setModalUrl(null);
            }}
            style={{
              height: 36,
              minWidth: 150,
              padding: "0 14px",
              borderRadius: 12,
              border: showTerminees ? "1px solid #168000" : "1px solid #999",
              background: showTerminees ? "#168000" : "#fff",
              color: showTerminees ? "#fff" : "#111",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            {showTerminees
              ? "Req actives"
              : `Req terminées (${termineesRows.length})`}
          </button>
        </div>
      </div>

      <ReqTerminees
        rows={rows}
        selectedKey={selectedKey}
        setSelectedKey={setSelectedKey}
        showTerminees={showTerminees}
        isAdmin={isAdmin}
      />

      {selected ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 8000,
            background: "rgba(0,0,0,0.58)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              width: "min(1500px, 96vw)",
              height: "min(850px, 92vh)",
              background: "#f2f2f2",
              borderRadius: 18,
              boxShadow: "0 22px 55px rgba(0,0,0,0.35)",
              border: "1px solid rgba(255,255,255,0.25)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                height: 58,
                minHeight: 58,
                padding: "0 16px",
                borderBottom: "1px solid #d8d8d8",
                background: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                boxSizing: "border-box",
                fontFamily: "Arial, sans-serif",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    fontWeight: 1000,
                    fontSize: 18,
                    whiteSpace: "nowrap",
                  }}
                >
                  Détails réquisition
                </div>

                <div
                  style={{
                    fontWeight: 900,
                    fontSize: 13,
                    color:
                      selected.collectionType === "panneaux"
                        ? "#0b3a78"
                        : "#168000",
                    background:
                      selected.collectionType === "panneaux"
                        ? "#eaf2ff"
                        : "#eaffea",
                    border:
                      selected.collectionType === "panneaux"
                        ? "1px solid #b8d4ff"
                        : "1px solid #b7e3b7",
                    borderRadius: 999,
                    padding: "5px 10px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {selected.collectionType === "panneaux" ? "Panneaux" : "Moulures"}
                </div>

                <div
                  style={{
                    fontWeight: 800,
                    fontSize: 13,
                    color: "#555",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={selected.reqId || selected.id}
                >
                  {selected.reqId || selected.id}
                </div>
              </div>

              <button
                type="button"
                onClick={closeDetailPopup}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: 20,
                  fontWeight: 1000,
                  lineHeight: 1,
                }}
                title="Fermer"
              >
                ✕
              </button>
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                overflowX: "hidden",
                padding: 0,
                boxSizing: "border-box",
              }}
            >
              {selected.collectionType === "panneaux" ? (
                <ReqPanneaux selected={selected} onTerminated={handleTerminated} />
              ) : selected.collectionType === "moulures" ? (
                <ReqMoulures
                  selected={selected}
                  modalUrl={modalUrl}
                  setModalUrl={setModalUrl}
                  isAdmin={isAdmin}
                  onCloseDetail={closeDetailPopup}
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
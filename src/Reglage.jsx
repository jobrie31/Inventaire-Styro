import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebaseConfig";

export default function Reglage({ currentUser, onRetour }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [savingId, setSavingId] = useState("");

  useEffect(() => {
    setLoading(true);
    setErr("");

    const q = query(collection(db, "users"), orderBy("emailLower", "asc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setUsers(arr);
        setLoading(false);
      },
      (e) => {
        console.error("Erreur chargement users:", e);
        setErr("Impossible de charger les utilisateurs.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const currentUserRow = useMemo(() => {
    if (!currentUser?.uid) return null;
    return users.find((u) => u.id === currentUser.uid) || null;
  }, [users, currentUser]);

  async function toggleAdmin(userRow) {
    if (!userRow?.id) return;

    const nextValue = !userRow.isAdmin;

    // Protection simple pour éviter de t'enlever toi-même admin par erreur.
    // Tu peux l'enlever plus tard si tu veux.
    if (userRow.id === currentUser?.uid && nextValue === false) {
      const ok = window.confirm(
        "Attention: tu es en train de t'enlever admin toi-même. Continuer?"
      );
      if (!ok) return;
    }

    setSavingId(userRow.id);
    setErr("");

    try {
      await updateDoc(doc(db, "users", userRow.id), {
        isAdmin: nextValue,
        role: nextValue ? "admin" : "employe",
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("Erreur update admin:", e);
      setErr("Impossible de modifier le rôle admin.");
    } finally {
      setSavingId("");
    }
  }

  const pageStyle = {
    minHeight: "100%",
    background: "#f2f2f2",
    padding: 18,
    boxSizing: "border-box",
    fontFamily: "Arial, sans-serif",
  };

  const cardStyle = {
    maxWidth: 1050,
    margin: "0 auto",
    background: "#fff",
    border: "1px solid #d6d6d6",
    borderRadius: 12,
    boxShadow: "0 4px 14px rgba(0,0,0,0.06)",
    overflow: "hidden",
  };

  const headerStyle = {
    padding: "14px 16px",
    borderBottom: "1px solid #e5e5e5",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    background: "#fbfbfb",
  };

  const btnStyle = {
    height: 36,
    padding: "0 14px",
    border: "1px solid #aaa",
    borderRadius: 8,
    background: "#e6e6e6",
    fontWeight: 800,
    cursor: "pointer",
  };

  const tableWrapStyle = {
    width: "100%",
    overflowX: "auto",
  };

  const thStyle = {
    textAlign: "left",
    padding: "10px 12px",
    borderBottom: "1px solid #ddd",
    background: "#f7f7f7",
    fontSize: 13,
    whiteSpace: "nowrap",
  };

  const tdStyle = {
    padding: "10px 12px",
    borderBottom: "1px solid #eee",
    fontSize: 14,
    verticalAlign: "middle",
  };

  const badgeStyle = (isAdmin) => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 80,
    height: 26,
    padding: "0 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    color: isAdmin ? "#065f1f" : "#7a1f1f",
    background: isAdmin ? "#d9fbe3" : "#ffe0e0",
    border: `1px solid ${isAdmin ? "#83d99b" : "#f0aaaa"}`,
  });

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22 }}>Réglages</h2>
            <div style={{ marginTop: 4, fontSize: 13, color: "#555" }}>
              Gestion des comptes admin / non-admin
            </div>
          </div>

          <button type="button" style={btnStyle} onClick={onRetour}>
            Retour
          </button>
        </div>

        <div style={{ padding: 16 }}>
          {currentUserRow && (
            <div
              style={{
                marginBottom: 14,
                padding: 12,
                borderRadius: 10,
                background: "#f7faff",
                border: "1px solid #dbeafe",
                fontSize: 14,
              }}
            >
              Connecté comme :{" "}
              <strong>{currentUserRow.email || currentUser?.email}</strong>{" "}
              — Statut :{" "}
              <strong>{currentUserRow.isAdmin ? "Admin" : "Non-admin"}</strong>
            </div>
          )}

          <div
            style={{
              marginBottom: 14,
              padding: 12,
              borderRadius: 10,
              background: "#fffbe6",
              border: "1px solid #f0df91",
              fontSize: 14,
              lineHeight: 1.45,
            }}
          >
            Pour l’instant, les nouveaux comptes sont créés admin par défaut.
            Tu peux ensuite décocher ceux qui ne doivent plus être admin.
          </div>

          {err && (
            <div
              style={{
                marginBottom: 14,
                padding: 12,
                borderRadius: 10,
                background: "#ffecec",
                color: "#a00000",
                border: "1px solid #ffb3b3",
                fontWeight: 800,
              }}
            >
              {err}
            </div>
          )}

          {loading ? (
            <div style={{ padding: 18, fontWeight: 800 }}>Chargement...</div>
          ) : users.length === 0 ? (
            <div style={{ padding: 18, color: "#555" }}>
              Aucun utilisateur trouvé. Les utilisateurs apparaîtront ici après
              leur première connexion.
            </div>
          ) : (
            <div style={tableWrapStyle}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: 720,
                }}
              >
                <thead>
                  <tr>
                    <th style={thStyle}>Email</th>
                    <th style={thStyle}>Nom</th>
                    <th style={thStyle}>Statut</th>
                    <th style={thStyle}>Admin</th>
                    <th style={thStyle}>UID</th>
                  </tr>
                </thead>

                <tbody>
                  {users.map((u) => {
                    const isAdmin = !!u.isAdmin;
                    const isSaving = savingId === u.id;

                    return (
                      <tr key={u.id}>
                        <td style={{ ...tdStyle, fontWeight: 800 }}>
                          {u.email || "-"}
                        </td>

                        <td style={tdStyle}>{u.displayName || "-"}</td>

                        <td style={tdStyle}>
                          <span style={badgeStyle(isAdmin)}>
                            {isAdmin ? "ADMIN" : "NON-ADMIN"}
                          </span>
                        </td>

                        <td style={tdStyle}>
                          <label
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                              fontWeight: 800,
                              cursor: isSaving ? "not-allowed" : "pointer",
                              opacity: isSaving ? 0.6 : 1,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isAdmin}
                              disabled={isSaving}
                              onChange={() => toggleAdmin(u)}
                              style={{
                                width: 18,
                                height: 18,
                                cursor: isSaving ? "not-allowed" : "pointer",
                              }}
                            />
                            {isSaving ? "Sauvegarde..." : "Admin"}
                          </label>
                        </td>

                        <td
                          style={{
                            ...tdStyle,
                            color: "#666",
                            fontSize: 12,
                            fontFamily: "monospace",
                          }}
                        >
                          {u.id}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
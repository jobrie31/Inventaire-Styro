import React, { useState } from "react";
import { auth } from "./firebaseConfig";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";

export default function Login() {
  const [mode, setMode] = useState("login"); // "login" | "signup" | "reset"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setErr("");
    setMsg("");

    const em = email.trim();
    if (!em) return setErr("Entre ton email.");
    if (!password) return setErr("Entre ton mot de passe.");

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, em, password);
      setMsg("✅ Connecté.");
    } catch (e2) {
      console.error(e2);
      setErr(mapAuthError(e2));
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e) {
    e.preventDefault();
    setErr("");
    setMsg("");

    const em = email.trim();
    if (!em) return setErr("Entre ton email.");
    if (!password || password.length < 6) return setErr("Mot de passe: minimum 6 caractères.");

    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, em, password);
      setMsg("✅ Compte créé et connecté.");
    } catch (e2) {
      console.error(e2);
      setErr(mapAuthError(e2));
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    setErr("");
    setMsg("");

    const em = email.trim();
    if (!em) return setErr("Entre ton email.");

    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, em);
      setMsg("✅ Email de réinitialisation envoyé.");
    } catch (e2) {
      console.error(e2);
      setErr(mapAuthError(e2));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    setErr("");
    setMsg("");
    setLoading(true);
    try {
      await signOut(auth);
      setMsg("✅ Déconnecté.");
    } catch (e2) {
      console.error(e2);
      setErr(mapAuthError(e2));
    } finally {
      setLoading(false);
    }
  }

  const boxStyle = {
    maxWidth: 420,
    margin: "60px auto",
    padding: 20,
    border: "1px solid #ddd",
    borderRadius: 12,
    background: "#fff",
    boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
    fontFamily: "Arial, sans-serif",
  };

  const inputStyle = {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 10,
    border: "1px solid #ccc",
    fontSize: 16,
    outline: "none",
  };

  const btnStyle = {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 10,
    border: "none",
    background: "#0b5cff",
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    opacity: loading ? 0.7 : 1,
  };

  const tabStyle = (active) => ({
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: active ? "#f0f6ff" : "#fff",
    cursor: "pointer",
    fontWeight: active ? 800 : 600,
    fontSize: 14,
  });

  return (
    <div style={boxStyle}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button type="button" style={tabStyle(mode === "login")} onClick={() => setMode("login")}>
          Connexion
        </button>
        <button type="button" style={tabStyle(mode === "signup")} onClick={() => setMode("signup")}>
          Créer compte
        </button>
        <button type="button" style={tabStyle(mode === "reset")} onClick={() => setMode("reset")}>
          Reset
        </button>
      </div>

      <h2 style={{ margin: "6px 0 16px 0" }}>
        {mode === "login" ? "Connexion" : mode === "signup" ? "Créer un compte" : "Réinitialiser le mot de passe"}
      </h2>

      <form onSubmit={mode === "login" ? handleLogin : mode === "signup" ? handleSignup : handleReset}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontWeight: 700, display: "block", marginBottom: 6 }}>Email</label>
          <input
            style={inputStyle}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ex: jo@styro.com"
            autoComplete="email"
          />
        </div>

        {mode !== "reset" && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontWeight: 700, display: "block", marginBottom: 6 }}>Mot de passe</label>
            <input
              style={inputStyle}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </div>
        )}

        <button style={btnStyle} disabled={loading} type="submit">
          {loading
            ? "..."
            : mode === "login"
            ? "Se connecter"
            : mode === "signup"
            ? "Créer le compte"
            : "Envoyer le reset"}
        </button>
      </form>

      <div style={{ marginTop: 14 }}>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loading}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: "#fff",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Déconnexion
        </button>
      </div>

      {err && (
        <div style={{ marginTop: 14, color: "#b00020", fontWeight: 700, whiteSpace: "pre-wrap" }}>
          ❌ {err}
        </div>
      )}
      {msg && (
        <div style={{ marginTop: 14, color: "#0a7a28", fontWeight: 800, whiteSpace: "pre-wrap" }}>
          {msg}
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 12, color: "#666" }}>
        Astuce: active Email/Password dans Firebase Console → Authentication → Sign-in method.
      </div>
    </div>
  );
}

function mapAuthError(e) {
  const code = e?.code || "";
  switch (code) {
    case "auth/invalid-email":
      return "Email invalide.";
    case "auth/user-not-found":
      return "Aucun utilisateur avec cet email.";
    case "auth/wrong-password":
      return "Mot de passe incorrect.";
    case "auth/invalid-credential":
      return "Email ou mot de passe invalide.";
    case "auth/email-already-in-use":
      return "Cet email est déjà utilisé.";
    case "auth/weak-password":
      return "Mot de passe trop faible (min 6 caractères).";
    case "auth/too-many-requests":
      return "Trop d’essais. Réessaie plus tard.";
    default:
      return e?.message || "Erreur inconnue.";
  }
}

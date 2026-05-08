import { auth } from "./firebaseConfig";

export const SECTIONS_COUR = ["", "1", "2", "3", "4", "5", "6"];

export function fmtTS(ts) {
  try {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString("fr-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function tsMillis(ts) {
  try {
    if (!ts) return 0;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.getTime();
  } catch {
    return 0;
  }
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function longueurTexte(pieds, pouces) {
  if (pieds === null || pieds === undefined || pieds === "") return "";
  return `${pieds},${String(pouces ?? 0)}`;
}

export function itemKey(req, it, index) {
  return `${req?.id || "req"}-${it?.banqueId || "item"}-${index}`;
}

export function getStatus(req) {
  if (!req) return "demande";

  if (req.collectionType === "panneaux" && req.status === "brouillon") {
    return "demande";
  }

  return req.status || "demande";
}

export function currentUserInfo() {
  const user = auth?.currentUser || null;

  return {
    uid: user?.uid || "",
    email: user?.email || "",
    name: user?.displayName || user?.email || "Utilisateur inconnu",
  };
}

export function actorName(row, mode = "created") {
  if (!row) return "Utilisateur non enregistré";

  if (mode === "completed") {
    return (
      row.completedByName ||
      row.completedByEmail ||
      row.updatedByName ||
      row.updatedByEmail ||
      row.createdByName ||
      row.createdByEmail ||
      row.userName ||
      row.userEmail ||
      "Utilisateur non enregistré"
    );
  }

  if (mode === "updated") {
    return (
      row.updatedByName ||
      row.updatedByEmail ||
      row.completedByName ||
      row.completedByEmail ||
      row.createdByName ||
      row.createdByEmail ||
      row.userName ||
      row.userEmail ||
      "Utilisateur non enregistré"
    );
  }

  return (
    row.createdByName ||
    row.createdByEmail ||
    row.userName ||
    row.userEmail ||
    row.updatedByName ||
    row.updatedByEmail ||
    row.completedByName ||
    row.completedByEmail ||
    "Utilisateur non enregistré"
  );
}

export function actorEmail(row, mode = "created") {
  if (!row) return "";

  if (mode === "completed") {
    return (
      row.completedByEmail ||
      row.updatedByEmail ||
      row.createdByEmail ||
      row.userEmail ||
      ""
    );
  }

  if (mode === "updated") {
    return (
      row.updatedByEmail ||
      row.completedByEmail ||
      row.createdByEmail ||
      row.userEmail ||
      ""
    );
  }

  return (
    row.createdByEmail ||
    row.userEmail ||
    row.updatedByEmail ||
    row.completedByEmail ||
    ""
  );
}
import React from "react";
import * as XLSX from "xlsx";

function toMoneyNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : "";
}

function calcLengthFeet(row) {
  const pieds = Number(row.longueurPieds ?? 0);
  const pouces = Number(row.longueurPouces ?? 0);
  if (!Number.isFinite(pieds)) return 0;
  return pieds + (Number.isFinite(pouces) ? pouces : 0) / 12;
}

function calcPC(row) {
  const L = calcLengthFeet(row);
  const W = Number(row.largeurPouces ?? 0) / 12;
  const Q = Number(row.quantite ?? 0);
  if (!Number.isFinite(L) || !Number.isFinite(W) || !Number.isFinite(Q)) return 0;
  return L * W * Q;
}

function moneyCell(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : "";
}

export default function PanneauxExcelButton({
  rows = [],
  prixUnitaire,
  settings,
}) {
  function creerExcel() {
    if (!rows.length) {
      alert("Aucune donnée à exporter.");
      return;
    }

    const mult = settings?.multipliers || {
      venteMin: 0.9,
      sugSans: 0.88,
      sugAvec: 0.85,
    };

    const data = rows.map((r) => {
      const prix = prixUnitaire ? prixUnitaire(r, settings) : null;
      const pc = calcPC(r);
      const valeur = Number.isFinite(prix) ? pc * prix : "";
      const venteMin =
        Number.isFinite(prix) && Number(mult.venteMin) > 0
          ? prix / Number(mult.venteMin)
          : "";
      const sugSans =
        Number.isFinite(prix) && Number(mult.sugSans) > 0
          ? prix / Number(mult.sugSans)
          : "";
      const sugAvec =
        Number.isFinite(prix) && Number(mult.sugAvec) > 0
          ? prix / Number(mult.sugAvec)
          : "";

      return {
        Projet: r.projet || "",
        "Section cour": r.sectionCour || "",
        Date: r.date || "",
        Type: r.type || "",
        "Épaisseur": r.epaisseurPouces || "",
        Fabricant: r.fabricant || "",
        Profile: r.profile || "",
        "Modèle": r.modele || "",
        Fini: r.fini || "",
        "Longueur pieds": r.longueurPieds ?? "",
        "Longueur pouces": r.longueurPouces ?? "",
        "Largeur pouces": r.largeurPouces ?? "",
        "Quantité": r.quantite ?? "",
        "Face extérieure": r.faceExterieure || "",
        "Face intérieure": r.faceInterieure || "",
        "Prix unitaire": moneyCell(prix),
        PC: Number.isFinite(pc) ? pc : "",
        Valeur: moneyCell(valeur),
        "Vente min.": moneyCell(venteMin),
        "Sug. sans": moneyCell(sugSans),
        "Sug. avec": moneyCell(sugAvec),
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);

    ws["!cols"] = [
      { wch: 22 }, // Projet
      { wch: 12 }, // Section cour
      { wch: 14 }, // Date
      { wch: 12 }, // Type
      { wch: 10 }, // Épaisseur
      { wch: 18 }, // Fabricant
      { wch: 16 }, // Profile
      { wch: 16 }, // Modèle
      { wch: 14 }, // Fini
      { wch: 14 }, // Long pieds
      { wch: 15 }, // Long pouces
      { wch: 15 }, // Largeur pouces
      { wch: 10 }, // Qté
      { wch: 18 }, // Face ext
      { wch: 18 }, // Face int
      { wch: 14 }, // Prix unit
      { wch: 12 }, // PC
      { wch: 14 }, // Valeur
      { wch: 14 }, // Vente min
      { wch: 14 }, // Sug sans
      { wch: 14 }, // Sug avec
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Panneaux");

    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const fileName = `inventaire-panneaux-${now.getFullYear()}-${pad(
      now.getMonth() + 1
    )}-${pad(now.getDate())}.xlsx`;

    XLSX.writeFile(wb, fileName);
  }

  return (
    <button
      className="btn"
      style={{ width: 140, height: 34 }}
      onClick={creerExcel}
      title="Créer un fichier Excel"
    >
      Créer excel
    </button>
  );
}
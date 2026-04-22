import React from "react";
import * as XLSX from "xlsx";

export default function MouluresExcelButton({ rows = [] }) {
  function creerExcel() {
    if (!rows.length) {
      alert("Aucune donnée à exporter.");
      return;
    }

    const data = rows.map((r) => ({
      Projet: r.projet || "",
      Date: r.date || "",
      Catégorie: r.categorie || "",
      Matériel: r.materiel || "",
      Calibre: r.calibre || "",
      Quantité: r.quantite ?? "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);

    ws["!cols"] = [
      { wch: 24 }, // Projet
      { wch: 14 }, // Date
      { wch: 16 }, // Catégorie
      { wch: 20 }, // Matériel
      { wch: 12 }, // Calibre
      { wch: 12 }, // Quantité
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Moulures");

    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const fileName = `inventaire-moulures-${now.getFullYear()}-${pad(
      now.getMonth() + 1
    )}-${pad(now.getDate())}.xlsx`;

    XLSX.writeFile(wb, fileName);
  }

  return (
    <button
      onClick={creerExcel}
      style={{
        height: 36,
        padding: "0 14px",
        borderRadius: 10,
        border: "1px solid #198754",
        background: "#198754",
        color: "#fff",
        fontWeight: 800,
        cursor: "pointer",
        boxShadow: "0 6px 14px rgba(25,135,84,0.18)",
        fontSize: 13,
      }}
      title="Créer un fichier Excel"
    >
      Créer excel
    </button>
  );
}
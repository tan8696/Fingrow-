import { useState } from "react";
import { getPDFUrl } from "../hooks/useReport";

export default function DownloadReport({ sessionId, t }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      const url = getPDFUrl(sessionId);
      const res = await fetch(url);
      if (!res.ok) throw new Error("PDF generation failed on server");
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `feasibility_report_${sessionId.slice(0, 8)}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div>
      <button
        id="download-pdf-btn"
        className="download-btn"
        onClick={handleDownload}
        disabled={downloading}
      >
        {downloading ? (
          <><div className="spinner" style={{ borderTopColor: "#fff" }} /> Generating PDF...</>
        ) : (
          <> 📄 {t.downloadPDF}</>
        )}
      </button>
      {error && (
        <p style={{ color: "#dc2626", fontSize: "0.78rem", marginTop: "8px", textAlign: "center" }}>
          ⚠️ {error}
        </p>
      )}
    </div>
  );
}

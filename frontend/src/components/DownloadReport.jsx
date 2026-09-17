import { useState } from "react";
import { downloadReportPdf } from "../hooks/useReport";

export default function DownloadReport({ sessionId, t }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      // Carries the session token, which a plain link cannot.
      await downloadReportPdf(sessionId);
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

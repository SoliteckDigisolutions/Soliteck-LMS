"use client";

import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";

interface PdfDownloadButtonProps {
  targetId: string;
  fileName?: string;
}

export function PdfDownloadButton({
  targetId,
  fileName = "document.pdf",
}: PdfDownloadButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    const node = document.getElementById(targetId);

    if (!node) {
      console.error(`Element with id "${targetId}" not found.`);
      return;
    }

    setLoading(true);

    try {
      // 1. Generate high-quality image of the DOM element
      const dataUrl = await toPng(node, {
        quality: 0.98,
        pixelRatio: 2, // Crisp 2x retina resolution
        backgroundColor: "#ffffff", // Prevents transparent elements rendering black
        cacheBust: true,
      });

      // 2. Load image into memory to get natural dimensions
      const img = new Image();
      img.src = dataUrl;
      await new Promise((resolve) => {
        img.onload = resolve;
      });

      const imgWidth = img.width;
      const imgHeight = img.height;

      // 3. Determine best orientation (Landscape vs Portrait)
      const isLandscape = imgWidth > imgHeight;
      const orientation = isLandscape ? "landscape" : "portrait";

      const pdf = new jsPDF({
        orientation,
        unit: "mm",
        format: "a4",
      });

      // Standard A4 dimensions in mm
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      
      const margin = 2; // 12mm margins around page
      const printableWidth = pageWidth - margin * 2;
      const printableHeight = pageHeight - margin * 2;

      // Calculate scaled dimensions to fit page width
      const renderWidth = printableWidth;
      const renderHeight = (imgHeight * renderWidth) / imgWidth;

      // Check if it fits on a single page
      if (renderHeight <= printableHeight) {
        // Center vertically on single page if there is extra room
        const yOffset = margin + (printableHeight - renderHeight) / 2;
        pdf.addImage(
          dataUrl,
          "PNG",
          margin,
          yOffset,
          renderWidth,
          renderHeight,
          undefined,
          "FAST"
        );
      } else {
        // Multi-page document handling via canvas slicing
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        if (!ctx) throw new Error("Could not create canvas context");

        const pageImgHeight = (imgWidth * printableHeight) / printableWidth;
        let sourceY = 0;
        let isFirstPage = true;

        while (sourceY < imgHeight) {
          const sliceHeight = Math.min(pageImgHeight, imgHeight - sourceY);

          canvas.width = imgWidth;
          canvas.height = sliceHeight;

          // Clear & slice current section
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(
            img,
            0,
            sourceY,
            imgWidth,
            sliceHeight,
            0,
            0,
            imgWidth,
            sliceHeight
          );

          const pageData = canvas.toDataURL("image/png");
          const currentRenderHeight = (sliceHeight * printableWidth) / imgWidth;

          if (!isFirstPage) {
            pdf.addPage();
          }

          pdf.addImage(
            pageData,
            "PNG",
            margin,
            margin,
            printableWidth,
            currentRenderHeight,
            undefined,
            "FAST"
          );

          sourceY += sliceHeight;
          isFirstPage = false;
        }
      }

      // 4. Save the generated PDF
      const finalFileName = fileName.endsWith(".pdf")
        ? fileName
        : `${fileName}.pdf`;
      pdf.save(finalFileName);
    } catch (error) {
      console.error("Error generating PDF:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={loading}
      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? (
        <LoaderCircle className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      <span>{loading ? "Generating PDF..." : "Download PDF"}</span>
    </button>
  );
}
"use client";

import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { Download, LoaderCircle } from "lucide-react";
import { toJpeg } from "html-to-image";
import { jsPDF } from "jspdf";
import { EmployeeReportCard } from "@/components/reports/EmployeeReportCard";
import {
  getEmployeeMonthlyReport,
  getMonthSummaries,
} from "@/lib/data";

type EmployeeSummary = Awaited<ReturnType<typeof getMonthSummaries>>[number];
type EmployeeReport = Awaited<ReturnType<typeof getEmployeeMonthlyReport>>;

type Props = {
  summaries: EmployeeSummary[];
  monthKeys: string[];
  periodLabel: string;
};

const ALL_DEPARTMENTS = "__all_departments__";
const REPORT_NODE_ID = "bulk-employee-report-card";

function slug(value: string) {
  return value
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "report";
}

function waitForRender() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.setTimeout(resolve, 250);
      });
    });
  });
}

async function loadImage(dataUrl: string) {
  const image = new Image();
  image.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not load a generated report image."));
  });
  return image;
}

function addReportImage(pdf: jsPDF, image: HTMLImageElement, firstPage: boolean) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 2;
  const printableWidth = pageWidth - margin * 2;
  const printableHeight = pageHeight - margin * 2;
  const pageSourceHeight = (image.width * printableHeight) / printableWidth;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not create a canvas to assemble report pages.");
  }

  let sourceY = 0;
  let isFirstSlice = true;
  while (sourceY < image.height) {
    const sliceHeight = Math.min(pageSourceHeight, image.height - sourceY);
    canvas.width = image.width;
    canvas.height = sliceHeight;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      image,
      0,
      sourceY,
      image.width,
      sliceHeight,
      0,
      0,
      image.width,
      sliceHeight,
    );

    if (!firstPage || !isFirstSlice) {
      pdf.addPage();
    }

    const pageData = canvas.toDataURL("image/jpeg", 0.82);
    const renderHeight = (sliceHeight * printableWidth) / image.width;
    pdf.addImage(
      pageData,
      "JPEG",
      margin,
      margin,
      printableWidth,
      renderHeight,
      undefined,
      "FAST",
    );
    sourceY += sliceHeight;
    isFirstSlice = false;
  }
}

export function BulkEmployeeReportsPdf({
  summaries,
  monthKeys,
  periodLabel,
}: Props) {
  const [department, setDepartment] = useState(ALL_DEPARTMENTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renderReport, setRenderReport] = useState<EmployeeReport>(null);
  const [progress, setProgress] = useState("");

  const departments = useMemo(
    () =>
      Array.from(
        new Set(summaries.map((employee) => employee.department || "General")),
      ).sort((a, b) => a.localeCompare(b)),
    [summaries],
  );

  async function handleDownload() {
    if (summaries.length === 0 || monthKeys.length === 0) return;

    setLoading(true);
    setError(null);
    try {
      const selectedEmployees = summaries
        .filter(
          (employee) =>
            department === ALL_DEPARTMENTS ||
            (employee.department || "General") === department,
        )
        .sort(
          (a, b) =>
            a.employeeName.localeCompare(b.employeeName) ||
            a.employeeCode.localeCompare(b.employeeCode),
        );
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      let generatedCount = 0;
      const reportCount = selectedEmployees.length * monthKeys.length;

      for (const employee of selectedEmployees) {
        for (const monthKey of monthKeys) {
          setProgress(
            `Preparing ${generatedCount + 1} of ${reportCount}: ${employee.employeeName}`,
          );
          const report = await getEmployeeMonthlyReport(
            monthKey,
            employee.employeeCode,
          );
          if (!report) continue;

          flushSync(() => {
            setRenderReport(report);
          });
          await waitForRender();

          const node = document.getElementById(REPORT_NODE_ID);
          if (!node) {
            throw new Error("The employee report preview was not available for PDF export.");
          }

          const dataUrl = await toJpeg(node, {
            quality: 0.82,
            pixelRatio: 1.5,
            backgroundColor: "#ffffff",
            cacheBust: true,
          });
          const image = await loadImage(dataUrl);
          addReportImage(pdf, image, generatedCount === 0);
          generatedCount += 1;
          setProgress(`Prepared ${generatedCount} report(s)`);
        }
      }

      if (generatedCount === 0) {
        throw new Error("No employee reports were found for the selected period.");
      }

      const fileName = `employee-leave-reports-${slug(periodLabel)}-${slug(
          department === ALL_DEPARTMENTS ? "all-departments" : department,
        )}.pdf`;
      const pdfBlob = pdf.output("blob");
      const downloadUrl = URL.createObjectURL(pdfBlob);
      const downloadLink = document.createElement("a");
      downloadLink.href = downloadUrl;
      downloadLink.download = fileName;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
    } catch (caughtError) {
      console.error("Could not generate bulk employee report PDF.", caughtError);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not generate employee report PDF.",
      );
    } finally {
      setRenderReport(null);
      setProgress("");
      setLoading(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="report-pdf-department" className="sr-only">
          Department for bulk PDF
        </label>
        <select
          id="report-pdf-department"
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
          disabled={departments.length === 0 || loading}
          className="h-9 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[12px] text-[#374151] outline-none focus:border-[#0070f3]"
        >
          <option value={ALL_DEPARTMENTS}>All departments</option>
          {departments.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleDownload}
          disabled={summaries.length === 0 || monthKeys.length === 0 || loading}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#111827] px-3 text-[12px] font-medium text-white transition hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          {loading ? progress || "Generating PDF…" : "Download PDF"}
        </button>
        {error && (
          <p role="alert" className="basis-full text-[11px] text-red-600">
            {error}
          </p>
        )}
      </div>
      {renderReport && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            top: 0,
            left: "-10000px",
            width: "210mm",
            zIndex: -1,
          }}
        >
          <EmployeeReportCard
            key={`${renderReport.employee.employeeCode}-${renderReport.summary.monthKey}`}
            company={renderReport.company}
            employee={renderReport.employee}
            summary={renderReport.summary}
            snapshot={renderReport.snapshot}
            weeklyBreakdown={renderReport.weeklyBreakdown}
            events={renderReport.events}
            reportId={REPORT_NODE_ID}
          />
        </div>
      )}
    </>
  );
}

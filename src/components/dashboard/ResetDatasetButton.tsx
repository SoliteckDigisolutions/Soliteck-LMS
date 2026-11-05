"use client";

import { useState } from "react";
import { RotateCcw, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { clearAllStoredData } from "@/lib/storage";

export function ResetDatasetButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleReset() {
    const confirmed = window.confirm(
      "This will permanently remove ALL uploaded data — leave events, monthly summaries, and uploads from local storage. You will be taken to the upload page to start fresh. Continue?",
    );

    if (!confirmed) {
      return;
    }

    setLoading(true);

    try {
      clearAllStoredData();
      router.push("/upload");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      id="reset-all-data-btn"
      type="button"
      onClick={handleReset}
      disabled={loading}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#fecaca] bg-white px-4 text-[13px] font-medium text-[#dc2626] transition hover:bg-[#fef2f2] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? (
        <LoaderCircle className="h-4 w-4 animate-spin" />
      ) : (
        <RotateCcw className="h-4 w-4" />
      )}
      <span>{loading ? "Resetting…" : "Reset & Re-upload"}</span>
    </button>
  );
}

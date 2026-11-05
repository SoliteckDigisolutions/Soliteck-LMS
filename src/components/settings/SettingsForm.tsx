"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { CheckCircle2, Image as ImageIcon, LoaderCircle, Upload, X } from "lucide-react";
import { getStoredSettings, saveStoredSettings } from "@/lib/storage";

const DEFAULT_LOGO = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRctbwP-ltQVujALktUt7y1VjdYULwirj_hZ1jkZ7RrLA&s";

const settingsSchema = z.object({
  companyName: z.string().min(2, "Enter the company name."),
  companyLogoUrl: z
    .string()
    .refine(
      (val) =>
        !val ||
        val.startsWith("http://") ||
        val.startsWith("https://") ||
        val.startsWith("data:image/") ||
        val.startsWith("/"),
      { message: "Enter a valid logo URL or image data." },
    ),
  reviewByName: z.string().min(2, "Enter the reviewer name."),
  defaultManagerName: z.string().min(2, "Enter the manager label."),
  companyFooter: z.string().min(4, "Enter the footer note."),
});

type SettingsInput = z.input<typeof settingsSchema>;
type SettingsValues = z.output<typeof settingsSchema>;

export function SettingsForm({
  initialValues,
}: {
  initialValues?: SettingsInput;
}) {
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SettingsInput, unknown, SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: initialValues ?? {
      companyName: "Leave Manager",
      companyLogoUrl: DEFAULT_LOGO,
      reviewByName: "HR Team",
      defaultManagerName: "Sanjay Sir",
      companyFooter: "This document is confidential",
    },
  });

  useEffect(() => {
    const current = getStoredSettings();
    reset({
      companyName: current.companyName,
      companyLogoUrl: current.companyLogoUrl || DEFAULT_LOGO,
      reviewByName: current.reviewByName,
      defaultManagerName: current.defaultManagerName,
      companyFooter: current.companyFooter,
    });
  }, [reset]);

  const currentLogo = watch("companyLogoUrl");

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setValue("companyLogoUrl", reader.result, { shouldValidate: true, shouldDirty: true });
      }
    };
    reader.readAsDataURL(file);
  }

  const router = useRouter();

  async function onSubmit(values: SettingsValues) {
    setSaved(false);

    const current = getStoredSettings();

    saveStoredSettings({
      ...current,
      companyName: values.companyName,
      companyLogoUrl: values.companyLogoUrl || null,
      reviewByName: values.reviewByName,
      defaultManagerName: values.defaultManagerName,
      companyFooter: values.companyFooter,
    });

    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 4000);
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="rounded-xl border border-[#e5e7eb] bg-white p-7 sm:p-8 shadow-[0_1px_3px_0_rgba(0,0,0,0.05)]"
    >
      <div className="grid gap-6 md:grid-cols-2 md:gap-7">
        <Field label="Company name" error={errors.companyName?.message}>
          <input
            {...register("companyName")}
            className="input"
            placeholder="e.g. Acme Corporation"
          />
        </Field>

        <div className="space-y-2">
          <label className="block text-[13px] font-medium text-[#374151]">
            Company logo (URL or upload)
          </label>
          <div className="flex items-center gap-2.5">
            <input
              {...register("companyLogoUrl")}
              placeholder="https://... or upload below"
              className="input flex-1"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-10 flex-shrink-0 items-center gap-2 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-3.5 text-[12.5px] font-medium text-[#374151] transition hover:border-[#d1d5db] hover:bg-white"
            >
              <Upload className="h-4 w-4" />
              Upload
            </button>
          </div>
          {errors.companyLogoUrl?.message && (
            <p className="text-[12px] text-red-600">{errors.companyLogoUrl.message}</p>
          )}

          {currentLogo && (
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-[#e5e7eb] bg-[#fafafa] p-3">
              <div className="flex h-11 w-16 items-center justify-center overflow-hidden rounded-lg border border-[#e5e7eb] bg-white p-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentLogo}
                  alt="Logo preview"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-medium text-[#111827]">Logo loaded</p>
                <p className="truncate text-[11px] text-[#6b7280]">
                  Will appear on printed employee report cards
                </p>
              </div>
              <button
                type="button"
                onClick={() => setValue("companyLogoUrl", "", { shouldDirty: true })}
                className="rounded-lg p-1.5 text-[#9ca3af] transition hover:bg-gray-200 hover:text-[#111827]"
                title="Remove logo"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* <Field label="Review by name" error={errors.reviewByName?.message}>
          <input
            {...register("reviewByName")}
            className="input"
            placeholder="e.g. HR Operations"
          />
        </Field> */}

        {/* <Field label="Default manager name" error={errors.defaultManagerName?.message}>
          <input
            {...register("defaultManagerName")}
            className="input"
            placeholder="e.g. Reporting Manager"
          />
        </Field> */}

        <Field label="Footer note" error={errors.companyFooter?.message}>
          <input
            {...register("companyFooter")}
            className="input"
            placeholder="e.g. Confidential - Internal HR use only"
          />
        </Field>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-[#f3f4f6] pt-6">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#111827] px-5 text-[13.5px] font-medium text-white transition hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:bg-[#9ca3af]"
        >
          {isSubmitting ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          <span>{isSubmitting ? "Saving changes..." : "Save settings"}</span>
        </button>

        {saved && (
          <div className="inline-flex items-center gap-2 text-[13px] font-medium text-[#059669]">
            <CheckCircle2 className="h-4 w-4" />
            <span>Settings saved successfully</span>
          </div>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[13px] font-medium text-[#374151]">{label}</span>
      {children}
      {error ? <span className="block text-[12px] text-red-600">{error}</span> : null}
    </label>
  );
}
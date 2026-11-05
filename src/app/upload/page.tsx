import { UploadWorkspace } from "@/components/upload/UploadWorkspace";
import { Page } from "@/components/ui/Page";

export default function UploadPage() {
  return (
    <Page
      eyebrow="Excel upload"
      title="Preview your monthly workbook before import"
      description="Upload the monthly HR Excel workbook to generate a normalized line preview of employee totals and detailed leave entries. Once the preview looks correct, import it into local storage for dashboard and report usage."
    >
      <UploadWorkspace />
    </Page>
  );
}

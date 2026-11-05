import { Page } from "@/components/ui/Page";
import { SettingsForm } from "@/components/settings/SettingsForm";

export default function SettingsPage() {
  return (
    <Page
      eyebrow="Settings"
      title="Company and leave allocation settings"
      description="Customize the organization branding, default reviewer text, manager label, and monthly leave allocation used across report previews."
    >
      <SettingsForm />
    </Page>
  );
}

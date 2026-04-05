import Card from "../../components/ui/Card";
import { APP_NAME } from "../../utils/constants";

export default function About() {
  return (
    <main className="pt-24 pb-28 px-6 md:px-12 max-w-4xl mx-auto">
      <div className="mb-10">
        <h1 className="font-headline text-4xl font-extrabold text-on-surface tracking-tight mb-2">About</h1>
        <p className="text-on-surface-variant text-lg tracking-wide">
          {APP_NAME} is an offline-first diabetic retinopathy (DR) screening suite designed for clinical workflows.
        </p>
      </div>

      <div className="space-y-6">
        <Card className="p-6">
          <div className="text-on-surface font-bold mb-2">What it does</div>
          <ul className="list-disc pl-5 text-on-surface-variant space-y-1">
            <li>Grades DR severity from fundus images (5-stage scale).</li>
            <li>Shows explainability heatmaps and clinical reasoning summaries.</li>
            <li>Manages patients and longitudinal reports with offline storage and sync.</li>
          </ul>
        </Card>

        <Card className="p-6">
          <div className="text-on-surface font-bold mb-2">Safety note</div>
          <p className="text-on-surface-variant">
            This tool is assistive. AI outputs can be wrong and must not be used as the sole basis for diagnosis or treatment decisions.
            Final decisions should be made by a qualified clinician following local protocols.
          </p>
        </Card>

        <Card className="p-6">
          <div className="text-on-surface font-bold mb-2">Offline-first</div>
          <p className="text-on-surface-variant">
            The desktop app runs AI inference and patient data locally and can sync with a cloud backend when connectivity is available.
          </p>
        </Card>
      </div>
    </main>
  );
}


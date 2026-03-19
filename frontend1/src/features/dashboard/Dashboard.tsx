import MechanicalEye from "../../components/eye/MechanicalEye";
import Card from "../../components/ui/Card";

export default function Dashboard() {
  return (
    <main className="min-h-screen pt-24 pb-32 px-6 md:px-12 max-w-7xl mx-auto">
      {/* ── Hero Bento Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Welcome + Stats */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-headline font-extrabold text-on-surface tracking-tight">
              Welcome, Dr. Aris
            </h1>
            <p className="text-on-surface-variant text-lg">
              Retinal screening status is currently optimal.
            </p>
          </div>

          {/* Daily Scans */}
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-on-surface-variant font-medium">Daily Scans</span>
              <span className="material-symbols-outlined text-primary text-xl">visibility</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-headline font-bold">142</span>
              <span className="text-primary-dim text-sm">+12%</span>
            </div>
          </Card>

          {/* Triage Required */}
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-on-surface-variant font-medium">Triage Required</span>
              <span className="material-symbols-outlined text-tertiary text-xl">medical_services</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-headline font-bold">08</span>
              <span className="text-on-surface-variant text-sm">Priority focus</span>
            </div>
          </Card>
        </div>

        {/* Center: Mechanical Eye */}
        <div className="lg:col-span-5 flex items-center justify-center py-12 lg:py-0">
          <MechanicalEye />
        </div>

        {/* Right: AI Diagnostics + Pending Records */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          <Card className="p-6 border-l-4 border-primary-container">
            <h3 className="font-headline font-bold mb-2">AI Diagnostics</h3>
            <p className="text-xs text-on-surface-variant leading-relaxed mb-4">
              Convolutional neural network is currently at 99.4% inference accuracy for DR staging.
            </p>
            <div className="w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden">
              <div className="bg-primary w-[94%] h-full" />
            </div>
          </Card>

          <Card className="p-6 flex-1">
            <h3 className="font-headline font-bold mb-4">Pending Records</h3>
            <div className="space-y-4">
              {[
                { id: "#8841-B", label: "Stage 2 Proliferative" },
                { id: "#2210-C", label: "Normal Fundus" },
              ].map((record) => (
                <div key={record.id} className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center">
                    <span className="material-symbols-outlined text-sm">folder</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Case {record.id}</p>
                    <p className="text-xs text-on-surface-variant">{record.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* ── Secondary Section ── */}
      <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Global Screening Map */}
        <div className="bg-surface-container-low rounded-xl overflow-hidden relative group">
          <img
            alt="Retinal Scan Visualization"
            className="w-full h-64 object-cover opacity-40 group-hover:opacity-60 transition-opacity"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuBM-I0ead7Baj-rVogj7rwsPdq_58z0FnDaRONJu9yElKYfdiI1FoDgpITHBF7JZvudf-EDu7iXJl5bc6nov0TaFNK3FG3yZrprVSY-hmbBt86U6I1E8X0XLwKHqhSAlnsZv99Fv3Pys9TGCB5XaYzBybcpqo3LCy0fW0It58wA44RC0plWrvY5tiAPvN2CQYkA7CW1RET6S8TGSoUKKrl1a3fPiml1l_l-1Vo4gDvj1hr84HgFcFQL8nRrmizBUqgjH30yM0wd-YJQ"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface-container-low via-transparent to-transparent" />
          <div className="absolute bottom-6 left-6">
            <div className="bg-primary/20 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold text-primary-fixed uppercase tracking-wider mb-2 w-fit">
              Live Analysis
            </div>
            <h4 className="text-xl font-headline font-bold">Global Screening Map</h4>
          </div>
        </div>

        {/* CTA */}
        <Card className="p-8 flex flex-col justify-center">
          <h3 className="text-2xl font-headline font-bold mb-4">Ready for Next Batch?</h3>
          <p className="text-on-surface-variant mb-8 max-w-md">
            Our AI system has pre-processed 24 new retinal images. Tap below to begin the verification and screening process.
          </p>
          <button className="bg-gradient-to-r from-primary to-primary-container text-on-primary-container px-8 py-4 rounded-lg font-bold text-sm self-start shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
            Start Screening Session
          </button>
        </Card>
      </div>
    </main>
  );
}

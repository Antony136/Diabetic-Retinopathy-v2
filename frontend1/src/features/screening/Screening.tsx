export default function Screening() {
  return (
    <main className="max-w-7xl mx-auto px-6 pt-24 pb-32">
      {/* Hero */}
      <div className="mb-12">
        <h1 className="font-headline text-4xl font-extrabold tracking-tight mb-2">
          Patient Screening
        </h1>
        <p className="text-on-surface-variant max-w-2xl">
          Upload high-resolution retinal fundus photography for instant AI-assisted diabetic retinopathy classification and lesion localization.
        </p>
      </div>

      {/* Asymmetric Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Upload & Preview */}
        <div className="lg:col-span-7 space-y-6">
          {/* Drag & Drop */}
          <section className="bg-surface-container-low rounded-xl p-8 flex flex-col items-center justify-center border-2 border-dashed border-outline-variant/20 hover:border-primary/40 transition-all group cursor-pointer h-[320px]">
            <div className="bg-surface-container-high w-16 h-16 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
              <span className="material-symbols-outlined text-primary text-3xl">upload_file</span>
            </div>
            <h3 className="font-headline text-xl font-bold mb-2">Drop Retinal Scan Here</h3>
            <p className="text-on-surface-variant text-sm text-center max-w-xs mb-6">
              Support for DICOM, PNG, and TIFF formats. Maximum file size 25MB.
            </p>
            <button className="bg-gradient-to-r from-primary to-primary-container text-on-primary-container font-bold px-6 py-2.5 rounded-lg transition-transform active:scale-95 shadow-lg shadow-primary/10">
              Browse Files
            </button>
          </section>

          {/* Input Preview */}
          <section className="bg-surface-container-low rounded-xl overflow-hidden relative">
            <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center">
              <h3 className="font-headline font-semibold text-lg">Input Preview</h3>
              <span className="text-xs font-medium text-on-surface-variant px-2 py-1 bg-surface-container rounded-md">
                ID: R-4829-X
              </span>
            </div>
            <div className="aspect-video w-full bg-surface-container-lowest relative overflow-hidden flex items-center justify-center">
              <img
                alt="Retinal fundus photograph"
                className="w-full h-full object-cover opacity-60"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCZ9HwfeOojdCj_kb3IHPNW4aUe0Wln0yYbrURvAoAPTdTkoLgw4ukRMJD4hlpGDT22e0YfQvOLdL1hdv5f3XZjCSoWug18Zt6hB67PrOk-TVKXq3dEGH8qxnQM-zZ9ka_L7kMwBzskGYqmKjhX0toYqU_kbJCNLVS9oJoeeQPv3nb-nDRL7sO6WYN-y75OWRghgALIWDZROksUSJH_4H0mcdFQGNISBSJM8y8T-ncJYyIsyyU26-dPEzuogAW7DOgMQZzRY3HjQ4wM"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-48 h-48 border-2 border-primary/30 rounded-full flex items-center justify-center relative">
                  <div className="absolute inset-0 rounded-full border border-primary/10 animate-ping" />
                  <span className="text-xs text-primary font-bold tracking-widest uppercase bg-surface/80 px-3 py-1 rounded-full backdrop-blur-sm">
                    Scan Active
                  </span>
                </div>
              </div>
            </div>
            <div className="p-6 flex justify-end gap-3">
              <button className="px-6 py-2 rounded-lg border border-outline-variant/30 text-on-surface-variant font-bold hover:bg-surface-container-high transition-colors">
                Cancel
              </button>
              <button className="px-8 py-2 rounded-lg bg-gradient-to-r from-primary to-primary-container text-on-primary-container font-bold shadow-xl shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95">
                Run Analysis
              </button>
            </div>
          </section>
        </div>

        {/* Right Column: Results */}
        <div className="lg:col-span-5 space-y-6">
          <section className="bg-surface-container-low rounded-xl p-8 relative overflow-hidden h-full flex flex-col">
            <div className="absolute top-0 right-0 p-4">
              <span className="material-symbols-outlined text-primary/20 text-6xl select-none">clinical_notes</span>
            </div>

            <h3 className="font-headline text-2xl font-bold mb-8 flex items-center gap-2">
              Analysis Results
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            </h3>

            <div className="space-y-8 flex-grow">
              {/* Prediction */}
              <div className="space-y-2">
                <span className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">
                  Prediction
                </span>
                <div className="bg-tertiary-container/10 border border-tertiary-container/20 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-2xl font-bold text-tertiary">Proliferative DR</h4>
                    <span className="material-symbols-outlined text-tertiary">warning</span>
                  </div>
                  <p className="text-sm text-on-surface-variant leading-relaxed">
                    Stage 4 Diabetic Retinopathy detected. Neovascularization and significant vitreous hemorrhaging identified in the nasal quadrant.
                  </p>
                </div>
              </div>

              {/* Confidence Score */}
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <span className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">
                    Confidence Score
                  </span>
                  <span className="text-3xl font-headline font-extrabold text-primary tracking-tighter">
                    98.4<span className="text-lg">%</span>
                  </span>
                </div>
                <div className="h-1.5 w-full bg-surface-container-high rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full w-[98.4%]" />
                </div>
              </div>

              {/* Localization Heatmap */}
              <div className="space-y-2 pt-4">
                <span className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">
                  Localization Heatmap
                </span>
                <div className="aspect-square w-full rounded-xl bg-surface-container-lowest relative overflow-hidden group">
                  <img
                    alt="Heatmap visualization overlay"
                    className="w-full h-full object-cover mix-blend-screen opacity-70 filter hue-rotate-[280deg]"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuDEVPxSMQ9_jYYu9w6LBE24pWaGq1cGfQ1jyyhtP24qvJ62VhrL6zWJjHxK0tmzIera5aNW_QKn4WKhVdixWusXGuDRnssOrXYRljrr_Q87HAkC3HHwnFIuBtfFKq8I5-gvc3iJt234vF_yJdXO5sZGOEMXnK0hr_HazzUY0Zv5-e30CMM7RLqwOKpa1tgfg9b1NAa0AXkzZyWIRhfaMg09U5HAYpiK2lscraON1wlZ-DWh0H6V2oNw_Jb0MsFrydgfkJ3N4YVL-Xgw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-transparent to-transparent" />
                  <div className="absolute bottom-4 left-4 flex gap-2">
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-black/40 backdrop-blur-md border border-white/5">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      <span className="text-[10px] text-white">Exudates</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-black/40 backdrop-blur-md border border-white/5">
                      <div className="w-2 h-2 rounded-full bg-yellow-500" />
                      <span className="text-[10px] text-white">Hemorrhages</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-8 pt-6 border-t border-outline-variant/10 flex gap-4">
              <button className="flex-1 flex items-center justify-center gap-2 py-3 bg-surface-container-high rounded-lg text-sm font-bold hover:text-primary transition-colors">
                <span className="material-symbols-outlined text-sm">print</span>
                Export PDF
              </button>
              <button className="flex-1 flex items-center justify-center gap-2 py-3 bg-surface-container-high rounded-lg text-sm font-bold hover:text-primary transition-colors">
                <span className="material-symbols-outlined text-sm">share</span>
                Referral
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

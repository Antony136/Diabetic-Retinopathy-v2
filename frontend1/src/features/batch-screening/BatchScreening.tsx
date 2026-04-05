import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import { createBatchReports, getBatchProgress } from "../../services/reports";
import type { BatchReportResponse } from "../../services/reports";
import { resolveBackendImageUrl } from "../../services/apiBase";
import { useScreeningMode } from "../../contexts/ScreeningModeContext";

/**
 * Enhanced Batch Screening Page
 * Performs multi-analysis on mixed-quality fundus images with fault tolerance.
 */
export default function BatchScreening() {
  const [files, setFiles] = useState<File[]>([]);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const { adaptiveMode, setAdaptiveMode } = useScreeningMode();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [result, setResult] = useState<BatchReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const onFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  };

  const addFiles = (newFiles: File[]) => {
    // Basic frontend filter, although backend does strict checking
    const validFiles = newFiles.filter(f => 
      f.name.toLowerCase().endsWith('.zip') || 
      ['image/jpeg', 'image/png', 'image/jpg'].includes(f.type) ||
      ['.jpg', '.jpeg', '.png'].some(ext => f.name.toLowerCase().endsWith(ext))
    );
    setFiles(prev => [...prev, ...validFiles]);
  };

  const onRunBatch = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setResult(null);
    setError(null);
    setDoneCount(0);
    setTotalCount(files.length);
    setProgress(0);
    
    // Generate an ID for tracking this exact batch execution.
    const batchId = Math.random().toString(36).substring(2, 10);

    // Exact Server-side completion tracking
    const timer = setInterval(async () => {
        try {
            const data = await getBatchProgress(batchId);
            if (data && data.total > 0) {
                setDoneCount(data.done);
                setTotalCount(data.total);
                const perc = Math.min(99, Math.round((data.done / data.total) * 100)); // cap at 99 until finished
                setProgress(perc);
            }
        } catch (e) {
            // Silently ignore polling errors
        }
    }, 1500);
    
    try {
      const resp = await createBatchReports({
        files,
        csvFile: csvFile || undefined,
        mode: adaptiveMode,
        batchId: batchId
      });
      setResult(resp);
      setProgress(100);
    } catch (err: any) {
      console.error("Batch error:", err);
      setError(err.response?.data?.detail || err.message || "Batch processing failed.");
    } finally {
      clearInterval(timer);
      setIsProcessing(false);
    }
  };

  const onDownloadReport = () => {
    if (result?.batch_pdf_url) {
      window.open(resolveBackendImageUrl(result.batch_pdf_url), "_blank");
    }
  };

  const removeFile = (index: number) => {
      setFiles(prev => prev.filter((_, i) => i !== index));
  }

  return (
    <main className="max-w-7xl mx-auto px-6 pt-24 pb-32 min-h-screen">
      <div className="mb-10">
        <motion.h1 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-headline text-5xl font-black tracking-tight mb-2 bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary-bright"
        >
          Enhanced Batch Screening
        </motion.h1>
        <p className="text-on-surface-variant max-w-2xl text-lg">
          Process multiple retinal images or structured ZIP folders in parallel.
          Strict fundus validation and automatic PDF reporting included.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-12">
            <div className="flex p-1 bg-surface-container-high rounded-2xl w-fit mb-6 shadow-inner">
                <button
                onClick={() => setAdaptiveMode("standard")}
                className={`px-8 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${
                    adaptiveMode === "standard"
                    ? "bg-surface-container-lowest text-primary shadow-xl scale-105"
                    : "text-on-surface-variant hover:text-on-surface font-black"
                }`}
                >
                Standard Mode
                </button>
                <button
                onClick={() => setAdaptiveMode("high_sensitivity")}
                className={`px-8 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${
                    adaptiveMode === "high_sensitivity"
                    ? "bg-surface-container-lowest text-secondary shadow-xl scale-105"
                    : "text-on-surface-variant hover:text-on-surface font-black"
                }`}
                >
                High Sensitivity
                </button>
            </div>
        </div>

        {/* Left Column: Configuration */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="p-8 border-primary/10 bg-surface-container-low/50 backdrop-blur-xl shadow-2xl relative overflow-hidden group">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-all duration-500" />
            
            <h3 className="font-headline text-xl font-bold mb-6 flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">upload_file</span>
              Input Configuration
            </h3>

            <div 
              onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('bg-primary/5', 'border-primary/50'); }}
              onDragLeave={e => { e.currentTarget.classList.remove('bg-primary/5', 'border-primary/50'); }}
              onDrop={e => { e.currentTarget.classList.remove('bg-primary/5', 'border-primary/50'); onFileDrop(e); }}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-outline-variant/30 rounded-2xl p-8 flex flex-col items-center justify-center gap-4 hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer bg-surface-container shadow-inner"
            >
              <input 
                type="file" 
                multiple 
                ref={fileInputRef} 
                className="hidden" 
                onChange={e => addFiles(Array.from(e.target.files || []))}
                accept=".zip,image/*"
              />
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-3xl">add_photo_alternate</span>
              </div>
              <div className="text-center">
                <p className="font-bold text-on-surface">Drop Images or ZIP</p>
                <p className="text-xs text-on-surface-variant mt-1 font-medium">Multi-select supported (Max 50)</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
                <Button 
                    variant="ghost" 
                    className="flex-1 rounded-xl py-3 border border-outline/10 text-xs font-black"
                    onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                    icon="file_open"
                >
                    Files
                </Button>
                <Button 
                    variant="ghost" 
                    className="flex-1 rounded-xl py-3 border border-outline/10 text-xs font-black"
                    onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}
                    icon="folder_open"
                >
                    Folder
                </Button>
                <input 
                    type="file" 
                    ref={folderInputRef} 
                    className="hidden" 
                    onChange={e => addFiles(Array.from(e.target.files || []))}
                    {...({ webkitdirectory: "", directory: "" } as any)}
                />
            </div>

            <AnimatePresence>
                {files.length > 0 && (
                    <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-6 max-h-48 overflow-y-auto custom-scrollbar pr-2 space-y-2"
                    >
                        {files.map((f, i) => (
                            <motion.div 
                                initial={{ x: -20, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                transition={{ delay: i * 0.05 }}
                                key={`${f.name}-${i}`} 
                                className="flex items-center justify-between p-3 rounded-xl bg-surface-container-high border border-outline/5 hover:border-primary/20 transition-all"
                            >
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <span className="material-symbols-outlined text-sm text-primary-bright">
                                        {f.name.endsWith('.zip') ? 'folder_zip' : 'image'}
                                    </span>
                                    <span className="text-[11px] font-bold truncate max-w-[240px] text-on-surface">{f.name}</span>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); removeFile(i); }} className="p-1 rounded-md hover:bg-error/10 text-error/40 hover:text-error transition-colors">
                                    <span className="material-symbols-outlined text-lg">close</span>
                                </button>
                            </motion.div>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="mt-8 space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">table_chart</span>
                Optional Labels (CSV)
              </label>
              <div 
                onClick={() => csvInputRef.current?.click()}
                className="flex items-center gap-3 p-4 rounded-xl bg-surface-container-lowest border border-outline/10 hover:border-secondary/50 cursor-pointer transition-all shadow-inner"
              >
                <input 
                  type="file" 
                  ref={csvInputRef} 
                  className="hidden" 
                  accept=".csv"
                  onChange={e => setCsvFile(e.target.files?.[0] || null)}
                />
                <span className="material-symbols-outlined text-secondary">csv</span>
                {csvFile ? <span className="text-xs font-bold text-on-surface">{csvFile.name}</span> : <span className="text-xs text-on-surface-variant font-medium">Click to select labels metadata CSV</span>}
              </div>
            </div>

            <Button 
                variant="primary" 
                className="w-full mt-10 py-6 text-lg rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 disabled:grayscale"
                disabled={files.length === 0 || isProcessing}
                onClick={onRunBatch}
                icon={isProcessing ? undefined : "rocket_launch"}
            >
                {isProcessing ? `Analyzing ${files.length} items...` : `Run Parallel Analysis (${files.length})`}
            </Button>
          </Card>
        </div>

        {/* Right Column: Execution & Results */}
        <div className="lg:col-span-7">
            <AnimatePresence mode="wait">
                {!result && !isProcessing && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="h-full min-h-[400px] flex flex-col items-center justify-center p-12 rounded-3xl bg-surface-container-low/30 border border-outline/10 border-dashed"
                    >
                         <span className="material-symbols-outlined text-8xl text-outline-variant/20 mb-6 animate-pulse">analytics</span>
                         <p className="text-on-surface-variant font-headline text-2xl text-center font-bold tracking-tight opacity-40">Ready for batch execution</p>
                    </motion.div>
                )}

                {isProcessing && (
                    <motion.div 
                        key="processing"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.02 }}
                        className="bg-surface-container p-10 rounded-[2.5rem] border border-primary/20 shadow-2xl relative overflow-hidden h-full flex flex-col justify-center"
                    >
                        <div className="absolute top-0 left-0 w-full h-1 bg-primary/10 overflow-hidden">
                             <motion.div 
                                className="h-full bg-primary"
                                initial={{ x: '-100%' }}
                                animate={{ x: '100%' }}
                                transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                             />
                        </div>

                        <div className="flex items-center justify-between mb-10">
                            <div>
                                <h3 className="font-headline text-3xl font-black mb-1">Processing Batch</h3>
                                <p className="text-on-surface-variant text-sm font-medium">Parallel multi-analysis engine active...</p>
                            </div>
                            <div className="w-16 h-16 rounded-3xl bg-primary/5 flex items-center justify-center">
                                <div className="w-8 h-8 rounded-full border-[3px] border-primary border-t-transparent animate-spin" />
                            </div>
                        </div>
                        
                        <div className="space-y-6">
                            <div className="flex justify-between text-base font-bold text-primary tracking-tight">
                                <span>Batch Progress ({doneCount} / {totalCount} Completed)</span>
                                <span>{progress}%</span>
                            </div>
                            <div className="h-3 w-full bg-surface-container-high rounded-full overflow-hidden shadow-inner">
                                <motion.div 
                                    className="h-full bg-gradient-to-r from-primary via-primary-bright to-secondary"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    transition={{ duration: 0.5 }}
                                />
                            </div>
                            <div className="flex items-center gap-3 p-4 rounded-2xl bg-surface-container-lowest border border-outline/5 text-on-surface-variant text-sm italic font-medium">
                                <span className="material-symbols-outlined text-lg animate-pulse text-primary">auto_awesome</span>
                                Processing fundus heuristics & Grad-CAM overlays...
                            </div>
                        </div>
                    </motion.div>
                )}

                {result && (
                    <motion.div 
                        key="result"
                        initial={{ opacity: 0, x: 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="space-y-8"
                    >
                        {/* Metrics Grid */}
                        <div className="grid grid-cols-3 gap-6">
                            <div className="bg-surface-container-low border border-outline/10 p-8 rounded-[2rem] text-center shadow-xl">
                                <p className="text-[10px] font-black uppercase text-on-surface-variant tracking-widest mb-2">Total Scanned</p>
                                <p className="text-4xl font-black text-on-surface">{result.total}</p>
                            </div>
                            <div className="bg-success-container/10 border border-success/20 p-8 rounded-[2rem] text-center shadow-xl shadow-success/5">
                                <p className="text-[10px] font-black uppercase text-success tracking-widest mb-2">Successful</p>
                                <p className="text-4xl font-black text-on-surface">{result.successful}</p>
                            </div>
                            <div className="bg-error-container/10 border border-error/20 p-8 rounded-[2rem] text-center shadow-xl shadow-error/5">
                                <p className="text-[10px] font-black uppercase text-error tracking-widest mb-2">Failed/Skipped</p>
                                <p className="text-4xl font-black text-on-surface">{result.failed}</p>
                            </div>
                        </div>

                        {/* PDF CTA */}
                        {result.batch_pdf_url && (
                             <motion.div 
                                whileHover={{ scale: 1.01 }}
                                className="p-8 rounded-[2.5rem] bg-gradient-to-br from-primary via-primary-bright to-secondary text-on-primary-container flex items-center justify-between shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/20 relative overflow-hidden"
                             >
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 pointer-events-none" />
                                <div className="relative z-10">
                                    <h4 className="font-headline font-black text-2xl mb-1 tracking-tight">Clinical Batch Report</h4>
                                    <p className="text-sm opacity-80 font-medium">Consolidated multi-analysis PDF with Grad-CAM visualization.</p>
                                </div>
                                <Button onClick={onDownloadReport} variant="secondary" className="px-8 py-4 rounded-2xl bg-white text-primary font-black shadow-2xl relative z-10" icon="picture_as_pdf">
                                    Download PDF
                                </Button>
                             </motion.div>
                        )}

                        {/* Details Table */}
                        <div className="bg-surface-container-low rounded-[2.5rem] border border-outline/10 overflow-hidden shadow-2xl">
                            <div className="p-8 border-b border-outline/5 bg-surface-container-high/40 flex justify-between items-center">
                                <h3 className="font-headline font-black text-xl flex items-center gap-3">
                                    <span className="material-symbols-outlined text-primary-bright">database</span>
                                    Analysis Breakdown
                                </h3>
                                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface-container-lowest border border-outline/10">
                                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                    <span className="text-[10px] text-on-surface-variant font-black uppercase tracking-widest">{adaptiveMode.replace('_', ' ')} logic</span>
                                </div>
                            </div>
                            <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                                <table className="w-full text-left text-sm">
                                    <thead className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 bg-surface-container-high/20">
                                        <tr>
                                            <th className="px-8 py-5">Patient Source</th>
                                            <th className="px-8 py-5">Diagnosis</th>
                                            <th className="px-8 py-5">Conf.</th>
                                            <th className="px-8 py-5">Decision</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-outline/5">
                                        {result.results.map((r, i) => (
                                            <tr key={i} className="hover:bg-primary/5 transition-all group border-l-4 border-l-transparent hover:border-l-primary">
                                                <td className="px-8 py-5">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-14 h-14 rounded-2xl overflow-hidden bg-black/40 ring-1 ring-outline/20 shadow-lg group-hover:scale-105 transition-transform">
                                                            <img src={resolveBackendImageUrl(r.image_url || "")} className="w-full h-full object-cover" alt="" />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="font-black text-on-surface truncate max-w-[140px] tracking-tight">{r.name}</span>
                                                            <span className="text-[10px] text-on-surface-variant font-medium opacity-60 italic whitespace-nowrap">File Access Validated</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5">
                                                    <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black tracking-tight ${
                                                        r.prediction === "No DR" ? "bg-success/10 text-success" : "bg-error/10 text-error"
                                                    }`}>
                                                        {r.prediction?.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td className="px-8 py-5 font-mono font-black text-primary text-base">
                                                    {((r.confidence || 0) * 100).toFixed(1)}%
                                                </td>
                                                <td className="px-8 py-5">
                                                    <div className={`flex items-center gap-2 font-black text-[10px] uppercase tracking-widest ${r.decision === 'Refer' ? 'text-error' : 'text-success'}`}>
                                                        <span className="material-symbols-outlined text-lg">
                                                            {r.decision === 'Refer' ? 'release_alert' : 'check_circle'}
                                                        </span>
                                                        {r.decision}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {result.failed_items.map((r, i) => (
                                            <tr key={`fail-${i}`} className="bg-error/[0.03] group border-l-4 border-l-error">
                                                <td className="px-8 py-6">
                                                    <div className="flex items-center gap-4">
                                                         <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-error/10 border border-error/20">
                                                            <span className="material-symbols-outlined text-error text-2xl">heart_broken</span>
                                                         </div>
                                                         <span className="font-bold truncate max-w-[140px] text-error tracking-tight">{r.name}</span>
                                                    </div>
                                                </td>
                                                <td colSpan={2} className="px-8 py-6">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[10px] font-black text-error uppercase tracking-widest opacity-60">Validation Failed</span>
                                                        <span className="text-xs font-medium text-on-surface-variant leading-relaxed">"{r.reason}"</span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className="flex items-center gap-2 text-error font-black text-[10px] uppercase opacity-40">
                                                        <span className="material-symbols-outlined text-lg">cancel</span>
                                                        Rejected
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {error && (
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-8 p-6 rounded-3xl bg-error/10 border border-error/20 text-error flex items-center gap-4 bg-error-container/10"
                >
                    <span className="material-symbols-outlined text-3xl">report</span>
                    <div>
                        <p className="text-xs font-black uppercase tracking-widest mb-1">Batch Execution Error</p>
                        <p className="text-sm font-bold tracking-tight">{error}</p>
                    </div>
                </motion.div>
            )}
        </div>
      </div>
    </main>
  );
}

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
  const [aiProvider, setAiProvider] = useState<"local" | "cloud">("cloud");
  
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
        batchId: batchId,
        provider: aiProvider
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
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="font-headline text-5xl font-black tracking-tight mb-2 text-text-primary"
          >
            Batch Processing
          </motion.h1>
          <p className="text-on-surface-variant font-medium opacity-60">High-throughput automated screening engine</p>
        </div>

        <div 
          className="flex bg-surface-container rounded-2xl p-1 gap-2 border border-outline-variant/30 shadow-2xl min-w-[340px]"
        >
          <button 
            type="button"
            onClick={() => {
                console.log("STATE CHANGE: CLOUD");
                setAiProvider("cloud");
            }}
            style={{
                backgroundColor: aiProvider === "cloud" ? "var(--md-sys-color-primary, #0061A4)" : "transparent",
                color: aiProvider === "cloud" ? "white" : "inherit",
                borderColor: aiProvider === "cloud" ? "var(--md-sys-color-primary, #0061A4)" : "transparent"
            }}
            className={`flex-1 py-3 px-4 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-2 border-2 ${
              aiProvider === "cloud" ? "shadow-lg scale-[1.05]" : "opacity-60"
            }`}
          >
            <span className="material-symbols-outlined text-sm">
                {aiProvider === "cloud" ? "check_circle" : "cloud"}
            </span>
            CLOUD INFERENCE
          </button>
          <button 
            type="button"
            onClick={() => {
                console.log("STATE CHANGE: LOCAL");
                setAiProvider("local");
            }}
            style={{
                backgroundColor: aiProvider === "local" ? "var(--md-sys-color-primary, #0061A4)" : "transparent",
                color: aiProvider === "local" ? "white" : "inherit",
                borderColor: aiProvider === "local" ? "var(--md-sys-color-primary, #0061A4)" : "transparent"
            }}
            className={`flex-1 py-3 px-4 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-2 border-2 ${
              aiProvider === "local" ? "shadow-lg scale-[1.05]" : "opacity-60"
            }`}
          >
            <span className="material-symbols-outlined text-sm">
                {aiProvider === "local" ? "check_circle" : "memory"}
            </span>
            LOCAL GPU ENGINE
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

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
                className="w-full mt-10 py-6 text-lg rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group"
                disabled={files.length === 0 || isProcessing}
                onClick={() => onRunBatch()}
                icon={isProcessing ? undefined : "rocket_launch"}
            >
                <div className="flex items-center gap-2">
                    {isProcessing ? (
                        <span className="flex items-center gap-3">
                            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ANALYZING {files.length} ITEMS...
                        </span>
                    ) : (
                        `RUN PARALLEL ANALYSIS (${files.length})`
                    )}
                </div>
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

                        {/* Details Table with Pagination */}
                        <BatchResultsTable result={result} adaptiveMode={adaptiveMode} />
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

interface BatchReportItem extends any {
    type: 'success' | 'failed';
}

function BatchResultsTable({ result, adaptiveMode }: { result: BatchReportResponse, adaptiveMode: string }) {
    const [page, setPage] = useState(0);
    const perPage = 5;
    
    const combined: BatchReportItem[] = [
        ...result.results.map(r => ({ ...r, type: 'success' as const })),
        ...result.failed_items.map(f => ({ ...f, type: 'failed' as const }))
    ];
    
    const totalPages = Math.ceil(combined.length / perPage);
    const paginated = combined.slice(page * perPage, (page + 1) * perPage);

    return (
        <div className="bg-surface-container-low rounded-[2.5rem] border border-outline/10 overflow-hidden shadow-2xl">
            <div className="p-8 border-b border-outline/5 bg-surface-container-high/40">
                <h3 className="font-headline font-black text-xl flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary-bright">database</span>
                    Analysis Breakdown
                </h3>
            </div>
            
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 bg-surface-container-high/20">
                        <tr>
                            <th className="px-6 py-5">#</th>
                            <th className="px-6 py-5">Patient Information</th>
                            <th className="px-6 py-5">Diagnosis</th>
                            <th className="px-6 py-5">Conf.</th>
                            <th className="px-6 py-5">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-outline/5">
                        {paginated.map((item, i) => {
                            const globalIndex = page * perPage + i + 1;
                            
                            if (item.type === 'success') {
                                const r = item as any;
                                const meta = r.metadata || {};
                                const pName = meta.patient_name || meta.name || meta.patient || r.name;
                                const pId = meta.patient_id || meta.id || "N/A";
                                
                                return (
                                    <tr key={`success-${i}`} className="hover:bg-primary/5 transition-all group border-l-4 border-l-transparent hover:border-l-primary">
                                        <td className="px-6 py-5 font-mono text-primary font-bold">
                                            {globalIndex.toString().padStart(2, '0')}
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-xl overflow-hidden bg-black/40 ring-1 ring-outline/20 shadow-md">
                                                    <img src={resolveBackendImageUrl(r.image_url || "")} className="w-full h-full object-cover" alt="" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-black text-on-surface truncate max-w-[150px] tracking-tight">{pName}</span>
                                                    <span className="text-[10px] text-on-surface-variant font-bold opacity-60">ID: {pId}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex flex-col gap-1">
                                                <span className={`px-2 py-1 rounded-md text-[9px] font-black w-fit tracking-tight ${
                                                    r.prediction === "No DR" ? "bg-success/10 text-success" : "bg-error/10 text-error"
                                                }`}>
                                                    {r.prediction?.toUpperCase()}
                                                </span>
                                                <span className="text-[9px] text-on-surface-variant font-bold opacity-50 uppercase tracking-widest">{r.decision}</span>
                                                {r.warning && (
                                                    <div className="mt-1 flex items-center gap-1 text-[8px] text-orange-500 font-black bg-orange-500/10 px-1.5 py-0.5 rounded-md border border-orange-500/20 w-fit">
                                                        <span className="material-symbols-outlined text-[10px]">warning</span>
                                                        {r.warning.toUpperCase()}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 font-mono font-black text-primary">
                                            {((r.confidence || 0) * 100).toFixed(1)}%
                                        </td>
                                        <td className="px-6 py-5">
                                            <Button 
                                                variant="secondary" 
                                                className="rounded-lg h-8 px-2 bg-primary text-white border-none text-[9px] font-black hover:bg-primary-bright shadow-sm flex items-center justify-center min-w-[90px]"
                                                onClick={() => window.open(resolveBackendImageUrl(r.pdf_url), "_blank")}
                                                icon="picture_as_pdf"
                                                disabled={!r.pdf_url}
                                            >
                                                PDF REPORT
                                            </Button>
                                        </td>
                                    </tr>
                                );
                            } else {
                                const f = item as any;
                                return (
                                    <tr key={`fail-${i}`} className="bg-error/[0.03] border-l-4 border-l-error">
                                        <td className="px-6 py-6 font-mono text-error font-bold opacity-50">
                                            {globalIndex.toString().padStart(2, '0')}
                                        </td>
                                        <td className="px-6 py-6">
                                            <div className="flex items-center gap-4 opacity-70">
                                                 <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-error/10 border border-error/20">
                                                    <span className="material-symbols-outlined text-error text-xl">heart_broken</span>
                                                 </div>
                                                 <span className="font-bold truncate max-w-[150px] text-error tracking-tight">{f.name}</span>
                                            </div>
                                        </td>
                                        <td colSpan={2} className="px-6 py-6">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-[9px] font-black text-error uppercase tracking-widest opacity-60">Validation Failed</span>
                                                <span className="text-xs font-medium text-on-surface-variant line-clamp-1 italic">"{f.reason}"</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-6">
                                            <span className="material-symbols-outlined text-error/20">cancel</span>
                                        </td>
                                    </tr>
                                );
                            }
                        })}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="p-6 bg-surface-container-high/20 border-t border-outline/5 flex items-center justify-between">
                    <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                        Page {page + 1} of {totalPages}
                    </p>
                    <div className="flex gap-2">
                        <Button 
                            variant="ghost" 
                            disabled={page === 0} 
                            onClick={() => setPage(p => p - 1)}
                            className="rounded-lg h-9 w-9 p-0"
                            icon="chevron_left"
                        />
                        <Button 
                            variant="ghost" 
                            disabled={page === totalPages - 1} 
                            onClick={() => setPage(p => p + 1)}
                            className="rounded-lg h-9 w-9 p-0"
                            icon="chevron_right"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

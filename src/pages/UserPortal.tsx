import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, FileText, CheckCircle2, AlertCircle, X, Loader2, Clock, AlertTriangle, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useLang } from "@/contexts/LangContext";
import { submitReceipts, pollJobStatus } from "@/lib/api";
import type { JobStatus } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useTeams } from "@/hooks/useTeams";

export default function UserPortal() {
  const { t } = useLang();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { teams, isLoading: isLoadingTeams } = useTeams();
  const [team, setTeam] = useState("");
  const [name, setName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<"idle" | "uploading" | "processing" | "done">("idle");
  const [dragOver, setDragOver] = useState(false);
  const [jobStatuses, setJobStatuses] = useState<JobStatus[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const [customName, setCustomName] = useState("");

  const members = team ? [...(teams[team] || []), "Other"] : ["Other"];

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).filter((f) =>
      ["image/jpeg", "image/png", "application/pdf"].includes(f.type)
    );
    setFiles((prev) => [...prev, ...dropped]);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const startPolling = (jobIds: string[]) => {
    // Initialize job statuses
    setJobStatuses(
      jobIds.map((id) => ({
        job_id: id,
        status: "processing",
        message: "Starting OCR processing...",
      }))
    );
    setUploadPhase("processing");

    pollingRef.current = setInterval(async () => {
      try {
        const results = await Promise.all(
          jobIds.map((id) => pollJobStatus(id).catch(() => null))
        );

        const updated: JobStatus[] = results.map((r, i) =>
          r || { job_id: jobIds[i], status: "processing" as const, message: "Checking status..." }
        );
        setJobStatuses(updated);

        // Check if all done
        const allDone = updated.every(
          (j) => j.status !== "processing"
        );
        if (allDone) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setUploadPhase("done");
          setUploading(false);

          const successCount = updated.filter((j) => j.status === "complete").length;
          const reviewCount = updated.filter((j) => j.status === "review_required").length;
          const errorCount = updated.filter((j) => j.status === "error").length;

          if (errorCount > 0) {
            toast({ title: "Processing Complete", description: `${successCount} succeeded, ${reviewCount} need review, ${errorCount} failed.`, variant: "destructive" });
          } else if (reviewCount > 0) {
            toast({ title: "Processing Complete", description: `${successCount} auto-approved, ${reviewCount} need admin review.` });
          } else {
            toast({ title: "Success!", description: `All ${successCount} receipt(s) processed successfully.` });
          }
        }
      } catch {
        // Keep polling on transient errors
      }
    }, 3000);
  };

  const handleSubmit = async () => {
    const finalName = name === "Other" ? customName : name;
    if (!team || !finalName || files.length === 0) {
      toast({ title: "Missing info", description: "Please select team, name, and upload at least one receipt.", variant: "destructive" });
      return;
    }
    setUploading(true);
    setUploadPhase("uploading");
    setJobStatuses([]);

    try {
      const response = await submitReceipts(files, team, finalName);

      if (response.job_ids && response.job_ids.length > 0) {
        // Start polling for real-time status
        startPolling(response.job_ids);
        setFiles([]);
      } else {
        // Fallback: no job IDs returned (should not happen with correct endpoint)
        setUploadPhase("done");
        setUploading(false);
        toast({
          title: "Uploaded successfully",
          description: "Receipts uploaded successfully.",
          className: "bg-success text-success-foreground border-success"
        });
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch {
      setUploading(false);
      setUploadPhase("idle");
      toast({ title: "Error", description: "Failed to submit receipts.", variant: "destructive" });
    }
  };

  const handleManualEntry = () => {
    const finalName = name === "Other" ? customName : name;
    navigate("/manual-entry", { state: { team, name: finalName, files } });
  };

  const resetState = () => {
    setJobStatuses([]);
    setUploadPhase("idle");
    setFiles([]);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "processing": return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case "complete": return <CheckCircle2 className="h-4 w-4 text-success" />;
      case "review_required": return <AlertTriangle className="h-4 w-4 text-warning" />;
      case "manual_entry_required": return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case "error": return <AlertCircle className="h-4 w-4 text-destructive" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "processing": return "Processing";
      case "complete": return "Complete";
      case "review_required": return "Needs Review";
      case "manual_entry_required": return "Manual Entry";
      case "error": return "Error";
      default: return "Queued";
    }
  };

  const overallProgress = jobStatuses.length > 0
    ? Math.round((jobStatuses.filter((j) => j.status !== "processing").length / jobStatuses.length) * 100)
    : uploadPhase === "uploading" ? 30 : 0;

  return (
    <div className="container py-6 md:py-10 max-w-2xl animate-fade-in">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-primary mb-4">
          <Upload className="h-8 w-8 text-primary-foreground" />
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-foreground">{t("nav.submit")}</h2>
        <p className="text-muted-foreground mt-2">Upload your receipts for processing</p>
      </div>

      <div className="space-y-6">
        {/* Team Selection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("user.selectTeam")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={team} onValueChange={(v) => { setTeam(v); setName(""); setCustomName(""); }} disabled={isLoadingTeams}>
              <SelectTrigger className="w-full bg-background">
                <SelectValue placeholder={isLoadingTeams ? "Loading teams..." : t("user.selectTeam")} />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {Object.keys(teams).map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {team && (
              <div className="space-y-2">
                <Select value={name} onValueChange={setName}>
                  <SelectTrigger className="w-full bg-background">
                    <SelectValue placeholder={t("user.selectName")} />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    {members.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {name === "Other" && (
                  <div className="pt-2">
                    <label className="text-sm font-medium mb-1 block">Enter Name:</label>
                    <input
                      type="text"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="Enter other name"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* File Upload */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("user.uploadReceipts")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 md:p-12 text-center transition-colors cursor-pointer ${dragOver ? "border-accent bg-accent/10" : "border-border hover:border-muted-foreground/30"
                }`}
              onClick={() => document.getElementById("file-input")?.click()}
              role="button"
              tabIndex={0}
              aria-label={t("user.dragDrop")}
              onKeyDown={(e) => { if (e.key === "Enter") document.getElementById("file-input")?.click(); }}
            >
              <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">{t("user.dragDrop")}</p>
              <p className="text-xs text-muted-foreground mt-2">JPG, PNG, PDF</p>
              <input
                id="file-input"
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.pdf"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {files.length > 0 && (
              <div className="mt-4 space-y-2">
                {files.map((file, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate flex-1">{file.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {(file.size / 1024).toFixed(0)} KB
                    </span>
                    <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive" aria-label="Remove file">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Processing Status */}
            {uploadPhase !== "idle" && (
              <div className="mt-4 space-y-3">
                <Progress value={uploadPhase === "uploading" ? 30 : overallProgress} className="h-2" />

                {uploadPhase === "uploading" && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Uploading files...</span>
                  </div>
                )}

                {/* Per-job status cards */}
                {jobStatuses.length > 0 && (
                  <div className="space-y-2">
                    {jobStatuses.map((job) => (
                      <div
                        key={job.job_id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50"
                      >
                        {getStatusIcon(job.status)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono text-muted-foreground">
                              Job {job.job_id}
                            </span>
                            <span className={`text-xs font-medium ${job.status === "complete" ? "text-success" :
                              job.status === "error" ? "text-destructive" :
                                job.status === "review_required" ? "text-warning" :
                                  "text-blue-500"
                              }`}>
                              {getStatusLabel(job.status)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {job.message}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {uploadPhase === "done" && (
                  <Button variant="outline" size="sm" onClick={resetState} className="w-full mt-2">
                    Upload More Receipts
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={handleSubmit}
              disabled={uploading || !team || (!name) || (name === "Other" && !customName) || files.length === 0}
              className="flex-1 h-12 gradient-primary text-primary-foreground hover:opacity-90"
            >
              <Upload className="h-4 w-4 me-2" />
              {t("user.submit")}
            </Button>
            <Button
              variant="outline"
              onClick={handleManualEntry}
              disabled={!team || (!name) || (name === "Other" && !customName)}
              className="flex-1 h-12"
            >
              <FileText className="h-4 w-4 me-2" />
              {t("user.manualEntry")}
            </Button>
          </div>
          {isAuthenticated && (
            <Button
              variant="ghost"
              onClick={() => navigate("/admin/dashboard")}
              className="w-full h-12 text-muted-foreground hover:text-foreground"
            >
              <LayoutDashboard className="h-4 w-4 me-2" />
              Go to Admin Dashboard
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

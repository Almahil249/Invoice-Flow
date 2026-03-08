import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Filter, CheckCircle, AlertTriangle, XCircle, Eye, ChevronLeft, ChevronRight, Plus, Pencil, ChevronDown, ChevronUp, Download, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useLang } from "@/contexts/LangContext";
import { getInvoices, reviewInvoice, updateInvoice, adminAddInvoice, getAuditLog, exportCSV, deleteInvoice } from "@/lib/api";
import type { AuditLogEntry } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import InvoiceForm, { type InvoiceFormValues } from "@/components/InvoiceForm";
import { useTeams } from "@/hooks/useTeams";
import type { Invoice } from "@/data/mockInvoices";

const PAGE_SIZE = 25;

type SortField = "invoice_id" | "user_name" | "team" | "store_name" | "amount_after_tax" | "invoice_date" | "status" | "created_at";
type ModalMode = "view" | "edit" | "add";

export default function AdminInvoices() {
  const { t } = useLang();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { teams: teamsData } = useTeams();
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [sortBy, setSortBy] = useState<SortField>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>("view");
  const [isExporting, setIsExporting] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
    setPage(1);
  };

  const SortHeader = ({ field, children, className = "" }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <th
      className={`text-start p-3 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors ${className}`}
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortBy === field ? (
          sortOrder === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </span>
    </th>
  );

  const { data } = useQuery({
    queryKey: ["invoices", debouncedSearch, statusFilter, teamFilter, dateFrom, dateTo, amountMin, amountMax, sortBy, sortOrder, page],
    queryFn: () => getInvoices({
      search: debouncedSearch, status: statusFilter, team: teamFilter,
      page, page_size: PAGE_SIZE,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      amount_min: amountMin ? parseFloat(amountMin) : undefined,
      amount_max: amountMax ? parseFloat(amountMax) : undefined,
      sort_by: sortBy,
      sort_order: sortOrder,
    }),
  });

  const invoices = data?.invoices || [];
  const totalPages = data?.total_pages || 0;
  const totalCount = data?.total || 0;

  // Get all teams from the useTeams hook for the filter dropdown
  const teams = teamsData ? Object.keys(teamsData) : [];

  const reviewMut = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "flag" | "reject" }) =>
      reviewInvoice(id, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Updated", description: "Invoice status updated." });
      setSelected(null); setModalMode("view");
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Invoice> }) => updateInvoice(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Saved", description: "Invoice updated successfully." });
      setSelected(null); setModalMode("view");
    },
  });

  const addMut = useMutation({
    mutationFn: ({ data, file }: { data: Record<string, unknown>; file?: File | null }) => adminAddInvoice(data, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Added", description: "New invoice created." });
      setSelected(null); setModalMode("view");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteInvoice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Deleted", description: "Invoice deleted successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete invoice.", variant: "destructive" });
    }
  });

  const handleFormSubmit = (formData: InvoiceFormValues, file?: File | null) => {
    if (modalMode === "edit" && selected) {
      updateMut.mutate({ id: selected.invoice_id, data: formData as unknown as Partial<Invoice> });
    } else if (modalMode === "add") {
      if (!file) {
        toast({
          title: "Missing Receipt",
          description: "Please upload a receipt image for the new invoice.",
          variant: "destructive",
        });
        return;
      }
      addMut.mutate({ data: formData as unknown as Record<string, unknown>, file });
    }
  };

  const handleDelete = (id: string) => {
    if (window.confirm("Are you sure you want to delete this invoice? This action cannot be undone.")) {
      deleteMut.mutate(id);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportCSV({
        search: debouncedSearch,
        status: statusFilter,
        team: teamFilter,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        amount_min: amountMin ? parseFloat(amountMin) : undefined,
        amount_max: amountMax ? parseFloat(amountMax) : undefined,
      });
      toast({ title: "Export Started", description: "Your CSV download should begin shortly." });
    } catch {
      toast({ title: "Export Failed", description: "Could not download the CSV file.", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const openAdd = () => { setSelected(null); setModalMode("add"); };
  const openEdit = (inv: Invoice) => { setSelected(inv); setModalMode("edit"); };
  const openView = (inv: Invoice) => { setSelected(inv); setModalMode("view"); };
  const closeModal = () => { setSelected(null); setModalMode("view"); };

  const navigateInvoice = (direction: "next" | "prev") => {
    if (!selected) return;
    const currentIndex = invoices.findIndex((inv) => inv.invoice_id === selected.invoice_id);
    if (currentIndex === -1) return;

    const newIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
    if (newIndex >= 0 && newIndex < invoices.length) {
      setSelected(invoices[newIndex]);
      // Keep the same mode (view or edit)
    }
  };

  const isModalOpen = modalMode === "add" || !!selected;

  const modalTitle = modalMode === "add" ? "New Invoice" : modalMode === "edit" ? `Edit ${selected?.invoice_id}` : `Invoice ${selected?.invoice_id}`;

  const getGoogleDrivePreviewUrl = (url: string) => {
    if (!url) return "";
    const match = url.match(/\/d\/([^/]+)/) || url.match(/id=([^&]+)/);
    if (match && match[1]) {
      return `https://drive.google.com/file/d/${match[1]}/preview`;
    }
    return url;
  };

  const clearAdvancedFilters = () => {
    setDateFrom("");
    setDateTo("");
    setAmountMin("");
    setAmountMax("");
    setPage(1);
  };

  const hasAdvancedFilters = dateFrom || dateTo || amountMin || amountMax;

  const ModalBody = () => {
    if (modalMode === "edit" || modalMode === "add") {
      return (
        <InvoiceForm
          invoice={modalMode === "edit" ? selected : null}
          onSubmit={handleFormSubmit}
          isLoading={updateMut.isPending || addMut.isPending}
        />
      );
    }
    if (!selected) return null;
    const imageUrl = selected.original_image_url || selected.image_link;
    const previewUrl = getGoogleDrivePreviewUrl(imageUrl);

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground">ID:</span> <span className="font-mono">{selected.invoice_id}</span></div>
              <div><span className="text-muted-foreground">Status:</span> <StatusBadge status={selected.status} /></div>
              <div><span className="text-muted-foreground">Submitted By:</span> {selected.user_name}</div>
              <div><span className="text-muted-foreground">Team:</span> {selected.team}</div>
              <div><span className="text-muted-foreground">Store:</span> {selected.store_name}</div>
              <div><span className="text-muted-foreground">TRN:</span> {selected.tax_registration_number || "N/A"}</div>
              <div><span className="text-muted-foreground">Invoice #:</span> {selected.invoice_number}</div>
              <div><span className="text-muted-foreground">Date:</span> {selected.invoice_date}</div>
              <div><span className="text-muted-foreground">Before Tax:</span> AED {(selected.amount_before_tax || 0).toLocaleString()}</div>
              <div><span className="text-muted-foreground">VAT:</span> AED {(selected.vat_amount || 0).toLocaleString()}</div>
              <div className="col-span-2"><span className="text-muted-foreground">Total:</span> <span className="font-bold">AED {(selected.amount_after_tax || 0).toLocaleString()}</span></div>
              <div className="col-span-2"><span className="text-muted-foreground">Category:</span> {selected.category}</div>
              {selected.notes && <div className="col-span-2"><span className="text-muted-foreground">Notes:</span> {selected.notes}</div>}
              {selected.entry_method === "manual_entry" && <div className="col-span-2"><span className="text-muted-foreground">Manual Reason:</span> {selected.manual_entry_reason}</div>}
              {selected.ocr_confidence != null && selected.ocr_confidence > 0 && (
                <div className="col-span-2"><span className="text-muted-foreground">OCR Confidence:</span> {selected.ocr_confidence}%</div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 pt-4 border-t border-border">
              <Button onClick={() => openEdit(selected)} variant="outline" className="flex-1">
                <Pencil className="h-4 w-4 me-2" /> Edit
              </Button>
              <Button onClick={() => reviewMut.mutate({ id: selected.invoice_id, action: "approve" })} className="flex-1 bg-success text-success-foreground hover:bg-success/90">
                <CheckCircle className="h-4 w-4 me-2" /> {t("admin.approve")}
              </Button>
              <Button variant="outline" onClick={() => reviewMut.mutate({ id: selected.invoice_id, action: "flag" })} className="flex-1 border-warning text-warning hover:bg-warning/10">
                <AlertTriangle className="h-4 w-4 me-2" /> {t("admin.flag")}
              </Button>
              <Button variant="outline" onClick={() => reviewMut.mutate({ id: selected.invoice_id, action: "reject" })} className="flex-1 border-destructive text-destructive hover:bg-destructive/10">
                <XCircle className="h-4 w-4 me-2" /> {t("admin.reject")}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">Receipt Image:</span>
            <div className="rounded-md border border-border bg-muted/50 overflow-hidden aspect-[3/4] flex items-center justify-center relative">
              {imageUrl ? (
                <iframe
                  src={previewUrl}
                  className="w-full h-full border-0"
                  allow="autoplay"
                  title="Receipt Preview"
                ></iframe>
              ) : (
                <div className="text-muted-foreground text-center p-4">
                  <Eye className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p>No image available</p>
                </div>
              )}
            </div>
            {imageUrl && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => window.open(imageUrl, "_blank")}
              >
                Open Original Image
              </Button>
            )}
          </div>
        </div>

        {/* OCR Audit Log Section */}
        {selected.entry_method === "ocr_auto" && (
          <AuditLogSection invoiceId={selected.invoice_id} />
        )}
      </div>
    );
  };

  return (
    <div className="container py-6 md:py-10 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl md:text-3xl font-bold text-foreground">{t("nav.invoices")}</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} disabled={isExporting}>
            <Download className="h-4 w-4 me-2" />
            {isExporting ? "Exporting..." : "Export CSV"}
          </Button>
          <Button onClick={openAdd}><Plus className="h-4 w-4 me-2" /> Add Invoice</Button>
        </div>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t("admin.search")} className="ps-10" />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-40 bg-background">
                <Filter className="h-4 w-4 me-2" /><SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="flagged">Flagged</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={teamFilter} onValueChange={(v) => { setTeamFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-48 bg-background"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                <SelectItem value="all">All Teams</SelectItem>
                {teams.map((tm) => <SelectItem key={tm} value={tm}>{tm}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`whitespace-nowrap ${hasAdvancedFilters ? "border-accent text-accent" : ""}`}
            >
              {showAdvancedFilters ? <ChevronUp className="h-4 w-4 me-1" /> : <ChevronDown className="h-4 w-4 me-1" />}
              Filters
              {hasAdvancedFilters && <span className="ml-1 w-2 h-2 rounded-full bg-accent inline-block" />}
            </Button>
          </div>

          {/* Advanced Filters Row */}
          {showAdvancedFilters && (
            <div className="flex flex-col sm:flex-row gap-3 mt-3 pt-3 border-t border-border/50">
              <div className="flex-1 space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Date From</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                  className="bg-background"
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Date To</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                  className="bg-background"
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Min Amount (AED)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={amountMin}
                  onChange={(e) => { setAmountMin(e.target.value); setPage(1); }}
                  className="bg-background"
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Max Amount (AED)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={amountMax}
                  onChange={(e) => { setAmountMax(e.target.value); setPage(1); }}
                  className="bg-background"
                />
              </div>
              {hasAdvancedFilters && (
                <div className="flex items-end">
                  <Button variant="ghost" size="sm" onClick={clearAdvancedFilters} className="text-muted-foreground">
                    Clear
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <SortHeader field="invoice_id">ID</SortHeader>
                  <SortHeader field="user_name">Submitted By</SortHeader>
                  <SortHeader field="team" className="hidden md:table-cell">Team</SortHeader>
                  <SortHeader field="store_name">Store</SortHeader>
                  <SortHeader field="amount_after_tax">Amount</SortHeader>
                  <SortHeader field="invoice_date" className="hidden sm:table-cell">Date</SortHeader>
                  <SortHeader field="status">Status</SortHeader>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.invoice_id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="p-3 font-mono text-xs">{inv.invoice_id}</td>
                    <td className="p-3">{inv.user_name}</td>
                    <td className="p-3 hidden md:table-cell">{inv.team}</td>
                    <td className="p-3 max-w-[120px] truncate">{inv.store_name}</td>
                    <td className="p-3 whitespace-nowrap">AED {(inv.amount_after_tax || 0).toLocaleString()}</td>
                    <td className="p-3 hidden sm:table-cell">{inv.invoice_date}</td>
                    <td className="p-3"><StatusBadge status={inv.status} /></td>
                    <td className="p-3 flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openView(inv)} aria-label="View"><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(inv)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(inv.invoice_id)} aria-label="Delete" className="text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></Button>
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 && (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No invoices found</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between p-4 border-t border-border">
            <p className="text-sm text-muted-foreground">{totalCount} invoice{totalCount !== 1 ? "s" : ""}</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-1">
                <Select value={String(page)} onValueChange={(v) => setPage(Number(v))}>
                  <SelectTrigger className="h-8 w-[70px] bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover max-h-[200px]">
                    {Array.from({ length: totalPages || 1 }, (_, i) => i + 1).map((p) => (
                      <SelectItem key={p} value={String(p)}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground mx-1">/ {totalPages || 1}</span>
              </div>
              <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isModalOpen && isMobile ? (
        <Sheet open={isModalOpen} onOpenChange={closeModal}>
          <SheetContent side="bottom" className="h-[90vh] overflow-y-auto bg-card">
            <SheetHeader className="flex flex-row items-center justify-between">
              <SheetTitle>{modalTitle}</SheetTitle>
              {(modalMode === "view" || modalMode === "edit") && selected && (
                <div className="flex items-center gap-1 me-10">
                  <Button variant="outline" size="icon" disabled={invoices.findIndex(i => i.invoice_id === selected.invoice_id) <= 0} onClick={() => navigateInvoice("prev")}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" disabled={invoices.findIndex(i => i.invoice_id === selected.invoice_id) >= invoices.length - 1} onClick={() => navigateInvoice("next")}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </SheetHeader>
            <div className="mt-4"><ModalBody /></div>
          </SheetContent>
        </Sheet>
      ) : isModalOpen ? (
        <Dialog open={isModalOpen} onOpenChange={closeModal}>
          <DialogContent className="max-w-4xl bg-card max-h-[90vh] overflow-y-auto">
            <DialogHeader className="flex flex-row items-center justify-between border-b pb-4 mb-4">
              <DialogTitle>{modalTitle}</DialogTitle>
              {(modalMode === "view" || modalMode === "edit") && selected && (
                <div className="flex items-center gap-2 me-8">
                  <Button variant="outline" size="sm" disabled={invoices.findIndex(i => i.invoice_id === selected.invoice_id) <= 0} onClick={() => navigateInvoice("prev")} className="h-8">
                    <ChevronLeft className="h-4 w-4 me-1" /> Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={invoices.findIndex(i => i.invoice_id === selected.invoice_id) >= invoices.length - 1} onClick={() => navigateInvoice("next")} className="h-8">
                    Next <ChevronRight className="h-4 w-4 ms-1" />
                  </Button>
                </div>
              )}
            </DialogHeader>
            <ModalBody />
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

/* ── OCR Audit Log Panel ── */

function AuditLogSection({ invoiceId }: { invoiceId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [audit, setAudit] = useState<AuditLogEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadAuditLog = async () => {
    if (loaded) {
      setExpanded(!expanded);
      return;
    }
    setLoading(true);
    try {
      const data = await getAuditLog(invoiceId);
      setAudit(data);
      setLoaded(true);
      setExpanded(true);
    } catch {
      setAudit(null);
      setLoaded(true);
      setExpanded(true);
    } finally {
      setLoading(false);
    }
  };

  const parseJson = (raw: string) => {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  };

  return (
    <div className="border-t border-border pt-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={loadAuditLog}
        className="w-full justify-between text-muted-foreground hover:text-foreground"
      >
        <span className="text-sm font-medium">OCR Audit Log</span>
        {loading ? (
          <span className="text-xs">Loading...</span>
        ) : expanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </Button>

      {expanded && (
        <div className="mt-3 space-y-4">
          {!audit ? (
            <p className="text-sm text-muted-foreground italic">No audit log available for this invoice.</p>
          ) : (
            <>
              {audit.mismatch_fields && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <span className="text-xs font-medium text-destructive">Mismatched Fields:</span>
                  <p className="text-sm mt-1">{audit.mismatch_fields}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <OcrResultCard title="OCR 1 (Google Vision)" data={parseJson(audit.ocr1_result)} />
                <OcrResultCard title="OCR 2 (Azure CV)" data={parseJson(audit.ocr2_result)} />
                {audit.ocr3_result && (
                  <OcrResultCard title="OCR 3 (Tiebreaker)" data={parseJson(audit.ocr3_result)} />
                )}
              </div>

              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">LLM Decision:</span>
                <pre className="text-xs bg-muted/50 rounded-lg p-3 overflow-x-auto max-h-40 border border-border/50">
                  {JSON.stringify(parseJson(audit.llm_decision), null, 2)}
                </pre>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function OcrResultCard({ title, data }: { title: string; data: unknown }) {
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{title}</span>
      <pre className="text-xs bg-muted/50 rounded-lg p-3 overflow-x-auto max-h-32 border border-border/50 whitespace-pre-wrap break-words">
        {typeof data === "string" ? data : JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    approved: "bg-success/15 text-success border-success/30",
    pending: "bg-warning/15 text-warning border-warning/30",
    flagged: "bg-destructive/15 text-destructive border-destructive/30",
    rejected: "bg-muted text-muted-foreground border-border",
  };
  return <Badge variant="outline" className={`text-xs ${classes[status] || ""}`}>{status}</Badge>;
}

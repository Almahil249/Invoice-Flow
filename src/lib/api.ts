import type { Invoice } from "@/data/mockInvoices";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

export interface InvoicesResponse {
    invoices: Invoice[];
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
}

export interface Statistics {
    totalInvoices: number;
    totalAmount: number;
    pendingReview: number;
    flaggedInvoices: number;
    approvedThisMonth: number;
    manualEntries: number;
    ocrAutoEntries: number;
    ocrAccuracy: number;
    categoryBreakdown: { category: string; count: number; amount: number }[];
    teamPerformance: { team: string; invoices: number; amount: number }[];
    monthlyTrend: { month: string; invoices: number; amount: number }[];
    manualEntryReasons: { reason: string; count: number }[];
}

function getToken(): string | null {
    return localStorage.getItem("admin_token");
}

function authHeaders(): Record<string, string> {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

/* ── User Endpoints ── */

export async function submitReceipts(files: File[], team: string, name: string) {
    const form = new FormData();
    form.append("user_name", name);
    form.append("team", team);
    files.forEach((f) => form.append("files", f));
    const res = await fetch(`${API_BASE}/api/upload-receipts`, { method: "POST", body: form });
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
}

export interface JobStatus {
    job_id: string;
    status: "processing" | "complete" | "review_required" | "manual_entry_required" | "error";
    message: string;
    receipt_data?: Record<string, unknown> | null;
}

export async function pollJobStatus(jobId: string): Promise<JobStatus> {
    const res = await fetch(`${API_BASE}/api/status/${jobId}`);
    if (!res.ok) throw new Error("Failed to fetch job status");
    return res.json();
}

export async function submitManualEntry(data: {
    user_name: string;
    team: string;
    store_name: string;
    tax_registration_number?: string;
    invoice_number: string;
    invoice_date: string;
    amount_before_tax: number;
    amount_after_tax: number;
    category?: string;
    notes?: string;
    manual_entry_reason: string;
}, file?: File | null) {
    const form = new FormData();
    Object.entries(data).forEach(([k, v]) => { if (v !== undefined) form.append(k, String(v)); });
    if (file) form.append("file", file);
    const res = await fetch(`${API_BASE}/api/admin/manual-entry`, { method: "POST", body: form });
    if (!res.ok) throw new Error("Manual entry failed");
    return res.json();
}

/* ── Admin Endpoints ── */

export async function getInvoices(params?: {
    search?: string; status?: string; team?: string; page?: number; page_size?: number;
    date_from?: string; date_to?: string; amount_min?: number; amount_max?: number;
    sort_by?: string; sort_order?: string;
}): Promise<InvoicesResponse> {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.status && params.status !== "all") q.set("status", params.status);
    if (params?.team && params.team !== "all") q.set("team", params.team);
    if (params?.page) q.set("page", String(params.page));
    if (params?.page_size) q.set("page_size", String(params.page_size));
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    if (params?.amount_min != null) q.set("amount_min", String(params.amount_min));
    if (params?.amount_max != null) q.set("amount_max", String(params.amount_max));
    if (params?.sort_by) q.set("sort_by", params.sort_by);
    if (params?.sort_order) q.set("sort_order", params.sort_order);
    const res = await fetch(`${API_BASE}/api/admin/invoices?${q}`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Failed to fetch invoices");
    return res.json();
}

export async function reviewInvoice(invoiceId: string, action: "approve" | "flag" | "reject") {
    const form = new FormData();
    form.append("action", action);
    const res = await fetch(`${API_BASE}/api/admin/review/${invoiceId}`, {
        method: "POST", headers: authHeaders(), body: form,
    });
    if (!res.ok) throw new Error("Review failed");
    return res.json();
}

export async function deleteInvoice(invoiceId: string) {
    const res = await fetch(`${API_BASE}/api/admin/invoices/${invoiceId}`, {
        method: "DELETE", headers: authHeaders(),
    });
    if (!res.ok) throw new Error("Delete failed");
    return res.json();
}

export async function updateInvoice(invoiceId: string, updates: Record<string, unknown>) {
    const res = await fetch(`${API_BASE}/api/admin/invoices/${invoiceId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error("Update failed");
    return res.json();
}

export async function adminAddInvoice(data: Record<string, unknown>, file?: File | null) {
    const form = new FormData();
    form.append("user_name", String(data.user_name || "Admin"));
    form.append("team", String(data.team || ""));
    form.append("store_name", String(data.store_name || ""));
    form.append("tax_registration_number", String(data.tax_registration_number || ""));
    form.append("invoice_number", String(data.invoice_number || "N/A"));
    form.append("invoice_date", String(data.invoice_date || new Date().toISOString().split("T")[0]));
    form.append("amount_before_tax", String(data.amount_before_tax || 0));
    form.append("amount_after_tax", String(data.amount_after_tax || 0));
    form.append("category", String(data.category || "Other"));
    form.append("notes", String(data.notes || ""));
    form.append("manual_entry_reason", String(data.manual_entry_reason || "Admin entry"));
    if (file) form.append("file", file);
    const res = await fetch(`${API_BASE}/api/admin/manual-entry`, {
        method: "POST", headers: authHeaders(), body: form,
    });
    if (!res.ok) throw new Error("Add invoice failed");
    return res.json();
}

export async function getStatistics(): Promise<Statistics> {
    const res = await fetch(`${API_BASE}/api/admin/statistics`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Failed to fetch statistics");
    return res.json();
}

export interface AuditLogEntry {
    invoice_id: string;
    ocr1_result: string;
    ocr2_result: string;
    ocr3_result: string;
    llm_decision: string;
    mismatch_fields: string;
    created_at: string;
}

export async function getAuditLog(invoiceId: string): Promise<AuditLogEntry | null> {
    const res = await fetch(`${API_BASE}/api/admin/invoices/${invoiceId}/audit-log`, { headers: authHeaders() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("Failed to fetch audit log");
    return res.json();
}

export type TeamsMap = Record<string, string[]>;

export async function getTeams(): Promise<TeamsMap> {
    const res = await fetch(`${API_BASE}/api/teams`);
    if (!res.ok) throw new Error("Failed to fetch teams");
    return res.json();
}

export async function exportCSV(params?: {
    search?: string; status?: string; team?: string;
    date_from?: string; date_to?: string; amount_min?: number; amount_max?: number;
}) {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.status && params.status !== "all") q.set("status", params.status);
    if (params?.team && params.team !== "all") q.set("team", params.team);
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    if (params?.amount_min != null) q.set("amount_min", String(params.amount_min));
    if (params?.amount_max != null) q.set("amount_max", String(params.amount_max));

    const res = await fetch(`${API_BASE}/api/admin/export/csv?${q}`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoices_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

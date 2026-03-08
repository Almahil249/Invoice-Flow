import { useState, useCallback, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { type Invoice } from "@/data/mockInvoices";
import { categories } from "@/data/categories";
import { useLang } from "@/contexts/LangContext";
import { type TeamsMap } from "@/lib/api";
import { Upload, X, FileImage, Eye } from "lucide-react";
import { useTeams } from "@/hooks/useTeams";

const schema = z.object({
  user_name: z.string().min(1, "Required"),
  team: z.string().min(1, "Required"),
  store_name: z.string().min(1, "Store name required").max(200),
  tax_registration_number: z.string().max(50).optional().or(z.literal("")),
  invoice_number: z.string().max(100).optional().or(z.literal("")),
  invoice_date: z.string().min(1, "Date required"),
  amount_before_tax: z.coerce.number().min(0),
  vat_amount: z.coerce.number().min(0),
  amount_after_tax: z.coerce.number().min(0),
  category: z.string().min(1, "Category required"),
  notes: z.string().max(500).optional().or(z.literal("")),
  status: z.enum(["pending", "approved", "flagged", "rejected"]),
  manual_entry_reason: z.string().max(300).optional().or(z.literal("")),
});

export type InvoiceFormValues = z.infer<typeof schema>;

interface Props {
  invoice?: Invoice | null;
  onSubmit: (data: InvoiceFormValues, file?: File | null) => void;
  isLoading?: boolean;
}



export default function InvoiceForm({ invoice, onSubmit, isLoading }: Props) {
  const { t } = useLang();

  // Teams state – fetched from the API
  const { teams: teamsData, isLoading: isLoadingTeams } = useTeams();

  const teams = Object.keys(teamsData);

  // New State for File Upload (Create Mode)
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      user_name: invoice?.user_name || "",
      team: invoice?.team || "",
      store_name: invoice?.store_name || "",
      tax_registration_number: invoice?.tax_registration_number || "",
      invoice_number: invoice?.invoice_number || "",
      invoice_date: invoice?.invoice_date || new Date().toISOString().split("T")[0],
      amount_before_tax: invoice?.amount_before_tax || 0,
      vat_amount: invoice?.vat_amount || 0,
      amount_after_tax: invoice?.amount_after_tax || 0,
      category: invoice?.category || "Other",
      notes: invoice?.notes || "",
      status: invoice?.status || "pending",
      manual_entry_reason: invoice?.manual_entry_reason || "",
    },
  });

  const selectedTeam = form.watch("team");
  const selectedUserName = form.watch("user_name");
  const amountBeforeTax = form.watch("amount_before_tax");

  // Custom name state for "Other" option
  const [customName, setCustomName] = useState("");

  useEffect(() => {
    const parsed = typeof amountBeforeTax === "number" ? amountBeforeTax : parseFloat(String(amountBeforeTax));
    const safe = isNaN(parsed) ? 0 : parsed;
    const vat = Number((safe * 0.05).toFixed(2));
    form.setValue("vat_amount", vat);
    form.setValue("amount_after_tax", Number((safe + vat).toFixed(2)));
  }, [amountBeforeTax, form]);

  const teamMembers = selectedTeam && teamsData[selectedTeam]
    ? [...teamsData[selectedTeam], "Other"]
    : ["Other"];

  const getGoogleDrivePreviewUrl = (url: string) => {
    if (!url) return "";
    const match = url.match(/\/d\/([^/]+)/) || url.match(/id=([^&]+)/);
    if (match && match[1]) {
      return `https://drive.google.com/file/d/${match[1]}/preview`;
    }
    return url;
  };

  const existingImageUrl = invoice?.original_image_url || invoice?.image_link;
  const existingPreviewUrl = getGoogleDrivePreviewUrl(existingImageUrl || "");

  // Handlers for File Upload
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).filter((f) =>
      ["image/jpeg", "image/png", "application/pdf"].includes(f.type)
    );
    if (dropped.length > 0) {
      if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
      setReceiptFile(dropped[0]);
      setUploadPreviewUrl(URL.createObjectURL(dropped[0]));
    }
  }, [uploadPreviewUrl]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
      const file = e.target.files[0];
      setReceiptFile(file);
      setUploadPreviewUrl(URL.createObjectURL(file));
    }
  };

  const removeFile = () => {
    if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
    setReceiptFile(null);
    setUploadPreviewUrl("");
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
    };
  }, []);

  const handleCustomSubmit = (data: InvoiceFormValues) => {
    if (data.user_name === "Other") {
      if (!customName.trim()) {
        form.setError("user_name", { message: "Please enter a name" });
        return;
      }
      data.user_name = customName;
    }
    onSubmit(data, receiptFile);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleCustomSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="team" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("user.selectTeam")}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={isLoadingTeams}>
                    <FormControl><SelectTrigger className="bg-background"><SelectValue placeholder={isLoadingTeams ? "Loading teams..." : "Select team"} /></SelectTrigger></FormControl>
                    <SelectContent className="bg-popover z-50">
                      {teams.map((tm) => <SelectItem key={tm} value={tm}>{tm}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="space-y-2">
                <FormField control={form.control} name="user_name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("user.selectName")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger className="bg-background"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent className="bg-popover z-50">
                        {teamMembers.map((nm) => <SelectItem key={nm} value={nm}>{nm}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                {selectedUserName === "Other" && (
                  <Input
                    placeholder="Enter Name"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                  />
                )}
              </div>
              <FormField control={form.control} name="store_name" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("form.storeName")}</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="tax_registration_number" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("form.trn")}</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="invoice_number" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("form.invoiceNumber")}</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="invoice_date" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("form.date")}</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="amount_before_tax" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("form.amountBeforeVat")}</FormLabel>
                  <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="vat_amount" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("form.vatAmount")}</FormLabel>
                  <FormControl><Input type="number" step="0.01" readOnly className="bg-muted" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="amount_after_tax" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("form.total")}</FormLabel>
                  <FormControl><Input type="number" step="0.01" readOnly className="bg-muted" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("form.category")}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger className="bg-background"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent className="bg-popover z-50">
                      {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger className="bg-background"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent className="bg-popover z-50">
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="flagged">Flagged</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("form.notes")}</FormLabel>
                <FormControl><Textarea {...field} rows={2} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="manual_entry_reason" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("form.manualReason")}</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>

          <div className="space-y-4">
            <span className="text-sm font-medium text-muted-foreground">{invoice ? "Original Receipt:" : "Receipt Image:"}</span>
            <div className="rounded-md border border-border bg-muted/50 overflow-hidden aspect-[3/4] flex items-center justify-center relative group">
              {/* Scenario 1: Existing Invoice (View Only) */}
              {invoice && existingImageUrl ? (
                <iframe
                  src={existingPreviewUrl}
                  className="w-full h-full border-0"
                  allow="autoplay"
                  title="Receipt Preview"
                ></iframe>
              ) : invoice && !existingImageUrl ? (
                <div className="text-muted-foreground text-center p-4">
                  <Eye className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p>No image available</p>
                </div>
              ) :
                /* Scenario 2: New Invoice (Upload Mode) */
                receiptFile && uploadPreviewUrl ? (
                  <>
                    <iframe
                      src={uploadPreviewUrl}
                      className="w-full h-full border-0"
                      title="Receipt Preview"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-8 w-8 rounded-full"
                      onClick={removeFile}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById("admin-receipt-upload")?.click()}
                    className={`w-full h-full flex flex-col items-center justify-center cursor-pointer transition-colors ${dragOver ? "bg-accent/20" : "hover:bg-muted/70"
                      }`}
                  >
                    <Upload className="h-10 w-10 text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground font-medium">Click or Drag to Upload</p>
                    <p className="text-xs text-muted-foreground mt-1 opacity-60">JPG, PNG, PDF</p>
                  </div>
                )}
            </div>

            {/* Action Buttons below preview */}
            {!invoice && (
              <>
                <input
                  id="admin-receipt-upload"
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                {!receiptFile && (
                  <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => document.getElementById("admin-receipt-upload")?.click()}>
                    <Upload className="h-4 w-4 me-2" /> Upload Receipt
                  </Button>
                )}
              </>
            )}

            {invoice && existingImageUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => window.open(existingImageUrl, "_blank")}
              >
                Open Original Image
              </Button>
            )}
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? t("common.loading") : invoice ? "Save Changes" : "Add Invoice"}
        </Button>
      </form>
    </Form>
  );
}

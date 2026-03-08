import { useState, useCallback, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, useNavigate } from "react-router-dom";
import { Save, ArrowLeft, FileImage, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLang } from "@/contexts/LangContext";
import { submitManualEntry } from "@/lib/api";
import { categories } from "@/data/categories";
import { useToast } from "@/hooks/use-toast";

const schema = z.object({
  store_name: z.string().min(1, "Required").max(200),
  tax_registration_number: z.string().max(50).optional(),
  invoice_number: z.string().min(1, "Required").max(100),
  invoice_date: z.string().min(1, "Required"),
  amount_before_tax: z.coerce.number().min(0),
  category: z.string().min(1, "Required"),
  notes: z.string().max(500).optional(),
  manual_entry_reason: z.string().min(1, "Required").max(300),
});

type FormData = z.infer<typeof schema>;

export default function ManualEntry() {
  const { t } = useLang();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    team = "",
    name = "",
    files: passedFiles = [],
  } = (location.state as { team?: string; name?: string; files?: File[] }) || {};

  // Receipt image state
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const userCleared = useRef(false);

  // If files were passed from UserPortal, use the first one
  useEffect(() => {
    if (!userCleared.current && passedFiles && passedFiles.length > 0 && !receiptFile) {
      const file = passedFiles[0];
      setReceiptFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  }, [passedFiles, receiptFile]);

  // Clean up object URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleImageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).filter((f) =>
      ["image/jpeg", "image/png", "application/pdf"].includes(f.type)
    );
    if (dropped.length > 0) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setReceiptFile(dropped[0]);
      setPreviewUrl(URL.createObjectURL(dropped[0]));
    }
  }, [previewUrl]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const file = e.target.files[0];
      setReceiptFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const removeImage = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setReceiptFile(null);
    setPreviewUrl("");
    userCleared.current = true;
  };

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { amount_before_tax: 0, category: "", invoice_date: new Date().toISOString().split("T")[0] },
  });

  const rawAmount = watch("amount_before_tax");
  const amountBeforeTax = typeof rawAmount === "number" && !isNaN(rawAmount) ? rawAmount : (parseFloat(String(rawAmount)) || 0);
  const vatAmount = Number((amountBeforeTax * 0.05).toFixed(2));
  const total = Number((amountBeforeTax + vatAmount).toFixed(2));

  const onSubmit = async (data: FormData) => {
    if (!receiptFile) {
      toast({
        title: "Missing Receipt",
        description: "Please upload a receipt image.",
        variant: "destructive",
      });
      return;
    }
    await submitManualEntry({
      user_name: name,
      team,
      store_name: data.store_name,
      tax_registration_number: data.tax_registration_number || "",
      invoice_number: data.invoice_number,
      invoice_date: data.invoice_date,
      amount_before_tax: data.amount_before_tax,
      amount_after_tax: total,
      category: data.category,
      notes: data.notes || "",
      manual_entry_reason: data.manual_entry_reason,
    }, receiptFile);
    toast({ title: "Submitted!", description: "Manual entry saved successfully." });
    navigate("/");
  };

  const isPdf = receiptFile?.type === "application/pdf";

  return (
    <div className="container py-6 md:py-10 animate-fade-in">
      <Button variant="ghost" onClick={() => navigate("/")} className="mb-4">
        <ArrowLeft className="h-4 w-4 me-2" />
        Back
      </Button>

      <h2 className="text-2xl font-bold text-foreground mb-6">{t("user.manualEntry")}</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Receipt Image Preview / Upload */}
        <Card className="order-2 lg:order-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Receipt Image</CardTitle>
              {receiptFile && (
                <Button variant="ghost" size="icon" onClick={removeImage} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {receiptFile && previewUrl ? (
              <div className="rounded-lg border border-border overflow-hidden bg-muted/30">
                {isPdf ? (
                  <iframe
                    src={previewUrl}
                    className="w-full aspect-[3/4] border-0"
                    title="Receipt PDF Preview"
                  />
                ) : (
                  <img
                    src={previewUrl}
                    alt="Receipt preview"
                    className="w-full object-contain max-h-[500px]"
                  />
                )}
                <div className="p-3 border-t border-border bg-muted/20 flex items-center gap-2">
                  <FileImage className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate flex-1">{receiptFile.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {(receiptFile.size / 1024).toFixed(0)} KB
                  </span>
                </div>
              </div>
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleImageDrop}
                onClick={() => document.getElementById("receipt-input")?.click()}
                className={`aspect-[3/4] rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors ${dragOver
                  ? "border-accent bg-accent/10"
                  : "border-border hover:border-muted-foreground/30 bg-muted/30"
                  }`}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") document.getElementById("receipt-input")?.click(); }}
              >
                <Upload className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground font-medium">
                  Drop receipt image here
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  or click to browse
                </p>
                <p className="text-xs text-muted-foreground mt-2 opacity-60">
                  JPG, PNG, PDF
                </p>
              </div>
            )}
            <input
              id="receipt-input"
              type="file"
              accept=".jpg,.jpeg,.png,.pdf"
              className="hidden"
              onChange={handleImageSelect}
            />
            {!receiptFile && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full mt-3"
                onClick={() => document.getElementById("receipt-input")?.click()}
              >
                <Upload className="h-4 w-4 me-2" /> Upload Receipt Image
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Invoice Details Form */}
        <Card className="order-1 lg:order-2">
          <CardHeader>
            <CardTitle className="text-base">Invoice Details</CardTitle>
            <p className="text-sm text-muted-foreground">Team: {team} • Name: {name}</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <Label htmlFor="store_name">{t("form.storeName")} *</Label>
                <Input id="store_name" {...register("store_name")} className="mt-1" />
                {errors.store_name && <p className="text-xs text-destructive mt-1">{errors.store_name.message}</p>}
              </div>
              <div>
                <Label htmlFor="tax_registration_number">{t("form.trn")}</Label>
                <Input id="tax_registration_number" {...register("tax_registration_number")} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="invoice_number">{t("form.invoiceNumber")} *</Label>
                <Input id="invoice_number" {...register("invoice_number")} className="mt-1" />
                {errors.invoice_number && <p className="text-xs text-destructive mt-1">{errors.invoice_number.message}</p>}
              </div>
              <div>
                <Label htmlFor="invoice_date">{t("form.date")} *</Label>
                <Input id="invoice_date" type="date" {...register("invoice_date")} className="mt-1" />
                {errors.invoice_date && <p className="text-xs text-destructive mt-1">{errors.invoice_date.message}</p>}
              </div>
              <div>
                <Label htmlFor="amount_before_tax">{t("form.amountBeforeVat")} (AED) *</Label>
                <Input id="amount_before_tax" type="number" step="0.01" {...register("amount_before_tax")} className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t("form.vatAmount")}</Label>
                  <Input value={`AED ${vatAmount.toFixed(2)}`} readOnly className="mt-1 bg-muted" />
                </div>
                <div>
                  <Label>{t("form.total")}</Label>
                  <Input value={`AED ${total.toFixed(2)}`} readOnly className="mt-1 bg-muted font-semibold" />
                </div>
              </div>
              <div>
                <Label>{t("form.category")} *</Label>
                <Select onValueChange={(v) => setValue("category", v)}>
                  <SelectTrigger className="mt-1 bg-background">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.category && <p className="text-xs text-destructive mt-1">{errors.category.message}</p>}
              </div>
              <div>
                <Label htmlFor="notes">{t("form.notes")}</Label>
                <Textarea id="notes" {...register("notes")} className="mt-1" rows={3} />
              </div>
              <div>
                <Label htmlFor="manual_entry_reason">{t("form.manualReason")} *</Label>
                <Textarea id="manual_entry_reason" {...register("manual_entry_reason")} className="mt-1" rows={2} />
                {errors.manual_entry_reason && <p className="text-xs text-destructive mt-1">{errors.manual_entry_reason.message}</p>}
              </div>
              <Button type="submit" disabled={isSubmitting} className="w-full h-12 gradient-primary text-primary-foreground hover:opacity-90">
                <Save className="h-4 w-4 me-2" />
                {isSubmitting ? "Saving..." : t("user.submit")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

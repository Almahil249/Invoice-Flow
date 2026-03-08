import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

type Lang = "en" | "ar";

const translations: Record<string, Record<Lang, string>> = {
  "app.title": { en: "Invoice Processing System", ar: "نظام معالجة الفواتير" },
  "nav.submit": { en: "Submit Receipt", ar: "إرسال إيصال" },
  "nav.dashboard": { en: "Dashboard", ar: "لوحة التحكم" },
  "nav.invoices": { en: "Invoices", ar: "الفواتير" },
  "nav.statistics": { en: "Statistics", ar: "الإحصائيات" },
  "nav.settings": { en: "Settings", ar: "الإعدادات" },
  "nav.logout": { en: "Logout", ar: "تسجيل الخروج" },
  "nav.adminLogin": { en: "Admin Login", ar: "تسجيل دخول المشرف" },
  "user.selectTeam": { en: "Select Team", ar: "اختر الفريق" },
  "user.selectName": { en: "Select Name", ar: "اختر الاسم" },
  "user.uploadReceipts": { en: "Upload Receipts", ar: "رفع الإيصالات" },
  "user.dragDrop": { en: "Drag & drop files here, or click to browse", ar: "اسحب وأسقط الملفات هنا، أو انقر للتصفح" },
  "user.submit": { en: "Submit", ar: "إرسال" },
  "user.manualEntry": { en: "Manual Entry", ar: "إدخال يدوي" },
  "form.storeName": { en: "Store Name", ar: "اسم المتجر" },
  "form.trn": { en: "TRN", ar: "الرقم الضريبي" },
  "form.invoiceNumber": { en: "Invoice Number", ar: "رقم الفاتورة" },
  "form.date": { en: "Date", ar: "التاريخ" },
  "form.amountBeforeVat": { en: "Amount Before VAT", ar: "المبلغ قبل الضريبة" },
  "form.vatAmount": { en: "VAT Amount (5%)", ar: "مبلغ الضريبة (5%)" },
  "form.total": { en: "Total", ar: "الإجمالي" },
  "form.category": { en: "Category", ar: "الفئة" },
  "form.notes": { en: "Notes", ar: "ملاحظات" },
  "form.manualReason": { en: "Reason for Manual Entry", ar: "سبب الإدخال اليدوي" },
  "admin.totalInvoices": { en: "Total Invoices", ar: "إجمالي الفواتير" },
  "admin.totalAmount": { en: "Total Amount", ar: "إجمالي المبلغ" },
  "admin.pending": { en: "Pending Review", ar: "قيد المراجعة" },
  "admin.flagged": { en: "Flagged", ar: "مُعلّم" },
  "admin.approved": { en: "Approved", ar: "معتمد" },
  "admin.rejected": { en: "Rejected", ar: "مرفوض" },
  "admin.approve": { en: "Approve", ar: "اعتماد" },
  "admin.flag": { en: "Flag", ar: "تعليم" },
  "admin.reject": { en: "Reject", ar: "رفض" },
  "admin.search": { en: "Search invoices...", ar: "بحث في الفواتير..." },
  "common.loading": { en: "Loading...", ar: "جاري التحميل..." },
  "common.noData": { en: "No data available", ar: "لا توجد بيانات" },
  "login.email": { en: "Email", ar: "البريد الإلكتروني" },
  "login.password": { en: "Password", ar: "كلمة المرور" },
  "login.submit": { en: "Sign In", ar: "تسجيل الدخول" },
  "login.error": { en: "Invalid credentials", ar: "بيانات الدخول غير صحيحة" },
  "login.title": { en: "Admin Login", ar: "تسجيل دخول المشرف" },
};

interface LangContextType {
  lang: Lang;
  dir: "ltr" | "rtl";
  toggleLang: () => void;
  t: (key: string) => string;
}

const LangContext = createContext<LangContextType | undefined>(undefined);

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");

  const toggleLang = useCallback(() => {
    setLang((l) => (l === "en" ? "ar" : "en"));
  }, []);

  const dir = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", lang);
  }, [dir, lang]);

  const t = useCallback(
    (key: string) => translations[key]?.[lang] || key,
    [lang]
  );

  return (
    <LangContext.Provider value={{ lang, dir, toggleLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within LangProvider");
  return ctx;
}

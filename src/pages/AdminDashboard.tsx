import { useQuery } from "@tanstack/react-query";
import { FileText, DollarSign, Clock, AlertTriangle, TrendingUp, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLang } from "@/contexts/LangContext";
import { getStatistics, getInvoices } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const COLORS = [
  "hsl(220, 60%, 22%)", "hsl(42, 92%, 52%)", "hsl(152, 60%, 40%)",
  "hsl(210, 80%, 52%)", "hsl(0, 72%, 51%)", "hsl(280, 60%, 50%)", "hsl(180, 50%, 45%)",
];

export default function AdminDashboard() {
  const { t } = useLang();
  const { data: stats } = useQuery({ queryKey: ["statistics"], queryFn: getStatistics });
  const { data: invoiceData } = useQuery({
    queryKey: ["invoices", "recent"],
    queryFn: () => getInvoices({ page: 1, page_size: 5 }),
  });

  const recentInvoices = invoiceData?.invoices || [];

  const overviewCards = [
    { label: t("admin.totalInvoices"), value: stats?.totalInvoices || 0, icon: FileText, color: "text-info" },
    { label: t("admin.totalAmount"), value: `AED ${((stats?.totalAmount || 0) / 1000).toFixed(0)}K`, icon: DollarSign, color: "text-success" },
    { label: t("admin.pending"), value: stats?.pendingReview || 0, icon: Clock, color: "text-warning" },
    { label: t("admin.flagged"), value: stats?.flaggedInvoices || 0, icon: AlertTriangle, color: "text-destructive" },
    { label: t("admin.approved"), value: stats?.approvedThisMonth || 0, icon: CheckCircle, color: "text-success" },
    { label: "Manual Entries", value: stats?.manualEntries || 0, icon: TrendingUp, color: "text-info" },
  ];

  return (
    <div className="container py-6 md:py-10 animate-fade-in">
      <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-6">{t("nav.dashboard")}</h2>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {overviewCards.map((card) => (
          <Card key={card.label} className="glass-card">
            <CardContent className="p-4">
              <card.icon className={`h-5 w-5 ${card.color} mb-2`} />
              <p className="text-2xl font-bold text-foreground">{card.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{card.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader><CardTitle className="text-base">Monthly Trend</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats?.monthlyTrend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(215, 25%, 88%)" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="invoices" fill="hsl(220, 60%, 22%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Category Breakdown</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={stats?.categoryBreakdown || []} cx="50%" cy="50%" outerRadius={90}
                  dataKey="amount" nameKey="category" label={({ category }) => category} labelLine={false}>
                  {(stats?.categoryBreakdown || []).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => `AED ${v.toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-start p-3 font-medium text-muted-foreground">ID</th>
                  <th className="text-start p-3 font-medium text-muted-foreground">Submitted By</th>
                  <th className="text-start p-3 font-medium text-muted-foreground">Store</th>
                  <th className="text-start p-3 font-medium text-muted-foreground">Amount</th>
                  <th className="text-start p-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map((inv) => (
                  <tr key={inv.invoice_id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs">{inv.invoice_id}</td>
                    <td className="p-3">{inv.user_name}</td>
                    <td className="p-3">{inv.store_name}</td>
                    <td className="p-3">AED {(inv.amount_after_tax || 0).toLocaleString()}</td>
                    <td className="p-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${inv.status === "approved" ? "bg-success/15 text-success" :
                          inv.status === "pending" ? "bg-warning/15 text-warning" :
                            inv.status === "flagged" ? "bg-destructive/15 text-destructive" :
                              "bg-muted text-muted-foreground"
                        }`}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {recentInvoices.length === 0 && (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No invoices yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

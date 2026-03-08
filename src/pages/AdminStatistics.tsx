import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLang } from "@/contexts/LangContext";
import { getStatistics } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";

const COLORS = [
  "hsl(220, 60%, 22%)", "hsl(42, 92%, 52%)", "hsl(152, 60%, 40%)",
  "hsl(210, 80%, 52%)", "hsl(0, 72%, 51%)", "hsl(280, 60%, 50%)", "hsl(180, 50%, 45%)",
];

export default function AdminStatistics() {
  const { t } = useLang();
  const { data: stats } = useQuery({ queryKey: ["statistics"], queryFn: getStatistics });

  return (
    <div className="container py-6 md:py-10 animate-fade-in">
      <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-6">{t("nav.statistics")}</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Monthly Invoice Amount</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={stats?.monthlyTrend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(215, 25%, 88%)" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${v / 1000}K`} />
                <Tooltip formatter={(v: number) => `AED ${v.toLocaleString()}`} />
                <Line type="monotone" dataKey="amount" stroke="hsl(42, 92%, 52%)" strokeWidth={3} dot={{ fill: "hsl(220, 60%, 22%)" }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Category Breakdown</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stats?.categoryBreakdown || []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(215, 25%, 88%)" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v / 1000}K`} />
                <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={100} />
                <Tooltip formatter={(v: number) => `AED ${v.toLocaleString()}`} />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                  {(stats?.categoryBreakdown || []).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Team Performance</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={stats?.teamPerformance?.map((tp) => ({ ...tp, subject: tp.team })) || []}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                <PolarRadiusAxis tick={{ fontSize: 10 }} />
                <Radar name="Invoices" dataKey="invoices" stroke="hsl(220, 60%, 22%)" fill="hsl(220, 60%, 22%)" fillOpacity={0.3} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Manual Entry Reasons</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={stats?.manualEntryReasons || []} cx="50%" cy="50%" outerRadius={100}
                  dataKey="count" nameKey="reason"
                  label={({ reason, count }) => `${reason}: ${count}`} labelLine={false}>
                  {(stats?.manualEntryReasons || []).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Team Breakdown</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-start p-3 font-medium text-muted-foreground">Team</th>
                    <th className="text-start p-3 font-medium text-muted-foreground">Invoices</th>
                    <th className="text-start p-3 font-medium text-muted-foreground">Total Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(stats?.teamPerformance || []).map((tp) => (
                    <tr key={tp.team} className="border-b border-border/50">
                      <td className="p-3 font-medium">{tp.team}</td>
                      <td className="p-3">{tp.invoices}</td>
                      <td className="p-3">AED {tp.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                  {(stats?.teamPerformance || []).length === 0 && (
                    <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">No data yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

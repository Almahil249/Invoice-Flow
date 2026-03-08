import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import logo1 from "@/assets/Emiratimarshals.png";

export default function AdminLogin() {
  const { t } = useLang();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const success = await login(email, password);
    setLoading(false);
    if (success) {
      navigate("/admin/dashboard");
    } else {
      setError(t("login.error"));
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
      <Card className="w-full max-w-md animate-fade-in">
        <CardHeader className="text-center">
          {/* Logo Section */}
          <div className="flex items-center justify-center gap-2 sm:gap-4 mb-4">
            <div className="flex items-center gap-1 sm:gap-2">
              <img
                src={logo1}
                alt="Emirati Marshals"
                className="h-8 sm:h-10 lg:h-12 w-auto object-contain"
              />
            </div>
          </div>
          <div className="mx-auto w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center mb-4">
            <Lock className="h-7 w-7 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">{t("login.title")}</CardTitle>
          <CardDescription>
            Sign in with your admin credentials
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">{t("login.email")}</Label>
              <div className="relative mt-1">
                <Mail className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="ps-10"
                  placeholder="admin@example.com"
                  required
                />
              </div>
            </div>
            <div>
              <Label htmlFor="password">{t("login.password")}</Label>
              <div className="relative mt-1">
                <Lock className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="ps-10"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full h-12 gradient-primary text-primary-foreground hover:opacity-90">
              {loading ? "..." : t("login.submit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

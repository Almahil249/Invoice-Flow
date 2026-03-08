import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLang } from "@/contexts/LangContext";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { User, Shield, Globe, UserPlus, Trash2, Crown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

interface AdminProfile {
  id: number;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export default function AdminSettings() {
  const { t, lang, toggleLang } = useLang();
  const { user, token, isSuperAdmin } = useAuth();

  // Admin management state
  const [admins, setAdmins] = useState<AdminProfile[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Fetch admin list (super_admin only)
  useEffect(() => {
    if (isSuperAdmin && token) {
      fetchAdmins();
    }
  }, [isSuperAdmin, token]);

  const fetchAdmins = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/admins`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAdmins(data.admins || []);
      }
    } catch {
      // silently fail
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setCreating(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/create-admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          name: newName,
        }),
      });

      if (res.ok) {
        setSuccess("Admin created successfully!");
        setNewEmail("");
        setNewPassword("");
        setNewName("");
        setShowCreateDialog(false);
        fetchAdmins();
      } else {
        const data = await res.json();
        setError(data.detail || "Failed to create admin");
      }
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteAdmin = async (adminId: number) => {
    if (!confirm("Are you sure you want to delete this admin?")) return;

    try {
      const res = await fetch(`${API_BASE}/api/auth/admins/${adminId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        fetchAdmins();
      } else {
        const data = await res.json();
        alert(data.detail || "Failed to delete admin");
      }
    } catch {
      alert("Network error");
    }
  };

  return (
    <div className="container py-6 md:py-10 max-w-2xl animate-fade-in">
      <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-6">{t("nav.settings")}</h2>

      <div className="space-y-6">
        {/* Profile Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" /> Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Email</span>
              <span className="text-sm font-medium">{user?.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Name</span>
              <span className="text-sm font-medium">{user?.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Role</span>
              <Badge variant="outline" className={user?.role === "super_admin" ? "border-amber-500 text-amber-600" : ""}>
                {user?.role === "super_admin" ? (
                  <span className="flex items-center gap-1"><Crown className="h-3 w-3" /> Super Admin</span>
                ) : (
                  "Administrator"
                )}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Language Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" /> Language
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Current Language</span>
              <Button variant="outline" size="sm" onClick={toggleLang}>
                {lang === "en" ? "Switch to Arabic (العربية)" : "Switch to English"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Admin Management — Super Admin Only */}
        {isSuperAdmin && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Admin Users
                </CardTitle>
                <Button size="sm" onClick={() => { setShowCreateDialog(true); setError(""); setSuccess(""); }}>
                  <UserPlus className="h-4 w-4 mr-1" /> New Admin
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {success && <p className="text-sm text-green-600 bg-green-50 rounded p-2">{success}</p>}

              {admins.length === 0 ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : (
                <div className="space-y-2">
                  {admins.map((admin) => (
                    <div key={admin.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${admin.role === "super_admin"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-blue-100 text-blue-700"
                          }`}>
                          {admin.name ? admin.name[0].toUpperCase() : admin.email[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{admin.name || admin.email}</p>
                          <p className="text-xs text-muted-foreground">{admin.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={admin.role === "super_admin" ? "border-amber-500 text-amber-600" : ""}>
                          {admin.role === "super_admin" ? "Super Admin" : "Admin"}
                        </Badge>
                        {admin.role !== "super_admin" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteAdmin(admin.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* System Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" /> System
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Version</span>
              <span className="text-sm font-mono">2.2.1</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Storage</span>
              <Badge className="bg-success/15 text-success border-success/30" variant="outline">PostgreSQL</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Create Admin Dialog (Modal Overlay) ── */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-background border rounded-xl shadow-2xl w-full max-w-md mx-4 animate-fade-in">
            <div className="flex items-center justify-between p-6 pb-2">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <UserPlus className="h-5 w-5" /> Create New Admin
              </h3>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setShowCreateDialog(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <form onSubmit={handleCreateAdmin} className="p-6 pt-4 space-y-4">
              <div>
                <Label htmlFor="admin-name">Name</Label>
                <Input
                  id="admin-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Full name"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="admin-email">Email *</Label>
                <Input
                  id="admin-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="admin-password">Password *</Label>
                <Input
                  id="admin-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="mt-1"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={creating} className="flex-1 gradient-primary text-primary-foreground">
                  {creating ? "Creating..." : "Create Admin"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

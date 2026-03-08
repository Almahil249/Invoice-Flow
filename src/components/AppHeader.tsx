import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, Globe, FileText, LayoutDashboard, BarChart3, Settings, LogOut, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import logo1 from "@/assets/Emiratimarshals.png";

export function AppHeader() {
  const [open, setOpen] = useState(false);
  const { isAuthenticated, logout } = useAuth();
  const { t, toggleLang, lang } = useLang();
  const location = useLocation();
  const isAdmin = location.pathname.startsWith("/admin");

  const userLinks = [
    { to: "/", label: t("nav.submit"), icon: Upload },
    ...(isAuthenticated ? [{ to: "/admin/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard }] : []),
  ];

  const adminLinks = [
    { to: "/admin/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
    { to: "/admin/invoices", label: t("nav.invoices"), icon: FileText },
    { to: "/admin/statistics", label: t("nav.statistics"), icon: BarChart3 },
    { to: "/admin/settings", label: t("nav.settings"), icon: Settings },
  ];

  const links = isAdmin && isAuthenticated ? adminLinks : userLinks;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="container flex h-16 items-center justify-between gap-4">
        {/* Logo Section */}
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1 sm:gap-2">
            <img
              src={logo1}
              alt="Emirati Marshals"
              className="h-8 sm:h-10 lg:h-12 w-auto object-contain"
            />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-sm sm:text-base md:text-lg font-semibold text-foreground text-center truncate">
          {t("app.title")}
        </h1>

        {/* Right: Lang toggle + Hamburger */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleLang}
            className="h-9 w-9"
            aria-label="Toggle language"
          >
            <Globe className="h-4 w-4" />
          </Button>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Menu">
                {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </SheetTrigger>
            <SheetContent side={lang === "ar" ? "left" : "right"} className="w-72 bg-card p-0">
              <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              <div className="flex flex-col h-full">
                <div className="p-6 border-b border-border">
                  <p className="text-lg font-semibold text-foreground">{t("app.title")}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {isAdmin && isAuthenticated ? "Admin Portal" : "User Portal"}
                  </p>
                </div>
                <nav className="flex-1 p-4 space-y-1">
                  {links.map((link) => {
                    const isActive = location.pathname === link.to;
                    return (
                      <Link
                        key={link.to}
                        to={link.to}
                        onClick={() => setOpen(false)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground hover:bg-muted"
                          }`}
                      >
                        <link.icon className="h-4 w-4" />
                        {link.label}
                      </Link>
                    );
                  })}
                  {!isAuthenticated && (
                    <Link
                      to="/admin/login"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-foreground hover:bg-muted"
                    >
                      <Settings className="h-4 w-4" />
                      {t("nav.adminLogin")}
                    </Link>
                  )}
                </nav>
                {isAuthenticated && (
                  <div className="p-4 border-t border-border">
                    <button
                      onClick={() => {
                        logout();
                        setOpen(false);
                      }}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 w-full"
                    >
                      <LogOut className="h-4 w-4" />
                      {t("nav.logout")}
                    </button>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

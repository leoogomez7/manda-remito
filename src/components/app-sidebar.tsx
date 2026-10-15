import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Archive, LayoutDashboard, FileCheck, FilePlus2, LogOut, Mail, Trash2, UserRound, UserPlus } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import logo from "@/assets/logo.png";
import { BUSINESS } from "@/lib/business";
import { useAppAuth } from "@/lib/auth";
import { AUTH_CONFIG } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const items = [
  { title: "Menú principal", url: "/", icon: LayoutDashboard },
  { title: "Nuevo remito", url: "/nueva", icon: FilePlus2 },
  { title: "Remitos borradores", url: "/borradores", icon: Archive },
  { title: "Remitos emitidos", url: "/historial", icon: FileCheck },
  { title: "Papelera", url: "/papelera", icon: Trash2 },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isMobile, setOpen, setOpenMobile } = useSidebar();
  const { configured, isAuthenticated, login, register, logout, user } = useAppAuth();
  const [authDialog, setAuthDialog] = useState<"login" | "register" | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const openAuthDialog = (mode: "login" | "register") => {
    setAuthDialog(mode);
    setAuthEmail("");
    setFirstName("");
    setLastName("");
  };
  const closeSidebar = () => {
    if (isMobile) {
      setOpenMobile(false);
    } else {
      setOpen(false);
    }
  };

  return (
    <>
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 min-h-14 shrink-0 justify-center p-0">
        <div className="flex h-full w-full items-center gap-3 px-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0">
          <img
            src={logo}
            alt="Manda Remito"
            className="h-10 w-10 shrink-0 rounded-full glow-cyan transition-[width,height] duration-200 group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8"
          />
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-bold tracking-wide text-gradient">
              MANDA REMITO
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              LRG Web Developer
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Panel Administrativo</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {!isAuthenticated && (
                <SidebarMenuItem>
                  <SidebarMenuButton className="gap-3" onClick={() => openAuthDialog("login")} tooltip="Ingresar">
                    <UserRound className="h-4 w-4" />
                    <span>Ingresar</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {!isAuthenticated && (
                <SidebarMenuItem>
                  <SidebarMenuButton className="gap-3" onClick={() => openAuthDialog("register")} tooltip="Crear cuenta">
                    <UserPlus className="h-4 w-4" />
                    <span>Crear cuenta</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {items.map((item) => {
                const active = pathname === item.url;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <Link to={item.url} className="flex items-center gap-3" onClick={closeSidebar}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              {isAuthenticated && (
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => { void logout(); }} tooltip="Cerrar sesión">
                    <LogOut className="h-4 w-4" />
                    <span>Cerrar sesión</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
            {isAuthenticated && user?.email && (
              <p className="mt-2 truncate px-2 text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">
                {user.email}
              </p>
            )}
            {!configured && (
              <p className="mt-1 px-2 text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">
                Configurá Kinde para habilitar el acceso.
              </p>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="px-2 py-3 text-xs group-data-[collapsible=icon]:hidden">
          <p className="font-medium text-foreground">{BUSINESS.name}</p>
          <p className="text-muted-foreground">{BUSINESS.role}</p>
          <p className="text-muted-foreground">{BUSINESS.location}</p>
        </div>
      </SidebarFooter>
    </Sidebar>
    <Dialog open={authDialog !== null} onOpenChange={(open) => { if (!open) setAuthDialog(null); }}>
      <DialogContent className="bg-background shadow-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-gradient">
            {authDialog === "register" ? "Crear cuenta" : "Ingresar a Manda Remito"}
          </DialogTitle>
          <DialogDescription>
            {authDialog === "register"
              ? "Completá tus datos para comenzar el registro."
              : "Ingresá tu correo para continuar con el acceso."}
          </DialogDescription>
        </DialogHeader>
        {configured ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (authDialog === "register") {
                void register(authEmail);
              } else {
                void login(authEmail);
              }
            }}
          >
            {authDialog === "register" && (
              <>
                <Input
                  autoComplete="given-name"
                  placeholder="Primer nombre"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  required
                  maxLength={80}
                />
                <Input
                  autoComplete="family-name"
                  placeholder="Apellido"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  required
                  maxLength={80}
                />
              </>
            )}
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                autoComplete="email"
                placeholder="tu@correo.com"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                className="pl-9"
                required
              />
            </div>
            {authDialog === "register" ? (
              <>
                <Button type="submit" className="w-full">
                  <UserPlus className="mr-2 h-4 w-4" /> Continuar con el registro
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  ¿Ya tenés cuenta?{" "}
                  <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => openAuthDialog("login")}>
                    Ingresar
                  </button>
                </p>
                <p className="text-center text-xs text-muted-foreground">
                  Kinde verifica el correo y administra de forma segura el registro. Esta SDK no transfiere estos nombres al perfil; si activaste la captura de nombre y apellido en Kinde, te los pedirá en su paso seguro.
                </p>
              </>
            ) : (
              <>
                <Button type="submit" className="w-full">
                  <UserRound className="mr-2 h-4 w-4" /> Continuar con el ingreso
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  ¿No tenés cuenta?{" "}
                  <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => openAuthDialog("register")}>
                    Crear cuenta
                  </button>
                </p>
              </>
            )}
            {!AUTH_CONFIG.emailConnectionId && (
              <p className="text-center text-xs text-amber-300">
                Falta configurar AUTH_CONNECTION_ID en Vercel para usar el flujo de email personalizado.
              </p>
            )}
          </form>
        ) : (
          <p className="rounded-xl border border-border/60 bg-background/50 p-3 text-sm text-muted-foreground">
            Kinde todavía no está configurado en este deployment. Revisá DOMAIN_USER y AUTH_USER en Vercel y volvé a desplegar.
          </p>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
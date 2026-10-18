import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import logo from "@/assets/logo.png";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAppAuth } from "@/lib/auth";
import { bootstrapCloudData, clearCloudSession, loadCachedCloudSnapshot } from "@/lib/cloud-sync";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Manda Remito — Generador de remitos y recibos" },
      {
        name: "description",
        content:
          "Manda Remito: genera remitos y recibos profesionales en segundos. Estética neon, PDF al instante e historial integrado.",
      },
      { name: "author", content: "Leonardo Roque Gómez" },
      { property: "og:title", content: "Manda Remito — Generador de remitos y recibos" },
      {
        property: "og:description",
        content: "Generador profesional de remitos y recibos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@MandaFactura" },
      { name: "twitter:title", content: "Manda Remito — Generador de remitos y recibos" },
      { name: "description", content: "Manda Remito Pro is a professional web application for generating remitos and receipts." },
      { property: "og:description", content: "Manda Remito Pro is a professional web application for generating remitos and receipts." },
      { name: "twitter:description", content: "Manda Remito Pro is a professional web application for generating remitos and receipts." },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        href: logo,
        type: "image/png",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HeadContent />
      {children}
      <Scripts />
    </>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CloudDataBootstrap>
          <SidebarProvider>
            <div className="flex min-h-screen w-full">
              <AppSidebar />
              <div className="flex min-w-0 flex-1 flex-col">
                <AppHeader />
                <main className="min-w-0 flex-1">
                  <Outlet />
                </main>
              </div>
            </div>
            <Toaster theme="dark" position="top-right" richColors />
          </SidebarProvider>
        </CloudDataBootstrap>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function CloudDataBootstrap({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user, getIdToken } = useAppAuth();
  const [readyFor, setReadyFor] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      clearCloudSession();
      setReadyFor("");
      setError("");
      return;
    }
    const email = user?.email?.trim().toLowerCase();
    if (!email) {
      setError("La sesión no contiene un correo de usuario para sincronizar los datos.");
      return;
    }

    let cancelled = false;
    setError("");
    void (async () => {
      const hasCache = await loadCachedCloudSnapshot(email);
      if (cancelled) return;
      if (hasCache) setReadyFor(email);

      try {
        await bootstrapCloudData(email, getIdToken);
        if (!cancelled) setReadyFor(email);
      } catch (reason) {
        console.error("No se pudieron cargar los datos de Turso", reason);
        if (!cancelled) setError(reason instanceof Error ? reason.message : "No se pudieron cargar tus datos.");
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, isLoading, user?.email, getIdToken, attempt]);

  const email = user?.email?.trim().toLowerCase() ?? "";
  const ready = !isLoading && (!isAuthenticated ? readyFor === "" : Boolean(email) && readyFor === email);

  if (ready) return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="glass w-full max-w-md rounded-2xl p-6 text-center">
        <p className="text-lg font-semibold">{error ? "No se pudieron sincronizar tus datos" : "Cargando tus datos"}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {error || "Conectando con la base de datos para cargar tus datos."}
        </p>
        {error && (
          <button type="button" className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" onClick={() => setAttempt((value) => value + 1)}>
            Reintentar
          </button>
        )}
      </div>
    </div>
  );
}

function AppHeader() {
  const { state } = useSidebar();
  const { isAuthenticated, user } = useAppAuth();

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border/60 bg-background/60 px-4 backdrop-blur">
      <SidebarTrigger />
      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Manda Remito</div>
      {state === "collapsed" && isAuthenticated && user?.email && (
        <div className="ml-auto flex min-w-0 items-center gap-2 rounded-full border border-(--neon-cyan)/20 bg-background/70 px-3 py-1.5 text-xs">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
          <span className="shrink-0 text-muted-foreground">Sesión activa</span>
          <span className="max-w-[35vw] truncate font-medium text-foreground sm:max-w-64" title={user.email}>
            {user.email}
          </span>
        </div>
      )}
    </header>
  );
}

import { createContext, useContext } from "react";
import { KindeProvider, useKindeAuth } from "@kinde-oss/kinde-auth-react";
import { AUTH_CONFIG } from "@/lib/env";

type AuthContextValue = {
  configured: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  user: { givenName?: string; familyName?: string; email?: string } | null;
  login: () => void | Promise<void>;
  logout: () => void | Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  configured: false,
  isAuthenticated: false,
  isLoading: false,
  user: null,
  login: () => {
    window.alert("La autenticación todavía no está configurada. Agregá DOMAIN_USER y AUTH_USER.");
  },
  logout: () => undefined,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (!AUTH_CONFIG.domain || !AUTH_CONFIG.clientId) {
    return <AuthContext.Provider value={{
      configured: false,
      isAuthenticated: false,
      isLoading: false,
      user: null,
      login: () => window.alert("La autenticación todavía no está configurada. Agregá DOMAIN_USER y AUTH_USER."),
      logout: () => undefined,
    }}>{children}</AuthContext.Provider>;
  }

  const appOrigin = typeof window === "undefined" ? "" : window.location.origin;
  const configuredDomain = AUTH_CONFIG.domain.replace(/\/+$/, "");
  const domain = /^https?:\/\//i.test(configuredDomain)
    ? configuredDomain
    : `https://${configuredDomain}`;

  return (
    <KindeProvider
      clientId={AUTH_CONFIG.clientId}
      domain={domain}
      redirectUri={appOrigin}
      logoutUri={appOrigin}
    >
      <KindeSession>{children}</KindeSession>
    </KindeProvider>
  );
}

function KindeSession({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user, login, logout } = useKindeAuth();

  return (
    <AuthContext.Provider
      value={{
        configured: true,
        isAuthenticated,
        isLoading,
        user: user ?? null,
        login: async () => {
          try {
            await login(AUTH_CONFIG.orgCode ? { orgCode: AUTH_CONFIG.orgCode } : {});
          } catch (error) {
            console.error("No se pudo iniciar sesión con Kinde", error);
            const detail = error instanceof Error ? `\n\nDetalle: ${error.message}` : "";
            window.alert(
              `Kinde no pudo iniciar sesión. Verificá DOMAIN_USER, AUTH_USER y las URLs autorizadas de callback en Kinde.${detail}`,
            );
          }
        },
        logout: () => logout(),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAppAuth() {
  return useContext(AuthContext);
}
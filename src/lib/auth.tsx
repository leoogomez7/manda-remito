import { createContext, useContext } from "react";
import { KindeProvider, useKindeAuth } from "@kinde-oss/kinde-auth-react";
import { AUTH_CONFIG } from "@/lib/env";

type AuthContextValue = {
  configured: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  user: { id?: string; givenName?: string; familyName?: string; email?: string } | null;
  getIdToken: () => Promise<string | undefined>;
  login: (email?: string) => void | Promise<void>;
  register: (email?: string) => void | Promise<void>;
  logout: () => void | Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  configured: false,
  isAuthenticated: false,
  isLoading: false,
  user: null,
  getIdToken: async () => undefined,
  login: () => {
    window.alert("La autenticación todavía no está configurada. Agregá DOMAIN_USER y AUTH_USER.");
  },
  register: () => {
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
      getIdToken: async () => undefined,
      login: () => window.alert("La autenticación todavía no está configurada. Agregá DOMAIN_USER y AUTH_USER."),
      register: () => window.alert("La autenticación todavía no está configurada. Agregá DOMAIN_USER y AUTH_USER."),
      logout: () => undefined,
    }}>{children}</AuthContext.Provider>;
  }

  // Kinde React normalizes the root redirect URI by removing its trailing slash.
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
  const { isAuthenticated, isLoading, user, login, register, logout, getIdToken } = useKindeAuth();

  const startAuth = async (
    action: typeof login | typeof register,
    email?: string,
    useCustomEmailConnection = true,
  ) => {
    try {
      const options = {
        ...(AUTH_CONFIG.orgCode ? { orgCode: AUTH_CONFIG.orgCode } : {}),
        ...(useCustomEmailConnection && AUTH_CONFIG.emailConnectionId
          ? { connectionId: AUTH_CONFIG.emailConnectionId }
          : {}),
        ...(email?.trim() ? { loginHint: email.trim() } : {}),
      };
      await action(options);
    } catch (error) {
      console.error("No se pudo iniciar el flujo de autenticación de Kinde", error);
      const detail = error instanceof Error ? `\n\nDetalle: ${error.message}` : "";
      window.alert(
        `Kinde no pudo iniciar la autenticación. Verificá DOMAIN_USER, AUTH_USER, el registro habilitado y las URLs autorizadas.${detail}`,
      );
    }
  };

  return (
    <AuthContext.Provider
      value={{
        configured: true,
        isAuthenticated,
        isLoading,
        user: user ?? null,
        getIdToken,
        login: (email) => startAuth(login, email),
        register: () => {
          if (!AUTH_CONFIG.orgCode) {
            window.alert(
              "No se puede crear la cuenta en una organización específica: CODE_ORG no está configurado en este deployment. Configuralo en Vercel y volvé a desplegar.",
            );
            return;
          }

          return startAuth(register, undefined, false);
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
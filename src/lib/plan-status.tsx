import * as React from "react";
import { useAppAuth } from "@/lib/auth";

export type PlanSubscription = { planId: string; startsAt: string; expiresAt: string };
type PlanStatusContextValue = {
  subscription: PlanSubscription | null;
  setSubscription: (subscription: PlanSubscription | null) => void;
};

const PlanStatusContext = React.createContext<PlanStatusContextValue>({
  subscription: null,
  setSubscription: () => undefined,
});

export function usePlanStatus() {
  return React.useContext(PlanStatusContext);
}

export function PlanStatusProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, getIdToken, user } = useAppAuth();
  const [subscription, setSubscription] = React.useState<PlanSubscription | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (isLoading) return;
    if (!isAuthenticated) {
      setSubscription(null);
      return;
    }

    void (async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        const response = await fetch("/api/account-plan", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const result = await response.json().catch(() => ({})) as { subscription?: PlanSubscription | null };
        if (!response.ok) throw new Error("No se pudo consultar el plan activo.");
        if (!cancelled) setSubscription(result.subscription ?? null);
      } catch (error) {
        console.error("No se pudo consultar el plan para la navegación", error);
        if (!cancelled) setSubscription(null);
      }
    })();

    return () => { cancelled = true; };
  }, [isAuthenticated, isLoading, getIdToken, user?.email]);

  return (
    <PlanStatusContext.Provider value={{ subscription, setSubscription }}>
      {children}
    </PlanStatusContext.Provider>
  );
}
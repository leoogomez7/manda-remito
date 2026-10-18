import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BadgeCheck, CalendarClock, Crown, Gem, Medal, Shield, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAppAuth } from "@/lib/auth";
import { PAYMENT_PLANS, formatPlanPrice, type PaymentPlanId } from "@/lib/plans";
import { PAGE_CONTAINER_CLASS } from "@/lib/utils";

type Subscription = { planId: string; startsAt: string; expiresAt: string };

export const Route = createFileRoute("/planes")({
  validateSearch: (search: Record<string, unknown>) => ({
    payment: search.payment === "success" || search.payment === "pending" || search.payment === "failure" ? search.payment : undefined,
    payment_id: typeof search.payment_id === "string" || typeof search.payment_id === "number" ? String(search.payment_id) : undefined,
  }),
  component: PlanesPage,
  head: () => ({ meta: [{ title: "Planes de pago" }, { name: "description", content: "Planes de Manda Remito." }] }),
});

function PlanesPage() {
  const navigate = useNavigate();
  const { payment, payment_id: paymentId } = Route.useSearch();
  const { getIdToken } = useAppAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [buyingPlan, setBuyingPlan] = useState<PaymentPlanId | null>(null);
  const [verifying, setVerifying] = useState(false);

  const loadSubscription = async () => {
    const token = await getIdToken();
    if (!token) throw new Error("Inicia sesión para consultar tus planes.");
    const response = await fetch("/api/account-plan", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({})) as { subscription?: Subscription | null; error?: string };
    if (!response.ok) throw new Error(result.error || "No se pudo consultar tu plan.");
    setSubscription(result.subscription ?? null);
  };

  useEffect(() => {
    void loadSubscription().catch((error) => toast.error(error instanceof Error ? error.message : "No se pudo consultar el plan.")).finally(() => setLoading(false));
  }, [getIdToken]);

  useEffect(() => {
    if (!payment || !paymentId) return;
    let cancelled = false;
    const handleReturn = async () => {
      if (payment !== "success") {
        toast.error(payment === "failure" ? "El pago no se aprobó. Puedes volver a elegir un plan." : "El pago está pendiente de aprobación.");
        await navigate({ to: "/planes", replace: true });
        return;
      }
      setVerifying(true);
      try {
        const token = await getIdToken();
        if (!token) throw new Error("Inicia sesión para confirmar la activación del plan.");
        const response = await fetch("/api/verify-plan-payment", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ paymentId }),
          cache: "no-store",
        });
        const result = await response.json().catch(() => ({})) as { approved?: boolean; subscription?: Subscription; error?: string };
        if (!response.ok || !result.approved) throw new Error(result.error || "No se pudo confirmar el pago.");
        if (!cancelled) {
          setSubscription(result.subscription ?? null);
          toast.success("Pago aprobado. Tu plan ya está activo.");
        }
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "No se pudo confirmar el pago del plan.");
      } finally {
        if (!cancelled) {
          setVerifying(false);
          await navigate({ to: "/planes", replace: true });
        }
      }
    };
    void handleReturn();
    return () => { cancelled = true; };
  }, [payment, paymentId, getIdToken, navigate]);

  const buyPlan = async (planId: PaymentPlanId) => {
    setBuyingPlan(planId);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Inicia sesión para comprar un plan.");
      const response = await fetch("/api/create-plan-preference", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({})) as { paymentUrl?: string; error?: string };
      if (!response.ok || !result.paymentUrl) throw new Error(result.error || "No se pudo iniciar el pago del plan.");
      window.location.assign(result.paymentUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo iniciar el pago.");
      setBuyingPlan(null);
    }
  };

  const currentPlan = PAYMENT_PLANS.find((plan) => plan.id === subscription?.planId);
  const planIsActive = Boolean(subscription && Date.parse(subscription.expiresAt) > Date.now());
  const planIcons = [Medal, Gem, Crown, Sparkles] as const;

  return (
    <div className={PAGE_CONTAINER_CLASS}>
      <div className="mb-7">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Membresía</p>
        <h1 className="mt-1 text-3xl font-bold"><span className="text-gradient">Planes de pago</span></h1>
        <p className="mt-2 text-sm text-muted-foreground">Los planes son de pago único, sin renovación automática. Incluyen generación ilimitada de remitos durante su vigencia.</p>
      </div>

      {verifying && <div className="mb-5 rounded-xl border border-(--neon-cyan)/30 bg-card/50 p-4 text-sm">Verificando el pago y activando el plan…</div>}
      {!loading && planIsActive && subscription && (
        <div className="mb-6 flex flex-col gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <BadgeCheck className="h-5 w-5 text-emerald-400" />
            <div>
              <p className="font-semibold">Plan {currentPlan?.name ?? subscription.planId} activo</p>
              <p className="text-sm text-muted-foreground">Vence el {new Date(subscription.expiresAt).toLocaleDateString("es-AR")}</p>
            </div>
          </div>
          <p className="text-xs text-emerald-300">No se cobrará el cargo de $ 2.000 ARS por remito mientras esté vigente.</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PAYMENT_PLANS.map((plan, index) => {
          const isCurrent = planIsActive && subscription?.planId === plan.id;
          return (
            <article key={plan.id} className="glass flex flex-col rounded-2xl border border-border/60 p-5">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-(--neon-cyan)/10 text-(--neon-cyan)">
                  {(() => {
                    const PlanIcon = planIcons[index] ?? Shield;
                    return <PlanIcon className="h-5 w-5" />;
                  })()}
                </div>
                {isCurrent && <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">Actual</span>}
              </div>
              <h2 className="mt-4 text-xl font-bold">{plan.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{plan.durationMonths} {plan.durationMonths === 1 ? "mes" : "meses"}</p>
              <p className="mt-4 text-2xl font-bold tabular-nums">{formatPlanPrice(plan.price)}</p>
              <ul className="mt-5 flex-1 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-emerald-400" /> Remitos ilimitados</li>
                <li className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-(--neon-cyan)" /> Vigencia exacta de {plan.durationMonths} {plan.durationMonths === 1 ? "mes" : "meses"}</li>
                <li>Sin renovación automática</li>
              </ul>
              <Button className="mt-6 w-full" disabled={loading || verifying || buyingPlan !== null} onClick={() => void buyPlan(plan.id)}>
                {buyingPlan === plan.id ? "Preparando pago…" : isCurrent ? "Comprar nuevamente" : "Elegir plan"}
              </Button>
            </article>
          );
        })}
      </div>
      <p className="mt-5 text-xs text-muted-foreground">Sin un plan activo, puedes seguir generando remitos pagando $ 2.000 ARS por cada uno.</p>
    </div>
  );
}

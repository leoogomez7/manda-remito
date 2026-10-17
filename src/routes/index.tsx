import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Clock3, Files, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PAGE_CONTAINER_CLASS, cn } from "@/lib/utils";
import {
  formatMoney,
  getInvoices,
  PAYMENT_LABEL,
  type Invoice,
} from "@/lib/invoices";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Manda Remito" },
      { name: "description", content: "Resumen de remitos, ingresos y métodos de pago." },
    ],
  }),
});

function Dashboard() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    setInvoices(getInvoices());
  }, []);

  const monthOptions = useMemo(() => {
    const months = Array.from(
      new Set(
        invoices
          .map((i) => {
            const d = new Date(i.createdAt);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          })
          .filter(Boolean),
      ),
    ).sort();
    return months;
  }, [invoices]);

  const [selectedMonth, setSelectedMonth] = useState<string>("");

  useEffect(() => {
    if (!selectedMonth && monthOptions.length) {
      setSelectedMonth(monthOptions[0]);
    }
  }, [monthOptions, selectedMonth]);

  const stats = useMemo(() => {
    const rootInvoices = invoices.filter((invoice) => !invoice.settlesInvoiceId);
    const arsInvoices = rootInvoices.filter((i) => i.currency === "ARS");
    const usdInvoices = rootInvoices.filter((i) => i.currency === "USD");
    const pendingARS = arsInvoices.reduce((acc, invoice) => acc + invoice.balance, 0);
    const pendingUSD = usdInvoices.reduce((acc, invoice) => acc + invoice.balance, 0);
    const lastInvoice = rootInvoices
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

    return {
      totalARS: arsInvoices.reduce((sum, invoice) => sum + invoice.total, 0),
      totalUSD: usdInvoices.reduce((sum, invoice) => sum + invoice.total, 0),
      pendingARS,
      pendingUSD,
      countARS: arsInvoices.length,
      countUSD: usdInvoices.length,
      invoiceCount: invoices.length,
      count: invoices.length,
      last: lastInvoice,
    };
  }, [invoices]);

  const monthly = useMemo(() => {
    if (!selectedMonth) {
      return {
        totalARS: 0,
        totalUSD: 0,
        countARS: 0,
        countUSD: 0,
      };
    }

    const selectedInvoices = invoices.filter((i) => {
      const d = new Date(i.createdAt);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` === selectedMonth;
    });

    return {
      totalARS: selectedInvoices
        .filter((i) => !i.settlesInvoiceId)
        .filter((i) => i.currency === "ARS")
        .reduce((sum, invoice) => sum + invoice.total, 0),
      totalUSD: selectedInvoices
        .filter((i) => !i.settlesInvoiceId)
        .filter((i) => i.currency === "USD")
        .reduce((sum, invoice) => sum + invoice.total, 0),
      countARS: selectedInvoices.filter((i) => i.currency === "ARS").length,
      countUSD: selectedInvoices.filter((i) => i.currency === "USD").length,
    };
  }, [invoices, selectedMonth]);

  const byMethod = useMemo(() => {
    const map = new Map<string, number>();
    invoices.forEach((i) =>
      map.set(PAYMENT_LABEL[i.paymentMethod], (map.get(PAYMENT_LABEL[i.paymentMethod]) || 0) + 1),
    );
    const arr = Array.from(map.entries()).map(([name, value]) => ({ name, value }));
    return arr.length ? arr : [{ name: "Sin datos", value: 0 }];
  }, [invoices]);

  const PIE_COLORS = ["#00E5FF", "#FF00D4", "#7C3AED", "#22D3EE"];

  return (
    <div className={cn(PAGE_CONTAINER_CLASS, "pl-8 pb-8 sm:pb-10")}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Panel
          </p>
          <h1 className="mt-1 text-3xl font-bold">
            <span className="text-gradient">Menú Principal</span>{" "}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Generá remitos profesionales, todo se guarda en tu cuenta.
          </p>
        </div>
        <Button asChild size="lg" className="group">
          <Link to="/nueva">
            Nuevo remito
            <ArrowUpRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </Button>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="Total remitido (ARS)"
          value={formatMoney(stats.totalARS, "ARS")}
          accent="cyan"
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="Total remitido (USD)"
          value={formatMoney(stats.totalUSD, "USD")}
          accent="fuchsia"
        />
        <StatCard
          icon={<Clock3 className="h-4 w-4" />}
          label="Cobro pendiente (ARS)"
          value={formatMoney(stats.pendingARS, "ARS")}
          accent="cyan"
        />
        <StatCard
          icon={<Clock3 className="h-4 w-4" />}
          label="Cobro pendiente (USD)"
          value={formatMoney(stats.pendingUSD, "USD")}
          accent="fuchsia"
        />
        <StatCard
          icon={<Files className="h-4 w-4" />}
          label="Remitos totales"
          value={`${stats.invoiceCount}`}
          accent="cyan"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass border-gradient rounded-2xl p-5 lg:col-span-2"
        >
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Seleccionar mes
              </h3>
              <p className="text-xs text-muted-foreground">
                Ver total remitido y cantidad de remitos por moneda.
              </p>
            </div>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="rounded-2xl border border-border/60 bg-background/80 px-4 py-2 text-sm text-foreground outline-none transition-colors focus:border-(--neon-cyan)/80"
            >
              {monthOptions.length === 0 ? (
                <option value="">Sin meses</option>
              ) : (
                monthOptions.map((month) => {
                  const [year, monthNumber] = month.split("-");
                  return (
                    <option key={month} value={month}>
                      {`${monthNumber}/${year}`}
                    </option>
                  );
                })
              )}
            </select>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border/60 bg-background/70 p-5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Remitido (ARS)
              </p>
              <p className="mt-3 text-2xl font-bold tabular-nums">
                {formatMoney(monthly.totalARS, "ARS")}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {monthly.countARS} remito{monthly.countARS === 1 ? "" : "s"}
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/70 p-5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Remitido (USD)
              </p>
              <p className="mt-3 text-2xl font-bold tabular-nums">
                {formatMoney(monthly.totalUSD, "USD")}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {monthly.countUSD} remito{monthly.countUSD === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-border/60 bg-background/70 p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Cantidad total de remitos
            </p>
            <p className="mt-3 text-2xl font-bold tabular-nums">
              {monthly.countARS + monthly.countUSD} remitos
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass border-gradient rounded-2xl p-5"
        >
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Métodos de pago
          </h3>
          <div className="space-y-3 text-sm">
            {byMethod.map((method) => (
              <div
                key={method.name}
                className="rounded-2xl border border-border/60 bg-background/80 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-foreground">{method.name}</p>
                  <span className="text-xs text-muted-foreground">{method.value} remito{method.value === 1 ? "" : "s"}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {stats.last && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="mt-6 glass rounded-2xl p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Último cliente
              </p>
              <p className="mt-1 text-lg font-semibold">
                {stats.last.number} · {stats.last.client.name || "Sin cliente"}
              </p>
              <p className="text-sm text-muted-foreground">
                {new Date(stats.last.createdAt).toLocaleDateString("es-AR")} ·{" "}
                {PAYMENT_LABEL[stats.last.paymentMethod]}
              </p>
            </div>
            <p className="text-2xl font-bold text-gradient">
              {formatMoney(stats.last.total, stats.last.currency)}
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: "cyan" | "fuchsia";
}) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 280, damping: 20 }}
      className="glass border-gradient relative overflow-hidden rounded-2xl p-5"
    >
      <div
        className="absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-30 blur-2xl"
        style={{
          background: accent === "cyan" ? "#00E5FF" : "#FF00D4",
        }}
      />
      <div className="flex items-center gap-2 text-muted-foreground">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-md border ${
            accent === "cyan"
              ? "border-(--neon-cyan)/40 text-(--neon-cyan)"
              : "border-(--neon-fuchsia)/40 text-(--neon-fuchsia)"
          }`}
        >
          {icon}
        </span>
        <span className="text-xs uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
    </motion.div>
  );
}

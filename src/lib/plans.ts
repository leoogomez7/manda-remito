export const PAYMENT_PLANS = [
  { id: "bronze", name: "Bronce", price: 9999, durationMonths: 1 },
  { id: "silver", name: "Plata", price: 19999, durationMonths: 3 },
  { id: "gold", name: "Oro", price: 32999, durationMonths: 6 },
  { id: "platinum", name: "Platino", price: 52999, durationMonths: 12 },
] as const;

export type PaymentPlanId = (typeof PAYMENT_PLANS)[number]["id"];

export function formatPlanPrice(price: number) {
  return `$ ${price.toLocaleString("es-AR")} ARS`;
}

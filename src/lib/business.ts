import { queueCloudChange } from "@/lib/cloud-sync";

export interface BusinessProfile {
  name: string;
  location: string;
  email: string;
  phone: string;
  logoDataUrl?: string;
}

export const BUSINESS = {
  brand: "Manda Remito",
};

export const SAMPLE_BUSINESS_PROFILE: BusinessProfile = {
  name: "Empresa de ejemplo",
  location: "Buenos Aires, Argentina",
  email: "contacto@ejemplo.com",
  phone: "+54 11 5555-0101",
};

const PROFILE_KEY_PREFIX = "mf:business-profile:";

function profileStorageKey(userEmail?: string) {
  const account = userEmail?.trim().toLowerCase() || "anonymous";
  return `${PROFILE_KEY_PREFIX}${encodeURIComponent(account)}`;
}

export function getBusinessProfile(userEmail?: string): BusinessProfile {
  if (typeof window === "undefined") {
    return { name: "", location: "", email: userEmail ?? "", phone: "" };
  }

  try {
    const saved = localStorage.getItem(profileStorageKey(userEmail));
    if (saved) {
      const profile = JSON.parse(saved) as Partial<BusinessProfile>;
      return {
        name: profile.name ?? "",
        location: profile.location ?? "",
        email: userEmail?.trim() || profile.email || "",
        phone: profile.phone ?? "",
        logoDataUrl: profile.logoDataUrl,
      };
    }
  } catch (error) {
    console.warn("No se pudieron leer los datos del negocio", error);
  }

  return { name: "", location: "", email: userEmail ?? "", phone: "" };
}

export function saveBusinessProfile(profile: BusinessProfile, userEmail?: string) {
  if (typeof window === "undefined") return;
  const normalizedEmail = userEmail?.trim().toLowerCase();
  const value = { ...profile, ...(normalizedEmail ? { email: normalizedEmail } : {}) };
  localStorage.setItem(profileStorageKey(userEmail), JSON.stringify(value));
  void queueCloudChange({ collection: "business_profiles", value });
}
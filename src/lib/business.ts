import { getCloudProfile, queueCloudChange } from "@/lib/cloud-sync";

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

export function getBusinessProfile(userEmail?: string): BusinessProfile {
  const profile = getCloudProfile() as Partial<BusinessProfile> | null;
  if (profile) return {
    name: profile.name ?? "",
    location: profile.location ?? "",
    email: userEmail?.trim() || profile.email || "",
    phone: profile.phone ?? "",
    logoDataUrl: profile.logoDataUrl,
  };
  return { name: "", location: "", email: userEmail ?? "", phone: "" };
}

export function saveBusinessProfile(profile: BusinessProfile, userEmail?: string) {
  const normalizedEmail = userEmail?.trim().toLowerCase();
  const value = { ...profile, ...(normalizedEmail ? { email: normalizedEmail } : {}) };
  void queueCloudChange({ collection: "business_profiles", value });
}
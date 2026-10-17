import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBusinessProfile, saveBusinessProfile, type BusinessProfile } from "@/lib/business";
import { useAppAuth } from "@/lib/auth";
import { PAGE_CONTAINER_CLASS } from "@/lib/utils";

export const Route = createFileRoute("/mis-datos")({
  component: MisDatosPage,
  head: () => ({
    meta: [
      { title: "Mis datos" },
      { name: "description", content: "Configura los datos de tu empresa para tus remitos." },
    ],
  }),
});

function MisDatosPage() {
  const { user } = useAppAuth();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<BusinessProfile>(() => getBusinessProfile());

  useEffect(() => {
    setProfile(getBusinessProfile(user?.email));
  }, [user?.email]);

  const update = (field: keyof BusinessProfile, value: string) => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const handleLogoUpload = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Seleccioná un archivo de imagen.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("La imagen debe pesar menos de 10 MB.");
      return;
    }

    try {
      const bitmap = await createImageBitmap(file);
      const maxDimension = 800;
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No se pudo procesar la imagen.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      setProfile((current) => ({ ...current, logoDataUrl: canvas.toDataURL("image/png") }));
    } catch (error) {
      console.error("No se pudo procesar el logo", error);
      toast.error("No se pudo abrir esa imagen. Probá con otro formato.");
    }
  };

  const handleSave = () => {
    saveBusinessProfile(profile, user?.email);
    toast.success("Mis datos se guardaron correctamente");
  };

  return (
    <div className={PAGE_CONTAINER_CLASS}>
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Cuenta</p>
        <h1 className="mt-1 text-3xl font-bold"><span className="text-gradient">Mis datos</span></h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Estos datos y el logo aparecerán en el encabezado de tus remitos y PDFs.
        </p>
        {user?.email && <p className="mt-1 text-xs text-muted-foreground">Perfil asociado a {user.email}</p>}
      </div>

      <section className="glass border-gradient space-y-5 rounded-2xl p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="business-name">Nombre empresa</Label>
            <Input
              id="business-name"
              value={profile.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="Nombre de tu empresa"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="business-location">Ubicación</Label>
            <Input
              id="business-location"
              value={profile.location}
              onChange={(event) => update("location", event.target.value)}
              placeholder="Ciudad, provincia, país"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="business-email">Correo</Label>
            <Input
              id="business-email"
              type="email"
              value={profile.email}
              readOnly
              aria-readonly="true"
              title="El correo corresponde a la cuenta con la que iniciaste sesión y no se puede modificar."
              placeholder="contacto@empresa.com"
              className="cursor-not-allowed opacity-60"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="business-phone">Número móvil</Label>
            <Input
              id="business-phone"
              type="tel"
              value={profile.phone}
              onChange={(event) => update("phone", event.target.value)}
              placeholder="+54 9 11 1234-5678"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Logo para tus remitos</Label>
          <div className="flex flex-col gap-4 rounded-xl border border-border/60 bg-background/40 p-4 sm:flex-row sm:items-center">
            {profile.logoDataUrl ? (
              <div className="flex h-24 w-36 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/60 p-2">
                <img src={profile.logoDataUrl} alt="Vista previa del logo de la empresa" className="max-h-full max-w-full object-contain" />
              </div>
            ) : (
              <div className="flex h-24 w-36 shrink-0 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 text-xs text-muted-foreground">
                <ImagePlus className="h-5 w-5" />
                Sin logo
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  void handleLogoUpload(event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
              <Button type="button" variant="secondary" onClick={() => logoInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" /> Importar desde la PC
              </Button>
              {profile.logoDataUrl && (
                <Button type="button" variant="ghost" onClick={() => setProfile((current) => ({ ...current, logoDataUrl: undefined }))}>
                  <Trash2 className="mr-2 h-4 w-4" /> Quitar logo
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Opcional. Se optimiza al cargar y se usa en el encabezado del PDF.</p>
        </div>

        <div className="flex justify-end border-t border-border/50 pt-4">
          <Button type="button" onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" /> Guardar mis datos
          </Button>
        </div>
      </section>
    </div>
  );
}

"use client";

// Input de archivo que reduce las fotos en el celular antes de enviarlas (máx. 1600 px, JPEG),
// para que quepan en el límite de envío del servidor. Los PDF pasan tal cual.
export async function comprimir(archivo: File, maxLado = 1600, calidad = 0.8): Promise<File> {
  if (!archivo.type.startsWith("image/") || archivo.size < 400 * 1024) return archivo;
  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", calidad));
    if (!blob || blob.size >= archivo.size) return archivo;
    return new File([blob], archivo.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return archivo; // formato que el navegador no sabe leer (p. ej. HEIC fuera de Safari)
  }
}

export function InputComprimido({
  name,
  accept,
  multiple,
  required,
  className,
  onElegir,
}: {
  name: string;
  accept: string;
  multiple?: boolean;
  required?: boolean;
  className?: string;
  onElegir?: (nombres: string) => void;
}) {
  return (
    <input
      type="file"
      name={name}
      accept={accept}
      multiple={multiple}
      required={required}
      className={className}
      onChange={async (e) => {
        const input = e.currentTarget;
        const lista = Array.from(input.files ?? []);
        const dt = new DataTransfer();
        for (const f of await Promise.all(lista.map((f) => comprimir(f)))) dt.items.add(f);
        input.files = dt.files;
        onElegir?.(lista.map((f) => f.name).join(", "));
      }}
    />
  );
}

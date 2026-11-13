"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { enviarAlta } from "@/app/alta/actions";
import { comprimir } from "@/components/InputComprimido";
import { Icono } from "./Iconos";
import { Aviso, CAMPO, ETIQUETA, Pantalla } from "./Piezas";

type Vivienda = { id: string; numero: string };

function Paso({ n }: { n: number }) {
  return <span className="w-fit rounded-full bg-[#D5E6CF] px-4 py-1 text-lg font-semibold text-[#1E4D2B]">Paso {n} de 2</span>;
}

function FotoINE({ etiqueta, archivo, onArchivo }: { etiqueta: string; archivo: File | null; onArchivo: (f: File | null) => void }) {
  const [vista, setVista] = useState<string | null>(null);
  return (
    <label className="flex min-h-20 cursor-pointer items-center gap-5 rounded-2xl border border-[#BDB8AC] bg-[#FBF9F4] px-5">
      {vista ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={vista} alt="" className="h-12 w-16 rounded-md object-cover" />
      ) : (
        <Icono nombre="camara" className="size-9 shrink-0" grueso={1.5} />
      )}
      <span className="flex-1 text-lg">
        {etiqueta}
        {archivo && <span className="block text-sm text-[#17583A]">✓ Lista · toca para cambiarla</span>}
      </span>
      <Icono nombre="adelante" className="size-6" />
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = await comprimir(f, 1400, 0.8);
          onArchivo(r);
          setVista(URL.createObjectURL(r));
        }}
      />
    </label>
  );
}

// Cámara frontal con guía ovalada. Si el navegador no da acceso, usa la cámara del sistema.
function Selfie({ onFoto }: { onFoto: (f: File) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  // Este componente solo se monta en el navegador (paso 2), así que se puede leer navigator al iniciar.
  const [error, setError] = useState(() => !navigator.mediaDevices?.getUserMedia);
  const [lista, setLista] = useState<string | null>(null);
  useEffect(() => {
    let flujo: MediaStream | null = null;
    if (!navigator.mediaDevices?.getUserMedia) return;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: { ideal: 960 } }, audio: false })
      .then((s) => {
        flujo = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => setError(true));
    return () => flujo?.getTracks().forEach((t) => t.stop());
  }, []);

  const tomar = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    const lado = Math.min(v.videoWidth, v.videoHeight);
    c.width = c.height = Math.min(lado, 900);
    c.getContext("2d")!.drawImage(v, (v.videoWidth - lado) / 2, (v.videoHeight - lado) / 2, lado, lado, 0, 0, c.width, c.height);
    c.toBlob((b) => {
      if (!b) return;
      const f = new File([b], "selfie.jpg", { type: "image/jpeg" });
      setLista(URL.createObjectURL(f));
      onFoto(f);
    }, "image/jpeg", 0.85);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-[4/4.2] w-full overflow-hidden rounded-2xl bg-[#D9D4C8]">
        {lista ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={lista} alt="Tu selfie" className="h-full w-full -scale-x-100 object-cover" />
        ) : !error ? (
          <video ref={video} autoPlay playsInline muted className="h-full w-full -scale-x-100 object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-lg text-[#5A5547]">No pudimos abrir la cámara aquí. Usa el botón para tomar la selfie con tu cámara.</div>
        )}
        <div aria-hidden="true" className="pointer-events-none absolute inset-[8%_17%] rounded-[50%] border-[3px] border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,0.12)]" />
      </div>
      <p className="text-center text-xl">{lista ? "¿Se ve bien tu cara?" : "Mira de frente a la cámara"}</p>
      {lista ? (
        <button type="button" onClick={() => setLista(null)} className="min-h-14 rounded-2xl border border-[#BDB8AC] bg-[#FBF9F4] text-lg font-medium">
          Tomar otra
        </button>
      ) : error ? (
        <label className="flex min-h-16 cursor-pointer items-center justify-center gap-3 rounded-2xl bg-[#17583A] text-xl font-semibold text-white">
          <Icono nombre="camara" className="size-7" />
          Tomar selfie
          <input
            type="file"
            accept="image/*"
            capture="user"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const r = await comprimir(f, 900, 0.85);
              setLista(URL.createObjectURL(r));
              onFoto(r);
            }}
          />
        </label>
      ) : (
        <button type="button" onClick={tomar} className="flex min-h-16 items-center justify-center gap-3 rounded-2xl bg-[#17583A] text-xl font-semibold text-white">
          <Icono nombre="camara" className="size-7" />
          Tomar selfie
        </button>
      )}
    </div>
  );
}

export function FormAlta({ token, condominio, administradora, viviendas }: { token: string; condominio: string; administradora: string; viviendas: Vivienda[] }) {
  const [paso, setPaso] = useState(1);
  const [tipo, setTipo] = useState<"propietario" | "inquilino">("propietario");
  const [frente, setFrente] = useState<File | null>(null);
  const [reverso, setReverso] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [manual, setManual] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const datos = useRef<HTMLFormElement>(null);
  const [estado, accion, pendiente] = useActionState(enviarAlta, null);

  if (estado?.ok) {
    return (
      <Pantalla>
        <h1 className="font-display text-[34px] leading-tight font-bold">¡Listo!</h1>
        <p className="text-lg">
          {administradora} revisará tu identificación y te mandará por WhatsApp tu link personal de {condominio}. Tus fotos se borran en cuanto se revisan.
        </p>
      </Pantalla>
    );
  }

  const enviar = (f: FormData) => {
    if (frente) f.set("ine_frente", frente);
    if (reverso) f.set("ine_reverso", reverso);
    if (selfie && !manual) f.set("selfie", selfie);
    f.set("tipo", tipo);
    f.set("revision_manual", manual ? "1" : "0");
    return accion(f);
  };

  return (
    <Pantalla>
      <header className="flex flex-col gap-3">
        {paso === 2 && (
          <button type="button" onClick={() => setPaso(1)} aria-label="Regresar" className="-ml-2 flex size-11 items-center justify-center rounded-full hover:bg-black/5">
            <Icono nombre="atras" className="size-7" />
          </button>
        )}
        <h1 className="font-display text-[34px] leading-[1.05] font-bold tracking-tight">{paso === 1 ? "Alta de residente" : "Verificación facial"}</h1>
        <Paso n={paso} />
        {paso === 1 && <p className="text-lg text-[#5A5547]">{condominio}</p>}
      </header>

      <form ref={datos} action={enviar} className="flex flex-col gap-5">
        <input type="hidden" name="token" value={token} />
        <div className={paso === 1 ? "flex flex-col gap-5" : "hidden"}>
          <label className={`${ETIQUETA} text-xl`}>
            Vivienda
            <select name="vivienda_id" required className={CAMPO} defaultValue="">
              <option value="" disabled>
                Elige tu vivienda
              </option>
              {viviendas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.numero}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-xl font-semibold">Tipo de residente</legend>
            <div className="grid grid-cols-2 gap-3">
              {(["propietario", "inquilino"] as const).map((t) => (
                <button key={t} type="button" aria-pressed={tipo === t} onClick={() => setTipo(t)} className={`min-h-14 rounded-2xl border text-xl ${tipo === t ? "border-transparent bg-[#D5E6CF] font-semibold text-[#1E4D2B]" : "border-[#BDB8AC] bg-[#FBF9F4]"}`}>
                  {t === "propietario" ? "Propietario" : "Inquilino"}
                </button>
              ))}
            </div>
          </fieldset>
          <label className={ETIQUETA}>
            Nombre completo
            <input name="nombre" required minLength={3} maxLength={120} autoComplete="name" className={CAMPO} />
          </label>
          <label className={ETIQUETA}>
            Celular (WhatsApp)
            <input name="telefono" required inputMode="tel" autoComplete="tel" placeholder="442 123 4567" className={CAMPO} />
          </label>
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold">Verifica tu INE</h2>
            <FotoINE etiqueta="Frente de la INE" archivo={frente} onArchivo={setFrente} />
            <FotoINE etiqueta="Reverso de la INE" archivo={reverso} onArchivo={setReverso} />
          </section>
          {aviso && <Aviso tipo="error">{aviso}</Aviso>}
          <button
            type="button"
            onClick={() => {
              const f = datos.current!;
              if (!f.reportValidity()) return;
              if (!frente || !reverso) return setAviso("Toma la foto del frente y del reverso de tu INE.");
              setAviso(null);
              setPaso(2);
            }}
            className="min-h-16 rounded-2xl bg-[#17583A] text-xl font-semibold text-white"
          >
            Continuar
          </button>
        </div>

        {paso === 2 && (
          <div className="flex flex-col gap-4">
            {!manual ? <Selfie onFoto={setSelfie} /> : <Aviso>Una persona de la administración revisará tu INE sin selfie. Puede tardar un poco más.</Aviso>}
            <label className="flex items-start gap-3 rounded-xl border border-[#E1DCD0] bg-[#FBF9F4] p-4 text-base">
              <input type="checkbox" name="consentimiento" required className="mt-1 size-5 shrink-0 accent-[#17583A]" />
              <span>
                Autorizo a {administradora} a usar las fotos de mi INE{manual ? "" : " y mi selfie (dato biométrico)"} solo para verificar que vivo aquí. Se borran al terminar la revisión.
              </span>
            </label>
            {estado?.error && <Aviso tipo="error">{estado.error}</Aviso>}
            <button type="submit" disabled={pendiente || (!manual && !selfie)} className="min-h-16 rounded-2xl bg-[#17583A] text-xl font-semibold text-white disabled:opacity-50">
              {pendiente ? "Enviando…" : "Enviar"}
            </button>
            <button type="button" onClick={() => setManual(!manual)} className="min-h-14 rounded-2xl border border-[#BDB8AC] bg-[#FBF9F4] text-lg font-medium">
              {manual ? "Mejor tomar selfie" : "Solicitar revisión manual"}
            </button>
            <Link href="/privacidad" className="text-center text-lg text-[#17583A] underline underline-offset-4">
              Aviso de privacidad
            </Link>
          </div>
        )}
      </form>
    </Pantalla>
  );
}

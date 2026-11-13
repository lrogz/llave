// Íconos de línea para el portal de residentes y la caseta.
const TRAZOS = {
  inicio: "M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z",
  visitas: "M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z",
  cuenta: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  caseta: "M3 20V10l6-5 6 5v10zM7 20v-5h4v5M15 13h6l-1 2h-5",
  campana: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0",
  qr: "M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 8h3v3H8zM13 8h3v3h-3zM8 13h3v3H8zM13 14h3",
  alerta: "M12 4l9 16H3zM12 10v4M12 17h.01",
  paquete: "M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8",
  atras: "M15 5l-7 7 7 7",
  adelante: "M9 5l7 7-7 7",
  calendario: "M5 6h14v14H5zM5 10h14M9 4v4M15 4v4",
  boleto: "M4 8a2 2 0 0 0 0 4v4h16v-4a2 2 0 0 1 0-4V6H4zM10 6v12",
  banco: "M4 10h16L12 5zM6 10v7M10 10v7M14 10v7M18 10v7M4 20h16",
  llave: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a6 6 0 0 1-7.9 7.9l-6.3 6.3a2.1 2.1 0 0 1-3-3l6.3-6.3a6 6 0 0 1 7.9-7.9z",
  gota: "M12 4c3 4 6 7 6 10a6 6 0 0 1-12 0c0-3 3-6 6-10z",
  mas: "M12 5v14M5 12h14",
  check: "M9 12l2 2 4-4M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z",
  whatsapp: "M5 19l1.2-3.6A7.5 7.5 0 1 1 9 18.6zM9.5 9.5c0 3 2 5 5 5l1-1.2-1.6-.8-.8.8c-1-.4-1.8-1.2-2.2-2.2l.8-.8-.8-1.6z",
  recibo: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  chat: "M4 5h16v11H9l-5 4z",
  persona: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  salir: "M10 5H5v14h5M14 8l4 4-4 4M18 12H9",
  camara: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  lista: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  reloj: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  documento: "M7 3h7l5 5v13H7zM14 3v5h5",
} as const;

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({ nombre, className = "size-6", grueso = 1.8 }: { nombre: NombreIcono; className?: string; grueso?: number }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={grueso} strokeLinecap="round" strokeLinejoin="round">
      <path d={TRAZOS[nombre]} />
    </svg>
  );
}

// Datos del responsable para el aviso de privacidad y los términos.
// IMPORTANTE: llénalos con tus datos reales (o ponlos como variables en Vercel) antes de cobrar.
export const LEGAL = {
  marca: "Black Key",
  responsable: process.env.LEGAL_RESPONSABLE || "[Nombre o razón social del responsable]",
  domicilio: process.env.LEGAL_DOMICILIO || "[Domicilio completo], Querétaro, México",
  correo: process.env.LEGAL_CORREO || "[correo de privacidad]",
  actualizado: "10 de octubre de 2026",
};

export const legalPendiente = LEGAL.responsable.startsWith("[") || LEGAL.correo.startsWith("[");

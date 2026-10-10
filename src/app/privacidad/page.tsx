import type { Metadata } from "next";
import { Lista, PaginaLegal, Seccion } from "@/components/PaginaLegal";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: `Aviso de privacidad · ${LEGAL.marca}` };

export default function Privacidad() {
  const { marca, responsable, domicilio, correo } = LEGAL;
  return (
    <PaginaLegal titulo="Aviso de privacidad">
      <p>
        {responsable} (&quot;{marca}&quot;), con domicilio en {domicilio}, es responsable del tratamiento de los datos personales de quienes crean una cuenta en {marca}, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.
      </p>

      <Seccion titulo="1. Dos papeles distintos">
        <Lista
          items={[
            <>
              <strong>Usuarias de {marca}</strong> (administradoras y su equipo): {marca} es <strong>responsable</strong> de sus datos de cuenta.
            </>,
            <>
              <strong>Inquilinos, dueños y proveedores</strong> registrados por una administradora: la administradora es la responsable de esos datos y {marca} actúa como <strong>encargado</strong>, es decir, solo los guarda y procesa por cuenta de ella y siguiendo sus instrucciones. Para ejercer tus derechos sobre esos datos, dirígete primero a tu administradora; si no la localizas, escríbenos y la contactamos.
            </>,
          ]}
        />
      </Seccion>

      <Seccion titulo="2. Datos que tratamos">
        <Lista
          items={[
            "Identificación y contacto: nombre, correo, teléfono.",
            "De la cuenta: organización, rol en el equipo y registros de acceso.",
            "De las propiedades: dirección, rentas, contratos, servicios y documentos que suba la administradora.",
            "De reportes y pagos: descripciones, fotos, videos, comprobantes de pago y fechas.",
            "De facturación (solo usuarias con plan): el cobro lo procesa Stripe; nosotros no guardamos números de tarjeta.",
          ]}
        />
        <p>No solicitamos datos personales sensibles. Te pedimos no subirlos (por ejemplo, información de salud) en notas ni documentos.</p>
      </Seccion>

      <Seccion titulo="3. Para qué los usamos">
        <p>Finalidades necesarias para el servicio:</p>
        <Lista
          items={[
            "Crear y operar tu cuenta y la de tu equipo.",
            "Registrar y dar seguimiento a reportes de mantenimiento, cotizaciones y aprobaciones.",
            "Generar cobros, recibos, recordatorios y reportes mensuales.",
            "Enviar correos y links de la operación (avisos de renta, reportes, invitaciones).",
            "Cobrar la suscripción, prevenir fraudes y cumplir obligaciones legales.",
          ]}
        />
        <p>Finalidades adicionales (puedes negarte sin perder el servicio): enviarte novedades del producto y encuestas de satisfacción. Para negarte, escríbenos a {correo}.</p>
      </Seccion>

      <Seccion titulo="4. Con quién los compartimos">
        <p>Solo con proveedores que nos ayudan a dar el servicio y que están obligados a protegerlos:</p>
        <Lista
          items={[
            "Supabase (base de datos y almacenamiento de archivos).",
            "Vercel (alojamiento de la aplicación).",
            "Resend (envío de correos).",
            "Stripe (procesamiento de pagos de la suscripción).",
          ]}
        />
        <p>
          Algunos de estos servidores están fuera de México. Dentro de la app, cada administradora solo ve la información de su organización, y los links para inquilinos, dueños y proveedores muestran únicamente lo que les corresponde. No vendemos datos personales. Solo los entregaremos a una autoridad cuando la ley lo exija.
        </p>
      </Seccion>

      <Seccion titulo="5. Tus derechos ARCO">
        <p>
          Puedes pedir <strong>acceso</strong>, <strong>rectificación</strong>, <strong>cancelación</strong> u <strong>oposición</strong> al tratamiento de tus datos, así como revocar tu consentimiento, escribiendo a <strong>{correo}</strong> con:
        </p>
        <Lista
          items={[
            "Tu nombre y un medio para responderte.",
            "Una identificación (o la de tu representante y el documento que lo acredite).",
            "Qué derecho quieres ejercer y sobre qué datos.",
          ]}
        />
        <p>Te respondemos en un máximo de 20 días hábiles y, si procede, lo hacemos efectivo en los 15 días hábiles siguientes.</p>
      </Seccion>

      <Seccion titulo="6. Cookies">
        <p>Usamos únicamente cookies necesarias para mantener tu sesión iniciada y recordar a dónde volver después de entrar. No usamos cookies de publicidad.</p>
      </Seccion>

      <Seccion titulo="7. Cuánto tiempo los guardamos">
        <p>Mientras tu cuenta esté activa. Si la cancelas, borramos o anonimizamos la información en un plazo razonable, salvo lo que debamos conservar por obligaciones fiscales o legales.</p>
      </Seccion>

      <Seccion titulo="8. Cambios a este aviso">
        <p>Publicaremos cualquier cambio en esta página y, si es importante, te avisaremos por correo o dentro de la app.</p>
      </Seccion>
    </PaginaLegal>
  );
}

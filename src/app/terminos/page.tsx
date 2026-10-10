import type { Metadata } from "next";
import Link from "next/link";
import { Lista, PaginaLegal, Seccion } from "@/components/PaginaLegal";
import { LEGAL } from "@/lib/legal";
import { GRATIS_HASTA, PRECIO_PROPIEDAD } from "@/lib/plan";

export const metadata: Metadata = { title: `Términos y condiciones · ${LEGAL.marca}` };

export default function Terminos() {
  const { marca, responsable, correo } = LEGAL;
  return (
    <PaginaLegal titulo="Términos y condiciones">
      <p>
        Estos términos regulan el uso de {marca}, software en línea para administrar propiedades, ofrecido por {responsable}. Al crear una cuenta los aceptas en nombre propio y, en su caso, de la empresa que representas.
      </p>

      <Seccion titulo="1. El servicio">
        <p>
          {marca} te permite registrar propiedades, dueños, inquilinos y proveedores; recibir reportes de mantenimiento; pedir y comparar cotizaciones; llevar cobros de renta y servicios; guardar documentos y enviar reportes y recordatorios. Podemos mejorar, cambiar o retirar funciones; si un cambio afecta algo esencial de tu plan, te avisaremos con anticipación.
        </p>
      </Seccion>

      <Seccion titulo="2. Tu cuenta">
        <Lista
          items={[
            "Eres responsable de que la información sea correcta y de cuidar tu contraseña.",
            "Puedes invitar a tu equipo; tú decides sus permisos y respondes por lo que hagan en tu cuenta.",
            "Debes ser mayor de edad y tener facultades para contratar.",
          ]}
        />
      </Seccion>

      <Seccion titulo="3. Planes y pagos">
        <Lista
          items={[
            `Gratis para siempre hasta ${GRATIS_HASTA} propiedades.`,
            "Al crear tu cuenta tienes 30 días de prueba sin límite de propiedades.",
            `Plan de pago: $${PRECIO_PROPIEDAD} MXN + IVA por propiedad al mes, cobrado por adelantado con tarjeta a través de Stripe. El monto se ajusta automáticamente cuando agregas o quitas propiedades.`,
            "Sin plazos forzosos: puedes cancelar cuando quieras desde la sección Plan; la cancelación aplica al final del periodo pagado y no hay reembolsos por periodos parciales.",
            "Si un pago no se puede cobrar, tu cuenta regresa al plan gratis hasta que lo regularices; no borramos tu información por ello.",
            "Podemos cambiar los precios avisándote con al menos 30 días de anticipación.",
          ]}
        />
      </Seccion>

      <Seccion titulo="4. Tu información es tuya">
        <p>
          Los datos que subes (propiedades, personas, documentos, fotos) son tuyos. Nos das permiso de guardarlos y procesarlos solo para darte el servicio. Tú eres responsable de tener el consentimiento o la base legal para registrar datos de tus inquilinos, dueños y proveedores, y de contar con tu propio aviso de privacidad frente a ellos. Consulta nuestro{" "}
          <Link href="/privacidad" className="underline">
            aviso de privacidad
          </Link>
          .
        </p>
      </Seccion>

      <Seccion titulo="5. Uso aceptable">
        <p>No puedes usar {marca} para:</p>
        <Lista
          items={[
            "Subir información ilegal, falsa o de personas sin su autorización.",
            "Enviar correos o mensajes no deseados (spam).",
            "Intentar acceder a cuentas o datos de otras organizaciones, o afectar el funcionamiento del sistema.",
          ]}
        />
        <p>Si esto ocurre, podemos suspender la cuenta.</p>
      </Seccion>

      <Seccion titulo="6. Pagos de renta y proveedores">
        <p>
          {marca} ayuda a registrar y dar seguimiento a pagos, pero no recibe ni custodia dinero de rentas ni de trabajos: los pagos se hacen directamente entre inquilinos, administradoras, dueños y proveedores. No somos parte de los contratos de arrendamiento ni de los trabajos contratados, ni garantizamos el trabajo de los proveedores.
        </p>
      </Seccion>

      <Seccion titulo="7. Disponibilidad y responsabilidad">
        <p>
          Hacemos lo razonable para que el servicio esté disponible y respaldado, pero puede haber interrupciones. En la medida que la ley lo permita, nuestra responsabilidad total frente a ti se limita a lo que nos pagaste en los últimos 3 meses, y no respondemos por daños indirectos o pérdida de ganancias.
        </p>
      </Seccion>

      <Seccion titulo="8. Cancelación">
        <p>
          Puedes dejar de usar el servicio en cualquier momento. Si cancelas, puedes pedirnos una copia de tu información dentro de los 30 días siguientes escribiendo a {correo}; después la eliminaremos conforme al aviso de privacidad.
        </p>
      </Seccion>

      <Seccion titulo="9. Cambios y ley aplicable">
        <p>
          Si cambiamos estos términos te avisaremos; seguir usando {marca} implica que aceptas la nueva versión. Estos términos se rigen por las leyes de México y cualquier controversia se resolverá ante los tribunales de Querétaro, Querétaro, sin perjuicio de los derechos que te otorga la Ley Federal de Protección al Consumidor.
        </p>
        <p>Dudas: {correo}</p>
      </Seccion>
    </PaginaLegal>
  );
}

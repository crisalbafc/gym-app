const CONTACT = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined) || ''
const UPDATED = '9 de noviembre de 2026'

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-bold text-zinc-100 mt-5 mb-1">{children}</h2>
}

/** Política de privacidad (se puede leer sin haber iniciado sesión). */
export default function Privacy() {
  return (
    <div className="text-sm text-zinc-300 leading-relaxed">
      <h1 className="text-2xl font-extrabold text-zinc-100 mb-1">Política de privacidad</h1>
      <p className="text-xs text-zinc-500">Última actualización: {UPDATED}</p>

      <p className="mt-3">
        GymLog es una app gratuita, sin ánimo de lucro y sin publicidad, creada por un particular para entrenar con amigos.
        Aquí te explicamos, de forma sencilla, qué datos guarda y qué se hace con ellos.
      </p>

      <H>1. Quién es el responsable</H>
      <p>
        El responsable de tus datos es el creador de GymLog.
        {CONTACT
          ? <> Puedes escribir a <a className="text-accent underline" href={`mailto:${CONTACT}`}>{CONTACT}</a> para cualquier duda o petición.</>
          : <> Para cualquier duda o petición, contacta con la persona que te invitó a la app.</>}
      </p>

      <H>2. Qué datos guardamos</H>
      <ul className="list-disc pl-5 space-y-1">
        <li>Tu email, tu nombre visible y tu contraseña (cifrada: nadie puede verla).</li>
        <li>Tus entrenos: ejercicios, kilos, repeticiones y fechas.</li>
        <li>Tu dieta: alimentos, cantidades, calorías y macros.</li>
        <li>Tu peso corporal y tus medidas, si las apuntas.</li>
        <li>Las fotos de tus entrenos, si decides hacerlas.</li>
        <li>Los grupos de amigos a los que te unes.</li>
      </ul>
      <p className="mt-2">
        El peso, la dieta, las medidas y las fotos pueden considerarse <b>datos relacionados con la salud</b>.
        Solo los guardamos porque tú los apuntas voluntariamente y das tu consentimiento expreso al crear la cuenta.
      </p>

      <H>3. Para qué los usamos</H>
      <p>
        Únicamente para que la app funcione: guardar tu progreso, mostrarte tus gráficas y, si estás en un grupo, compartir con él
        lo que tú decidas. <b>No vendemos ni cedemos tus datos, no hay publicidad y no se usan para nada más.</b>
      </p>

      <H>4. Quién puede ver tus datos</H>
      <ul className="list-disc pl-5 space-y-1">
        <li><b>Solo tú</b> ves tu dieta, tu peso, tus medidas y tus entrenos completos.</li>
        <li>Si te conectas con un <b>entrenador</b> (Ajustes → Mi entrenador), verá solo lo que tú marques: entrenos, dieta, peso y medidas y/o fotos. Podrá dejarte notas, asignarte rutinas, ajustar tus objetivos de dieta y enviarte mensajes. Puedes cambiar lo que compartes o desconectarte cuando quieras.</li>
        <li>Las personas de <b>tus grupos</b> ven tu nombre visible, tus récords por ejercicio (puedes desactivarlo en Ajustes) y las fotos que marques como «La verá tu grupo».</li>
        <li>El creador de la app solo ve cifras globales (número de usuarios, de entrenos…), no tus datos personales.</li>
      </ul>

      <H>5. Dónde se guardan</H>
      <p>
        En los servidores de <b>Supabase</b> (base de datos y fotos) y la web se sirve desde <b>GitHub Pages</b>. Son proveedores que
        tratan los datos por cuenta nuestra con medidas de seguridad, y cada usuario solo puede acceder a lo suyo.
      </p>

      <H>6. Cuánto tiempo</H>
      <p>Mientras tengas la cuenta. Si la borras, se eliminan al momento todos tus datos y fotos.</p>

      <H>7. Tus derechos</H>
      <p>Puedes en cualquier momento:</p>
      <ul className="list-disc pl-5 space-y-1">
        <li><b>Ver y corregir</b> tus datos dentro de la app.</li>
        <li><b>Descargar</b> todos tus datos: Ajustes → «Descargar mis datos».</li>
        <li><b>Borrar tu cuenta</b> y todo su contenido: Ajustes → «Borrar mi cuenta».</li>
        <li>Retirar tu consentimiento (borrando la cuenta), oponerte o limitar el uso de tus datos.</li>
        <li>Reclamar ante la Agencia Española de Protección de Datos (aepd.es) si crees que no se respetan tus derechos.</li>
      </ul>

      <H>8. Menores</H>
      <p>GymLog es para mayores de 14 años.</p>

      <H>9. Cambios</H>
      <p>Si cambiamos esta política, actualizaremos la fecha de arriba y te avisaremos en la app si el cambio es importante.</p>
    </div>
  )
}

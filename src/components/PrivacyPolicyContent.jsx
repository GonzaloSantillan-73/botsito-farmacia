import React from 'react';

// Texto vigente de la Política de Privacidad (canal de WhatsApp + CRM).
// Es la única fuente del contenido: lo usan tanto la página pública
// /privacidad (PrivacyPolicyPage) como la pestaña "PP" de Configuración,
// así cualquier cambio de versión se hace en un solo lugar.
// Nota: la "nota interna" de la sección 7 y el "anexo interno" del borrador
// NO se publican (el propio documento indica eliminarlos antes de subirlo).

export const POLITICA_VERSION = 'Versión 1.1 — 24 de septiembre de 2026 — Área de Sistemas';

const CORREO = 'contacto@redmifarma.com.ar';

// Bloques de presentación reutilizables dentro de la política.
function Seccion({ titulo, children }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">{titulo}</h2>
      {children}
    </section>
  );
}

function Parrafo({ children }) {
  return <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{children}</p>;
}

function Lista({ items }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}

function Tabla({ columnas, filas }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm text-left">
        <thead className="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
          <tr>
            {columnas.map(col => <th key={col} className="px-3 py-2 font-semibold">{col}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700 text-gray-700 dark:text-gray-300">
          {filas.map((fila, i) => (
            <tr key={i}>
              {fila.map((celda, j) => <td key={j} className="px-3 py-2 align-top">{celda}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Correo() {
  return <a href={`mailto:${CORREO}`} className="text-teal-700 dark:text-teal-400 underline">{CORREO}</a>;
}

export default function PrivacyPolicyContent() {
  return (
    <article className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Política de Privacidad</h1>
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Canal de WhatsApp y sistema de gestión de clientes (CRM)</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{POLITICA_VERSION}</p>
      </header>

      <Seccion titulo="1. Quién es responsable de tus datos">
        <Parrafo>
          El responsable de la base de datos es MI FARMA S.R.L., CUIT 30-71671613-5, con domicilio en Hipólito Yrigoyen 1998,
          San Fernando del Valle de Catamarca, provincia de Catamarca, República Argentina (en adelante, “la Farmacia”).
        </Parrafo>
        <Tabla
          columnas={['Canal', 'Dato']}
          filas={[
            ['Correo electrónico', <Correo key="c" />],
            ['Teléfono', '3834 52-5662'],
            ['Domicilio', 'Hipólito Yrigoyen 1998, San Fernando del Valle de Catamarca, Catamarca']
          ]}
        />
        <Parrafo>
          Esta política describe cómo la Farmacia trata los datos personales de quienes se comunican con nosotros por WhatsApp o
          quedan registrados en nuestro sistema de gestión de clientes (CRM). Se rige por la Ley N° 25.326 de Protección de los
          Datos Personales y su reglamentación.
        </Parrafo>
      </Seccion>

      <Seccion titulo="2. Qué datos recopilamos">
        <Parrafo>
          Solo pedimos los datos mínimos necesarios para atenderte. No solicitamos datos bancarios, de tarjetas ni contraseñas por WhatsApp.
        </Parrafo>
        <Tabla
          columnas={['Dato', 'Para qué lo pedimos', 'Origen']}
          filas={[
            ['Nombre y apellido', 'Identificar y personalizar la atención', 'Lo informás vos'],
            ['DNI', 'Verificar tu identidad, asociar el pedido a la persona correcta y cumplir con los requisitos de dispensa de medicamentos', 'Lo informás vos'],
            ['Número de teléfono', 'Comunicarnos con vos y vincular la conversación a tu ficha', 'WhatsApp, al iniciar el contacto'],
            ['Contenido de la conversación', 'Registrar el pedido, la consulta o el reclamo', 'Los mensajes que nos enviás']
          ]}
        />
        <Parrafo>
          Si nos enviás una receta, una imagen o el nombre de un medicamento, ese contenido también queda registrado. Ver la sección 4.
        </Parrafo>
        <Parrafo>
          No obtenemos tu lista de contactos ni tu ubicación de manera automática, ni ningún otro dato de tu dispositivo.
        </Parrafo>
      </Seccion>

      <Seccion titulo="3. Para qué usamos tus datos y con qué fundamento">
        <Parrafo>Usamos tus datos únicamente para:</Parrafo>
        <Lista items={[
          'Atender tus consultas y coordinar la preparación y retiro de pedidos.',
          'Verificar tu identidad al momento de la dispensa.',
          'Informar el estado, la disponibilidad y la entrega de tu pedido.',
          'Registrar y responder reclamos o devoluciones.',
          'Cumplir obligaciones legales, contables y sanitarias.'
        ]} />
        <Parrafo>
          No usamos tus datos para publicidad ni marketing. No te enviamos promociones ni ofertas por WhatsApp, y no cedemos tu
          número a terceros con fines comerciales. Si en el futuro quisiéramos hacerlo, te pediremos tu consentimiento previo y por separado.
        </Parrafo>
        <Parrafo>
          El canal de WhatsApp se utiliza únicamente para comunicarnos con vos. La dispensa de medicamentos, en especial los que
          requieren receta, se realiza siempre en el local, con la intervención del profesional farmacéutico y la presentación de la
          receta correspondiente. No comercializamos ni gestionamos la venta de medicamentos a través de la plataforma.
        </Parrafo>
        <Parrafo>
          La base legal del tratamiento es tu consentimiento libre, expreso e informado, prestado al iniciar la conversación con
          nosotros y aceptar esta política (artículo 5 de la Ley N° 25.326). También tratamos datos cuando resulta necesario para
          ejecutar la relación comercial o para cumplir una obligación legal a cargo de la Farmacia.
        </Parrafo>
      </Seccion>

      <Seccion titulo="4. Datos de salud">
        <Parrafo>
          La información sobre medicamentos, recetas o tratamientos es un dato sensible según el artículo 7 de la Ley N° 25.326.
          La Farmacia solo la trata cuando vos nos la proporcionás voluntariamente para gestionar tu pedido, y siempre con tu
          consentimiento expreso.
        </Parrafo>
        <Parrafo>
          Este tratamiento se ampara además en el artículo 8 de la Ley N° 25.326, que habilita a los establecimientos sanitarios y a
          los profesionales de la salud a tratar datos relativos a la salud de sus pacientes, respetando el secreto profesional. Se
          aplican también la Ley N° 26.529 de Derechos del Paciente y las normas que regulan la actividad farmacéutica.
        </Parrafo>
        <Parrafo>En la práctica esto significa que:</Parrafo>
        <Lista items={[
          'El personal que accede a esa información está alcanzado por el deber de confidencialidad, que subsiste incluso después de finalizada la relación laboral.',
          'Nunca publicamos ni compartimos información sobre tu salud, tus compras o tus medicamentos con terceros ajenos a la dispensa.',
          'No usamos datos de salud para segmentar, perfilar ni dirigir publicidad.'
        ]} />
        <Parrafo>
          Si preferís no enviar información sobre tu medicación por WhatsApp, podés acercarte directamente al mostrador de la farmacia.
        </Parrafo>
      </Seccion>

      <Seccion titulo="5. Uso de WhatsApp y Meta">
        <Parrafo>
          La atención se presta a través de la Plataforma de WhatsApp Business, un servicio de WhatsApp LLC, empresa del grupo Meta
          Platforms, Inc. Al escribirnos por ese canal, tus mensajes se transmiten a través de la infraestructura de WhatsApp y
          quedan sujetos también a las políticas de privacidad de WhatsApp y de Meta.
        </Parrafo>
        <Parrafo>Qué implica esto:</Parrafo>
        <Lista items={[
          'Los mensajes viajan cifrados de extremo a extremo entre tu teléfono y nuestra cuenta comercial. Una vez recibidos, quedan almacenados en nuestros sistemas y en los de nuestros proveedores.',
          'WhatsApp procesa metadatos del intercambio (números involucrados, marcas de tiempo, estado de entrega) para prestar el servicio de mensajería.',
          'Al usar una cuenta de WhatsApp Business, WhatsApp puede compartir con nosotros información asociada a tu perfil, como el nombre público de la cuenta y el número.',
          'La Farmacia no conecta estos datos con Meta para fines publicitarios, ni los carga en herramientas de segmentación de anuncios (públicos personalizados, Conversions API o similares).'
        ]} />
        <Parrafo>
          Podés consultar la política de privacidad de WhatsApp en{' '}
          <a href="https://www.whatsapp.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-teal-700 dark:text-teal-400 underline">
            www.whatsapp.com/legal/privacy-policy
          </a>.
        </Parrafo>
        <Parrafo>
          <strong>Transferencia internacional.</strong> Los servidores de WhatsApp y de nuestros proveedores tecnológicos pueden estar
          ubicados fuera de la Argentina. Al aceptar esta política prestás tu consentimiento para esa transferencia, conforme al
          artículo 12 de la Ley N° 25.326. Exigimos a esos proveedores garantías contractuales de confidencialidad y seguridad
          equivalentes a las de la normativa argentina.
        </Parrafo>
      </Seccion>

      <Seccion titulo="6. Con quién compartimos tus datos">
        <Parrafo>No vendemos, alquilamos ni cedemos tus datos personales a terceros con fines comerciales.</Parrafo>
        <Parrafo>Acceden a ellos únicamente:</Parrafo>
        <Lista items={[
          'El personal autorizado de la Farmacia, en la medida en que lo necesite para atenderte.',
          'Nuestros proveedores tecnológicos, que actúan como encargados del tratamiento y solo pueden usar los datos siguiendo nuestras instrucciones: el proveedor del CRM, el proveedor de la plataforma de mensajería y el servicio de alojamiento. Están obligados por contrato a guardar confidencialidad.',
          'Obras sociales, prepagas o entidades financiadoras, cuando sea imprescindible para liquidar una receta a tu nombre.',
          'Autoridades públicas, cuando exista un requerimiento judicial o una obligación legal.'
        ]} />
        <Parrafo>Si necesitás la lista actualizada de proveedores que intervienen, podés pedirla a <Correo />.</Parrafo>
      </Seccion>

      <Seccion titulo="7. Cuánto tiempo conservamos tus datos">
        <Parrafo>
          Conservamos los datos mientras dure la relación comercial y, después, por los plazos que exijan las normas fiscales,
          comerciales y sanitarias aplicables.
        </Parrafo>
        <Tabla
          columnas={['Tipo de dato', 'Plazo de conservación']}
          filas={[
            ['Ficha de cliente (nombre, DNI, teléfono)', 'Mientras seas cliente activo y hasta 2 años después del último contacto'],
            ['Historial de conversaciones de WhatsApp', '12 meses desde el último mensaje'],
            ['Comprobantes y registros de dispensa', 'El plazo que fije la normativa fiscal y sanitaria vigente'],
            ['Prescripciones electrónicas archivadas y de medicamentos sujetos a control especial', '3 años, conforme a la Resolución N° 2214/2025 del Ministerio de Salud de la Nación, en el repositorio habilitado a tal efecto']
          ]}
        />
        <Parrafo>
          Las prescripciones electrónicas se conservan en la plataforma de recetas habilitada, no en el canal de WhatsApp. Si nos
          enviás una imagen de una receta por mensaje, esa imagen se elimina junto con el historial de conversación, sin perjuicio
          del registro que corresponda llevar en la plataforma de prescripciones.
        </Parrafo>
        <Parrafo>
          El sistema de gestión de clientes no almacena comprobantes de venta ni documentación fiscal. La facturación se emite y se
          conserva en un sistema independiente, por los plazos que fija la normativa vigente, de modo que la eliminación de tu ficha
          en el canal de atención no afecta esos registros.
        </Parrafo>
        <Parrafo>
          Cumplidos esos plazos, los datos se eliminan o se anonimizan de forma irreversible. Si pedís la supresión antes, la hacemos
          efectiva salvo que exista una obligación legal de conservarlos.
        </Parrafo>
      </Seccion>

      <Seccion titulo="8. Seguridad">
        <Parrafo>
          Aplicamos las medidas técnicas y organizativas que exige el artículo 9 de la Ley N° 25.326 para evitar la adulteración,
          pérdida, consulta o tratamiento no autorizado de los datos. Entre otras:
        </Parrafo>
        <Lista items={[
          'Acceso al CRM mediante usuario y contraseña individual, con permisos según el rol.',
          'Cifrado de la información en tránsito y de las copias de seguridad.',
          'Registro de accesos y de las operaciones realizadas sobre cada ficha.',
          'Acuerdos de confidencialidad con el personal y con los proveedores.'
        ]} />
        <Parrafo>
          Ningún sistema es infalible. Ante un incidente de seguridad que afecte tus datos personales, actuamos según los
          procedimientos previstos en la normativa vigente y te informamos si corresponde.
        </Parrafo>
      </Seccion>

      <Seccion titulo="9. Tus derechos">
        <Parrafo>
          Como titular de los datos podés ejercer los derechos de acceso, rectificación, actualización y supresión sobre tu
          información. Escribinos a <Correo /> o acercate a Hipólito Yrigoyen 1998, San Fernando del Valle de Catamarca, con tu DNI.
          Respondemos el pedido de acceso dentro de los 10 días corridos y el de rectificación o supresión dentro de los 5 días
          hábiles, conforme a los artículos 14 y 16 de la Ley N° 25.326.
        </Parrafo>
        <Parrafo>Las siguientes cláusulas son de inclusión obligatoria:</Parrafo>
        <div className="space-y-3 border-l-4 border-teal-500 pl-4">
          <Parrafo>
            El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a
            intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto conforme lo establecido en el
            artículo 14, inciso 3 de la Ley N° 25.326.
          </Parrafo>
          <Parrafo>
            LA AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley N° 25.326, tiene la
            atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por
            incumplimiento de las normas vigentes en materia de protección de datos personales.
          </Parrafo>
        </div>
      </Seccion>

      <Seccion titulo="10. Cómo dejar de recibir mensajes o eliminar tus datos">
        <Parrafo>
          <strong>Para dejar de recibir mensajes:</strong> respondé la palabra BAJA en la conversación de WhatsApp. Dejaremos de
          escribirte, salvo para responder consultas que vos inicies.
        </Parrafo>
        <Parrafo>
          <strong>Para eliminar tus datos:</strong> escribinos a <Correo /> desde el correo que tengamos registrado, o enviá el pedido
          por WhatsApp desde el número asociado a tu ficha, indicando tu nombre y DNI. Confirmamos la eliminación dentro de los 5 días hábiles.
        </Parrafo>
        <Parrafo>
          Eliminamos el nombre, el DNI, el teléfono y el historial de conversación. Pueden subsistir los registros que estemos
          obligados a conservar por normas fiscales o sanitarias, que quedan bloqueados y no se usan para contactarte.
        </Parrafo>
      </Seccion>

      <Seccion titulo="11. Menores de edad">
        <Parrafo>
          Este canal está dirigido a personas mayores de 18 años. No recopilamos deliberadamente datos de menores. Si detectamos que
          una ficha corresponde a un menor sin autorización de su madre, padre o representante legal, solo tratamos datos de menores
          en los supuestos que la normativa sanitaria admite. Si sos madre, padre o tutor y creés que registramos datos de un menor a
          tu cargo, escribinos a <Correo />.
        </Parrafo>
      </Seccion>

      <Seccion titulo="12. Condiciones de uso del canal">
        <Parrafo>Al utilizar este canal, tené en cuenta que:</Parrafo>
        <Lista items={[
          'Los datos que nos aportás deben ser veraces, exactos y actuales. Sos responsable de la información que proporcionás y de mantenerla actualizada.',
          'Si gestionás un pedido para otra persona, declarás contar con su autorización para entregarnos sus datos personales y de salud, y asumís la responsabilidad de haberla obtenido.',
          'Las respuestas que damos por este canal son de carácter informativo y administrativo. No constituyen un diagnóstico ni reemplazan la consulta médica ni la atención farmacéutica presencial.',
          'El servicio depende de la infraestructura de WhatsApp, operada por un tercero. La Farmacia no responde por interrupciones, demoras, pérdidas de mensajes o incidentes atribuibles a esa plataforma o a la conectividad del usuario.'
        ]} />
      </Seccion>

      <Seccion titulo="13. Cambios y vigencia">
        <Parrafo>
          Podemos actualizar esta política para reflejar cambios en nuestros procesos o en la normativa. Publicamos la versión
          vigente en www.redmifarma.com.ar/privacidad con su fecha de última actualización. Si el cambio afecta de manera sustancial
          el uso de tus datos, te avisamos por el mismo canal de WhatsApp antes de aplicarlo.
        </Parrafo>
        <Parrafo><strong>Última actualización:</strong> 24 de septiembre de 2026.</Parrafo>
        <Parrafo>
          Ante cualquier duda sobre esta política, escribinos a <Correo /> o llamanos al 3834 52-5662.
        </Parrafo>
      </Seccion>
    </article>
  );
}

import crypto from 'crypto';

// Identifica de forma inequívoca QUÉ proceso corrió una acción puntual (ej.
// quién mandó el mensaje de cierre por inactividad), para poder probar o
// descartar en los logs si un mensaje duplicado salió de ESTE mismo proceso
// (bug real de concurrencia acá adentro) o de otro proceso/deploy distinto
// corriendo en paralelo contra la misma base (instancia fantasma).
//
// RENDER_INSTANCE_ID/RENDER_GIT_COMMIT los pone Render automáticamente en
// cada instancia — son la fuente más confiable posible porque los genera la
// plataforma, no este código. Si no están (dev local, u otro hosting), se
// arma un id al azar por proceso + PID como mejor esfuerzo.
const renderInstanceId = process.env.RENDER_INSTANCE_ID || null;
const renderGitCommit = process.env.RENDER_GIT_COMMIT || null;
const localInstanceId = renderInstanceId ? null : crypto.randomUUID().slice(0, 8);

export const INSTANCE_INFO = {
  id: renderInstanceId || `local-${localInstanceId}-pid${process.pid}`,
  commit: renderGitCommit || '(sin RENDER_GIT_COMMIT, no es Render o no está seteado)',
  serviceName: process.env.RENDER_SERVICE_NAME || null,
  pid: process.pid,
  bootedAt: new Date().toISOString()
};

export const logInstanceBoot = () => {
  console.log('🆔 [INSTANCE] ==================================================');
  console.log('🆔 [INSTANCE] Arrancó un proceso del backend con esta identidad:');
  console.log('🆔 [INSTANCE]   id:          ', INSTANCE_INFO.id);
  console.log('🆔 [INSTANCE]   commit:      ', INSTANCE_INFO.commit);
  console.log('🆔 [INSTANCE]   serviceName: ', INSTANCE_INFO.serviceName);
  console.log('🆔 [INSTANCE]   pid:         ', INSTANCE_INFO.pid);
  console.log('🆔 [INSTANCE]   bootedAt:    ', INSTANCE_INFO.bootedAt);
  console.log('🆔 [INSTANCE] Si en algún momento se manda un mensaje de cierre duplicado,');
  console.log('🆔 [INSTANCE] buscá en los logs "enviando mensaje de finalización" y comparká');
  console.log('🆔 [INSTANCE] el id/commit de cada línea: si son DISTINTOS, hay más de un');
  console.log('🆔 [INSTANCE] proceso corriendo contra esta misma base de datos.');
  console.log('🆔 [INSTANCE] ==================================================');
};

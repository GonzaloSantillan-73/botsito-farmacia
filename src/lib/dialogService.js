// Reemplazo de window.confirm()/window.alert() por los modales propios del
// CRM (ver DialogHost.jsx). Es un singleton a propósito: los ~25 puntos del
// código que antes llamaban a confirm()/alert() están repartidos en muchos
// componentes sin relación entre ellos, así que en vez de forzar un
// Context/hook en cada uno, alcanza con importar estas dos funciones y
// llamarlas igual que a las nativas (con await en vez de sincrónico).
// <DialogHost /> se monta una sola vez en App.jsx y se registra acá con
// registerDialogHost(); si por algún motivo no llegó a montarse todavía,
// caemos a la versión nativa del navegador para no romper el flujo.
let listener = null;

export function registerDialogHost(fn) {
  listener = fn;
}

// Reemplazo de window.confirm(mensaje). Devuelve una Promise<boolean>.
export function confirmDialog(message, opts = {}) {
  return new Promise((resolve) => {
    if (!listener) { resolve(window.confirm(message)); return; }
    listener({
      type: 'confirm',
      message,
      title: opts.title,
      confirmText: opts.confirmText || 'Aceptar',
      cancelText: opts.cancelText || 'Cancelar',
      danger: !!opts.danger,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false)
    });
  });
}

// Reemplazo de window.alert(mensaje). Devuelve una Promise<void> que se
// resuelve cuando el usuario cierra el modal (útil si algo necesita esperar
// a que lo haya visto, aunque la mayoría de los llamados no lo necesitan).
export function alertDialog(message, opts = {}) {
  return new Promise((resolve) => {
    if (!listener) { window.alert(message); resolve(); return; }
    listener({
      type: 'alert',
      message,
      title: opts.title,
      confirmText: opts.confirmText || 'Aceptar',
      danger: !!opts.danger,
      onConfirm: () => resolve()
    });
  });
}

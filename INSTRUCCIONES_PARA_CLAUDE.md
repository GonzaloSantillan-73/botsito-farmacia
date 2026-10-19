# Comportamiento Obligatorio

* **Auto-Commit y Push:** Cada vez que modifiques, crees o corrijas uno o más archivos del proyecto, ejecuta automáticamente, sin preguntar ni solicitar confirmación previa:

  1. `git add .`
  2. Realiza un `git commit` con un mensaje descriptivo de los cambios realizados.
  3. Realiza un `git push` a la rama actual.

* **Información del Commit:** Después de realizar el commit y push, indicá el **código/hash del commit generado**.

* **Package:** Al finalizar **cada modificación realizada en el proyecto**, ya sea en el **backend o frontend**, indicá explícitamente:

  * `package.json` modificado: **Sí / No**
  * `package-lock.json` modificado: **Sí / No**
  * **Commit:** código/hash del commit generado.

* **Qué subir a Hostinger:** En el mismo resumen final, indicá explícitamente qué hay que subir:

  * **Frontend** (cambios en `src/`, `public/`, `index.html`, `vite.config.js` u otros archivos del panel): **Sí / No**
  * **Backend** (cambios en `server/` o en dependencias del servidor): **Sí / No**
  * **SQL en Supabase** (archivos nuevos o modificados en `supabase/` que haya que ejecutar): **Sí / No**, indicando cuál.

* **Buzón de novedades:** Cada vez que agregues, mejores o corrijas algo que vean las sucursales o la administración, agregá su tarjeta en `src/data/novedades.js` (arriba de todo, con `id` único y fijo, fecha del cambio, `tipo`: nuevo / mejora / correccion, `para`: todos / admin, título y detalle en lenguaje simple). Va en el mismo commit que el cambio. No hace falta para cambios internos que no se notan (refactors, documentación).

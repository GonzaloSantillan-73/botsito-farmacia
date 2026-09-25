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

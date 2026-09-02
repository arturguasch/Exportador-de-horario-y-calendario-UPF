# Exportador d'horari i calendari UPF, versión 1.0.4

Extensión para Chrome y Edge que exporta el horario de clases de la UPF desde Secretaría Virtual o gestioacadémica a archivos `.ics` compatibles con Google Calendar, Apple Calendar, Outlook y otros calendarios.

## Instalación sencilla

Añadir la extensión de forma automática desde la Chrome Web Store:
https://chromewebstore.google.com/detail/ijndcdclgmgbmdmcppklikbmdgbapaig?utm_source=item-share-cb

## Instalación manual

1. Descomprime el ZIP en una carpeta fija.
2. Abre `chrome://extensions` o `edge://extensions`.
3. Activa `Modo desarrollador`.
4. Pulsa `Cargar descomprimida`.
5. Selecciona la carpeta descomprimida.

## Uso recomendado para colores en Google Calendar

Google Calendar no respeta de forma fiable los colores por evento al importar archivos `.ics`.

La mejor solución es:

1. Crear un calendario diferente para cada materia.
2. Asignar un color a cada calendario.
3. En la extensión, activar `Crear un .ics por cada materia seleccionada`.
4. Importar cada `.ics` al calendario correspondiente.

## Cambios en la versión 1.0.4

- Se actualiza la versión del paquete de `1.0.3` a `1.0.4`.
- Se añaden dos modos de exportación: **modo manual** (`.ics`) y **modo automático** (sincronización con Google Calendar).
- El modo automático se muestra como funcionalidad **en pruebas**; puede no funcionar correctamente para todos los usuarios mientras se completa la configuración de Google OAuth.
- Nueva interfaz por pasos para exportar o sincronizar el horario.
- Personalización del formato de los títulos de eventos (teoría, seminarios y exámenes) con bloques, prefijos, sufijos y texto propio.
- Detección de materias, selección por asignatura y asignación de colores en el modo automático.
- Se añaden los permisos `identity` y `tabs`, y acceso a `googleapis.com` y `accounts.google.com` para la sincronización con Google Calendar.
- Mejoras en la zona horaria `Europe/Madrid` para la exportación `.ics`.
- Aviso visible en amarillo en el modo automático indicando que la sincronización está en pruebas.
- Actualización de la política de privacidad para reflejar el uso opcional de Google Calendar.

## Cambios en la versión 1.0.3

- Se actualiza la versión del paquete de `1.0.2` a `1.0.3`.
- Se cambia el nombre a `Exportador d'horari i calendari UPF` y se mejora la descripción para SEO.
- Se actualiza el enlace público de gestioacadémica para abrir directamente con entrada pública e idioma catalán.
- Se elimina el permiso `tabs`; la extensión mantiene `activeTab`, `scripting`, `downloads` y `storage`.
- Se añade soporte para `https://gestioacademica.upf.edu/*`, además de `https://secretariavirtual.upf.edu/*`.
- El aviso inicial aparece en rojo cuando la pestaña actual no es una página compatible de la UPF.
- El aviso de página no compatible incluye enlaces a la secretaría virtual de la UPF y al horario público de gestioacadémica.
- El primer paso de ayuda permite entrar desde la secretaría virtual de la UPF o desde gestioacadémica.
- El subtítulo se generaliza a cualquier calendario compatible, no solo Google Calendar.
- Se eliminan los campos visibles `Nombre del calendario` y `Nombre del archivo`; ahora se usan nombres por defecto según el idioma.
- Los seminarios muestran el grupo con prefijo `G:` en el título del evento, por ejemplo `G: 102`.
- Se añade modo oscuro configurable desde el panel de configuración; por defecto sigue el tema del navegador o del sistema.
- Se corrige el botón `Cap` / `Ninguna` / `None` para poder dejar todas las materias desmarcadas.
- Se añade la versión de la extensión dentro del panel de configuración.
- Se mejora la compatibilidad de los archivos `.ics` incluyendo la zona horaria `Europe/Madrid` con `VTIMEZONE`.
- Las etiquetas de la descripción del evento se traducen según el idioma seleccionado.
- Se evita descargar archivos `.ics` vacíos cuando no hay eventos exportables.
- Los mensajes de error del área de estado se muestran en una caja roja y vuelven al estilo normal cuando desaparece el error.
- Se limpian claves de traducción no utilizadas.

## Privacidad

Extensión no oficial. No está afiliada, avalada ni mantenida por la Universitat Pompeu Fabra.

La extensión procesa los datos localmente en el navegador. No recopila, vende ni transmite datos personales a servidores propios. La sincronización con Google Calendar solo ocurre si el usuario conecta su cuenta y pulsa sincronizar; en ese caso, los eventos seleccionados se envían a la cuenta de Google del usuario.

Política de privacidad: https://arturguasch.github.io/Exportador-de-horario-y-calendario-UPF/

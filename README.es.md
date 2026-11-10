# SmartHomeNG Items para VS Code

![](https://flagcdn.com/20x15/gb.png) [English](README.md) &nbsp;
![](https://flagcdn.com/20x15/de.png) [Deutsch](README.de.md) &nbsp;
![](https://flagcdn.com/20x15/fr.png) [Français](README.fr.md) &nbsp;
![](https://flagcdn.com/20x15/it.png) [Italiano](README.it.md)

Crea y gestiona tus items de [SmartHomeNG](https://www.smarthomeng.de) de forma rápida y eficiente:

- Busca, ordena y filtra los items de tu configuración de SmartHomeNG
- Navega por tu configuración de forma eficiente
- Edita y amplía tu configuración con autocompletado contextual y soporte para YAML
- Integra tu proyecto KNX y encuentra direcciones de grupo sin salir de VS Code

## Funciones

- **Árbol de items** (barra de actividades → SmartHomeNG): todos los items con tipo, direcciones de grupo KNX
  (`→` send, `←` listen, `⇐` init), ID de Hue, `ƒ` para eval, `⏲` para UZSU y el struct utilizado. Los items que solo
  existen a través de un struct aparecen en morado, los atributos de structs en gris. Un clic abre la definición en
  `items/`.
- **Tooltip** con todos los atributos (incluido el struct de origen) y enlaces a las definiciones.
- **Filtros**: un chip por cada plugin configurado (leído de `etc/plugin.yaml` y de los `item_attributes` de los
  plugins), categorías adicionales (eval, temporización, caché) y tipos de item (bool, num, …). Plugins/categorías se
  combinan con Y, los tipos con O. Se aplica a la búsqueda y al árbol de items.
- **Búsqueda** (Ctrl+Shift+Alt+I): resultados en vivo sobre ruta, nombre y atributos; búsqueda por patrón como
  `baddim` → `eg.bad.licht.spiegel.dimmen`; ordenada por menos fragmentos e inicios de palabra; los resultados ocultos
  por el filtro aparecen bajo un separador; los items que solo existen por un struct van al final.
- **Autocompletado** en `items/*.yaml`, `structs/*.yaml` y `logics/*.py`:
  - sub-items (de items con el mismo nombre o la misma profundidad, hijos de structs para ampliar)
  - atributos (núcleo de SmartHomeNG e `item_attributes` de los plugins configurados, incluido `@instancia`)
  - valores (`type`, nombres de structs, `valid_list` de los plugins, valores ya usados)
  - rutas de items para `eval_trigger`, `hysteresis_input`, el destino de `on_change`/`on_update` y `sh.` en
    expresiones – absolutas y relativas (`..hermano`, `.hijo`, `...tio`, `.self`)
  - ordenado según lo que aparece junto en tus items existentes (p. ej. `type: bool` → `knx_dpt` → `1`)
- **KNX / ETS** (ajuste `shngItems.knxProject`): `knx_send`, `knx_listen`, … sugieren direcciones de grupo adecuadas
  del proyecto ETS (nombre y grupos ↔ ruta del item, DPT ↔ `type`/`knx_dpt`, direcciones de estado para `knx_listen`)
  y la siguiente dirección libre del grupo; `knx_dpt` toma el DPT de ETS; al pasar el ratón sobre una dirección de
  grupo se muestran su nombre en ETS, los grupos, el DPT y todos los items que la usan.
- **Resumen de items** (icono de tabla): tabla ordenable y filtrable de todos los items.
- **Hover e Ir a la definición (F12)** para rutas de items en YAML, Python (lógicas) y HTML (smartVISU).
- **Diagnósticos**: structs desconocidos, `eval_trigger` que apuntan a items inexistentes, referencias `sh.*`
  desconocidas en `eval`/`on_change`/`on_update`.
- Menú contextual: copiar la ruta del item, buscar usos; en el editor: «Mostrar item en el árbol».

## Requisitos

Una instalación de SmartHomeNG (una carpeta que contenga `items/`) en el espacio de trabajo, o el ajuste
`shngItems.basePath`, p. ej. para una carpeta de red `\\smarthomeng\SmartHomeNG`. Para las sugerencias KNX, un
proyecto ETS (`.knxproj`) exportado **sin contraseña**.

## Ajustes

| Ajuste | Significado |
|---|---|
| `shngItems.language` | idioma de la interfaz: `en` (predeterminado), `de`, `es`, `fr`, `it`, `nl` o `auto` (idioma de VS Code) |
| `shngItems.basePath` | directorio de SmartHomeNG si no forma parte del espacio de trabajo |
| `shngItems.knxProject` | ruta al proyecto ETS (`.knxproj`) para direcciones de grupo, DPT y hover |
| `shngItems.categories` | categorías de filtro adicionales no ligadas a un plugin (nombre → nombres de atributos, `*` = prefijo) |
| `shngItems.showAttributes` | mostrar los atributos como nodos hijos en el árbol |
| `shngItems.showStructItems` | mostrar los items creados por structs |
| `shngItems.sortAlphabetically` | orden alfabético en lugar del orden de los archivos |
| `shngItems.diagnostics` | activar/desactivar los diagnósticos |

Los nombres de los comandos y las descripciones de los ajustes se muestran en el idioma de VS Code (VS Code no permite
que una extensión los cambie en tiempo de ejecución); todo lo demás sigue `shngItems.language`.

## Traducciones

Los textos están en `lib/l10n/<idioma>.json` (vistas, tooltips, autocompletado, mensajes) y
`package.nls.<idioma>.json` (comandos y ajustes). Las claves que faltan usan el inglés. Se agradecen correcciones y
nuevos idiomas como pull requests.

## Licencia

[MIT](LICENSE)

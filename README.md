# SmartHomeNG Items for VS Code

![](https://flagcdn.com/20x15/de.png) [Deutsch](README.de.md) &nbsp;
![](https://flagcdn.com/20x15/fr.png) [Français](README.fr.md) &nbsp;
![](https://flagcdn.com/20x15/es.png) [Español](README.es.md) &nbsp;
![](https://flagcdn.com/20x15/it.png) [Italiano](README.it.md)

Create and manage your [SmartHomeNG](https://www.smarthomeng.de) items quickly and efficiently:

- Search, sort and filter the items of your SmartHomeNG configuration
- Navigate your configuration efficiently
- Edit and extend your configuration with context-aware autocomplete and YAML support
- Connect your KNX project and find group addresses without leaving VS Code

## Features

- **Item tree** (activity bar → SmartHomeNG): all items with type, KNX group addresses (`→` send, `←` listen,
  `⇐` init), Hue ID, `ƒ` for eval, `⏲` for UZSU and the struct used. Items that exist only through a struct are purple,
  attributes from structs grey. Clicking an item opens its definition in `items/`.
- **Tooltip** with all attributes (including their struct origin) and links to the definitions.
- **Filters**: one chip per configured plugin (read from `etc/plugin.yaml` and the plugins' `item_attributes`), extra
  categories (eval, timers, cache) and item types (bool, num, …). Plugins/categories are combined with AND, types with
  OR. Applies to the search and the item tree.
- **Search** (Ctrl+Shift+Alt+I): live results over path, name and attributes; pattern matching such as `baddim` →
  `eg.bad.licht.spiegel.dimmen`; ranked by fewest fragments and word starts; hits hidden by the filter are listed below
  a separator; items that exist only through a struct come last.
- **Autocomplete** in `items/*.yaml`, `structs/*.yaml` and `logics/*.py`:
  - child items (from items with the same name or at the same depth, struct children to extend)
  - attributes (SmartHomeNG core and `item_attributes` of the configured plugins, including `@instance`)
  - values (`type`, struct names, plugin `valid_list`, values used elsewhere)
  - item paths for `eval_trigger`, `hysteresis_input`, the target of `on_change`/`on_update` and `sh.` in expressions –
    absolute and relative (`..sibling`, `.child`, `...uncle`, `.self`)
  - ranked by what occurs together in your existing items (e.g. `type: bool` → `knx_dpt` → `1`)
- **KNX / ETS** (setting `shngItems.knxProject`): `knx_send`, `knx_listen`, … suggest matching group addresses from the
  ETS project (name and groups ↔ item path, DPT ↔ `type`/`knx_dpt`, status addresses for `knx_listen`) plus the next
  free address in the group; `knx_dpt` takes the DPT from the ETS; hovering a group address shows its ETS name, groups,
  DPT and all items using it.
- **Item overview** (table icon): sortable and filterable table of all items.
- **Hover & Go to Definition (F12)** for item paths in YAML, Python (logics) and HTML (smartVISU).
- **Diagnostics**: unknown structs, `eval_trigger` pointing to missing items, unknown `sh.*` references in
  `eval`/`on_change`/`on_update`.
- Context menu: copy item path, find usages; in the editor: "Reveal item in tree".

## Requirements

A SmartHomeNG installation (a folder containing `items/`) in the workspace, or the setting `shngItems.basePath`, e.g.
for a network share `\\smarthomeng\SmartHomeNG`. For KNX suggestions, an ETS project (`.knxproj`) exported **without a
password**.

## Settings

| Setting | Meaning |
|---|---|
| `shngItems.language` | language of the user interface: `en` (default), `de`, `es`, `fr`, `it`, `nl` or `auto` (display language of VS Code) |
| `shngItems.basePath` | SmartHomeNG directory if it is not part of the workspace |
| `shngItems.knxProject` | path to the ETS project (`.knxproj`) for group addresses, DPT and hover |
| `shngItems.categories` | extra filter categories not tied to a plugin (name → attribute names, `*` = prefix) |
| `shngItems.showAttributes` | show attributes as child nodes in the tree |
| `shngItems.showStructItems` | show items created by structs |
| `shngItems.sortAlphabetically` | sort alphabetically instead of file order |
| `shngItems.diagnostics` | enable/disable diagnostics |

Command names and setting descriptions are shown in the display language of VS Code (VS Code does not allow an
extension to change them at runtime); everything else follows `shngItems.language`.

## Translations

Texts are in `lib/l10n/<language>.json` (views, tooltips, autocomplete, messages) and `package.nls.<language>.json`
(commands and settings). Missing keys fall back to English. Corrections and new languages are welcome as pull requests.

## License

[MIT](LICENSE)

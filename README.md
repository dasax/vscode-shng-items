# SmartHomeNG Items für VS Code

Zeigt die in `items/*.yaml` definierten SmartHomeNG-Items übersichtlich an – so, wie SmartHomeNG sie
nach dem Laden sieht: alle Dateien zusammengeführt und Structs (`structs/`, `etc/struct*.yaml`,
`plugins/<plugin>/plugin.yaml`) aufgelöst.

## Funktionen

- **Baumansicht** (Activity Bar → SmartHomeNG): alle Items hierarchisch, mit Typ, KNX-Gruppenadressen
  (`→` send, `←` listen, `⇐` init), Hue-ID, `ƒ` für eval, `⏲` für UZSU und verwendetem Struct.
  Durch Structs erzeugte Items/Attribute sind lila bzw. grau markiert. Klick springt zur Definition.
- **Tooltip** mit allen Attributen (inkl. Herkunft aus Struct) und Links zu den Definitionen.
- **Filter** (oberster Bereich): Kategorie-Chips (KNX, Hue, 1-Wire, …; mehrere = UND) und Typ-Chips (bool, num, …; automatisch aus den Items, mehrere = ODER) filtern Suche und Item-Baum.
- **Suche** (Strg+Shift+Alt+I): Live-Trefferliste über Pfad, Name und Attribute; Muster-Suche wie `baddim` → `eg.bad.licht.spiegel.dimmen`; ✕ oder Esc leert das Feld. Bei aktivem Filter stehen ausgeblendete Treffer unter einem Strich; nur durch Structs erzeugte Items (lila) stehen immer am Ende.
- **Autovervollständigung** in `items/*.yaml` und `structs/*.yaml`: Unter-Items (aus gleichnamigen und gleich tiefen Items, Struct-Kinder zum Erweitern), Attribute (SmartHomeNG-Kern und `item_attributes` der konfigurierten Plugins, inkl. `@instanz`) und Werte (`type`, Struct-Namen, Item-Pfade für `eval_trigger` & Co., `valid_list` der Plugins, verwendete Werte). Sortiert nach dem, was in den vorhandenen Items zusammen vorkommt (z.B. `type: bool` → `knx_dpt` → `1`). `sh.` in `eval`/`on_change` schlägt Item-Pfade vor, auch relative (`..geschwister`, `.kind`, `...onkel`, `.self`); ebenso `eval_trigger`, das Ziel von `on_change`/`on_update` und `sh.`/`items.return_item()` in `logics/*.py`.
- **KNX / ETS** (Einstellung `shngItems.knxProject` = Pfad zur `.knxproj`): `knx_send`, `knx_listen`, … schlagen passende Gruppenadressen vor (Name ↔ Item-Pfad, DPT ↔ `type`/`knx_dpt`, Status-Adressen für `knx_listen`) plus die nächste freie Adresse der Gruppe; `knx_dpt` übernimmt den DPT aus der ETS; Hover über eine Gruppenadresse zeigt ETS-Name, DPT und alle Items, die sie verwenden.
- **Textfilter im Baum** (Trichter-Symbol): sucht in Pfaden, Attributnamen und Werten, z.B. `1/1/12`, `bad licht`, `uzsu`.
- **Item öffnen …** (Lupe): Schnellauswahl über alle Item-Pfade.
- **Item-Übersicht** (Tabellen-Symbol): sortier- und filterbare Tabelle aller Items, Attribute per ▸ aufklappbar.
- **Hover & Gehe zu Definition (F12)** für Item-Pfade in YAML, Python (Logiken) und HTML (smartVISU),
  z.B. auf `sh.eg.bad.licht.decke.schalten()` oder `'eg.bad.licht.decke.schalten'`.
- **Prüfungen**: Warnung bei unbekannten Structs, `eval_trigger` auf nicht existierende Items und
  unbekannten `sh.*`-Referenzen in `eval`/`on_change`/`on_update`.
- Kontextmenü: Item-Pfad kopieren, Verwendungen im Workspace suchen; im Editor: „Item im Baum anzeigen“.

## Installation

```powershell
cd C:\Users\danie\vscode-shng-items
.\build.ps1 -Install
```

Danach VS Code neu laden (`Developer: Reload Window`).

## Einstellungen

| Einstellung | Bedeutung |
|---|---|
| `shngItems.basePath` | SmartHomeNG-Verzeichnis, falls es nicht im Workspace liegt (z.B. im smartVISU-Workspace) |
| `shngItems.showAttributes` | Attribute als Unterknoten zeigen |
| `shngItems.showStructItems` | durch Structs erzeugte Items zeigen |
| `shngItems.sortAlphabetically` | alphabetisch statt Dateireihenfolge |
| `shngItems.diagnostics` | Prüfungen an/aus |

## Test ohne VS Code

```bash
ELECTRON_RUN_AS_NODE=1 "<VS Code>/Code.exe" test/smoke.js //smarthomeng/SmartHomeNG eg.bad.licht
```

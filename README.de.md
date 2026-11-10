# SmartHomeNG Items für VS Code

![](https://flagcdn.com/20x15/gb.png) [English](README.md) &nbsp;
![](https://flagcdn.com/20x15/fr.png) [Français](README.fr.md) &nbsp;
![](https://flagcdn.com/20x15/es.png) [Español](README.es.md) &nbsp;
![](https://flagcdn.com/20x15/it.png) [Italiano](README.it.md)

Erstelle und verwalte deine [SmartHomeNG](https://www.smarthomeng.de)-Items schnell und effizient:

- Suche, sortiere und filtere Items in deiner SmartHomeNG-Konfiguration
- Navigiere effizient durch deine Konfiguration
- Editiere und erweitere deine Konfiguration durch kontextbezogene Autovervollständigung und YAML-Unterstützung
- Binde dein KNX-Projekt ein und finde Gruppenadressen, ohne VS Code zu verlassen

## Funktionen

- **Baumansicht** (Activity Bar → SmartHomeNG): alle Items hierarchisch, mit Typ, KNX-Gruppenadressen
  (`→` send, `←` listen, `⇐` init), Hue-ID, `ƒ` für eval, `⏲` für UZSU und verwendetem Struct.
  Nur durch Structs erzeugte Items sind lila, Attribute aus Structs grau. Klick springt zur Definition in `items/`.
- **Tooltip** mit allen Attributen (inkl. Herkunft aus Struct) und Links zu den Definitionen.
- **Filter**: ein Chip je konfiguriertem Plugin (automatisch aus `etc/plugin.yaml` und den `item_attributes` der
  Plugins), sonstige Kategorien (eval, Zeitsteuerung, Cache) und Item-Typen (bool, num, …). Plugins/Sonstige
  untereinander UND, Typen ODER. Wirkt auf Suche und Item-Baum.
- **Suche** (Strg+Shift+Alt+I): Live-Trefferliste über Pfad, Name und Attribute; Muster-Suche wie `baddim` →
  `eg.bad.licht.spiegel.dimmen`; Sortierung nach wenigen Fragmenten und Wortanfängen; vom Filter ausgeblendete Treffer
  unter einem Strich; nur durch Structs erzeugte Items am Ende.
- **Autovervollständigung** in `items/*.yaml`, `structs/*.yaml` und `logics/*.py`:
  - Unter-Items (aus gleichnamigen und gleich tiefen Items, Struct-Kinder zum Erweitern)
  - Attribute (SmartHomeNG-Kern und `item_attributes` der konfigurierten Plugins, inkl. `@instanz`)
  - Werte (`type`, Struct-Namen, `valid_list` der Plugins, verwendete Werte)
  - Item-Pfade für `eval_trigger`, `hysteresis_input`, Ziel von `on_change`/`on_update` und `sh.` in Ausdrücken –
    absolut und relativ (`..geschwister`, `.kind`, `...onkel`, `.self`)
  - sortiert nach dem, was in den vorhandenen Items zusammen vorkommt (z.B. `type: bool` → `knx_dpt` → `1`)
- **KNX / ETS** (Einstellung `shngItems.knxProject`): `knx_send`, `knx_listen`, … schlagen passende Gruppenadressen aus
  dem ETS-Projekt vor (Name und Gruppen ↔ Item-Pfad, DPT ↔ `type`/`knx_dpt`, Status-Adressen für `knx_listen`) plus die
  nächste freie Adresse der Gruppe; `knx_dpt` übernimmt den DPT aus der ETS; Hover über eine Gruppenadresse zeigt
  ETS-Name, Gruppen, DPT und alle Items, die sie verwenden.
- **Item-Übersicht** (Tabellen-Symbol): sortier- und filterbare Tabelle aller Items.
- **Hover & Gehe zu Definition (F12)** für Item-Pfade in YAML, Python (Logiken) und HTML (smartVISU).
- **Prüfungen**: Warnung bei unbekannten Structs, `eval_trigger` auf nicht existierende Items und unbekannten
  `sh.*`-Referenzen in `eval`/`on_change`/`on_update`.
- Kontextmenü: Item-Pfad kopieren, Verwendungen suchen; im Editor: „Item im Baum anzeigen“.

## Voraussetzungen

Ein Ordner mit einer SmartHomeNG-Installation (mit `items/`) im Workspace – oder die Einstellung `shngItems.basePath`,
z.B. für eine Netzwerkfreigabe `\\smarthomeng\SmartHomeNG`. Für die KNX-Vorschläge ein ETS-Projekt (`.knxproj`), das
**ohne Passwort** exportiert wurde.

## Einstellungen

| Einstellung | Bedeutung |
|---|---|
| `shngItems.language` | Sprache der Oberfläche: `en` (Standard), `de`, `es`, `fr`, `it`, `nl` oder `auto` (Anzeigesprache von VS Code) |
| `shngItems.basePath` | SmartHomeNG-Verzeichnis, falls es nicht im Workspace liegt |
| `shngItems.knxProject` | Pfad zum ETS-Projekt (`.knxproj`) für Gruppenadressen, DPT und Hover |
| `shngItems.categories` | zusätzliche Filter-Kategorien, die zu keinem Plugin gehören (Name → Attributnamen, `*` = Präfix) |
| `shngItems.showAttributes` | Attribute als Unterknoten im Baum zeigen |
| `shngItems.showStructItems` | durch Structs erzeugte Items zeigen |
| `shngItems.sortAlphabetically` | alphabetisch statt Dateireihenfolge |
| `shngItems.diagnostics` | Prüfungen an/aus |

Befehlsnamen und die Beschreibungen der Einstellungen erscheinen in der Anzeigesprache von VS Code, weil VS Code sie
nicht zur Laufzeit ändern lässt; alles andere folgt `shngItems.language`.

## Übersetzungen

Die Texte stehen in `lib/l10n/<sprache>.json` (Ansichten, Tooltips, Autovervollständigung, Meldungen) und
`package.nls.<sprache>.json` (Befehle und Einstellungen). Fehlende Schlüssel fallen auf Englisch zurück.

## Entwicklung

```powershell
.\build.ps1 -Install    # baut die .vsix ohne Node.js und installiert sie lokal
```

Danach VS Code neu laden (`Developer: Reload Window`). Veröffentlichen: siehe [PUBLISHING.md](PUBLISHING.md).

Test des Modells ohne VS Code:

```bash
ELECTRON_RUN_AS_NODE=1 "<VS Code>/Code.exe" test/smoke.js <SmartHomeNG-Verzeichnis> eg.bad.licht
```

# SmartHomeNG Items per VS Code

![](https://flagcdn.com/20x15/gb.png) [English](README.md) &nbsp;
![](https://flagcdn.com/20x15/de.png) [Deutsch](README.de.md) &nbsp;
![](https://flagcdn.com/20x15/fr.png) [Français](README.fr.md) &nbsp;
![](https://flagcdn.com/20x15/es.png) [Español](README.es.md)

Crea e gestisci i tuoi item [SmartHomeNG](https://www.smarthomeng.de) in modo rapido ed efficiente:

- Cerca, ordina e filtra gli item della tua configurazione SmartHomeNG
- Naviga in modo efficiente nella tua configurazione
- Modifica ed estendi la tua configurazione con il completamento automatico contestuale e il supporto YAML
- Integra il tuo progetto KNX e trova gli indirizzi di gruppo senza uscire da VS Code

## Funzionalità

- **Albero degli item** (barra delle attività → SmartHomeNG): tutti gli item con tipo, indirizzi di gruppo KNX
  (`→` send, `←` listen, `⇐` init), ID Hue, `ƒ` per eval, `⏲` per UZSU e lo struct utilizzato. Gli item che esistono
  solo tramite uno struct sono viola, gli attributi provenienti da struct grigi. Un clic apre la definizione in `items/`.
- **Tooltip** con tutti gli attributi (inclusa l'origine dallo struct) e link alle definizioni.
- **Filtri**: un chip per ogni plugin configurato (letto da `etc/plugin.yaml` e dagli `item_attributes` dei plugin),
  categorie aggiuntive (eval, temporizzazione, cache) e tipi di item (bool, num, …). Plugin/categorie combinati con E,
  tipi con O. Si applica alla ricerca e all'albero degli item.
- **Ricerca** (Ctrl+Shift+Alt+I): risultati in tempo reale su percorso, nome e attributi; ricerca per schema come
  `baddim` → `eg.bad.licht.spiegel.dimmen`; ordinata per numero di frammenti e inizi di parola; i risultati nascosti dal
  filtro compaiono sotto un separatore; gli item che esistono solo tramite uno struct sono in fondo.
- **Completamento automatico** in `items/*.yaml`, `structs/*.yaml` e `logics/*.py`:
  - sotto-item (da item con lo stesso nome o alla stessa profondità, figli di struct da estendere)
  - attributi (nucleo di SmartHomeNG e `item_attributes` dei plugin configurati, incluso `@istanza`)
  - valori (`type`, nomi degli struct, `valid_list` dei plugin, valori già usati)
  - percorsi di item per `eval_trigger`, `hysteresis_input`, la destinazione di `on_change`/`on_update` e `sh.` nelle
    espressioni – assoluti e relativi (`..fratello`, `.figlio`, `...zio`, `.self`)
  - ordinati in base a ciò che compare insieme negli item esistenti (ad es. `type: bool` → `knx_dpt` → `1`)
- **KNX / ETS** (impostazione `shngItems.knxProject`): `knx_send`, `knx_listen`, … propongono gli indirizzi di gruppo
  adatti dal progetto ETS (nome e gruppi ↔ percorso dell'item, DPT ↔ `type`/`knx_dpt`, indirizzi di stato per
  `knx_listen`) più il prossimo indirizzo libero del gruppo; `knx_dpt` riprende il DPT da ETS; passando il mouse su un
  indirizzo di gruppo si vedono nome ETS, gruppi, DPT e tutti gli item che lo usano.
- **Panoramica item** (icona tabella): tabella ordinabile e filtrabile di tutti gli item.
- **Hover e Vai alla definizione (F12)** per i percorsi degli item in YAML, Python (logiche) e HTML (smartVISU).
- **Diagnostica**: struct sconosciuti, `eval_trigger` verso item inesistenti, riferimenti `sh.*` sconosciuti in
  `eval`/`on_change`/`on_update`.
- Menu contestuale: copia percorso item, trova utilizzi; nell'editor: «Mostra item nell'albero».

## Requisiti

Un'installazione SmartHomeNG (una cartella che contiene `items/`) nell'area di lavoro, oppure l'impostazione
`shngItems.basePath`, ad es. per una condivisione di rete `\\smarthomeng\SmartHomeNG`. Per i suggerimenti KNX, un
progetto ETS (`.knxproj`) esportato **senza password**.

## Impostazioni

| Impostazione | Significato |
|---|---|
| `shngItems.language` | lingua dell'interfaccia: `en` (predefinita), `de`, `es`, `fr`, `it`, `nl` o `auto` (lingua di VS Code) |
| `shngItems.basePath` | directory di SmartHomeNG se non fa parte dell'area di lavoro |
| `shngItems.knxProject` | percorso del progetto ETS (`.knxproj`) per indirizzi di gruppo, DPT e hover |
| `shngItems.categories` | categorie di filtro aggiuntive non legate a un plugin (nome → nomi degli attributi, `*` = prefisso) |
| `shngItems.showAttributes` | mostra gli attributi come nodi figli nell'albero |
| `shngItems.showStructItems` | mostra gli item creati da struct |
| `shngItems.sortAlphabetically` | ordine alfabetico invece dell'ordine dei file |
| `shngItems.diagnostics` | attiva/disattiva la diagnostica |

I nomi dei comandi e le descrizioni delle impostazioni sono mostrati nella lingua di VS Code (VS Code non consente a
un'estensione di modificarli durante l'esecuzione); tutto il resto segue `shngItems.language`.

## Traduzioni

I testi si trovano in `lib/l10n/<lingua>.json` (viste, tooltip, completamento automatico, messaggi) e
`package.nls.<lingua>.json` (comandi e impostazioni). Le chiavi mancanti ricadono sull'inglese. Correzioni e nuove
lingue sono benvenute come pull request.

## Licenza

[MIT](LICENSE)

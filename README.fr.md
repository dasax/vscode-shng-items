# SmartHomeNG Items pour VS Code

![](https://flagcdn.com/20x15/gb.png) [English](README.md) &nbsp;
![](https://flagcdn.com/20x15/de.png) [Deutsch](README.de.md) &nbsp;
![](https://flagcdn.com/20x15/es.png) [Español](README.es.md) &nbsp;
![](https://flagcdn.com/20x15/it.png) [Italiano](README.it.md)

Créez et gérez vos items [SmartHomeNG](https://www.smarthomeng.de) rapidement et efficacement :

- Recherchez, triez et filtrez les items de votre configuration SmartHomeNG
- Naviguez efficacement dans votre configuration
- Modifiez et complétez votre configuration grâce à l'autocomplétion contextuelle et à la prise en charge de YAML
- Intégrez votre projet KNX et trouvez les adresses de groupe sans quitter VS Code

## Fonctionnalités

- **Arborescence des items** (barre d'activité → SmartHomeNG) : tous les items avec type, adresses de groupe KNX
  (`→` send, `←` listen, `⇐` init), ID Hue, `ƒ` pour eval, `⏲` pour UZSU et le struct utilisé. Les items qui n'existent
  que par un struct sont violets, les attributs issus de structs gris. Un clic ouvre la définition dans `items/`.
- **Info-bulle** avec tous les attributs (y compris leur struct d'origine) et des liens vers les définitions.
- **Filtres** : une puce par plugin configuré (lu depuis `etc/plugin.yaml` et les `item_attributes` des plugins),
  catégories supplémentaires (eval, minuterie, cache) et types d'items (bool, num, …). Plugins/catégories combinés
  par ET, types par OU. S'applique à la recherche et à l'arborescence.
- **Recherche** (Ctrl+Shift+Alt+I) : résultats en direct sur le chemin, le nom et les attributs ; recherche par motif
  comme `baddim` → `eg.bad.licht.spiegel.dimmen` ; classement par nombre de fragments et débuts de mots ; les résultats
  masqués par le filtre apparaissent sous un séparateur ; les items issus uniquement d'un struct viennent en dernier.
- **Autocomplétion** dans `items/*.yaml`, `structs/*.yaml` et `logics/*.py` :
  - sous-items (d'items du même nom ou de même profondeur, enfants de struct à étendre)
  - attributs (cœur de SmartHomeNG et `item_attributes` des plugins configurés, y compris `@instance`)
  - valeurs (`type`, noms de structs, `valid_list` des plugins, valeurs déjà utilisées)
  - chemins d'items pour `eval_trigger`, `hysteresis_input`, la cible de `on_change`/`on_update` et `sh.` dans les
    expressions – absolus et relatifs (`..frere`, `.enfant`, `...oncle`, `.self`)
  - classés selon ce qui apparaît ensemble dans vos items existants (p. ex. `type: bool` → `knx_dpt` → `1`)
- **KNX / ETS** (paramètre `shngItems.knxProject`) : `knx_send`, `knx_listen`, … proposent les adresses de groupe
  correspondantes du projet ETS (nom et groupes ↔ chemin de l'item, DPT ↔ `type`/`knx_dpt`, adresses d'état pour
  `knx_listen`) ainsi que la prochaine adresse libre du groupe ; `knx_dpt` reprend le DPT de l'ETS ; le survol d'une
  adresse de groupe affiche son nom ETS, ses groupes, son DPT et tous les items qui l'utilisent.
- **Vue d'ensemble des items** (icône tableau) : tableau triable et filtrable de tous les items.
- **Survol et Atteindre la définition (F12)** pour les chemins d'items en YAML, Python (logiques) et HTML (smartVISU).
- **Diagnostics** : structs inconnus, `eval_trigger` vers des items inexistants, références `sh.*` inconnues dans
  `eval`/`on_change`/`on_update`.
- Menu contextuel : copier le chemin de l'item, rechercher les utilisations ; dans l'éditeur : « Afficher l'item dans
  l'arborescence ».

## Prérequis

Une installation SmartHomeNG (un dossier contenant `items/`) dans l'espace de travail, ou le paramètre
`shngItems.basePath`, p. ex. pour un partage réseau `\\smarthomeng\SmartHomeNG`. Pour les propositions KNX, un projet
ETS (`.knxproj`) exporté **sans mot de passe**.

## Paramètres

| Paramètre | Signification |
|---|---|
| `shngItems.language` | langue de l'interface : `en` (par défaut), `de`, `es`, `fr`, `it`, `nl` ou `auto` (langue d'affichage de VS Code) |
| `shngItems.basePath` | répertoire SmartHomeNG s'il ne fait pas partie de l'espace de travail |
| `shngItems.knxProject` | chemin du projet ETS (`.knxproj`) pour les adresses de groupe, le DPT et le survol |
| `shngItems.categories` | catégories de filtre supplémentaires non liées à un plugin (nom → noms d'attributs, `*` = préfixe) |
| `shngItems.showAttributes` | afficher les attributs comme nœuds enfants dans l'arborescence |
| `shngItems.showStructItems` | afficher les items créés par des structs |
| `shngItems.sortAlphabetically` | tri alphabétique au lieu de l'ordre des fichiers |
| `shngItems.diagnostics` | activer/désactiver les diagnostics |

Les noms des commandes et les descriptions des paramètres s'affichent dans la langue d'affichage de VS Code (VS Code ne
permet pas à une extension de les modifier à l'exécution) ; tout le reste suit `shngItems.language`.

## Traductions

Les textes se trouvent dans `lib/l10n/<langue>.json` (vues, info-bulles, autocomplétion, messages) et
`package.nls.<langue>.json` (commandes et paramètres). Les clés manquantes reviennent à l'anglais. Corrections et
nouvelles langues bienvenues sous forme de pull requests.

## Licence

[MIT](LICENSE)

# Veröffentlichen

Die Extension kann im **Visual Studio Marketplace** (Standard in VS Code) und bei **Open VSX** (VSCodium, Cursor, …)
veröffentlicht werden. Beides ist kostenlos. `build.ps1` ist nur für die lokale Installation gedacht – zum
Veröffentlichen werden die offiziellen Werkzeuge `vsce` bzw. `ovsx` verwendet, die Node.js brauchen.

## 1. Einmalig: Node.js installieren

```powershell
winget install OpenJS.NodeJS.LTS
```

Danach ein neues Terminal öffnen und mit `node -v` und `npx -v` prüfen.

## 2. Empfohlen: öffentliches Repository

Der Marketplace verlinkt das Repository auf der Seite der Extension und löst relative Links in der README darüber auf.

1. Auf GitHub ein leeres Repository anlegen, z.B. `vscode-shng-items`.
2. In `package.json` ergänzen (`<user>` ersetzen):
   ```json
   "repository": { "type": "git", "url": "https://github.com/<user>/vscode-shng-items.git" },
   "bugs": { "url": "https://github.com/<user>/vscode-shng-items/issues" },
   "homepage": "https://github.com/<user>/vscode-shng-items#readme",
   ```
3. Hochladen:
   ```powershell
   git remote add origin https://github.com/<user>/vscode-shng-items.git
   git push -u origin master
   ```

Ohne Repository geht es auch – dann bei `vsce` zusätzlich `--allow-missing-repository` angeben.

## 3. Visual Studio Marketplace

1. Unter <https://marketplace.visualstudio.com/manage> mit einem Microsoft-Konto anmelden und einen Publisher anlegen.
   Die **ID muss `dasax` sein** (wie `publisher` in `package.json`) – oder `publisher` entsprechend ändern.
2. Unter <https://dev.azure.com> (gleiches Konto) eine Organisation anlegen und ein **Personal Access Token** erzeugen:
   Organization = *All accessible organizations*, Scope = *Marketplace → Manage*.
3. Paket bauen und prüfen:
   ```powershell
   npx @vscode/vsce package
   ```
   Das erzeugt `shng-items-<version>.vsix`. Welche Dateien drin sind, zeigt `npx @vscode/vsce ls`
   (gesteuert über `.vscodeignore`).
4. Veröffentlichen:
   ```powershell
   npx @vscode/vsce login dasax      # fragt nach dem Token
   npx @vscode/vsce publish
   ```
   Die Extension erscheint nach einigen Minuten unter
   `https://marketplace.visualstudio.com/items?itemName=dasax.shng-items`.

## 4. Open VSX

1. Unter <https://open-vsx.org> mit GitHub anmelden, im Profil das *Publisher Agreement* bestätigen und unter
   *Access Tokens* ein Token erzeugen.
2. Einmalig den Namespace anlegen, dann das in Schritt 3 gebaute Paket hochladen:
   ```powershell
   npx ovsx create-namespace dasax -p <token>
   npx ovsx publish shng-items-0.1.0.vsix -p <token>
   ```

## Updates

1. Änderungen in `CHANGELOG.md` eintragen.
2. Version erhöhen und veröffentlichen:
   ```powershell
   npx @vscode/vsce publish patch     # 0.1.0 -> 0.1.1 (minor/major analog), setzt auch das Git-Tag
   npx ovsx publish shng-items-<neue Version>.vsix -p <token>
   ```

## Vorher klären

- Den Namen „SmartHomeNG“ verwendet die Extension im Titel – kurz im
  [Forum](https://knx-user-forum.de/forum/supportforen/smarthome-py) bzw. bei den Entwicklern nachfragen, ob das in
  Ordnung ist.

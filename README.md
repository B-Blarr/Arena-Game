# ⚡ NEON ARENA

Ein 3D-Arena-Survival-Roguelite im Neon-Look — überlebe immer härtere Gegner-Wellen,
sammle Upgrades, besiege Bosse und schalte dauerhaft neue Helden frei.

Gebaut mit [Vite](https://vitejs.dev), [TypeScript](https://www.typescriptlang.org) und
[three.js](https://threejs.org). Grafik und Sound sind komplett im Code erzeugt
(prozedural) — keine externen Assets, keine Lizenzfragen.

---

## 🚀 So startest du das Spiel (auch ohne Vorwissen)

**Einmalig vorbereiten:**

1. Installiere [Node.js](https://nodejs.org) (Version 20 oder neuer, die „LTS"-Version reicht).
2. Öffne ein Terminal (Windows: `cmd` oder PowerShell) **in diesem Ordner**.
3. Tippe ein und drücke Enter:

   ```
   npm install
   ```

   (lädt einmalig die Bibliotheken herunter, dauert eine halbe Minute)

**Spielen:**

```
npm run dev
```

Danach im Browser **http://localhost:5173** öffnen — fertig. Zum Beenden im Terminal `Strg+C` drücken.

**Für eine feste Version zum Weitergeben** (statischer Build im Ordner `dist/`):

```
npm run build
npm run preview
```

---

## 🎮 Steuerung

| Taste | Aktion |
|---|---|
| **W A S D** oder **Pfeiltasten** | Laufen |
| **Leertaste** | Dash (kurzer Sprint, macht kurz unverwundbar) |
| **Maus** | Zielen (nur wenn „Auto-Zielen" im Menü auf **Aus** steht — dann gibt's +10 % Schaden!) |
| **P** oder **Esc** | Pause |
| **1 / 2 / 3** | Upgrade-Karte wählen |
| **R** | Nach „Runde vorbei" sofort neu starten |

Geschossen wird **automatisch** — auch das Zielen übernimmt das Spiel
(„Auto-Zielen", standardmäßig an).

**🎮 Gamepad** (Xbox-Layout, einfach anstecken):

| Eingabe | Aktion |
|---|---|
| **Linker Stick** | Laufen |
| **Rechter Stick** | Zielen (bei Auto-Zielen aus) |
| **A** oder **RT** | Dash · in Menüs: Bestätigen |
| **B** | In Menüs: Zurück |
| **Steuerkreuz / linker Stick** | In Menüs: Auswahl bewegen |
| **Y** | Upgrade-Wahl: Neu würfeln |
| **Start** | Pause |

Das komplette Spiel ist ohne Maus bedienbar; bei Treffern und Boss-Stampfern
vibriert der Controller (abschaltbar in der Pause unter „Vibration").
Wird ein Controller im Spiel abgezogen, pausiert das Spiel automatisch.

**🤝 Zu zweit** (Knopf „Zusammen" im Menü): Spieler 2 drückt einfach seine
Dash-Taste zum Beitreten — zweites Gamepad, oder Pfeiltasten + rechte
Umschalttaste/Enter, während Spieler 1 WASD + Leertaste behält.

## 🕹️ So funktioniert's

1. **Überlebe die Welle** — Gegner kommen von den Rändern.
2. **Wähle nach jeder Welle 1 von 3 Upgrades** — sie stapeln sich und formen deinen Build.
3. **Alle 5 Wellen wartet ein Boss** (PRISMA, GOLIATH, HYDRA-KERN …) mit eigenen Angriffsmustern — die roten Markierungen am Boden zeigen, wo es gleich gefährlich wird.
4. **Sammle Kerne ⬡** — die behältst du für immer und kaufst davon in der **Werkstatt** neue Helden (BLITZ, BROCKEN), Startwaffen und dauerhafte Boni.

**Tipp für den Anfang:** Schwierigkeit „Einfach" wählen, in Bewegung bleiben,
und Rot heißt immer: ausweichen! „Schwer" schaltest du frei, wenn du auf
„Normal" Welle 10 erreichst. In der **Tages-Arena** spielen alle weltweit
dieselben Wellen — jeden Tag neue.

## ✨ Was ist neu (Update 3 „Zusammen spielen")

- **Lokaler 2-Spieler-Koop** 🤝 — der Knopf „Zusammen" im Menü: gleiche
  Arena, geteilte Kamera (zoomt automatisch raus, wenn ihr euch trennt),
  jeder mit eigenem Helden, eigenen Upgrades und eigener Lebensleiste.
  Wer fällt, geht **zu Boden** statt zu sterben — der Partner stellt sich
  kurz dazu und hilft wieder auf. Verloren ist erst, wenn beide gleichzeitig
  liegen; am Wellenende stehen sowieso alle wieder. Spieler 2 kann ein
  eigenes Profil mitbringen (bekommt Kerne, Sticker und Koop-Bestwerte
  gutgeschrieben) oder als Gast spielen.
- **Volle Gamepad-Unterstützung** 🎮 — vom Menü bis zum Upgrade-Screen
  komplett ohne Maus spielbar, mit Controller-Vibration und automatischer
  Pause, wenn ein Pad abgezogen wird. Zwei Pads für den Koop, oder
  Tastatur-Hälften (WASD gegen Pfeiltasten).
- **Sticker-Album** 📔 — 54 Sammel-Sticker auf 7 Seiten, von „Erster
  Funke" bis „Schlächter III" (20.000 Gegner), inklusive 6 geheimer
  Rätsel-Sticker. Volle Seiten geben Belohnungen: Kerne und **neue
  Farbvarianten** für die Helden (im Menü unter der Heldenreihe wählbar,
  färben auch Schüsse und Dash-Spur um). Wer ALLE 54 sammelt, schaltet
  die Gold-Farbe frei. Fortschritt zählt pro Profil und über alle Runden.

## ✨ Update 2 „Bosse, Spieler, Balance"

- **Zwei neue Bosse:** **MINOS**, der Minenkönig (Welle 15) — ein rasender
  oranger Ring, der die Arena mit tickenden Sprengzonen pflastert; und
  **WIRBEL** (Welle 25) — ein blauer Strudel, der dich ansaugt, während
  Spiralen nach außen fliegen. HYDRA-KERN rückt auf Welle 20.
- **GOLIATH aufgemotzt:** Jeder Wandaufprall schleudert jetzt Trümmersteine
  zurück, in Phase 2 prallt sein Sturmangriff wie eine Billardkugel von der
  Wand ab und die Schockwelle kommt doppelt. Dafür lohnt sich das
  Betäubungsfenster mehr (doppelter Schaden).
- **Spieler-Profile** 👤 — oben links im Menü auf den Namen klicken:
  Jeder am Rechner bekommt sein eigenes Spielstand-Profil (Kerne,
  Freischaltungen, Bestwerte). Dazu die **Bestenliste** 🏆, die alle
  Spieler vergleicht.
- **Jeder Held sieht jetzt anders aus:** VOLT als Pfeiljäger mit Flossen,
  BLITZ als schlanker Speeder mit Pfeilflügeln, BROCKEN als breiter
  Panzer-Keil mit Schulterplatten — inklusive Triebwerks-Glühen, das beim
  Dash aufflammt. Die Vorschau im Menü wechselt live.
- **Schwarzes Loch neu:** Der Dash schleudert jetzt eine sichtbare
  Singularität voraus, die Gegner in einen Knäuel saugt und dann explodiert.
- **Balance:** Legendäre Karten sind seltener (dafür bleibt jeder Fund ein
  Fest), und Heilung ist knapper — Lebensraub, Herzen und Boss-Heilung
  wurden gestutzt, damit die Lebensleiste wieder etwas bedeutet.
  Auf „Einfach" bleibt alles so gnädig wie vorher.

## ✨ Update 1 („Viel cooler")

- **Legendäre Upgrades** 🌟 — eine vierte, extrem seltene Karten-Stufe über
  „Episch". Sechs Stück gibt es: Spiegelklon, Kettenreaktion, Orbital-Laser,
  Schwarzes Loch, Überladung und Mega-Kugeln. Wenn eine goldene Karte
  auftaucht, ist das ein Ereignis — greif zu!
- **Neue Gegner:** der rote **Zünder** (wegrennen, wenn er blinkt!), der
  silberne **Kern-Dieb** (klaut liegende Kerne — erwisch ihn, bevor er
  entkommt, dann gibt's alles plus Bonus zurück) und das violette
  **Phantom** (teleportiert sich an deine Flanke).
- **Elite-Gegner** ★ — seltene, größere Varianten mit goldenem Ring am Boden.
  Manche haben einen Schild (erster Treffer prallt ab), manche werden
  wütend und schneller. Dafür lassen sie garantiert Extra-Beute fallen.
- **Überraschungen:** ab und zu kommt eine **Goldene Welle** (doppelte
  Kerne!) oder eine **Versorgungskapsel** landet in der Arena — einsammeln
  lohnt sich (Kern-Regen, Extra-Herzen, Magnet oder Turbofeuer).
- **Neue Optik:** die Arena wechselt alle 5 Wellen ihre Farbwelt
  (Cyan-Nacht, Magenta-Dämmerung, Matrix-Smaragd, Blau-Eis, Gold-Inferno),
  Projektile ziehen Leuchtspuren, Bosse bekommen einen dramatischen Auftritt,
  und dein Dash hinterlässt Geisterbilder.
- **Für Tüftler:** der „Runde vorbei"-Bildschirm zeigt jetzt deinen Build,
  Schaden pro Sekunde, stärksten Treffer und beste Combo.

Auf „Einfach" bleibt alles kindertauglich: neue Gegner kommen dort später
und sanfter, Überraschungen sind fast nur Belohnungen.

## 🧰 Technik-Überblick

- **60-FPS-Architektur:** Fixed-Timestep-Simulation (60 Hz) mit Render-Interpolation, Objekt-Pools, InstancedMesh-Rendering, Spatial-Hash-Kollisionen — keine Allokationen im Spiel-Loop, keine Memory-Leaks bei langen Sitzungen.
- **Neon-Look:** HDR-Emissive-Materialien + Mipmap-Bloom (pmndrs `postprocessing`), prozedurale Grid-Texturen.
- **Sound:** komplett per Web Audio API synthetisiert (Sequencer-Musik, die mit den Wellen schneller wird).
- **Speicherstand:** `localStorage` (Bestwerte pro Schwierigkeit, Kerne, Freischaltungen, Einstellungen).
- **Balancing:** alle Zahlen zentral in `src/config/` — zum Experimentieren einfach dort drehen.

Viel Spaß in der Arena! 🖤

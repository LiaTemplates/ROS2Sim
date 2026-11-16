<!--
author:   Sebastian Zug & Claude Code (Opus 5.5) mit LiaScript Teaching-Agent
email:    sebastian.zug@informatik.tu-freiberg.de
version:  0.5.1
repository: https://github.com/LiaTemplates/ROS2Sim
language: de
narrator: Deutsch Female
comment:  Simulierter ROS-2-Graph (Jazzy) im Browser: Terminals mit Vervollständigung, ros2-Befehle, turtlesim und Live-Graph – um Publish/Subscribe ohne Installation auszuprobieren.

script:   ./ros2sim-help.js
          ./ros2sim.js

@ROS2.terminal: @ROS2.terminal_(@uid,@0,@1)

@ROS2.terminal_
<ros2-terminal sid="@0" title="@1" cmd="@2"></ros2-terminal>
@end

@ROS2.steps: @ROS2.steps_(@uid,@0,```@1```)

@ROS2.steps_
<ros2-terminal sid="@0" title="@1"></ros2-terminal>
<script>(function set () { if (window.ROS2Sim) window.ROS2Sim.setSteps("@0", "@'2"); else setTimeout(set, 100) })(); ""</script>
@end

@ROS2.desk: @ROS2.desk_(@uid,@uid)

@ROS2.desk_
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:.6em">
<ros2-terminal sid="@0" title="Terminal 1" rows="12"></ros2-terminal>
<ros2-terminal sid="@1" title="Terminal 2" rows="12"></ros2-terminal>
</div>
<ros2-graph></ros2-graph>
@end

@ROS2.graph: <ros2-graph></ros2-graph>

@ROS2.turtlesim: <ros2-turtlesim></ros2-turtlesim>

@ROS2.reset: <ros2-reset></ros2-reset>

@ROS2.bag: <ros2-bag name="@0" src="@1"></ros2-bag>

@ROS2.rviz: <ros2-rviz></ros2-rviz>

@ROS2.rviz.with: <ros2-rviz fixed-frame="@0" displays="@1"></ros2-rviz>

@ROS2.robot: <ros2-robot domain="@0"></ros2-robot>

@ROS2.robot.with: <ros2-robot domain="@0" lidar="@1" cmd-vel="@2"></ros2-robot>

@ROS2.bashrc
<script>(function set () { if (window.ROS2Sim) window.ROS2Sim.setBashrc("@'0"); else setTimeout(set, 100) })(); ""</script>
@end
-->

# ROS2Sim – ROS 2 im Browser

Dieses Template simuliert einen ROS-2-Graphen (Jazzy) direkt im Browser. Es eignet sich für erste Versuche mit Publish/Subscribe, ohne dass ROS 2 installiert sein muss.

* __Terminals__ verstehen ausgewählte `ros2`-Befehle. Sie vervollständigen Paket-, Knoten-, Topic- und Typnamen aus dem laufenden Graphen und zeigen dabei an, welches Argument als Nächstes erwartet wird.
* __Graph-Ansicht__ wie `rqt_graph`, live aktualisiert. Nachrichten laufen als Punkte über die Kanten.
* __turtlesim__ mit `turtlesim_node` und `turtle_teleop_key`, mit Parametern, Services und der Action `rotate_absolute`.
* __Werkzeuge:__ `ros2 topic`, `node`, `param`, `service`, `action`, `bag`, `interface`, `pkg`.
* __tf und RViz:__ `tf2_echo`, `static_transform_publisher` und eine RViz-Draufsicht mit LaserScan, Odometry, Pose, Path und TF.
* __Mit dem Roboter verbinden:__ ein simulierter TurtleBot3 als eigener Rechner im WLAN, `ROS_DOMAIN_ID` und `ROS_AUTOMATIC_DISCOVERY_RANGE` je Terminal, `~/.bashrc`, `ros2 daemon`, `view_frames`.
* __Bagdateien__ im MCAP-Format wie unter Jazzy: aufnehmen, untersuchen, abspielen. Vorbereitete Aufnahmen lassen sich einbinden, auch mit Typen wie `sensor_msgs/msg/LaserScan`.

Alle Terminals einer Seite teilen sich einen Graphen, wie Terminals auf einem Rechner. Beim Wechsel der Folie werden alle Programme beendet: Jede Folie beginnt mit einem leeren ROS-Graphen.

> **Woran man erkennt, was echt ist:** Ausgaben, die wie ROS aussehen, wurden an ROS 2 Jazzy mitgeschnitten (`test/captures/`). Was die Simulation selbst sagt, beginnt mit ℹ und ist kursiv in Türkis gesetzt.

__Einbinden:__

Feste Version (empfohlen für Kurse, die ein Semester lang gleich bleiben sollen):

```
import: https://raw.githubusercontent.com/LiaTemplates/ROS2Sim/0.5.1/README.md
```

Immer der neueste Stand:

```
import: https://raw.githubusercontent.com/LiaTemplates/ROS2Sim/main/README.md
```

Quelltext: https://github.com/LiaTemplates/ROS2Sim

## Erste Schritte

@ROS2.terminal(Terminal,ros2 run demo_nodes_cpp talker)

1. Drücke im Terminal __Enter__. Der vorbereitete Befehl startet den Knoten `talker`.
2. Beende ihn mit __Strg+C__ (oder dem Knopf oben rechts).
3. Tippe `ros2 to` und drücke __Tab__. Unten erscheinen Vorschläge mit Erklärung, darüber steht, welches Argument gerade dran ist.

| Taste / Knopf  | Wirkung                                            |
| -------------- | -------------------------------------------------- |
| __Tab__        | vervollständigen, zweimal: Vorschläge durchblättern |
| __→__          | grau angezeigten Vorschlag übernehmen              |
| __↑ / ↓__      | frühere Befehle                                    |
| __Strg+C__     | laufendes Programm beenden                         |
| __Strg+L__     | Bildschirm leeren                                  |
| __⧉ kopieren__ | Befehle ohne Prompt und Ausgabe in die Zwischenablage, zum Nachmachen auf dem eigenen Rechner |

Mit `help` zeigt das Terminal alle nachgebildeten Befehle.

## Sender und Empfänger

@ROS2.desk

1. Starte in Terminal 1 `ros2 run demo_nodes_cpp talker`.
2. Starte in Terminal 2 `ros2 run demo_nodes_py listener`.
3. Beobachte den Graphen: Der Sender kennt den Empfänger nicht, beide kennen nur das Topic `/chatter`.
4. Beende den talker. Was passiert beim listener?

**Prüfe dich:** Starte einen zweiten listener in einem der Terminals (nachdem du dort den laufenden Knoten beendet hast). Wie viele Subscriber meldet `ros2 topic info /chatter` dann?

[[2]]
***
Zwei. `ros2 topic info` zählt jeden Knoten, der das Topic abonniert hat. Ein Werkzeug wie `ros2 topic echo` zählt ebenfalls mit, solange es läuft.
***

## Topics untersuchen

@ROS2.desk

Lass in Terminal 1 einen talker laufen und untersuche das Topic in Terminal 2:

```bash
ros2 topic list -t
ros2 topic info -v /chatter
ros2 topic echo /chatter
ros2 topic hz /chatter
```

Achte im Graphen auf den gestrichelten Knoten `/_ros2cli_…`: `ros2 topic echo` ist selbst ein Subscriber. Mit dem Kästchen „Werkzeug-Knoten“ lässt er sich ausblenden.

## Selbst senden

@ROS2.desk

1. Starte in Terminal 1 einen listener.
2. Sende in Terminal 2 eine einzelne Nachricht. Tippe dazu `ros2 topic pub --once /chatter ` und drücke Tab: Die Vervollständigung schlägt zuerst den Typ des Topics vor und danach eine YAML-Vorlage für die Werte.

```bash
ros2 topic pub --once /chatter std_msgs/msg/String "{data: 'Hallo ROS'}"
```

**Prüfaufgabe:** Bringe einen listener dazu, auf dem Topic `/gespraech` zu hören, und sende dort Nachrichten mit `ros2 topic pub`.

[[!]]
<script>
const st = ROS2Sim.state()
const t = st.topics.find(x => x.name === '/gespraech')
t !== undefined && t.subscribers.includes('/listener') && t.publishers.length > 0
</script>
***
Mit Remapping hört der listener auf ein anderes Topic:

```bash
ros2 run demo_nodes_cpp listener --ros-args -r chatter:=gespraech
ros2 topic pub /gespraech std_msgs/msg/String "{data: 'Hallo'}"
```
***

## turtlesim

<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:.6em;align-items:start">
<div>
@ROS2.terminal(Terminal 1,ros2 run turtlesim turtlesim_node)
@ROS2.terminal(Terminal 2,ros2 run turtlesim turtle_teleop_key)
</div>
<div>
@ROS2.turtlesim
</div>
</div>

@ROS2.graph

1. Starte in Terminal 1 `turtlesim_node`, in Terminal 2 `turtle_teleop_key`.
2. Klicke in Terminal 2 und steuere die Schildkröte mit den Pfeiltasten.
3. Beende den teleop-Knoten und lass die Schildkröte über die Kommandozeile im Kreis fahren:

```bash
ros2 topic pub -r 1 /turtle1/cmd_vel geometry_msgs/msg/Twist "{linear: {x: 2.0}, angular: {z: 1.8}}"
```

## Parameter

<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:.6em;align-items:start">
<div>
@ROS2.terminal(Terminal 1,ros2 run turtlesim turtlesim_node)
@ROS2.terminal(Terminal 2,ros2 param list /turtlesim)
</div>
<div>
@ROS2.turtlesim
</div>
</div>

Parameter sind Einstellungen eines Knotens, die man von außen lesen und ändern kann.

```bash
ros2 param get /turtlesim background_r
ros2 param describe /turtlesim background_r
ros2 param set /turtlesim background_r 150
ros2 param dump /turtlesim
```

Startwerte lassen sich schon beim Starten setzen:

```bash
ros2 run turtlesim turtlesim_node --ros-args -p background_g:=200
```

**Prüfe dich:** Was antwortet `ros2 param set /turtlesim background_r 1.5`?

[( )] `Set parameter successful`, der Wert wird auf 1 abgerundet.
[(X)] Eine Fehlermeldung: Der Parameter hat den Typ integer, ein double ist nicht erlaubt.
[( )] Eine Fehlermeldung: Der Wert liegt außerhalb von 0 bis 255.
***
ROS prüft den Typ eines Parameters, bevor es den Wertebereich prüft. `1.5` wird als `double` gelesen, `background_r` ist als `integer` deklariert.
***

## Services

<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:.6em;align-items:start">
<div>
@ROS2.terminal(Terminal 1,ros2 run turtlesim turtlesim_node)
@ROS2.terminal(Terminal 2,ros2 service list -t)
</div>
<div>
@ROS2.turtlesim
</div>
</div>

Ein Service ist eine Anfrage mit Antwort. Der Aufrufer wartet, bis die Antwort da ist.

```bash
ros2 service call /spawn turtlesim/srv/Spawn "{x: 2.0, y: 2.0, theta: 0.0, name: ''}"
ros2 service call /turtle1/set_pen turtlesim/srv/SetPen "{r: 255, g: 0, b: 0, width: 5, 'off': 0}"
ros2 service call /turtle1/teleport_absolute turtlesim/srv/TeleportAbsolute "{x: 2.0, y: 8.0, theta: 0.0}"
ros2 service call /clear std_srvs/srv/Empty
```

Tippe `ros2 service call /sp` und drücke dreimal Tab: Name, Typ und eine YAML-Vorlage der Anfrage werden ergänzt.

> `'off'` steht in Anführungszeichen, weil YAML ein nacktes `off` als Wahrheitswert liest.

## Actions

<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:.6em;align-items:start">
<div>
@ROS2.terminal(Terminal 1,ros2 run turtlesim turtlesim_node)
@ROS2.terminal(Terminal 2,ros2 run turtlesim turtle_teleop_key)
@ROS2.terminal(Terminal 3,ros2 action list -t)
</div>
<div>
@ROS2.turtlesim
</div>
</div>

Eine Action ist ein Auftrag, der länger dauert. Der Auftraggeber bekommt unterwegs Rückmeldungen (Feedback) und am Ende ein Ergebnis. Er kann den Auftrag auch abbrechen.

* Im teleop-Terminal drehen die Tasten `g b v c d e r t` die Schildkröte auf eine feste Richtung, `f` bricht die Drehung ab. Achte auf die Meldungen in Terminal 1.
* Ein Ziel über die Kommandozeile, mit Zwischenständen:

```bash
ros2 action send_goal --feedback /turtle1/rotate_absolute turtlesim/action/RotateAbsolute "{theta: 1.57}"
```

**Prüfe dich:** Was schreibt turtlesim, wenn du im teleop-Terminal `d` und sofort danach `v` drückst?

[[ ]] `Rotation goal completed successfully` für `d`
[[X]] `Rotation goal received before a previous goal finished. Aborting previous goal`
[[X]] `Rotation goal completed successfully` für `v`
***
Ein neues Ziel verdrängt das laufende. Die Schildkröte bricht die Drehung zu `d` ab und dreht sich zu `v`.
***

## Bagdateien

@[ROS2.bag(fahrt1)](bags/fahrt1.mcap)

@ROS2.desk

Eine Bagdatei speichert Nachrichten mit Zeitstempel, damit man sie später wieder abspielen kann. `fahrt1` wurde unter ROS 2 Jazzy aufgenommen: ein talker und eine turtlesim.

1. Untersuche die Aufnahme: `ros2 bag info fahrt1`
2. Starte in Terminal 1 einen listener und spiele die Aufnahme in Terminal 2 ab: `ros2 bag play fahrt1`
3. Nimm selbst auf: In Terminal 1 läuft ein talker, in Terminal 2 `ros2 bag record --topics /chatter -o meine_aufnahme`. Beende die Aufnahme nach einigen Sekunden mit Strg+C und sieh dir das Ergebnis mit `ls`, `ros2 bag info` und `cat meine_aufnahme/metadata.yaml` an.

Beim Abspielen steuern Tasten das Programm: Leertaste hält an und setzt fort, → schickt im angehaltenen Zustand die nächste Nachricht, ↑ und ↓ ändern die Geschwindigkeit um 10 %.

**Prüfe dich:** Wie viele Nachrichten auf `/turtle1/pose` enthält `fahrt1`?

[[287]]
***
`ros2 bag info fahrt1` listet für jedes Topic die Anzahl der Nachrichten (`Count`). turtlesim sendet die Pose etwa 60-mal pro Sekunde.
***

## tf: Koordinatensysteme

@[ROS2.bag(raumfahrt)](bags/raumfahrt.mcap)

@ROS2.desk

`raumfahrt` enthält die Fahrt eines TurtleBot-ähnlichen Roboters durch einen Raum: Laserscan, Odometrie und die Koordinatensysteme (`/tf`, `/tf_static`). Die Welt ist erfunden, die Aufnahme entstand mit dem echten rosbag2 unter Jazzy (`tools/make_demo_bag.py`).

1. Spiele die Aufnahme in Terminal 1 in Schleife ab: `ros2 bag play raumfahrt -l`
2. Wo sitzt der Laserscanner am Roboter? `ros2 run tf2_ros tf2_echo base_footprint base_scan`
3. Wo ist der Scanner im Raum? `ros2 run tf2_ros tf2_echo odom base_scan` – die Werte ändern sich, weil der Roboter fährt.
4. Lege selbst einen Frame an: `ros2 run tf2_ros static_transform_publisher --x 1.0 --yaw 1.57 --frame-id base_footprint --child-frame-id kamera`

**Prüfe dich:** In welcher Höhe über dem Boden sitzt der Laserscanner (z in Metern)?

[[0.182]]
***
`tf2_echo base_footprint base_scan` zeigt die Translation `[-0.032, 0.000, 0.182]`: 3,2 cm hinter der Mitte und 18,2 cm über dem Boden – wie beim TurtleBot3 Burger.
***

## RViz

@[ROS2.bag(raumfahrt)](bags/raumfahrt.mcap)

<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:.6em">
@ROS2.terminal(Terminal 1,ros2 run rviz2 rviz2)
@ROS2.terminal(Terminal 2,ros2 bag play raumfahrt -l)
</div>

@ROS2.rviz

1. Starte RViz in Terminal 1 und die Aufnahme in Terminal 2.
2. RViz meldet `Fixed Frame [map] does not exist`: Die Aufnahme kennt kein `map`. Wähle als Fixed Frame `odom`.
3. Füge über „＋ Display“ die Anzeigen `TF`, `Odometry` auf `/odom` und `LaserScan` auf `/scan` hinzu.
4. Der Laserscan bleibt leer. Lies die Statuszeile und Terminal 1 – und behebe das Problem.

**Prüfe dich:** Warum zeigt RViz den Laserscan zunächst nicht an?

[( )] Der Laserscanner liegt in einem anderen Frame als `odom`.
[(X)] Der Scanner sendet mit QoS `Best Effort`, RViz abonniert mit `Reliable` – die Einstellungen sind unverträglich.
[( )] Die Aufnahme enthält auf `/scan` keine Nachrichten.
***
Sensordaten werden oft mit `Best Effort` gesendet: Eine verlorene Messung wird nicht wiederholt, die nächste kommt ohnehin gleich. Ein `Reliable`-Abonnent bekommt von einem `Best Effort`-Publisher nichts. In RViz stellt man deshalb beim LaserScan die *Reliability Policy* auf `Best Effort`.
***

## Mit dem Roboter verbinden

```bash @ROS2.bashrc
source /opt/ros/jazzy/setup.bash
export ROS_AUTOMATIC_DISCOVERY_RANGE=LOCALHOST
```

@ROS2.robot(23)

<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:.6em">
@ROS2.terminal(Terminal 1)
@ROS2.terminal(Terminal 2)
</div>

Die Ausgangslage entspricht dem Stand nach Ü 1: In der `~/.bashrc` steht noch `LOCALHOST` aus Aufgabe 5. Der TurtleBot eurer Gruppe arbeitet mit `ROS_DOMAIN_ID=23`, seine Treiber starten von selbst.

1. `ros2 topic list` zeigt nur `/parameter_events` und `/rosout`. Prüfe mit `printenv | grep ROS`, warum.
2. Stelle die Domain ein: erst in diesem Terminal, dann dauerhaft mit `echo 'export ROS_DOMAIN_ID=23' >> ~/.bashrc`. Was zeigt Terminal 2?
3. Der Roboter bleibt unsichtbar, solange `LOCALHOST` gilt – und auch noch danach, solange der ros2-Daemon mit der alten Einstellung läuft (`ros2 daemon stop`).
4. Fahre den Roboter ein Stück vorwärts. Welchen Nachrichtentyp erwartet er auf `/cmd_vel`?
5. Erzeuge den tf-Baum mit `ros2 run tf2_tools view_frames` und öffne ihn mit `xdg-open frames_….pdf`.

**Prüfaufgabe:** Fahre den Roboter mindestens 0,5 m nach vorn.

[[!]]
<script>
const r = ROS2Sim.sim.robots.get('turtlebot')
r !== undefined && r.x > 0.5
</script>
***
```bash
export ROS_DOMAIN_ID=23
export ROS_AUTOMATIC_DISCOVERY_RANGE=SUBNET
ros2 daemon stop
ros2 topic type /cmd_vel
ros2 topic pub --once /cmd_vel geometry_msgs/msg/TwistStamped "{twist: {linear: {x: 0.2}}}"
```

Unter Jazzy erwartet der TurtleBot3 `TwistStamped`. Ein `Twist` auf `/cmd_vel` wird ohne Fehlermeldung ignoriert. Der Burger hält die letzte Geschwindigkeit, bis ein neuer Befehl kommt: Anhalten mit `{twist: {linear: {x: 0.0}}}`.
***

## Vorführmodus

Ein Codeblock mit `@ROS2.steps` wird zu einem Terminal mit Schrittfolge. Der Knopf „▶ Schritt“ trägt den nächsten Befehl ein, die Lernenden lösen ihn mit Enter selbst aus.

```bash @ROS2.steps(Vorführung)
ros2 run demo_nodes_cpp talker --ros-args -r __node:=sender
```

```bash @ROS2.steps(Beobachtung)
ros2 node list
ros2 node info /sender
ros2 topic echo --once /chatter
```

@ROS2.graph

## Makros

| Makro                                   | Wirkung                                                                    |
| --------------------------------------- | -------------------------------------------------------------------------- |
| `@ROS2.terminal(Titel,Befehl)`          | ein Terminal; `Befehl` steht vorbereitet in der Eingabezeile (optional)    |
| ```` ```bash @ROS2.steps(Titel) ````    | Terminal mit Schrittfolge aus dem Codeblock (eine Zeile je Schritt)        |
| `@ROS2.desk`                            | zwei Terminals nebeneinander und darunter der Graph                        |
| `@ROS2.graph`                           | Live-Graph wie `rqt_graph`, Klick auf Knoten/Topic zeigt Details            |
| `@ROS2.turtlesim`                       | turtlesim-Fenster (zeigt den zuletzt gestarteten `turtlesim_node`)         |
| `@ROS2.reset`                           | Knopf, der alle Programme beendet und den Graphen leert                    |
| `@[ROS2.bag(name)](datei.mcap)`         | stellt eine MCAP-Bagdatei als Ordner `name` bereit (für `ros2 bag info/play`) |
| `@ROS2.robot(23)`                        | simulierter TurtleBot3 Burger als eigener Rechner im WLAN mit `ROS_DOMAIN_ID` 23; Knoten wie unter Jazzy, fährt im Raum der Aufnahme `raumfahrt` |
| `@ROS2.robot.with(23,LDS-02,Twist)`     | wie oben, mit Lidar-Modell (`LDS-01`, `LDS-02`, `C1`) und Typ von `/cmd_vel` (`TwistStamped` oder `Twist`) |
| ```` ```bash @ROS2.bashrc ````          | Inhalt der simulierten `~/.bashrc`; Terminals, die noch nicht benutzt wurden, lesen sie neu ein |
| `@ROS2.rviz`                            | RViz-Fenster; zeigt Inhalte, sobald `ros2 run rviz2 rviz2` läuft           |
| `@ROS2.rviz.with(odom,LaserScan /scan best_effort; Odometry /odom; TF)` | RViz mit vorbereitetem Fixed Frame und Displays (durch `;` getrennt)     |

Beim Folienwechsel beendet die Simulation alle Programme und setzt Schrittfolgen zurück. Für Abläufe, die über mehrere Folien weiterlaufen sollen, lässt sich das in einem Kurs abschalten:

```html
<script>window.ROS2Sim.resetOnSlideChange = false; ""</script>
```

Für Prüfaufgaben liefert `ROS2Sim.state()` den aktuellen Graphen:

```js
{ nodes: ['/talker', …],
  topics: [{ name: '/chatter', types: [...], publishers: [...], subscribers: [...] }],
  running: [{ terminal: '…', command: 'ros2 run demo_nodes_cpp talker' }] }
```

## Was nachgebildet ist

| Bereich          | nachgebildet                                                                          | nicht nachgebildet                                     |
| ---------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `ros2 run`       | `demo_nodes_cpp` talker, listener, listener_best_effort; `demo_nodes_py` talker, listener; `turtlesim` turtlesim_node, turtle_teleop_key; `--ros-args` mit `-r` (`__node`, `__ns`, Topics) und `-p` | `--params-file`, alle übrigen Programme |
| `ros2 topic`     | list (`-t`, `-v`, `-c`), info (`-v`), echo (`--once`, `--field`, QoS-Optionen), hz, pub (`--once`, `-r`, `-t`, `-w`, QoS-Optionen), type, find | bw, delay, `--csv`, `--filter` |
| `ros2 node`      | list (`-a`, `-c`), info                                                               |                                                        |
| `ros2 param`     | list, get, set, dump, describe, delete                                                | load, Dateiausgabe von dump                            |
| `ros2 service`   | list (`-t`), type, find, call (`-r`)                                                  | echo, info                                             |
| `ros2 action`    | list (`-t`), info, type, send_goal (`--feedback`, Abbruch mit Strg+C)                 |                                                        |
| `ros2 bag`       | record (`--topics`, `-a`, `-o`, Leertaste), info (`-t`), play (`-r`, `-l`, `--topics`, `--remap`, `-d`, `-p`, Tasten) – MCAP, mit dem echten Jazzy austauschbar | convert, reindex, burst, Kompression, sqlite3, `--clock` |
| Dateien          | `ls`, `cat`, `rm -r`, `pwd` für Bag-Ordner                                           | alle übrigen Shell-Befehle                             |
| tf               | `tf2_echo` (Ausgabe einschließlich Vorzeichen wie tf2), `static_transform_publisher` (neue und alte Schreibweise) | `view_frames`, `tf2_monitor`, zeitliche Interpolation (es gilt die jeweils neueste Transformation) |
| RViz             | Draufsicht in 2D: Grid, LaserScan, Odometry, Pose, Path, TF; Fixed Frame; Reliability Policy je Display; Statusmeldungen | 3D, Kamera- und Punktwolkenanzeigen, Werkzeuge (2D Pose Estimate …) |
| Netzwerk         | `ROS_DOMAIN_ID` (0 … 232, Fehler wie Fast DDS), `ROS_AUTOMATIC_DISCOVERY_RANGE` (SUBNET, LOCALHOST, OFF), ein Daemon je Domain mit den Einstellungen beim Start, Laptop und Roboter als getrennte Rechner | WSL2-Netzwerk, WLAN-Ausfälle, Paketverluste, `ROS_STATIC_PEERS` |
| Roboter          | TurtleBot3 Burger: `robot_state_publisher` (URDF aus `turtlebot3_description`), `turtlebot3_node` (`/odom`, `/tf`, `/joint_states`, `/cmd_vel`), Lidar-Treiber (`/scan`, Best Effort) | Inhalte von `/imu`, `/battery_state`, `/magnetic_field`, `/sensor_state`; Kamera |
| Shell            | Variablen mit und ohne `export`, `VAR=wert befehl`, `unset`, `env`/`printenv`, `~/.bashrc`, `source`, `bash`, Pipe nach `grep`, `>`/`>>`, `xdg-open` | alle übrigen Befehle |
| weitere          | `ros2 interface show/proto/list`, `ros2 pkg executables/list`                         | launch                                                 |
| turtlesim        | mehrere Schildkröten, `/spawn`, `/kill`, `/clear`, `/reset`, `set_pen`, `teleport_absolute/relative`, `rotate_absolute`, Parameter `background_r/g/b` und `holonomic` | Bilder der verschiedenen Schildkröten; `color_sensor` misst nur Hintergrund oder Stift |
| Typen            | `std_msgs` String, Int32, Float64, Bool; `geometry_msgs` Twist, Vector3; `turtlesim` Pose, Color sowie die Services und die Action von turtlesim; dazu alle Typen, die eine geladene Bagdatei mitbringt (z. B. LaserScan, Odometry) | alle übrigen (werden als „nicht nachgebildet“ gemeldet) |
| QoS              | Reliability und Durability inkl. Unverträglichkeits-Warnungen                          | Deadline, Liveliness, Lifespan, Paketverlust           |

@ROS2.reset

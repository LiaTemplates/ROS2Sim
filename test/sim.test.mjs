// Tests für ros2sim.js – Ausgaben werden mit den Mitschnitten aus ROS 2 Jazzy verglichen.
// Autoren: Sebastian Zug & Claude Code (Opus 5.5) mit LiaScript Teaching-Agent
// Aufruf: node test/sim.test.mjs
import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const cap = (f) => fs.readFileSync(path.join(dir, 'captures', f + '.txt'), 'utf8').split('\n').slice(1).join('\n').replace(/\n\[exit \d+\]\n?$/, '')

// ---- simulierte Uhr
let now = 1794599000000
let timers = []; let tid = 0
const ctx = {
  console,
  TextEncoder,
  TextDecoder,
  Math,
  JSON,
  setInterval: (fn, ms) => { const t = { id: ++tid, fn, ms, next: now + ms, every: true }; timers.push(t); return t.id },
  setTimeout: (fn, ms) => { const t = { id: ++tid, fn, ms, next: now + (ms || 0), every: false }; timers.push(t); return t.id },
  clearInterval: (id) => { timers = timers.filter(t => t.id !== id) },
  clearTimeout: (id) => { timers = timers.filter(t => t.id !== id) }
}
ctx.Date = class extends Date { static now () { return now } }
ctx.globalThis = ctx
vm.createContext(ctx)
for (const f of ['ros2sim-help.js', 'ros2sim.js']) vm.runInContext(fs.readFileSync(path.join(dir, '..', f), 'utf8'), ctx, { filename: f })

function advance (ms) {
  const end = now + ms
  for (;;) {
    timers.sort((a, b) => a.next - b.next)
    const t = timers[0]
    if (!t || t.next > end) break
    now = t.next
    if (t.every) t.next += t.ms; else timers.shift()
    t.fn()
  }
  now = end
}

const { sim } = ctx.ROS2Sim
const I = ctx.ROS2Sim._internal
let failures = 0
function test (name, fn) {
  try { fn(); console.log('✓', name) } catch (e) { failures++; console.log('✗', name); console.log('  ', e.message.split('\n').join('\n   ')) }
}
const out = (s, from) => s.lines.slice(from).filter(l => l.c !== 'cmd' && l.c !== 'hint').map(l => l.t).join('\n')
const stripStamp = (t) => t.replace(/\[\d+\.\d{9}\]/g, '[T]')
function run (s, cmd, ms = 0) { const n = s.lines.length; s.exec(cmd); advance(ms); return out(s, n) }

// ------------------------------------------------------------------ Tests

test('Hilfetexte wie ros2 --help / ros2 topic', () => {
  sim.reset(); const s = sim.session('h')
  assert.equal(run(s, 'ros2 --help'), cap('ros2_help'))
  assert.equal(run(s, 'ros2 topic'), cap('topic_help'))
  assert.equal(run(s, 'ros2 topic echo --help'), cap('topic_echo_help'))
})

test('talker (C++) Ausgabe und Strg+C', () => {
  sim.reset(); const s = sim.session('t1')
  const n = s.lines.length
  s.exec('ros2 run demo_nodes_cpp talker'); advance(3100)
  s.interrupt()
  const want = stripStamp(cap('talker_cpp')).split('\n')
  const got = stripStamp(s.lines.slice(n + 1).map(l => l.t).join('\n')).split('\n')
  assert.deepEqual(got.filter(l => l !== '^C'), want)
  assert.equal(s.proc, null)
})

test('listener (Python) hört talker', () => {
  sim.reset(); const a = sim.session('a'); const b = sim.session('b')
  a.exec('ros2 run demo_nodes_cpp talker')
  const n = b.lines.length
  b.exec('ros2 run demo_nodes_py listener'); advance(3050)
  assert.equal(stripStamp(out(b, n)), stripStamp(cap('listener_py')))
})

test('topic list / -t / node list / node info / topic info -v', () => {
  sim.reset(); const a = sim.session('a'); const b = sim.session('b'); const c = sim.session('c')
  a.exec('ros2 run demo_nodes_cpp talker'); b.exec('ros2 run demo_nodes_cpp listener')
  assert.equal(run(c, 'ros2 topic list'), cap('topic_list'))
  assert.equal(run(c, 'ros2 node list'), '/listener\n/talker')
  assert.equal(run(c, 'ros2 node info /talker'), cap('node_info'))
  assert.equal(run(c, 'ros2 node info /listener'), cap('node_info_listener'))
  assert.equal(run(c, 'ros2 topic info /chatter'), cap('topic_info'))
  const gid = (t) => t.replace(/GID: [0-9a-f.]+/g, 'GID: X')
  assert.equal(gid(run(c, 'ros2 topic info -v /chatter')), gid(cap('topic_info_v')))
  assert.equal(run(c, 'ros2 topic type /chatter'), 'std_msgs/msg/String')
  assert.equal(run(c, 'ros2 topic find std_msgs/msg/String'), '/chatter')
  assert.match(run(c, 'ros2 node list -a'), /^\/_ros2cli_daemon_0_[0-9a-f]{32}\n\/listener\n\/talker$/)
})

test('topic echo und --once', () => {
  sim.reset(); const a = sim.session('a'); const c = sim.session('c')
  a.exec('ros2 run demo_nodes_cpp talker'); advance(6100)
  const n = c.lines.length
  c.exec('ros2 topic echo /chatter'); advance(2000); c.interrupt()
  assert.equal(out(c, n).replace(/\^C$/, '').trim(), "data: 'Hello World: 7'\n---\ndata: 'Hello World: 8'\n---")
  const m = c.lines.length
  c.exec('ros2 topic echo --once /chatter'); advance(1100)
  assert.equal(out(c, m), "data: 'Hello World: 9'\n---")
  assert.equal(c.proc, null)
})

test('topic echo auf unbekanntes Topic', () => {
  sim.reset(); const c = sim.session('c')
  assert.equal(run(c, 'ros2 topic echo /nix'), cap('topic_echo_none'))
  assert.equal(c.proc, null)
})

test('topic hz', () => {
  sim.reset(); const a = sim.session('a'); const c = sim.session('c')
  a.exec('ros2 run demo_nodes_cpp talker'); advance(500)
  const n = c.lines.length
  c.exec('ros2 topic hz /chatter'); advance(4200); c.interrupt()
  const lines = out(c, n).split('\n')
  assert.equal(lines[0], 'average rate: 1.000')
  assert.match(lines[1], /^\tmin: 1\.000s max: 1\.000s std dev: 0\.00000s window: 2$/)
})

test('topic pub: Ausgaben wie Jazzy', () => {
  sim.reset(); const c = sim.session('c')
  assert.equal(run(c, 'ros2 topic pub /hallo std_msgs/msg/String "{data: \'Hi\'}"', 1500), cap('topic_pub'))
  c.interrupt()
  assert.equal(run(c, 'ros2 topic pub -r 2 /zahl std_msgs/msg/Int32 "{data: 5}"', 1600), cap('topic_pub_r'))
  c.interrupt()
  assert.equal(run(c, 'ros2 topic pub /x std_msgs/msg/String "{dat: 1}"'), cap('topic_pub_bad'))
  assert.equal(run(c, 'ros2 topic pub /x std_msgs/msg/Strin "{data: 1}"'), cap('topic_pub_badtype'))
})

test('topic pub --once wartet auf Subscriber', () => {
  sim.reset(); const a = sim.session('a'); const c = sim.session('c')
  const n = c.lines.length
  c.exec('ros2 topic pub --once /hallo std_msgs/msg/String "data: Hi"'); advance(2500)
  assert.equal(out(c, n), 'Waiting for at least 1 matching subscription(s)...\n'.repeat(3).trim())
  const m = a.lines.length
  a.exec('ros2 run demo_nodes_cpp listener --ros-args -r chatter:=hallo'); advance(1000)
  assert.match(out(c, n), /publisher: beginning loop\npublishing #1: std_msgs\.msg\.String\(data='Hi'\)\n$/)
  assert.equal(c.proc, null)
  assert.equal(stripStamp(out(a, m)), '[INFO] [T] [listener]: I heard: [Hi]')
})

test('Typumwandlung bei topic pub wie Jazzy', () => {
  const r = (t, y) => { const x = I.msgFromYaml(t, y); return x.error || I.pyRepr(t, x.msg) }
  assert.equal(r('std_msgs/msg/String', '{data: 1}'), "std_msgs.msg.String(data='1')")
  assert.equal(r('std_msgs/msg/Int32', '{data: 1.5}'), 'std_msgs.msg.Int32(data=1)')
  assert.equal(r('std_msgs/msg/Float64', '{data: 2}'), 'std_msgs.msg.Float64(data=2.0)')
  assert.equal(r('std_msgs/msg/Int32', '{data: abc}'), "Failed to populate field: invalid literal for int() with base 10: 'abc'")
  assert.equal(r('std_msgs/msg/Bool', '{data: true}'), 'std_msgs.msg.Bool(data=True)')
  assert.equal(r('geometry_msgs/msg/Twist', '{linear: {x: 2}}'), 'geometry_msgs.msg.Twist(linear=geometry_msgs.msg.Vector3(x=2.0, y=0.0, z=0.0), angular=geometry_msgs.msg.Vector3(x=0.0, y=0.0, z=0.0))')
  assert.equal(r('std_msgs/msg/String', '{data: Hallo Welt: 1}'), 'The passed value needs to be in YAML string or a dictionary')
  assert.equal(r('std_msgs/msg/String', '{data: [1}'), 'The passed value needs to be in YAML string or a dictionary')
  assert.equal(r('std_msgs/msg/String', ''), "std_msgs.msg.String(data='')")
  assert.equal(r('std_msgs/msg/String', 'data: "a b"'), "std_msgs.msg.String(data='a b')")
  assert.equal(r('std_msgs/msg/Float64', '{data: 0.1}'), 'std_msgs.msg.Float64(data=0.1)')
  assert.equal(r('std_msgs/msg/Float64', '{data: 1e-7}'), 'std_msgs.msg.Float64(data=1e-07)')
})

test('Fehlermeldungen run / node info / topic info / Tippfehler', () => {
  sim.reset(); const c = sim.session('c')
  assert.equal(run(c, 'ros2 run demo_node talker'), cap('run_badpkg'))
  assert.equal(run(c, 'ros2 run demo_nodes_cpp talk'), cap('run_badexe'))
  assert.equal(run(c, 'ros2 node info /nix'), cap('node_info_bad'))
  assert.equal(run(c, 'ros2 topic info /nix'), cap('topic_info_bad'))
  assert.equal(run(c, 'ros2 topik list'), cap('bad_cmd'))
  assert.equal(run(c, 'ros2 topic echo'), [
    ...ctx.ROS2SimHelp['topic echo'].split('\n\n')[0].split('\n'),
    'ros2 topic echo: error: the following arguments are required: topic_name'].join('\n'))
  const n = c.lines.length; c.exec('ros2 topik list')
  assert.ok(c.lines.slice(n).some(l => l.c === 'hint' && l.t.includes('topic')))
})

test('interface show / proto / pkg executables', () => {
  sim.reset(); const c = sim.session('c')
  for (const [t, f] of [['std_msgs/msg/String', 'iface_string'], ['std_msgs/msg/Int32', 'iface_int32'], ['geometry_msgs/msg/Twist', 'iface_twist'], ['turtlesim/msg/Pose', 'iface_pose']]) {
    assert.equal(run(c, 'ros2 interface show ' + t), cap(f))
  }
  assert.equal(run(c, 'ros2 interface proto geometry_msgs/msg/Twist'), cap('iface_proto'))
  assert.equal(run(c, 'ros2 pkg executables turtlesim'), cap('pkg_exec_turtlesim'))
  assert.equal(run(c, 'ros2 pkg executables demo_nodes_cpp'), cap('pkg_exec_demo_cpp'))
  assert.equal(run(c, 'ros2 pkg executables demo_nodes_py'), cap('pkg_exec_demo_py'))
})

test('Remapping: __node und Topic', () => {
  sim.reset(); const a = sim.session('a'); const c = sim.session('c')
  const n = a.lines.length
  a.exec('ros2 run demo_nodes_py talker --ros-args -r __node:=talker2 -r chatter:=chatter2'); advance(2050)
  assert.equal(stripStamp(out(a, n)), stripStamp(cap('talker_py')))
  assert.equal(run(c, 'ros2 topic list -t'), '/chatter2 [std_msgs/msg/String]\n/parameter_events [rcl_interfaces/msg/ParameterEvent]\n/rosout [rcl_interfaces/msg/Log]')
})

test('turtlesim: Start, node info, Pose, cmd_vel', () => {
  sim.reset(); const a = sim.session('a'); const c = sim.session('c')
  const n = a.lines.length
  a.exec('ros2 run turtlesim turtlesim_node'); advance(100)
  assert.equal(stripStamp(out(a, n)), stripStamp(cap('turtlesim').split('\n').slice(0, 2).join('\n')))
  assert.equal(run(c, 'ros2 node info /turtlesim'), cap('node_info_turtle'))
  assert.equal(run(c, 'ros2 topic list -t'), cap('topic_list_turtle'))
  const e = c.lines.length
  c.exec('ros2 topic echo --once /turtle1/pose'); advance(50)
  assert.equal(out(c, e), cap('echo_pose').split('---')[0] + '---')
  c.exec('ros2 topic pub --once /turtle1/cmd_vel geometry_msgs/msg/Twist "{linear: {x: 2.0}, angular: {z: 1.8}}"'); advance(1500)
  const t = sim.worlds[0].turtles[0]
  assert.ok(t.x !== Math.fround(5.544445) && t.theta > 1.5 && t.theta < 2.0, `Pose x=${t.x} theta=${t.theta}`)
})

test('teleop: Pfeiltaste bewegt Schildkröte', () => {
  sim.reset(); const a = sim.session('a'); const b = sim.session('b')
  a.exec('ros2 run turtlesim turtlesim_node')
  const n = b.lines.length
  b.exec('ros2 run turtlesim turtle_teleop_key')
  assert.equal(out(b, n), fs.readFileSync(path.join(dir, 'captures', 'teleop.txt'), 'utf8').replace(/\r/g, '').split('\n').slice(0, 5).join('\n'))
  b.key('ArrowUp'); advance(500)
  assert.ok(sim.worlds[0].turtles[0].x > 6, 'x=' + sim.worlds[0].turtles[0].x)
})

test('QoS: reliable echo gegen best_effort pub → Warnung, keine Daten', () => {
  sim.reset(); const a = sim.session('a'); const c = sim.session('c')
  a.exec('ros2 topic pub --qos-reliability best_effort /q std_msgs/msg/Int32 "{data: 1}"'); advance(100)
  const n = c.lines.length
  c.exec('ros2 topic echo --qos-reliability reliable /q'); advance(2100)
  const o = out(c, n)
  assert.match(o, /offering incompatible QoS.*RELIABILITY/)
  assert.ok(!o.includes('data: 1'))
  c.interrupt()
  const m = c.lines.length
  c.exec('ros2 topic echo /q'); advance(1100)
  assert.match(out(c, m), /data: 1\n---/)
})

test('Vervollständigung', () => {
  sim.reset(); const a = sim.session('a'); const c = sim.session('c')
  a.exec('ros2 run turtlesim turtlesim_node')
  const v = (line) => JSON.parse(JSON.stringify(c.complete(line).items.map(i => i.value)))
  assert.deepEqual(v('ros2 to'), ['topic'])
  assert.ok(v('ros2 topic ').includes('pub'))
  assert.deepEqual(v('ros2 run turt'), ['turtlesim'])
  assert.deepEqual(v('ros2 run turtlesim t').slice(0, 2), ['turtle_teleop_key', 'turtlesim_node'])
  assert.ok(v('ros2 topic echo /tu').includes('/turtle1/pose'))
  assert.ok(v('ros2 topic echo cmd').includes('/turtle1/cmd_vel'), 'Teilwort-Treffer')
  assert.deepEqual(v('ros2 topic pub /turtle1/cmd_vel ').slice(0, 1), ['geometry_msgs/msg/Twist'])
  assert.deepEqual(v('ros2 topic pub /turtle1/cmd_vel geometry_msgs/msg/Twist '),
    ['"{linear: {x: 0.0, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}"'])
  assert.ok(v('ros2 topic echo --qos-reliability ').includes('best_effort'))
  assert.ok(v('ros2 topic echo --').includes('--once'))
  assert.deepEqual(v('ros2 node info /tu'), ['/turtlesim'])
  const r = c.complete('ros2 topic pub /turtle1/cmd_vel geometry_msgs/msg/Twist "{li')
  assert.equal(r.items.length, 1)
  assert.equal(I.applyCompletion('ros2 run turtlesim t', c.complete('ros2 run turtlesim t'), { value: 'turtlesim_node' }), 'ros2 run turtlesim turtlesim_node ')
  assert.ok(v('ros2 run demo_nodes_cpp talker --ros-args -r ').includes('chatter:='))
})

test('Graph-Zustand für Prüfaufgaben', () => {
  sim.reset(); const a = sim.session('a'); const b = sim.session('b')
  a.exec('ros2 run demo_nodes_cpp talker'); b.exec('ros2 run demo_nodes_cpp listener')
  const st = JSON.parse(JSON.stringify(ctx.ROS2Sim.state()))
  const ch = st.topics.find(t => t.name === '/chatter')
  assert.deepEqual([ch.publishers, ch.subscribers], [['/talker'], ['/listener']])
  assert.equal(st.running.length, 2)
})


// ------------------------------------------------------------------ Parameter, Services, Actions
const cap2 = (f) => fs.readFileSync(path.join(dir, 'captures2', f + '.txt'), 'utf8').split('\n').slice(1).join('\n').replace(/\n\[exit \d+\]\n?$/, '')

test('param list / get / set / dump / describe wie Jazzy', () => {
  sim.reset(); const a = sim.session('a'); const b = sim.session('b'); const c = sim.session('c')
  a.exec('ros2 run turtlesim turtlesim_node'); b.exec('ros2 run demo_nodes_cpp talker')
  assert.equal(run(c, 'ros2 param list'), cap2('param_list'))
  assert.equal(run(c, 'ros2 param list /turtlesim'), cap2('param_list_turtle'))
  assert.equal(run(c, 'ros2 param get /turtlesim background_g'), cap2('param_get'))
  assert.equal(run(c, 'ros2 param get /turtlesim nix'), cap2('param_get_bad'))
  assert.match(stripStamp(a.lines[a.lines.length - 1].t), /^\[WARN\] \[T\] \[rclcpp\]: Failed to get parameters: nix$/)
  assert.equal(run(c, 'ros2 param get /nix background_g'), cap2('param_get_badnode'))
  assert.equal(run(c, 'ros2 param set /turtlesim background_r 150'), cap2('param_set'))
  assert.equal(run(c, 'ros2 param set /turtlesim background_r 300'), cap2('param_set_bad'))
  assert.equal(run(c, 'ros2 param set /turtlesim background_r hallo'), cap2('param_set_str'))
  assert.equal(run(c, 'ros2 param set /turtlesim background_r 1.5'), cap2('param_set_float'))
  assert.equal(run(c, 'ros2 param get /turtlesim background_r'), cap2('param_get_after'))
  assert.equal(run(c, 'ros2 param dump /turtlesim'), cap2('param_dump'))
  assert.equal(run(c, 'ros2 param dump /talker'), cap2('param_dump_talker'))
  assert.equal(run(c, 'ros2 param describe /turtlesim background_r'), cap2('param_describe'))
  assert.equal(run(c, 'ros2 param get /turtlesim use_sim_time'), cap2('param_get_simtime'))
  assert.equal(run(c, 'ros2 param set /talker foo 3'), cap2('param_set_new'))
  assert.equal(run(c, 'ros2 param set /turtlesim qos_overrides./parameter_events.publisher.depth 5'),
    "Setting parameter failed: parameter 'qos_overrides./parameter_events.publisher.depth' cannot be set because it is read-only")
  assert.deepEqual([...sim.worlds[0].bg], [150, 86, 255])
})

test('service list -t / type / find wie Jazzy', () => {
  sim.reset(); const a = sim.session('a'); const b = sim.session('b'); const c = sim.session('c')
  a.exec('ros2 run turtlesim turtlesim_node'); b.exec('ros2 run demo_nodes_cpp talker')
  assert.equal(run(c, 'ros2 service list -t'), cap2('service_list_t'))
  assert.equal(run(c, 'ros2 service type /spawn'), cap2('service_type'))
  assert.equal(run(c, 'ros2 service find std_srvs/srv/Empty'), cap2('service_find'))
})

test('service call: spawn, set_pen, teleport, clear, kill, reset', () => {
  sim.reset(); const a = sim.session('a'); const c = sim.session('c')
  const n0 = a.lines.length
  a.exec('ros2 run turtlesim turtlesim_node'); advance(50)
  const calls = [
    ['ros2 service call /spawn turtlesim/srv/Spawn "{x: 2.0, y: 2.0, theta: 0.2, name: \'\'}"', 'call_spawn'],
    ['ros2 service call /spawn turtlesim/srv/Spawn "{x: 8, y: 3, name: \'anna\'}"', 'call_spawn_named'],
    ['ros2 service call /spawn turtlesim/srv/Spawn "{x: 8, y: 3, name: \'anna\'}"', 'call_spawn_dup'],
    ['ros2 service call /turtle1/set_pen turtlesim/srv/SetPen "{r: 255, g: 0, b: 0, width: 5, \'off\': 0}"', 'call_setpen'],
    ['ros2 service call /turtle1/teleport_absolute turtlesim/srv/TeleportAbsolute "{x: 1.0, y: 1.0, theta: 0.0}"', 'call_tpabs'],
    ['ros2 service call /turtle1/teleport_relative turtlesim/srv/TeleportRelative "{linear: 2.0, angular: 1.57}"', 'call_tprel'],
    ['ros2 service call /clear std_srvs/srv/Empty', 'call_clear'],
    ['ros2 service call /kill turtlesim/srv/Kill "{name: \'anna\'}"', 'call_kill'],
    ['ros2 service call /kill turtlesim/srv/Kill "{name: \'nix\'}"', 'call_kill_bad'],
    ['ros2 service call /reset std_srvs/srv/Empty', 'call_reset']
  ]
  for (const [cmd, f] of calls) { assert.equal(run(c, cmd, 100), cap2(f), f); assert.equal(c.proc, null) }
  assert.equal(run(c, 'ros2 service call /clear std_srvs/srv/Emty'), cap2('call_badtype'))
  assert.equal(run(c, 'ros2 service call /spawn turtlesim/srv/Spawn "{z: 1}"'), cap2('call_badfield'))
  assert.equal(run(c, 'ros2 service call /clear'), cap2('call_notype'))
  const want = cap2('turtlesim_log').split('\n').filter(l => l && !l.includes('rclcpp')).map(stripStamp)
  const got = JSON.parse(JSON.stringify(a.lines.slice(n0 + 1).map(l => stripStamp(l.t))))
  assert.deepEqual(got, want)
  assert.equal(sim.worlds[0].turtles.map(t => t.name).join(), 'turtle1')
})

test('service call auf fehlenden Service wartet', () => {
  sim.reset(); const c = sim.session('c')
  const n = c.lines.length
  c.exec('ros2 service call /nix std_srvs/srv/Empty'); advance(3000)
  assert.equal(out(c, n), 'waiting for service to become available...')
  assert.ok(c.proc)
  c.interrupt()
})

test('Wand-Warnung wie Jazzy (nur links, rechts, unten)', () => {
  sim.reset(); const a = sim.session('a'); const c = sim.session('c')
  a.exec('ros2 run turtlesim turtlesim_node')
  const n = a.lines.length
  for (const [x, y] of [[1, -5], [-3, 5], [5, 15]]) {
    c.exec(`ros2 service call /turtle1/teleport_absolute turtlesim/srv/TeleportAbsolute "{x: ${x}, y: ${y}}"`); advance(100)
  }
  assert.deepEqual(JSON.parse(JSON.stringify(a.lines.slice(n).map(l => stripStamp(l.t)))), [
    '[WARN] [T] [turtlesim]: Oh no! I hit the wall! (Clamping from [x=1.000000, y=16.088889])',
    '[WARN] [T] [turtlesim]: Oh no! I hit the wall! (Clamping from [x=-3.000000, y=6.088889])'])
})

test('action list / info / send_goal wie Jazzy', () => {
  sim.reset(); const a = sim.session('a'); const c = sim.session('c')
  a.exec('ros2 run turtlesim turtlesim_node')
  assert.equal(run(c, 'ros2 action list'), cap2('action_list'))
  assert.equal(run(c, 'ros2 action list -t'), cap2('action_list_t'))
  assert.equal(run(c, 'ros2 action info /turtle1/rotate_absolute'), cap2('action_info'))
  assert.equal(run(c, 'ros2 action info -t /turtle1/rotate_absolute'), cap2('action_info_t'))
  assert.equal(run(c, 'ros2 action type /turtle1/rotate_absolute'), 'turtlesim/action/RotateAbsolute')
  assert.equal(run(c, 'ros2 interface show turtlesim/action/RotateAbsolute'), cap2('iface_rot'))
  for (const f of ['spawn', 'kill', 'setpen', 'tpabs', 'tprel', 'empty']) {
    const t = cap2('iface_' + f).split('\n')
    assert.equal(run(c, fs.readFileSync(path.join(dir, 'captures2', 'iface_' + f + '.txt'), 'utf8').split('\n')[0].slice(2)), t.join('\n'))
  }
  const id = (s) => s.replace(/ID: [0-9a-f]{32}/, 'ID: X')
  assert.equal(id(run(c, 'ros2 action send_goal /turtle1/rotate_absolute turtlesim/action/RotateAbsolute "{theta: 1.57}"', 3000)), id(cap2('send_goal')))
  const fb = run(c, 'ros2 action send_goal --feedback /turtle1/rotate_absolute turtlesim/action/RotateAbsolute "{theta: -1.0}"', 4000)
  assert.match(fb, /Goal accepted with ID: [0-9a-f]{32}\n\nFeedback:\n    remaining: -2.552000045776367\n\nFeedback:\n    remaining: -2.5360000133514404\n/)
  assert.match(fb, /Goal finished with status: SUCCEEDED$/)
  assert.equal(run(c, 'ros2 action send_goal /turtle1/rotate_absolute turtlesim/action/RotateAbsolut "{theta: 1}"'), cap2('send_goal_badtype'))
})

test('send_goal mit Strg+C bricht das Ziel ab', () => {
  sim.reset(); const a = sim.session('a'); const c = sim.session('c')
  a.exec('ros2 run turtlesim turtlesim_node')
  const n = c.lines.length; const m = a.lines.length
  c.exec('ros2 action send_goal /turtle1/rotate_absolute turtlesim/action/RotateAbsolute "{theta: 3.0}"'); advance(1000)
  c.interrupt()
  assert.match(out(c, n), /Goal accepted with ID: [0-9a-f]{32}\n\n\^C\nCanceling goal\.\.\.$/)
  assert.equal(stripStamp(a.lines.slice(m).map(l => l.t).join('\n')), '[INFO] [T] [turtlesim]: Rotation goal canceled')
})

test('teleop: Drehtasten senden Action-Ziele, f bricht ab', () => {
  sim.reset(); const a = sim.session('a'); const b = sim.session('b')
  a.exec('ros2 run turtlesim turtlesim_node')
  b.exec('ros2 run turtlesim turtle_teleop_key')
  const m = a.lines.length; const mb = b.lines.length
  b.key('g'); advance(500)
  b.key('r'); advance(3000)
  b.key('b'); advance(400); b.key('f'); advance(500)
  b.key('d'); advance(300); b.key('v'); advance(4000)
  assert.deepEqual(JSON.parse(JSON.stringify(a.lines.slice(m).map(l => stripStamp(l.t)))), [
    '[INFO] [T] [turtlesim]: Rotation goal completed successfully',
    '[INFO] [T] [turtlesim]: Rotation goal completed successfully',
    '[INFO] [T] [turtlesim]: Rotation goal canceled',
    '[WARN] [T] [turtlesim]: Rotation goal received before a previous goal finished. Aborting previous goal',
    '[INFO] [T] [turtlesim]: Rotation goal completed successfully'])
  assert.ok(Math.abs(sim.worlds[0].turtles[0].theta + Math.PI / 2) < 0.02)
  assert.ok(!b.lines.slice(mb).some(l => l.c === 'hint'), 'kein Hinweis mehr auf fehlende Action')
})

test('Startparameter -p und Vervollständigung für param/service/action', () => {
  sim.reset(); const a = sim.session('a'); const c = sim.session('c')
  a.exec('ros2 run turtlesim turtlesim_node --ros-args -p background_r:=200')
  assert.deepEqual([...sim.worlds[0].bg], [200, 86, 255])
  const v = (line) => JSON.parse(JSON.stringify(c.complete(line).items.map(i => i.value)))
  assert.deepEqual(v('ros2 param get /turtlesim back'), ['background_b', 'background_g', 'background_r'])
  assert.deepEqual(v('ros2 param set /turtlesim holonomic '), ['true', 'false'])
  assert.deepEqual(v('ros2 service call /sp'), ['/spawn'])
  assert.deepEqual(v('ros2 service call /spawn ').slice(0, 1), ['turtlesim/srv/Spawn'])
  assert.deepEqual(v('ros2 service call /spawn turtlesim/srv/Spawn '), ['"{x: 0.0, y: 0.0, theta: 0.0, name: \'\'}"'])
  assert.deepEqual(v('ros2 service call /turtle1/set_pen turtlesim/srv/SetPen '), ['"{r: 0, g: 0, b: 0, width: 0, \'off\': 0}"'])
  assert.deepEqual(v('ros2 action send_goal '), ['/turtle1/rotate_absolute'])
  assert.deepEqual(v('ros2 action send_goal /turtle1/rotate_absolute turtlesim/action/RotateAbsolute '), ['"{theta: 0.0}"'])
  assert.ok(v('ros2 ').indexOf('param') < v('ros2 ').indexOf('component'))
})

test('Hinweis bei doppeltem Knotennamen', () => {
  sim.reset(); const a = sim.session('a'); const b = sim.session('b')
  a.exec('ros2 run turtlesim turtlesim_node')
  const n = b.lines.length
  b.exec('ros2 run turtlesim turtlesim_node')
  assert.ok(b.lines.slice(n).some(l => l.c === 'hint' && l.t.includes('Es läuft bereits ein Knoten /turtlesim')))
  assert.equal(sim.worlds.length, 2)
})

test('Reset beim Folienwechsel: Programme beendet, Schritte zurück', () => {
  sim.reset(); const a = sim.session('a')
  ctx.ROS2Sim.setSteps('a', 'ros2 node list\nros2 topic list')
  a.exec('ros2 node list')
  a.exec('ros2 run demo_nodes_cpp talker')
  assert.equal(a.stepIdx, 1)
  const n = a.lines.length
  sim.reset('slide')
  assert.equal(a.proc, null)
  assert.equal(a.stepIdx, 0)
  assert.equal(sim.graph.nodes.length, 0)
  assert.ok(a.lines.slice(n).some(l => l.c === 'hint' && l.t.includes('Folienwechsel')))
})

// ------------------------------------------------------------------ Bagdateien
const cap3 = (f) => fs.readFileSync(path.join(dir, 'captures3', f + '.txt'), 'utf8').split('\n').slice(1).join('\n').replace(/\n\[exit \d+\]\n?$/, '')
const bagDir = path.join(dir, 'captures3', 'bags')
const loadReal = (name) => ctx.ROS2Sim.loadBag(name, fs.readFileSync(path.join(bagDir, name, name + '_0.mcap')), fs.readFileSync(path.join(bagDir, name, 'metadata.yaml'), 'utf8'))

test('bag info liest eine echte Jazzy-Bag wie ros2 bag info', () => {
  sim.reset(); const c = sim.session('c')
  loadReal('fahrt1')
  assert.equal(run(c, 'ros2 bag info fahrt1'), cap3('info'))
  const norm = (x) => x.replace('{mcap,sqlite3}', '{sqlite3,mcap}') // Reihenfolge wechselt auch unter Jazzy
  assert.equal(norm(run(c, 'ros2 bag info nix')), norm(cap3('info_bad')))
  assert.equal(run(c, 'ros2 bag info -t fahrt1'), '/chatter\n/turtle1/pose')
})

test('Typen aus der Bag: LaserScan dekodieren und wie topic echo ausgeben', () => {
  loadReal('scan2')
  const r = I.readMcap(new Uint8Array(fs.readFileSync(path.join(bagDir, 'scan2', 'scan2_0.mcap'))))
  const m = r.messages.find(x => r.channels.get(x.channelId).topic === '/scan')
  const msg = I.cdrDecode('sensor_msgs/msg/LaserScan', m.data)
  const want = fs.readFileSync(path.join(dir, 'captures3', 'echo_scan.txt'), 'utf8').replace(/\n$/, '')
  assert.equal(I.yamlMsg('sensor_msgs/msg/LaserScan', msg).concat('---').join('\n'), want)
  const o = r.messages.find(x => r.channels.get(x.channelId).topic === '/odom')
  const om = I.cdrDecode('nav_msgs/msg/Odometry', o.data)
  const wantO = fs.readFileSync(path.join(dir, 'captures3', 'echo_odom.txt'), 'utf8').replace(/\n$/, '').split('\n')
  const gotO = I.yamlMsg('nav_msgs/msg/Odometry', om).concat('---')
  gotO[2] = wantO[2]; gotO[3] = wantO[3] // Zeitstempel unterscheiden sich je Nachricht
  assert.equal(gotO.join('\n'), wantO.join('\n'))
  // CDR hin und zurück
  assert.deepEqual(JSON.parse(JSON.stringify(I.cdrDecode('sensor_msgs/msg/LaserScan', I.cdrEncode('sensor_msgs/msg/LaserScan', msg)))), JSON.parse(JSON.stringify(msg)))
  assert.equal(Buffer.from(I.cdrEncode('sensor_msgs/msg/LaserScan', msg)).toString('hex'), Buffer.from(m.data).toString('hex'))
})

test('bag play: listener hört die aufgezeichneten Nachrichten, -r und --topics', () => {
  sim.reset(); const a = sim.session('a'); const c = sim.session('c')
  loadReal('fahrt1')
  a.exec('ros2 run demo_nodes_cpp listener')
  const n = c.lines.length; const m = a.lines.length
  c.exec('ros2 bag play fahrt1'); advance(5000)
  const lines = out(c, n).split('\n').map(stripStamp)
  assert.deepEqual(lines, cap3('play').replace('stdin is not a terminal device. Keyboard handling disabled.', '').split('\n').map(stripStamp))
  assert.equal(c.proc, null)
  const heard = a.lines.slice(m).map(l => l.t.replace(/^.*I heard: /, ''))
  assert.deepEqual(JSON.parse(JSON.stringify(heard)), ['[Hello World: 4]', '[Hello World: 5]', '[Hello World: 6]', '[Hello World: 7]', '[Hello World: 8]'])
  const k = a.lines.length
  c.exec('ros2 bag play fahrt1 -r 2.0 --topics /chatter'); advance(2500)
  assert.equal(a.lines.length - k, 5)
  assert.equal(c.proc, null)
  assert.match(c.lines.find(l => l.t.includes('Set rate to 2')).t, /Set rate to 2$/)
})

test('bag play: Tasten SPACE, Pfeil hoch/runter, Strg+C wie Jazzy', () => {
  sim.reset(); const c = sim.session('c')
  loadReal('fahrt1')
  const n = c.lines.length
  c.exec('ros2 bag play -l fahrt1'); advance(300)
  for (const k of [' ', ' ', 'ArrowUp', 'ArrowDown', ' ', 'ArrowRight', ' ']) { c.key(k); advance(200) }
  c.interrupt()
  const got = out(c, n).split('\n').slice(7).map(stripStamp)
  assert.deepEqual(JSON.parse(JSON.stringify(got)), [
    '[INFO] [T] [rosbag2_player]: Pausing play.', '[INFO] [T] [rosbag2_player]: Resuming play.',
    '[INFO] [T] [rosbag2_player]: Set rate to 1.1', '[INFO] [T] [rosbag2_player]: Set rate to 0.99',
    '[INFO] [T] [rosbag2_player]: Pausing play.', '[INFO] [T] [rosbag2_player]: Resuming play.',
    '^C', '[INFO] [T] [rosbag2_player]: Stopping playback.'])
})

test('bag record: Ausgaben, Aufnahme, info und erneutes Abspielen', () => {
  sim.reset(); sim.fs.clear(); const a = sim.session('a'); const b = sim.session('b'); const c = sim.session('c')
  a.exec('ros2 run demo_nodes_cpp talker'); b.exec('ros2 run turtlesim turtlesim_node')
  advance(200)
  const n = c.lines.length
  c.exec('ros2 bag record /chatter /turtle1/pose -o meinefahrt'); advance(4600); c.interrupt()
  const want = cap3('record_topics').replace('stdin is not a terminal device. Keyboard handling disabled.', '').replace("'fahrt1'", "'meinefahrt'").split('\n').map(stripStamp)
  assert.deepEqual(JSON.parse(JSON.stringify(out(c, n).split('\n').map(stripStamp).filter(l => l !== '^C'))), want)
  const info = run(c, 'ros2 bag info meinefahrt')
  assert.match(info, /Files: {13}meinefahrt_0\.mcap\n/)
  assert.match(info, /Topic information: Topic: \/chatter \| Type: std_msgs\/msg\/String \| Count: [45] \| Serialization Format: cdr\n {19}Topic: \/turtle1\/pose \| Type: turtlesim\/msg\/Pose \| Count: 2[6-9]\d \| Serialization Format: cdr/)
  assert.equal(run(c, 'ros2 bag record /chatter -o meinefahrt'), cap3('record_exists').replace("'fahrt1'", "'meinefahrt'"))
  assert.equal(run(c, 'ros2 bag record'), "[ERROR] [ros2bag]: Need to specify at least one option out of --all, --all-topics, --all-services, --services, --topics, --topic-types or --regex")
  // Dateien für den Abgleich mit dem echten ROS ablegen
  const files = ctx.ROS2Sim.files('meinefahrt')
  const outDir = path.join(dir, 'out', 'meinefahrt'); fs.mkdirSync(outDir, { recursive: true })
  for (const [f, d] of Object.entries(files)) fs.writeFileSync(path.join(outDir, f), typeof d === 'string' ? d : Buffer.from(d))
  // erneut lesen: Typen, Inhalt, ls/cat/rm
  const r = I.readMcap(files['meinefahrt_0.mcap'])
  assert.equal(r.profile, 'ros2')
  assert.equal(run(c, 'ls'), 'meinefahrt')
  assert.equal(run(c, 'ls meinefahrt'), 'meinefahrt_0.mcap  metadata.yaml')
  assert.match(run(c, 'cat meinefahrt/metadata.yaml'), /^rosbag2_bagfile_information:\n  version: 9\n/)
  assert.equal(run(c, 'rm meinefahrt'), "rm: cannot remove 'meinefahrt': Is a directory")
  run(c, 'rm -r meinefahrt')
  assert.equal(run(c, 'ls'), '')
})

test('Vervollständigung für ros2 bag', () => {
  sim.reset(); const a = sim.session('a'); const c = sim.session('c')
  loadReal('fahrt1')
  a.exec('ros2 run turtlesim turtlesim_node')
  const v = (line) => JSON.parse(JSON.stringify(c.complete(line).items.map(i => i.value)))
  assert.deepEqual(v('ros2 bag in'), ['info'])
  assert.deepEqual(v('ros2 bag play fa'), ['fahrt1'])
  assert.deepEqual(v('ros2 bag play fahrt1 --topics '), ['/chatter', '/turtle1/pose'])
  assert.deepEqual(v('ros2 bag play fahrt1 --topics /chatter '), ['/turtle1/pose'])
  assert.ok(v('ros2 bag record --topics ').includes('/turtle1/pose'))
  assert.ok(v('ros2 bag record -').includes('-o'))
})

// ------------------------------------------------------------------ tf und rviz
const cap4 = (f) => fs.readFileSync(path.join(dir, 'captures4', f + '.txt'), 'utf8').replace(/\n$/, '')
const loadRaum = () => ctx.ROS2Sim.loadBag('raumfahrt', fs.readFileSync(path.join(dir, 'captures4', 'raumfahrt', 'raumfahrt_0.mcap')), fs.readFileSync(path.join(dir, 'captures4', 'raumfahrt', 'metadata.yaml'), 'utf8'))

test('static_transform_publisher und tf2_echo (statisch) wie Jazzy', () => {
  sim.reset(); const a = sim.session('a'); const c = sim.session('c')
  const n = a.lines.length
  a.exec('ros2 run tf2_ros static_transform_publisher --x 1.0 --y 2.0 --z 0.5 --yaw 1.57 --frame-id welt --child-frame-id kamera')
  const got = out(a, n).split('\n').map(stripStamp).map(l => l.replace(/static_transform_publisher_\w{16}/, 'STP'))
  assert.deepEqual(JSON.parse(JSON.stringify(got)), cap4('stp').split('\n').slice(0, 4).map(stripStamp).map(l => l.replace(/static_transform_publisher_\w{16}/, 'STP')))
  const m = c.lines.length
  c.exec('ros2 run tf2_ros tf2_echo welt kamera'); advance(2100); c.interrupt()
  const want = cap4('tf2_echo_stp').split('\n').slice(1, 21)
  assert.deepEqual(JSON.parse(JSON.stringify(out(c, m).split('\n').slice(0, 20))), want)
  const k = a.lines.length
  a.exec('ros2 run tf2_ros static_transform_publisher 1 2 3 0 0 0 a b')
  assert.match(stripStamp(a.lines[k + 1] ? a.lines[k + 1].t : ''), /^\[WARN\] \[T\] \[\]: Old-style arguments are deprecated/)
  assert.equal(run(c, 'ros2 run tf2_ros tf2_echo'), cap4('tf2_echo_noargs'))
})

test('tf2_echo mit Daten aus der Bag (odom -> base_scan, inverse, fehlender Frame)', () => {
  sim.reset(); sim.fs.clear(); const a = sim.session('a'); const c = sim.session('c')
  loadRaum()
  const n = c.lines.length
  c.exec('ros2 run tf2_ros tf2_echo map base_scan'); advance(300)
  assert.equal(stripStamp(out(c, n)), '[INFO] [T] [tf2_echo]: Waiting for transform map ->  base_scan: Invalid frame ID "map" passed to canTransform argument target_frame - frame does not exist')
  c.interrupt()
  a.exec('ros2 bag play raumfahrt'); advance(1600)
  const m = c.lines.length
  c.exec('ros2 run tf2_ros tf2_echo base_footprint base_scan'); advance(1100); c.interrupt()
  assert.equal(out(c, m).split('\n').slice(0, 11).join('\n'), cap4('tf2_echo').split('\n').slice(1, 12).join('\n'))
  const k = c.lines.length
  c.exec('ros2 run tf2_ros tf2_echo odom base_scan'); advance(1100); c.interrupt()
  const lines = out(c, k).split('\n')
  assert.match(lines[0], /^At time 1794643\d{3}\.\d{9}$/)
  assert.match(lines[1], /^- Translation: \[\d\.\d{3}, -?\d\.\d{3}, 0\.182\]$/)
})

test('rviz2: Knoten wie Jazzy, QoS-Falle beim Best-Effort-Scan', () => {
  sim.reset(); sim.fs.clear(); const a = sim.session('a'); const b = sim.session('b'); const c = sim.session('c')
  loadRaum()
  sim.rvizConfig = { fixedFrame: 'odom', displays: 'LaserScan /scan; Odometry /odom; TF' }
  const n = a.lines.length
  a.exec('ros2 run rviz2 rviz2'); advance(100)
  assert.deepEqual(JSON.parse(JSON.stringify(out(a, n).split('\n').map(stripStamp))), fs.readFileSync(path.join(dir, 'captures4', 'rviz_start.txt'), 'utf8').split('\n').slice(0, 4).map(stripStamp))
  const info = run(c, 'ros2 node info /rviz')
  assert.match(info, /  Publishers:\n    \/clicked_point: geometry_msgs\/msg\/PointStamped\n    \/goal_pose: geometry_msgs\/msg\/PoseStamped\n    \/initialpose: geometry_msgs\/msg\/PoseWithCovarianceStamped\n/)
  assert.match(info, /    \/rviz\/reset_time: std_srvs\/srv\/Empty\n/)
  assert.match(run(c, 'ros2 node list'), /^\/rviz\n\/transform_listener_impl_[0-9a-f]{12}$/)
  const m = a.lines.length
  b.exec('ros2 bag play raumfahrt'); advance(2000)
  const rv = sim.rviz
  const scan = rv.displays.find(d => d.type === 'LaserScan'); const odom = rv.displays.find(d => d.type === 'Odometry')
  assert.equal(scan.count, 0, 'Reliable-Abo bekommt vom Best-Effort-Publisher nichts')
  assert.ok(odom.count > 10)
  assert.ok(a.lines.slice(m).some(l => /\[rviz\]: New publisher discovered on topic '\/scan', offering incompatible QoS/.test(l.t)))
  // Umstellen auf Best Effort wie in RViz
  scan.reliability = 'Best Effort'
  const I2 = ctx.ROS2Sim._internal
  I2.rvizSubscribe(rv, scan); advance(1000)
  assert.ok(scan.count > 5)
  assert.deepEqual(JSON.parse(JSON.stringify(I2.rvizStatus(rv, scan))), ['ok', `OK: ${scan.count} messages received`])
  rv.fixedFrame = 'map'
  assert.equal(I2.rvizStatus(rv, scan)[1], 'Transform: For frame [base_scan]: No transform to fixed frame [map]')
})

test('echo eines Scans aus der Bag: .inf wie PyYAML', () => {
  sim.reset(); sim.fs.clear(); const a = sim.session('a'); const c = sim.session('c')
  loadRaum()
  a.exec('ros2 bag play raumfahrt')
  const n = c.lines.length
  c.exec('ros2 topic echo --once /scan'); advance(1000)
  const lines = out(c, n).split('\n')
  assert.deepEqual(JSON.parse(JSON.stringify(lines.slice(5, 16))), cap4('echo_scan_bag').split('\n').slice(5, 16))
  assert.ok(lines.includes('- .inf'))
})

test('tf2_echo-Rechnung Zeichen für Zeichen gegen Jazzy (vorwärts und invers)', () => {
  const r = I.readMcap(new Uint8Array(fs.readFileSync(path.join(dir, 'captures4', 'raumfahrt', 'raumfahrt_0.mcap'))))
  const topicOf = (m) => r.channels.get(m.channelId).topic
  const check = (src, tgt, file) => {
    const blocks = cap4(file).split('\n').filter(l => !l.startsWith('[')).join('\n').split(/(?=At time )/).filter(b => b.startsWith('At time')).map(b => b.trim())
    let n = 0
    for (const want of blocks) {
      const ns = BigInt(want.split('\n')[0].replace('At time ', '').replace('.', ''))
      const buf = new I.TfBuffer()
      for (const m of r.messages) {
        const tp = topicOf(m)
        if (tp === '/tf_static') buf.add(I.cdrDecode('tf2_msgs/msg/TFMessage', m.data), true)
        if (tp === '/tf') { const msg = I.cdrDecode('tf2_msgs/msg/TFMessage', m.data); const st = BigInt(msg.transforms[0].header.stamp.sec) * 1000000000n + BigInt(msg.transforms[0].header.stamp.nanosec); if (st <= ns) buf.add(msg, false) }
      }
      const got = I.tfEchoBlock(buf.lookup(src, tgt), 3); if (got !== want) console.log('GOT\n' + got + '\nWANT\n' + want)
      assert.equal(got, want, src + ' -> ' + tgt)
      n++
    }
    return n
  }
  assert.ok(check('odom', 'base_scan', 'tf2_echo_dyn') >= 3)
  assert.ok(check('base_scan', 'odom', 'tf2_echo_inv') >= 2)
})

// ------------------------------------------------------------------ Domains, Discovery, Roboter (P 1)
const cap5 = (f) => fs.readFileSync(path.join(dir, 'captures5', f + '.txt'), 'utf8').split('\n').slice(1).join('\n').replace(/\n?\[exit \d+\]\n?$/, '')
const fresh = (id) => { sim.sessions.delete(id); return sim.session(id) }

test('ROS_DOMAIN_ID trennt Terminals wie unter Jazzy', () => {
  sim.reset(); const a = fresh('da'); const b = fresh('db')
  a.exec('export ROS_DOMAIN_ID=23'); a.exec('ros2 run demo_nodes_cpp talker')
  assert.equal(run(b, 'ros2 topic list'), cap5('list_default'))
  assert.equal(run(b, 'ros2 node list'), cap5('nodes_default'))
  assert.equal(run(b, 'echo $ROS_DOMAIN_ID'), '')
  b.exec('export ROS_DOMAIN_ID=23')
  assert.equal(run(b, 'ros2 topic list'), cap5('list_23'))
  assert.equal(run(b, 'ros2 node list'), cap5('nodes_23'))
})

test('Shell-Variable ohne export, einmalige Zuweisung, unset (Ü 1)', () => {
  sim.reset(); const a = fresh('da'); const b = fresh('db')
  a.exec('export ROS_DOMAIN_ID=23'); a.exec('ros2 run demo_nodes_cpp talker')
  b.exec('ROS_DOMAIN_ID=23')
  assert.equal(run(b, 'echo $ROS_DOMAIN_ID'), '23')
  assert.equal(run(b, 'printenv ROS_DOMAIN_ID'), '')
  assert.equal(run(b, 'ros2 node list'), '', 'nicht exportiert: ros2 sieht die Variable nicht')
  assert.equal(run(b, 'ROS_DOMAIN_ID=23 ros2 node list'), '/talker')
  b.exec('export ROS_DOMAIN_ID')
  assert.equal(run(b, 'ros2 node list'), '/talker')
  b.exec('unset ROS_DOMAIN_ID')
  assert.equal(run(b, 'ros2 node list'), '')
})

test('~/.bashrc: echo >>, cat, neues Terminal, source', () => {
  sim.reset(); sim.home.set('.bashrc', 'source /opt/ros/jazzy/setup.bash\n')
  const a = fresh('da')
  a.exec("echo 'export ROS_DOMAIN_ID=23' >> ~/.bashrc")
  assert.equal(run(a, 'cat ~/.bashrc'), 'source /opt/ros/jazzy/setup.bash\nexport ROS_DOMAIN_ID=23')
  assert.equal(run(a, 'printenv ROS_DOMAIN_ID'), '', 'erst nach source oder in einem neuen Terminal')
  const b = fresh('db')
  assert.equal(run(b, 'printenv ROS_DOMAIN_ID'), '23')
  a.exec('source ~/.bashrc')
  assert.equal(run(a, 'printenv ROS_DOMAIN_ID'), '23')
  assert.match(run(a, 'ls -a'), /\.bashrc/)
})

test('Ungültige ROS_DOMAIN_ID und Discovery OFF wie Jazzy', () => {
  sim.reset(); const a = fresh('da')
  a.exec('export ROS_DOMAIN_ID=300')
  const ts = (x) => x.replace(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3} /, '')
  assert.equal(ts(run(a, 'ros2 node list')), ts(cap5('domain_300').replace(/\x1b\[[0-9;]*m/g, '')))
  assert.equal(ts(run(a, 'ros2 run demo_nodes_cpp talker')), ts(cap5('domain_300_run').replace(/\x1b\[[0-9;]*m/g, '')))
  a.exec('export ROS_DOMAIN_ID=abc')
  assert.match(run(a, 'ros2 node list'), /ValueError: invalid literal for int\(\) with base 10: 'abc'$/)
  a.exec('export ROS_DOMAIN_ID=23 ROS_AUTOMATIC_DISCOVERY_RANGE=OFF')
  assert.equal(run(a, 'ros2 node list'), cap5('list_23_off').split('\n').slice(0, 5).join('\n'))
})

test('Roboter im WLAN: Knoten, LOCALHOST, veralteter Daemon (P 1)', () => {
  sim.reset(); sim.home.set('.bashrc', 'source /opt/ros/jazzy/setup.bash\nexport ROS_AUTOMATIC_DISCOVERY_RANGE=LOCALHOST\n')
  sim.addRobot({ domain: 23 })
  const a = fresh('da')
  advance(300)
  a.exec('export ROS_DOMAIN_ID=23')
  assert.equal(run(a, 'ros2 node list'), '', 'LOCALHOST: der Roboter ist ein anderer Rechner')
  a.exec('export ROS_AUTOMATIC_DISCOVERY_RANGE=SUBNET')
  assert.equal(run(a, 'ros2 node list'), '', 'Daemon läuft noch mit LOCALHOST')
  assert.equal(run(a, 'ros2 daemon stop'), cap5('daemon_stop'))
  assert.equal(run(a, 'ros2 node list'), '/hlds_laser_publisher\n/robot_state_publisher\n/turtlebot3_node')
  const tl = run(a, 'ros2 topic list')
  for (const t of ['/battery_state', '/cmd_vel', '/imu', '/joint_states', '/magnetic_field', '/odom', '/robot_description', '/scan', '/sensor_state', '/tf', '/tf_static']) assert.ok(tl.split('\n').includes(t), t)
  assert.equal(run(a, 'ros2 node info /robot_state_publisher'), cap5('rsp_info'))
  assert.equal(run(a, 'ros2 daemon status'), cap5('daemon_status_on'))
  assert.equal(run(a, 'ros2 daemon start'), cap5('daemon_start_again'))
})

test('Roboter: tf2_echo, Twist vs. TwistStamped, Fahrt, view_frames', () => {
  sim.reset(); sim.home.set('.bashrc', 'source /opt/ros/jazzy/setup.bash\n')
  const r = sim.addRobot({ domain: 23 })
  const a = fresh('da'); const b = fresh('db')
  a.exec('export ROS_DOMAIN_ID=23'); b.exec('export ROS_DOMAIN_ID=23')
  const m = a.lines.length
  a.exec('ros2 run tf2_ros tf2_echo base_footprint base_scan'); advance(1100); a.interrupt()
  assert.equal(out(a, m).split('\n').slice(0, 11).join('\n'), cap5('rsp_tf_scan').split('\n').slice(1, 12).join('\n'))
  b.exec('ros2 topic pub -t 3 /cmd_vel geometry_msgs/msg/Twist "{linear: {x: 0.2}}"'); advance(4000)
  assert.equal(r.x, 0, 'Twist wird ignoriert, der Roboter erwartet TwistStamped')
  assert.match(run(b, 'ros2 topic type /cmd_vel'), /geometry_msgs\/msg\/TwistStamped/)
  b.exec('ros2 topic pub --once /cmd_vel geometry_msgs/msg/TwistStamped "{twist: {linear: {x: 0.2}}}"'); advance(2000)
  assert.ok(r.x > 0.2, 'TwistStamped bewegt den Roboter: x=' + r.x)
  const k = a.lines.length
  a.exec('ros2 run tf2_tools view_frames'); advance(5200)
  const lines = out(a, k).split('\n').map(stripStamp)
  assert.equal(lines[0], '[INFO] [T] [view_frames]: Listening to tf data for 5.0 seconds...')
  assert.equal(lines[1], '[INFO] [T] [view_frames]: Generating graph...')
  assert.match(lines[2], /^\[INFO\] \[T\] \[view_frames\]: Result:tf2_msgs\.srv\.FrameGraph_Response\(frame_yaml="base_footprint: \\n  parent: 'odom'\\n  broadcaster: 'default_authority'\\n  rate: 20\.\d{3}\\n/)
  assert.match(lines[3], /^\[INFO\] \[T\] \[view_frames\]: Exporting graph in frames_\d{4}-\d\d-\d\d_\d\d\.\d\d\.\d\d\.pdf file\.\.\.$/)
  const files = run(a, 'ls')
  assert.match(files, /frames_[\d._-]+\.gv/); assert.match(files, /frames_[\d._-]+\.pdf/)
  const gvName = files.split(/\s+/).find(f => f.endsWith('.gv'))
  const gv = run(a, 'cat ' + gvName)
  assert.match(gv, /^digraph G \{\n"odom" -> "base_footprint"\[label=" Broadcaster: default_authority\\nAverage rate: 20\./)
  assert.match(gv, /"base_link" -> "base_scan"\[label=" Broadcaster: default_authority\\nAverage rate: 10000\.0\\nBuffer length: 0\.0\\nMost recent transform: 0\.0\\nOldest transform: 0\.0\\n"\];/)
  for (const fr of ['wheel_left_link', 'wheel_right_link', 'caster_back_link', 'imu_link']) assert.ok(gv.includes('"' + fr + '"'), fr)
  let opened = null; a.views.add({ onSession: (w, d) => { if (w === 'open') opened = d } })
  a.exec('xdg-open ' + gvName.replace('.gv', '.pdf'))
  assert.ok(opened && opened.svg.includes('base_scan'))
})

test('Pipes mit grep und Umleitungen', () => {
  sim.reset(); const a = fresh('da')
  a.exec('ros2 run demo_nodes_cpp talker')
  assert.equal(run(a, 'printenv | grep ROS'), 'ROS_VERSION=2\nROS_PYTHON_VERSION=3\nROS_DISTRO=jazzy')
  const b = fresh('db')
  assert.equal(run(b, 'ros2 topic list | grep -v ros'), '/chatter\n/parameter_events')
  b.exec('ros2 node list > knoten.txt')
  assert.equal(run(b, 'cat knoten.txt'), '/talker')
  const n = b.lines.length
  b.exec('ros2 topic echo /chatter | grep 3'); advance(4100); b.interrupt()
  assert.ok(out(b, n).split('\n').every(l => l === '^C' || l.includes('3')), out(b, n))
})

test('LOCALHOST blockiert auch die Nachlieferung von /tf_static', () => {
  sim.reset(); sim.home.set('.bashrc', 'source /opt/ros/jazzy/setup.bash\n')
  sim.addRobot({ domain: 23 })
  const a = fresh('da')
  a.exec('export ROS_DOMAIN_ID=23 ROS_AUTOMATIC_DISCOVERY_RANGE=LOCALHOST')
  const n = a.lines.length
  a.exec('ros2 run tf2_ros tf2_echo base_footprint base_scan'); advance(1100); a.interrupt()
  assert.match(out(a, n), /Waiting for transform base_footprint ->  base_scan: Invalid frame ID "base_footprint"/)
  assert.ok(!out(a, n).includes('At time'))
})

test('kopieren: Schritte mit Kommentaren, sonst eingegebene Befehle', () => {
  sim.reset()
  const a = fresh('ka')
  assert.equal(JSON.stringify(a.copyText()), JSON.stringify({ text: '', n: 0 }))
  a.draft = 'ros2 run demo_nodes_cpp talker'
  assert.equal(JSON.stringify(a.copyText()), JSON.stringify({ text: 'ros2 run demo_nodes_cpp talker', n: 1 }))
  a.exec('ros2 node list'); a.exec('help'); a.exec('ros2 topic list')
  assert.equal(JSON.stringify(a.copyText()), JSON.stringify({ text: 'ros2 node list\nros2 topic list', n: 2 }))
  const b = fresh('kb')
  ctx.ROS2Sim.setSteps('kb', '\n  # erst den Sender\n  ros2 run demo_nodes_cpp talker\n\n  ros2 topic list\n')
  assert.equal(JSON.stringify(b.copyText()), JSON.stringify({ text: '# erst den Sender\nros2 run demo_nodes_cpp talker\n\nros2 topic list', n: 2 }))
})

test('QoS-Warnung: Wortlaut bei Sender und Empfänger wie Jazzy', () => {
  sim.reset()
  const strip = (x) => x.replace(/\[\d+\.\d+\]/g, '[T]').replace(/_ros2cli_\d+/g, '_ros2cli_N')
  const p = fresh('qp'); const e = fresh('qe')
  p.exec('ros2 topic pub --rate 2 --qos-reliability best_effort /chatter std_msgs/msg/String "{data: hallo}"'); advance(1500)
  const n = e.lines.length; const m = p.lines.length
  e.exec('ros2 topic echo --qos-reliability reliable /chatter'); advance(1500)
  const capE = fs.readFileSync(path.join(dir, 'captures6', 'qos_incompatible_echo.txt'), 'utf8').trim()
  const capP = fs.readFileSync(path.join(dir, 'captures6', 'qos_incompatible_pub.txt'), 'utf8').trim()
  assert.equal(strip(out(e, n)).trim(), strip(capE))
  assert.ok(strip(out(p, m)).split('\n').includes(strip(capP)), out(p, m))
  p.interrupt(); e.interrupt()
})

console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nAlle Tests bestanden')
process.exit(failures ? 1 : 0)

/*!
 * ROS2Sim – ein simulierter ROS-2-Graph (Jazzy) für LiaScript
 * Version:  0.5.0
 * Autoren:  Sebastian Zug & Claude Code (Opus 5.5) mit LiaScript Teaching-Agent
 * Lizenz:   MIT
 *
 * Alle Ausgaben, die wie ROS aussehen, wurden an ROS 2 Jazzy (ros2cli 0.32.13)
 * mitgeschnitten (test/captures/). Alles, was die Simulation selbst sagt,
 * beginnt mit "ℹ" und ist farblich abgesetzt – erfundene ROS-Ausgaben gibt es nicht.
 */
(function (root) {
  'use strict'
  if (root.ROS2Sim && root.ROS2Sim.version) return

  const VERSION = '0.5.2'
  const help = () => {
    const h = root.ROS2SimHelp || {}
    const out = {}
    for (const k of Object.keys(h)) out[k] = h[k].replace(/\n$/, '')
    return out
  }

  // ======================================================================
  // Hilfsfunktionen
  // ======================================================================

  function stamp () {
    const ms = Date.now()
    const nsec = (ms % 1000) * 1e6 + Math.floor(Math.random() * 1e6)
    return Math.floor(ms / 1000) + '.' + String(nsec).padStart(9, '0')
  }

  function randHex (n) {
    let s = ''
    for (let i = 0; i < n; i++) s += '0123456789abcdef'[Math.floor(Math.random() * 16)]
    return s
  }

  function levenshtein (a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i])
    for (let j = 1; j <= b.length; j++) d[0][j] = j
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1,
          d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      }
    }
    return d[a.length][b.length]
  }

  function closest (word, candidates) {
    let best = null; let bestD = Infinity
    for (const c of candidates) {
      const d = levenshtein(word, c)
      if (d < bestD) { best = c; bestD = d }
    }
    const limit = Math.max(1, Math.min(3, Math.floor(word.length / 3)))
    return bestD > 0 && bestD <= limit ? best : null
  }

  function commonPrefix (list) {
    if (!list.length) return ''
    let p = list[0]
    for (const s of list) while (!s.startsWith(p)) p = p.slice(0, -1)
    return p
  }

  const sorted = (arr) => arr.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

  // ======================================================================
  // Nachrichtentypen (Texte von `ros2 interface show` unter Jazzy)
  // ======================================================================

  const DEPRECATED = '# This was originally provided as an example message.\n' +
    '# It is deprecated as of Foxy\n' +
    '# It is recommended to create your own semantically meaningful message.\n' +
    '# However if you would like to continue using this please use the equivalent in example_msgs.\n\n'

  const TYPES = {
    'std_msgs/msg/String': {
      fields: [['string', 'data']],
      hash: 'RIHS01_df668c740482bbd48fb39d76a70dfd4bd59db1288021743503259e948f6b1a18',
      show: DEPRECATED + 'string data'
    },
    'std_msgs/msg/Int32': {
      fields: [['int32', 'data']],
      hash: 'RIHS01_b6578ded3c58c626cfe8d1a6fb6e04f706f97e9f03d2727c9ff4e74b1cef0deb',
      show: DEPRECATED + 'int32 data'
    },
    'std_msgs/msg/Float64': {
      fields: [['float64', 'data']],
      hash: 'RIHS01_705ba9c3d1a09df43737eb67095534de36fd426c0587779bda2bc51fe790182a',
      show: DEPRECATED + 'float64 data'
    },
    'std_msgs/msg/Bool': {
      fields: [['bool', 'data']],
      hash: 'RIHS01_feb91e995ff9ebd09c0cb3d2aed18b11077585839fb5db80193b62d74528f6c9',
      show: DEPRECATED + 'bool data'
    },
    'geometry_msgs/msg/Vector3': {
      fields: [['float64', 'x'], ['float64', 'y'], ['float64', 'z']],
      hash: null,
      show: '# This represents a vector in free space.\n\n' +
        '# This is semantically different than a point.\n' +
        '# A vector is always anchored at the origin.\n' +
        '# When a transform is applied to a vector, only the rotational component is applied.\n\n' +
        'float64 x\nfloat64 y\nfloat64 z'
    },
    'geometry_msgs/msg/Twist': {
      fields: [['geometry_msgs/msg/Vector3', 'linear'], ['geometry_msgs/msg/Vector3', 'angular']],
      hash: 'RIHS01_9c45bf16fe0983d80e3cfe750d6835843d265a9a6c46bd2e609fcddde6fb8d2a',
      show: '# This expresses velocity in free space broken into its linear and angular parts.\n\n' +
        'Vector3  linear\n\tfloat64 x\n\tfloat64 y\n\tfloat64 z\n' +
        'Vector3  angular\n\tfloat64 x\n\tfloat64 y\n\tfloat64 z'
    },
    'turtlesim/msg/Pose': {
      fields: [['float32', 'x'], ['float32', 'y'], ['float32', 'theta'],
        ['float32', 'linear_velocity'], ['float32', 'angular_velocity']],
      hash: 'RIHS01_739beba26bcba6920404ba722b7b8321348512f92ea5be235c47251940dd8aa9',
      show: 'float32 x\nfloat32 y\nfloat32 theta\n\nfloat32 linear_velocity\nfloat32 angular_velocity'
    },
    'turtlesim/msg/Color': {
      fields: [['uint8', 'r'], ['uint8', 'g'], ['uint8', 'b']],
      hash: null,
      show: 'uint8 r\nuint8 g\nuint8 b'
    }
  }

  // Services und Actions: Anfrage/Antwort bzw. Ziel/Ergebnis/Rückmeldung als eigene Nachrichtentypen
  const SRVS = {
    'std_srvs/srv/Empty': { show: '---' },
    'turtlesim/srv/Spawn': { show: 'float32 x\nfloat32 y\nfloat32 theta\nstring name # Optional.  A unique name will be created and returned if this is empty\n---\nstring name' },
    'turtlesim/srv/Kill': { show: 'string name\n---' },
    'turtlesim/srv/SetPen': { show: 'uint8 r\nuint8 g\nuint8 b\nuint8 width\nuint8 off\n---' },
    'turtlesim/srv/TeleportAbsolute': { show: 'float32 x\nfloat32 y\nfloat32 theta\n---' },
    'turtlesim/srv/TeleportRelative': { show: 'float32 linear\nfloat32 angular\n---' }
  }
  const ACTIONS = {
    'turtlesim/action/RotateAbsolute': {
      show: '# The desired heading in radians\nfloat32 theta\n---\n# The angular displacement in radians to the starting position\nfloat32 delta\n---\n# The remaining rotation in radians\nfloat32 remaining'
    }
  }
  Object.assign(TYPES, {
    'std_srvs/srv/Empty_Request': { fields: [] },
    'std_srvs/srv/Empty_Response': { fields: [] },
    'turtlesim/srv/Spawn_Request': { fields: [['float32', 'x'], ['float32', 'y'], ['float32', 'theta'], ['string', 'name']] },
    'turtlesim/srv/Spawn_Response': { fields: [['string', 'name']] },
    'turtlesim/srv/Kill_Request': { fields: [['string', 'name']] },
    'turtlesim/srv/Kill_Response': { fields: [] },
    'turtlesim/srv/SetPen_Request': { fields: [['uint8', 'r'], ['uint8', 'g'], ['uint8', 'b'], ['uint8', 'width'], ['uint8', 'off']] },
    'turtlesim/srv/SetPen_Response': { fields: [] },
    'turtlesim/srv/TeleportAbsolute_Request': { fields: [['float32', 'x'], ['float32', 'y'], ['float32', 'theta']] },
    'turtlesim/srv/TeleportAbsolute_Response': { fields: [] },
    'turtlesim/srv/TeleportRelative_Request': { fields: [['float32', 'linear'], ['float32', 'angular']] },
    'turtlesim/srv/TeleportRelative_Response': { fields: [] },
    'turtlesim/action/RotateAbsolute_Goal': { fields: [['float32', 'theta']] },
    'turtlesim/action/RotateAbsolute_Result': { fields: [['float32', 'delta']] },
    'turtlesim/action/RotateAbsolute_Feedback': { fields: [['float32', 'remaining']] }
  })
  for (const t of Object.values(TYPES)) t.builtin = true
  const MSG_TYPES = () => Object.keys(TYPES).filter(t => t.includes('/msg/'))
  // Services/Actions unter ROS 2 Jazzy, die die Simulation kennt, aber nicht nachbildet
  const REAL_SRVS = new Set(['std_srvs/srv/SetBool', 'std_srvs/srv/Trigger', 'example_interfaces/srv/AddTwoInts',
    'example_interfaces/srv/SetBool', 'example_interfaces/srv/Trigger', 'rcl_interfaces/srv/DescribeParameters',
    'rcl_interfaces/srv/GetParameterTypes', 'rcl_interfaces/srv/GetParameters', 'rcl_interfaces/srv/ListParameters',
    'rcl_interfaces/srv/SetParameters', 'rcl_interfaces/srv/SetParametersAtomically',
    'type_description_interfaces/srv/GetTypeDescription'])
  const REAL_ACTIONS = new Set(['example_interfaces/action/Fibonacci', 'action_tutorials_interfaces/action/Fibonacci',
    'nav2_msgs/action/NavigateToPose'])

  // Typen, die im Graphen vorkommen, deren Inhalt aber nicht nachgebildet ist
  const INTERNAL_TYPES = {
    'rcl_interfaces/msg/Log': 'RIHS01_e28ce254ca8abc06abf92773b74602cdbf116ed34fbaf294fb9f81da9f318eac',
    'rcl_interfaces/msg/ParameterEvent': 'RIHS01_043e627780fcad87a22d225bc2a037361dba713fca6a6b9f4b869a5aa0393204'
  }
  // Nachrichtentypen dieser Pakete unter ROS 2 Jazzy (`ros2 interface list -m`)
  const REAL_MSGS = {
    builtin_interfaces: 'Duration Time',
    example_interfaces: 'Bool Byte ByteMultiArray Char Empty Float32 Float32MultiArray Float64 Float64MultiArray Int16 Int16MultiArray Int32 Int32MultiArray Int64 Int64MultiArray Int8 Int8MultiArray MultiArrayDimension MultiArrayLayout String UInt16 UInt16MultiArray UInt32 UInt32MultiArray UInt64 UInt64MultiArray UInt8 UInt8MultiArray WString',
    geometry_msgs: 'Accel AccelStamped AccelWithCovariance AccelWithCovarianceStamped Inertia InertiaStamped Point Point32 PointStamped Polygon PolygonInstance PolygonInstanceStamped PolygonStamped Pose Pose2D PoseArray PoseStamped PoseWithCovariance PoseWithCovarianceStamped Quaternion QuaternionStamped Transform TransformStamped Twist TwistStamped TwistWithCovariance TwistWithCovarianceStamped Vector3 Vector3Stamped VelocityStamped VelocityWithCovarianceStamped Wrench WrenchStamped',
    nav_msgs: 'Goals GridCells MapMetaData OccupancyGrid Odometry Path Trajectory TrajectoryPoint',
    rcl_interfaces: 'FloatingPointRange IntegerRange ListParametersResult Log LoggerLevel Parameter ParameterDescriptor ParameterEvent ParameterEventDescriptors ParameterType ParameterValue SetLoggerLevelsResult SetParametersResult',
    sensor_msgs: 'BatteryState CameraInfo ChannelFloat32 CompressedImage FluidPressure Illuminance Image Imu JointState Joy JoyFeedback JoyFeedbackArray LaserEcho LaserScan MagneticField MultiDOFJointState MultiEchoLaserScan NavSatFix NavSatStatus PointCloud PointCloud2 PointField Range RegionOfInterest RelativeHumidity Temperature TimeReference',
    std_msgs: 'Bool Byte ByteMultiArray Char ColorRGBA Empty Float32 Float32MultiArray Float64 Float64MultiArray Header Int16 Int16MultiArray Int32 Int32MultiArray Int64 Int64MultiArray Int8 Int8MultiArray MultiArrayDimension MultiArrayLayout String UInt16 UInt16MultiArray UInt32 UInt32MultiArray UInt64 UInt64MultiArray UInt8 UInt8MultiArray',
    tf2_msgs: 'TF2Error TFMessage',
    turtlesim: 'Color Pose',
    visualization_msgs: 'ImageMarker InteractiveMarker InteractiveMarkerControl InteractiveMarkerFeedback InteractiveMarkerInit InteractiveMarkerPose InteractiveMarkerUpdate Marker MarkerArray MenuEntry MeshFile UVCoordinate'
  }
  const KNOWN_PKGS = Object.keys(REAL_MSGS)
  const REAL_TYPES = new Set(KNOWN_PKGS.flatMap(p => REAL_MSGS[p].split(' ').map(n => p + '/msg/' + n)))

  const INT_RANGES = {
    int8: [-128, 127], uint8: [0, 255], int16: [-32768, 32767], uint16: [0, 65535],
    int32: [-2147483648, 2147483647], uint32: [0, 4294967295],
    int64: [-9223372036854775808, 9223372036854775807], uint64: [0, 18446744073709551615],
    byte: [0, 255], char: [0, 255]
  }
  const isFloatT = (t) => t === 'float32' || t === 'float64'
  const isIntT = (t) => t in INT_RANGES
  const isNested = (t) => t.includes('/')

  // Feld: [typ, name, arr]; arr = undefined | { kind: 'seq' | 'bseq' | 'arr', size }
  const defaultValue = (t) => isNested(t) ? defaultMsg(t) : (t === 'string' || t === 'wstring') ? '' : t === 'bool' ? false : 0
  function defaultMsg (type) {
    const m = {}
    for (const [t, n, arr] of TYPES[type].fields) {
      m[n] = arr ? (arr.kind === 'arr' ? Array.from({ length: arr.size }, () => defaultValue(t)) : []) : defaultValue(t)
    }
    return m
  }

  function typeStatus (type) {
    if (TYPES[type] && type.includes("/msg/")) return "ok"
    if (INTERNAL_TYPES[type]) return 'internal'
    if (REAL_TYPES.has(type)) return 'unmodelled'
    return 'invalid'
  }

  function normalizeType (type) {
    // `ros2 topic pub /x std_msgs/String` ist unter Jazzy ebenfalls erlaubt
    const m = /^([A-Za-z][\w]*)\/([A-Z][A-Za-z0-9]*)$/.exec(type || '')
    return m ? m[1] + '/msg/' + m[2] : type
  }

  // ---------------------------------------------------------- Python-Repr

  function pyFloat (x) {
    if (Number.isNaN(x)) return 'nan'
    if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf'
    if (Number.isInteger(x) && Math.abs(x) < 1e16) return x.toFixed(1)
    return String(x).replace(/e([+-])(\d)$/, 'e$10$2')
  }

  function pyStr (s) {
    if (s.includes("'") && !s.includes('"')) return '"' + s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n') + '"'
    return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'"
  }

  function pyRepr (type, msg) {
    const cls = type.replace(/\//g, '.')
    return cls + '(' + TYPES[type].fields.map(([t, n, arr]) => n + '=' + pyField(t, arr, msg[n])).join(', ') + ')'
  }

  // rclpy speichert Zahlenfolgen als array.array, feste Zahlen-Arrays als numpy.ndarray
  const ARRAY_CODES = { float32: 'f', float64: 'd', int8: 'b', uint8: 'B', int16: 'h', uint16: 'H', int32: 'i', uint32: 'I', int64: 'q', uint64: 'Q' }
  function pyField (t, arr, v) {
    if (!arr) return pyValue(t, v)
    const items = v.map(x => pyValue(t, x))
    if (ARRAY_CODES[t] && arr.kind !== 'arr') return items.length ? `array('${ARRAY_CODES[t]}', [${items.join(', ')}])` : `array('${ARRAY_CODES[t]}')`
    if (ARRAY_CODES[t]) return 'array([' + v.map(x => isFloatT(t) && Number.isInteger(x) ? x + '.' : String(x)).join(', ') + '])'
    return '[' + items.join(', ') + ']'
  }

  function pyValue (t, v) {
    if (isNested(t)) return pyRepr(t, v)
    if (t === 'string' || t === 'wstring') return pyStr(v)
    if (t === 'bool') return v ? 'True' : 'False'
    if (isFloatT(t)) return pyFloat(v)
    return String(v)
  }

  // ---------------------------------------------------------- YAML-Ausgabe

  const YAML_RESERVED = /^(true|false|yes|no|on|off|null|~)$/i
  function yamlStr (s) {
    if (s === '') return "''"
    const needsQuote = /^\s|\s$/.test(s) || /:\s|:$|\s#/.test(s) ||
      /^[-?:,[\]{}#&*!|>'"%@`]/.test(s) || /^\.\.\./.test(s) || YAML_RESERVED.test(s) ||
      /^[-+]?(\d[\d_]*(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(s) || /[\n\t]/.test(s)
    return needsQuote ? "'" + s.replace(/'/g, "''") + "'" : s
  }

  function yamlScalar (t, v, opts) {
    if (t === 'string' || t === 'wstring') {
      if (opts && opts.noStr) return yamlStr(`<string length: <${v.length}>>`)
      if (opts && !opts.full && v.length > 128) v = v.slice(0, 128) + '...'
      return yamlStr(v)
    }
    if (t === 'bool') return v ? 'true' : 'false'
    if (isFloatT(t)) {
      // PyYAML schreibt Unendlich und NaN als .inf, -.inf und .nan
      if (Number.isNaN(v)) return '.nan'
      if (!Number.isFinite(v)) return v > 0 ? '.inf' : '-.inf'
      return pyFloat(v)
    }
    return String(v)
  }

  // Typnamen wie in rosidl_runtime_py (für --no-arr)
  const IDL_NAMES = { float32: 'float', float64: 'double', bool: 'boolean', byte: 'octet', char: 'uint8' }
  const idlName = (t) => isNested(t) ? t : (IDL_NAMES[t] || t)

  // Ausgabe wie yaml.dump(..., default_flow_style=False) in ros2 topic echo
  function yamlMsg (type, msg, indent, opts) {
    indent = indent || ''
    opts = opts || {}
    const out = []
    for (const [t, n, arr] of TYPES[type].fields) {
      const v = msg[n]
      if (arr) {
        if (opts.noArr) {
          const ab = arr.kind === 'arr' ? `<array type: ${idlName(t)}[${arr.size}]>`
            : arr.kind === 'bseq' ? `<sequence type: ${idlName(t)}[${arr.size}], length: ${v.length}>`
              : `<sequence type: ${idlName(t)}, length: ${v.length}>`
          out.push(indent + n + ': ' + yamlStr(ab)); continue
        }
        let items = v; let cut = false
        if (!opts.full && items.length > 128) { items = items.slice(0, 128); cut = true }
        if (!items.length && !cut) { out.push(indent + n + ': []'); continue }
        out.push(indent + n + ':')
        for (const it of items) out.push(...yamlItem(t, it, indent, opts))
        if (cut) out.push(indent + "- '...'")
      } else if (isNested(t)) {
        if (!TYPES[t].fields.length) { out.push(indent + n + ': {}'); continue }
        out.push(indent + n + ':')
        out.push(...yamlMsg(t, v, indent + '  ', opts))
      } else {
        out.push(indent + n + ': ' + yamlScalar(t, v, opts))
      }
    }
    return out
  }

  function yamlItem (t, it, indent, opts) {
    if (!isNested(t)) return [indent + '- ' + yamlScalar(t, it, opts)]
    if (!TYPES[t].fields.length) return [indent + '- {}']
    const sub = yamlMsg(t, it, indent + '  ', opts)
    sub[0] = indent + '- ' + sub[0].slice(indent.length + 2)
    return sub
  }

  // ---------------------------------------------------------- YAML-Eingabe

  class YamlError extends Error {}

  function scalar (raw, quoted) {
    if (quoted) return { s: raw, kind: 'str' }
    const s = raw.trim()
    if (/^(true|yes|on)$/i.test(s)) return { v: true, kind: 'bool', s }
    if (/^(false|no|off)$/i.test(s)) return { v: false, kind: 'bool', s }
    if (/^(null|~)?$/i.test(s)) return { v: null, kind: 'null', s }
    if (/^[-+]?(0|[1-9][\d_]*)$/.test(s)) return { v: parseInt(s.replace(/_/g, ''), 10), kind: 'int', s }
    if (/^[-+]?(\d[\d_]*\.\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return { v: parseFloat(s.replace(/_/g, '')), kind: 'float', s }
    if (/^[-+]?\.(inf|Inf|INF)$/.test(s)) return { v: s.startsWith('-') ? -Infinity : Infinity, kind: 'float', s }
    return { s, kind: 'str' }
  }

  function parseYaml (text) {
    const src = String(text || '')
    if (!src.trim()) return {}
    let i = 0
    const ws = () => { while (i < src.length && /\s/.test(src[i])) i++ }
    function quoted () {
      const q = src[i++]; let out = ''
      while (i < src.length) {
        const c = src[i++]
        if (c === q) {
          if (q === "'" && src[i] === "'") { out += "'"; i++; continue }
          return out
        }
        if (q === '"' && c === '\\') { const e = src[i++]; out += e === 'n' ? '\n' : e === 't' ? '\t' : e; continue }
        out += c
      }
      throw new YamlError('unterminated string')
    }
    function plain (stops) {
      let out = ''
      while (i < src.length && !stops.includes(src[i])) {
        if (src[i] === ':' && /\s/.test(src[i + 1] || ' ') && stops.includes(',')) break
        out += src[i++]
      }
      return out
    }
    function value (stops) {
      ws()
      const c = src[i]
      if (c === '{') return flowMap()
      if (c === '[') return flowSeq()
      if (c === '"' || c === "'") { const s = quoted(); ws(); return scalar(s, true) }
      const p = plain(stops)
      if (src[i] === ':' && stops.includes(',')) throw new YamlError('mapping in plain scalar')
      return scalar(p, false)
    }
    function flowMap () {
      i++; const obj = {}
      ws()
      if (src[i] === '}') { i++; return obj }
      for (;;) {
        ws()
        let key
        if (src[i] === '"' || src[i] === "'") key = quoted()
        else {
          key = ''
          while (i < src.length && src[i] !== ':' && src[i] !== ',' && src[i] !== '}') key += src[i++]
          key = key.trim()
        }
        ws()
        if (src[i] !== ':') throw new YamlError('expected :')
        i++
        obj[key] = value([',', '}'])
        ws()
        if (src[i] === ',') { i++; continue }
        if (src[i] === '}') { i++; return obj }
        throw new YamlError('expected , or }')
      }
    }
    function flowSeq () {
      i++; const arr = []
      ws()
      if (src[i] === ']') { i++; return arr }
      for (;;) {
        arr.push(value([',', ']']))
        ws()
        if (src[i] === ',') { i++; continue }
        if (src[i] === ']') { i++; return arr }
        throw new YamlError('expected , or ]')
      }
    }
    ws()
    if (src[i] === '{') {
      const r = flowMap(); ws()
      if (i < src.length) throw new YamlError('trailing characters')
      return r
    }
    // Blockform:  "data: Hallo"  oder mehrzeilig mit Einrückung
    const lines = src.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'))
    const rootObj = {}
    const stack = [{ indent: -1, obj: rootObj }]
    for (const line of lines) {
      const ind = line.length - line.trimStart().length
      const m = /^([A-Za-z_][\w]*)\s*:(\s+(.*))?$/.exec(line.trim())
      if (!m) throw new YamlError('not a mapping')
      while (stack.length > 1 && ind <= stack[stack.length - 1].indent) stack.pop()
      const parent = stack[stack.length - 1].obj
      const rest = (m[3] || '').trim()
      if (!rest) { parent[m[1]] = {}; stack.push({ indent: ind, obj: parent[m[1]] }) } else parent[m[1]] = parseInline(rest)
    }
    return rootObj
  }

  function parseInline (text) {
    const t = text.trim()
    if (t.startsWith('{')) return parseYaml(t)
    if (t.startsWith('"') || t.startsWith("'")) {
      const q = t[0]
      if (!t.endsWith(q) || t.length < 2) throw new YamlError('unterminated string')
      let inner = t.slice(1, -1)
      if (q === "'") inner = inner.replace(/''/g, "'")
      return scalar(inner, true)
    }
    if (t.startsWith('[')) return parseYaml('{v: ' + t + '}').v
    if (/:\s/.test(t)) throw new YamlError('mapping values not allowed here')
    return scalar(t, false)
  }

  class PopulateError extends Error {}

  function pyStrOf (sc) {
    if (sc.kind === 'str') return sc.s
    if (sc.kind === 'bool') return sc.v ? 'True' : 'False'
    if (sc.kind === 'float') return pyFloat(sc.v)
    if (sc.kind === 'null') return 'None'
    return String(sc.v)
  }

  function convert (t, n, sc) {
    if (Array.isArray(sc) || (sc && sc.kind === undefined)) {
      throw new PopulateError(`The '${n}' field must be of type '${t === 'string' ? 'str' : isFloatT(t) ? 'float' : t === 'bool' ? 'bool' : 'int'}'`)
    }
    if (t === 'string' || t === 'wstring') return pyStrOf(sc)
    if (t === 'bool') {
      if (sc.kind === 'str') return sc.s.length > 0
      return !!sc.v
    }
    if (isFloatT(t)) {
      let v
      if (sc.kind === 'str') {
        const s = sc.s.trim()
        if (!/^[-+]?((\d+\.?\d*|\.\d+)([eE][-+]?\d+)?|inf|infinity|nan)$/i.test(s)) {
          throw new PopulateError(`could not convert string to float: '${sc.s}'`)
        }
        v = parseFloat(s.replace(/^([-+]?)inf(inity)?$/i, '$1Infinity'))
        if (/nan/i.test(s)) v = NaN
      } else if (sc.kind === 'null') {
        throw new PopulateError("float() argument must be a string or a real number, not 'NoneType'")
      } else v = Number(sc.v)
      // wie in Python: der Wert bleibt ungerundet, bis ihn ein C++-Knoten als float32 liest
      return v
    }
    // Ganzzahlen
    let v
    if (sc.kind === 'str') {
      if (!/^\s*[-+]?\d+\s*$/.test(sc.s)) throw new PopulateError(`invalid literal for int() with base 10: '${sc.s}'`)
      v = parseInt(sc.s, 10)
    } else if (sc.kind === 'null') {
      throw new PopulateError("int() argument must be a string, a bytes-like object or a real number, not 'NoneType'")
    } else v = Math.trunc(Number(sc.v))
    const [lo, hi] = INT_RANGES[t]
    if (v < lo || v > hi) {
      throw new PopulateError(`The '${n}' field must be ${lo === 0 ? 'an unsigned integer' : 'an integer'} in [${lo}, ${hi}]`)
    }
    return v
  }

  function populate (type, obj) {
    const msg = defaultMsg(type)
    const short = type.split('/').pop()
    for (const key of Object.keys(obj)) {
      const f = TYPES[type].fields.find(x => x[1] === key)
      if (!f) throw new PopulateError(`'${short}' object has no attribute '${key}'`)
      const [t, , arr] = f
      const val = obj[key]
      if (arr) {
        if (val && val.kind === 'null') continue
        if (!Array.isArray(val)) throw new PopulateError(`The '${key}' field must be a set or sequence and each value of type '${isNested(t) ? t.split('/').pop() : idlName(t)}'`)
        if (arr.kind === 'arr' && val.length !== arr.size) throw new PopulateError(`The '${key}' field must be a set or sequence with length ${arr.size}`)
        if (arr.kind === 'bseq' && val.length > arr.size) throw new PopulateError(`The '${key}' field must be a set or sequence with length <= ${arr.size}`)
        msg[key] = val.map(x => isNested(t) ? populate(t, x || {}) : convert(t, key, x))
      } else if (isNested(t)) {
        if (val && val.kind === 'null') continue
        if (!val || val.kind !== undefined || Array.isArray(val)) {
          throw new PopulateError(`The '${key}' field must be a sub message of type '${t.split('/').pop()}'`)
        }
        msg[key] = populate(t, val)
      } else {
        msg[key] = convert(t, key, val)
      }
    }
    return msg
  }

  function msgFromYaml (type, text) {
    let obj
    try { obj = parseYaml(text) } catch (e) {
      if (e instanceof YamlError) return { error: 'The passed value needs to be in YAML string or a dictionary' }
      throw e
    }
    if (!obj || typeof obj !== 'object' || obj.kind !== undefined || Array.isArray(obj)) {
      return { error: 'The passed value needs to be in YAML string or a dictionary' }
    }
    try { return { msg: populate(type, obj) } } catch (e) {
      if (e instanceof PopulateError) return { error: 'Failed to populate field: ' + e.message }
      throw e
    }
  }

  function yamlSkeleton (type, str) {
    const parts = TYPES[type].fields.map(([t, n0, arr]) => {
      // YAML 1.1 liest yes/no/on/off als Wahrheitswert – solche Schlüssel müssen in Anführungszeichen
      const n = /^(yes|no|on|off|true|false)$/i.test(n0) ? "'" + n0 + "'" : n0
      if (arr) return n + ': [' + (arr.kind === 'arr' ? Array.from({ length: arr.size }, () => isFloatT(t) ? '0.0' : isNested(t) ? yamlSkeleton(t, str) : '0').join(', ') : '') + ']'
      if (isNested(t)) return n + ': ' + yamlSkeleton(t, str)
      if (t === 'string') return n + ': ' + (str === undefined ? "'Hallo'" : "''")
      if (t === 'bool') return n + ': true'
      if (isFloatT(t)) return n + ': 0.0'
      return n + ': 0'
    })
    return '{' + parts.join(', ') + '}'
  }

  function protoYaml (type, indent) {
    indent = indent || ''
    const out = []
    for (const [t, n, arr] of TYPES[type].fields) {
      if (arr) {
        if (arr.kind !== 'arr') out.push(indent + n + ': []')
        else { out.push(indent + n + ':'); for (let i = 0; i < arr.size; i++) out.push(...yamlItem(t, defaultValue(t), indent, {})) }
      }
      else if (isNested(t)) { out.push(indent + n + ':'); out.push(...protoYaml(t, indent + '  ')) } else {
        out.push(indent + n + ': ' + (t === 'string' ? "''" : t === 'bool' ? 'false' : isFloatT(t) ? '0.0' : '0'))
      }
    }
    return out
  }

  // ======================================================================
  // Namen
  // ======================================================================

  function validateTopic (name) {
    if (!name) return 'topic name must not be empty'
    if (/[^A-Za-z0-9_/~{}]/.test(name)) return 'topic name must not contain characters other than alphanumerics, \'_\', \'~\', \'{\', or \'}\''
    if (/^\/?\d/.test(name) || /\/\d/.test(name)) return 'topic name must not start with a number'
    if (name.includes('//')) return 'topic name must not contain repeated forward slashes'
    if (name.length > 1 && name.endsWith('/')) return 'topic name must not end with a forward slash'
    return null
  }

  function resolveName (name, ns, nodeName) {
    if (name.startsWith('/')) return name
    if (name.startsWith('~')) return (ns === '/' ? '' : ns) + '/' + nodeName + name.slice(1)
    return (ns === '/' ? '' : ns) + '/' + name
  }

  // ======================================================================
  // QoS
  // ======================================================================

  function normQos (q) {
    q = q || {}
    return {
      reliability: (q.reliability || 'RELIABLE').toUpperCase(),
      durability: (q.durability || 'VOLATILE').toUpperCase(),
      depth: q.depth || 10
    }
  }

  function qosProblem (pubQ, subQ) {
    if (pubQ.reliability === 'BEST_EFFORT' && subQ.reliability === 'RELIABLE') return 'RELIABILITY'
    if (pubQ.durability === 'VOLATILE' && subQ.durability === 'TRANSIENT_LOCAL') return 'DURABILITY'
    return null
  }

  // ======================================================================
  // Graph
  // ======================================================================

  // ======================================================================
  // Discovery: Rechner, ROS_DOMAIN_ID, ROS_AUTOMATIC_DISCOVERY_RANGE
  // ======================================================================

  const LAPTOP = { host: 'laptop', domain: 0, range: 'SUBNET' }

  // Sehen sich zwei Teilnehmer (Knoten oder Daemon-Sicht)?
  function sees (a, b) {
    a = a || LAPTOP; b = b || LAPTOP
    if (a === b) return true
    if (a.domain !== b.domain) return false
    if (a.range === 'OFF' || b.range === 'OFF') return false
    if (a.host !== b.host && (a.range === 'LOCALHOST' || b.range === 'LOCALHOST')) return false
    return true
  }

  const PARAM_SERVICES = [
    ['describe_parameters', 'rcl_interfaces/srv/DescribeParameters'],
    ['get_parameter_types', 'rcl_interfaces/srv/GetParameterTypes'],
    ['get_parameters', 'rcl_interfaces/srv/GetParameters'],
    ['get_type_description', 'type_description_interfaces/srv/GetTypeDescription'],
    ['list_parameters', 'rcl_interfaces/srv/ListParameters'],
    ['set_parameters', 'rcl_interfaces/srv/SetParameters'],
    ['set_parameters_atomically', 'rcl_interfaces/srv/SetParametersAtomically']
  ]
  const DEBUG_TOPICS = ['/rosout', '/parameter_events']

  class Graph {
    constructor () {
      this.nodes = []
      this.handlers = {}
      this.stats = new Map()
      this.daemon = null
      this.pid = 2090000 + Math.floor(Math.random() * 9000)
      this.gidCounter = 0x1400
    }

    on (ev, fn) {
      (this.handlers[ev] = this.handlers[ev] || []).push(fn)
      return () => { this.handlers[ev] = (this.handlers[ev] || []).filter(f => f !== fn) }
    }

    emit (ev, data) {
      for (const fn of (this.handlers[ev] || []).slice()) {
        try { fn(data) } catch (e) { console.error('[ROS2Sim]', e) }
      }
    }

    nextPid () { this.pid += 1 + Math.floor(Math.random() * 40); return this.pid }

    nextGid () {
      this.gidCounter += 1
      const h = (n) => n.toString(16).padStart(2, '0')
      return ['01', '0f', '46', '35', randHex(2), randHex(2), randHex(2), randHex(2),
        '00', '00', '00', '00', '00', '00', h((this.gidCounter >> 8) & 255), h(this.gidCounter & 255)].join('.')
    }

    addNode ({ name, ns, kind, logger, lang, scope }) {
      ns = ns || '/'
      scope = scope || LAPTOP
      const node = {
        host: scope.host,
        domain: scope.domain,
        range: scope.range,
        name,
        ns,
        fqn: (ns === '/' ? '' : ns) + '/' + name,
        hidden: name.startsWith('_'),
        kind: kind || 'node',
        lang: lang || 'py',
        pubs: [],
        subs: [],
        services: [], // [name, type, handler]
        actionServers: [], // [name, type, handler]
        actionClients: [],
        params: new Map(),
        alive: true,
        log: logger || (() => {})
      }
      // Standardparameter: rclcpp-Knoten haben zusätzlich die qos_overrides von /parameter_events
      if (node.lang === 'cpp') {
        for (const [k, v] of [['depth', 1000], ['durability', 'volatile'], ['history', 'keep_last'], ['reliability', 'reliable']]) {
          node.params.set('qos_overrides./parameter_events.publisher.' + k, {
            type: typeof v === 'number' ? 'integer' : 'string',
            value: v,
            readOnly: true,
            desc: `qos policy {${k}} for publisher {/parameter_events}`
          })
        }
      }
      node.params.set('start_type_description_service', { type: 'boolean', value: true, readOnly: true })
      node.params.set('use_sim_time', { type: 'boolean', value: false })
      this.nodes.push(node)
      this.createPublisher(node, '/parameter_events', 'rcl_interfaces/msg/ParameterEvent', {}, true)
      this.createPublisher(node, '/rosout', 'rcl_interfaces/msg/Log', {}, true)
      this.createSubscription(node, '/parameter_events', 'rcl_interfaces/msg/ParameterEvent', {}, null, true)
      if (node.kind !== 'daemon') {
        for (const [s, t] of PARAM_SERVICES) node.services.push([node.fqn + '/' + s, t, null])
      }
      this.emit('change')
      return node
    }

    removeNode (node) {
      if (!node.alive) return
      node.alive = false
      this.nodes = this.nodes.filter(n => n !== node)
      this.emit('change')
    }

    removeEndpoint (ep) {
      const n = ep.node
      n.pubs = n.pubs.filter(e => e !== ep)
      n.subs = n.subs.filter(e => e !== ep)
      this.emit('change')
    }

    findService (name) {
      for (const n of this.nodes) for (const s of n.services) if (s[0] === name) return { node: n, type: s[1], handler: s[2] }
      return null
    }

    findAction (name) {
      for (const n of this.nodes) for (const a of n.actionServers) if (a[0] === name) return { node: n, type: a[1], handler: a[2] }
      return null
    }

    actions () {
      const m = new Map()
      for (const n of this.nodes) {
        for (const [a, t] of n.actionServers) { if (!m.has(a)) m.set(a, { name: a, types: [], servers: [], clients: [] }); m.get(a).servers.push(n); if (!m.get(a).types.includes(t)) m.get(a).types.push(t) }
        for (const [a, t] of n.actionClients) { if (!m.has(a)) m.set(a, { name: a, types: [], servers: [], clients: [] }); m.get(a).clients.push(n); if (!m.get(a).types.includes(t)) m.get(a).types.push(t) }
      }
      return m
    }

    createPublisher (node, topic, type, qos, silent) {
      const ep = { kind: 'pub', node, topic, type, qos: normQos(qos), gid: this.nextGid(), history: [] }
      ep.publish = (msg) => this.publish(ep, msg)
      node.pubs.push(ep)
      this.checkQos(ep)
      if (!silent) this.emit('change')
      return ep
    }

    createSubscription (node, topic, type, qos, cb, silent) {
      const ep = { kind: 'sub', node, topic, type, qos: normQos(qos), gid: this.nextGid(), cb }
      node.subs.push(ep)
      this.checkQos(ep)
      if (!silent) this.emit('change')
      // transient_local: letzte Nachrichten an späte Abonnenten nachliefern
      if (cb && ep.qos.durability === 'TRANSIENT_LOCAL') {
        for (const p of this.allEndpoints('pub')) {
          if (p.topic === topic && p.type === type && !qosProblem(p.qos, ep.qos) && p.qos.durability === 'TRANSIENT_LOCAL' && sees(p.node, node)) {
            for (const m of p.history) setTimeout(() => { if (node.alive) cb(m) }, 0)
          }
        }
      }
      return ep
    }

    allEndpoints (kind) {
      const out = []
      for (const n of this.nodes) for (const ep of (kind === 'sub' ? n.subs : n.pubs)) out.push(ep)
      return out
    }

    checkQos (ep) {
      if (DEBUG_TOPICS.includes(ep.topic)) return
      const others = this.allEndpoints(ep.kind === 'pub' ? 'sub' : 'pub')
        .filter(o => o.topic === ep.topic && o.type === ep.type && o.node !== ep.node && sees(o.node, ep.node))
      for (const o of others) {
        const pub = ep.kind === 'pub' ? ep : o
        const sub = ep.kind === 'pub' ? o : ep
        const pol = qosProblem(pub.qos, sub.qos)
        if (!pol) continue
        sub.node.log('WARN', `New publisher discovered on topic '${sub.topic}', offering incompatible QoS. No messages will be received from it. Last incompatible policy: ${pol}`)
        pub.node.log('WARN', `New subscription discovered on topic '${pub.topic}', requesting incompatible QoS. No messages will be sent to it. Last incompatible policy: ${pol}`)
      }
    }

    matchingSubs (pubEp) {
      return this.allEndpoints('sub').filter(s => s.topic === pubEp.topic && s.type === pubEp.type && !qosProblem(pubEp.qos, s.qos) && sees(pubEp.node, s.node))
    }

    // Sicht eines Teilnehmers: dieselbe Schnittstelle wie der Graph, aber nur mit den sichtbaren Knoten
    view (scope) {
      const g = this
      const f = Object.create(g)
      Object.defineProperty(f, 'nodes', { get: () => g.nodes.filter(n => sees(scope, n)) })
      for (const m of ['on', 'emit', 'addNode', 'removeNode', 'removeEndpoint', 'createPublisher', 'createSubscription', 'publish', 'matchingSubs', 'checkQos', 'allEndpoints', 'nextPid', 'nextGid', 'reset', 'ensureDaemon', 'stat']) f[m] = g[m].bind(g)
      f.scope = scope
      return f
    }

    stat (topic) {
      if (!this.stats.has(topic)) this.stats.set(topic, { count: 0, last: null, lastType: null, times: [] })
      return this.stats.get(topic)
    }

    publish (ep, msg) {
      if (!ep.node.alive) return
      const st = this.stat(ep.topic)
      st.count++; st.last = msg; st.lastType = ep.type
      st.times.push(Date.now()); if (st.times.length > 40) st.times.shift()
      if (ep.qos.durability === 'TRANSIENT_LOCAL') {
        ep.history.push(msg); if (ep.history.length > ep.qos.depth) ep.history.shift()
      }
      const delivered = this.matchingSubs(ep).filter(s => s.cb)
      this.emit('message', { ep, delivered, msg })
      for (const s of delivered) {
        try { if (s.node.alive) s.cb(msg) } catch (e) { console.error('[ROS2Sim]', e) }
      }
    }

    topics () {
      const m = new Map()
      for (const n of this.nodes) {
        for (const ep of n.pubs.concat(n.subs)) {
          let t = m.get(ep.topic)
          if (!t) { t = { name: ep.topic, types: [], pubs: [], subs: [] }; m.set(ep.topic, t) }
          if (!t.types.includes(ep.type)) t.types.push(ep.type)
          ;(ep.kind === 'pub' ? t.pubs : t.subs).push(ep)
        }
      }
      return m
    }

    topicNames () { return sorted([...this.topics().keys()]) }

    nodeByFqn (fqn) { return this.nodes.find(n => n.fqn === fqn) }

    // Ein ros2-Daemon je Domain. Er behält die Einstellungen, mit denen er gestartet wurde –
    // wer ROS_AUTOMATIC_DISCOVERY_RANGE ändert, muss ihn mit `ros2 daemon stop` neu starten.
    ensureDaemon (scope) {
      scope = scope || LAPTOP
      this.daemons = this.daemons || new Map()
      let d = this.daemons.get(scope.domain)
      if (!d || !d.alive) {
        d = this.addNode({ name: `_ros2cli_daemon_${scope.domain}_` + randHex(32), kind: 'daemon', scope: { host: scope.host, domain: scope.domain, range: scope.range } })
        this.daemons.set(scope.domain, d)
      }
      this.daemon = d
      return d
    }

    stopDaemon (domain) {
      this.daemons = this.daemons || new Map()
      const d = this.daemons.get(domain)
      if (!d || !d.alive) return false
      this.removeNode(d); this.daemons.delete(domain)
      return true
    }

    reset () {
      for (const n of this.nodes) n.alive = false
      this.nodes = []
      this.daemon = null
      this.daemons = new Map()
      this.stats.clear()
      this.emit('change')
    }
  }

  // ======================================================================
  // Prozesse und Knoten
  // ======================================================================

  class Proc {
    constructor (sess, label) {
      this.sess = sess
      this.label = label
      this.alive = true
      this.cleanups = []
      this.onInterrupt = null
      this.onKey = null
    }

    print (text, cls) { if (this.alive) this.sess.print(text, cls) }
    hint (text) { if (this.alive) this.sess.hint(text) }
    defer (fn) { this.cleanups.push(fn) }
    every (ms, fn) {
      const h = setInterval(() => { if (this.alive) fn() }, ms)
      this.defer(() => clearInterval(h))
    }

    after (ms, fn) {
      const h = setTimeout(() => { if (this.alive) fn() }, ms)
      this.defer(() => clearTimeout(h))
    }

    interrupt () {
      if (!this.alive) return
      if (this.onInterrupt) { try { this.onInterrupt() } catch (e) { console.error(e) } }
      this.exit()
    }

    exit () {
      if (!this.alive) return
      for (const f of this.cleanups) { try { f() } catch (e) { console.error(e) } }
      this.alive = false
      this.sess.procEnded(this)
    }
  }

  function parseRosArgs (argv) {
    const remaps = []
    const params = []
    const ignored = []
    let inRos = false
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i]
      if (a === '--ros-args') { inRos = true; continue }
      if (a === '--') { inRos = false; continue }
      if (!inRos) continue
      if (a === '-r' || a === '--remap') {
        const r = argv[++i] || ''
        const m = /^(.+?):=(.*)$/.exec(r)
        if (m) remaps.push({ from: m[1], to: m[2] })
      } else if (a === '-p' || a === '--param') {
        const m = /^(.+?):=(.*)$/.exec(argv[++i] || '')
        if (m) params.push({ name: m[1], value: m[2] })
      } else if (a === '--params-file' || a === '--log-level' || a === '-e' || a === '--enclave') {
        ignored.push(a); i++
      } else ignored.push(a)
    }
    return { remaps, params, ignored }
  }

  // ---------------------------------------------------------- Parameter

  // Wert wie ros2param aus YAML lesen: Typ ergibt sich aus der Schreibweise
  function paramValueFromString (s) {
    const sc = scalar(s, false)
    if (sc.kind === 'bool') return { type: 'boolean', value: sc.v }
    if (sc.kind === 'int') return { type: 'integer', value: sc.v }
    if (sc.kind === 'float') return { type: 'double', value: sc.v }
    if (/^'.*'$|^".*"$/.test(s)) return { type: 'string', value: s.slice(1, -1) }
    return { type: 'string', value: s }
  }

  // Liefert null bei Erfolg, sonst den Grund (Texte von rclcpp unter Jazzy)
  function setParam (node, name, raw) {
    const d = node.params.get(name)
    if (!d) return `parameter '${name}' cannot be set because it was not declared`
    if (d.readOnly) return `parameter '${name}' cannot be set because it is read-only`
    const v = paramValueFromString(raw)
    if (v.type !== d.type) return `Wrong parameter type, parameter {${name}} is of type {${d.type}}, setting it to {${v.type}} is not allowed.`
    if (d.type === 'integer' && d.min !== undefined && (v.value < d.min || v.value > d.max)) return `Parameter {${name}} doesn't comply with integer range.`
    d.value = v.value
    if (node.onParamSet) node.onParamSet(name, v.value)
    return null
  }

  function makeRosNode (ctx, defName, lang) {
    const g = ctx.sim.graph
    let name = defName; let ns = '/'
    for (const r of ctx.remaps) {
      if (r.from === '__node' || r.from === '__name') name = r.to
      if (r.from === '__ns') ns = r.to.startsWith('/') ? r.to : '/' + r.to
    }
    const proc = ctx.proc
    const node = g.addNode({
      name,
      ns,
      scope: ctx.sess && ctx.sess.scope ? ctx.sess.scope() : LAPTOP,
      lang: lang || 'py',
      logger: (lvl, txt, logger) => proc.print(`[${lvl}] [${stamp()}] [${logger || node.name}]: ${txt}`, lvl.toLowerCase())
    })
    const resolve = (topic) => {
      const full = resolveName(topic, ns, name)
      for (const r of ctx.remaps) {
        if (r.from.startsWith('__')) continue
        if (resolveName(r.from, ns, name) === full) return resolveName(r.to, ns, name)
      }
      return full
    }
    node.resolve = resolve
    node.pub = (topic, type, qos) => g.createPublisher(node, resolve(topic), type, qos)
    node.sub = (topic, type, qos, cb) => g.createSubscription(node, resolve(topic), type, qos, cb)
    node.srv = (srvName, type, handler) => {
      const e = [resolve(srvName), type, handler]; node.services.push(e); g.emit('change'); return e
    }
    node.action = (actName, type, handler) => {
      const e = [resolve(actName), type, handler]; node.actionServers.push(e); g.emit('change'); return e
    }
    node.drop = (e) => {
      node.services = node.services.filter(x => x !== e)
      node.actionServers = node.actionServers.filter(x => x !== e)
      g.emit('change')
    }
    node.declare = (pname, type, value, opts) => node.params.set(pname, Object.assign({ type, value }, opts || {}))
    proc.nodes = (proc.nodes || []).concat(node)
    proc.defer(() => g.removeNode(node))
    return node
  }

  const rclcppShutdown = (proc) => () => proc.print(`[INFO] [${stamp()}] [rclcpp]: signal_handler(SIGINT/SIGTERM)`, 'info')

  function talker (lang) {
    return (ctx) => {
      const { proc } = ctx
      const node = makeRosNode(ctx, 'talker', lang)
      const pub = node.pub('chatter', 'std_msgs/msg/String', { depth: lang === 'cpp' ? 7 : 10 })
      let i = lang === 'cpp' ? 1 : 0
      proc.every(1000, () => {
        const data = 'Hello World: ' + i++
        node.log('INFO', lang === 'cpp' ? `Publishing: '${data}'` : `Publishing: "${data}"`)
        pub.publish({ data })
      })
      if (lang === 'cpp') proc.onInterrupt = rclcppShutdown(proc)
    }
  }

  function listener (lang, reliability) {
    return (ctx) => {
      const { proc } = ctx
      const node = makeRosNode(ctx, 'listener', lang)
      node.sub('chatter', 'std_msgs/msg/String', { depth: 10, reliability: reliability || 'RELIABLE' },
        (m) => node.log('INFO', `I heard: [${m.data}]`))
      if (lang === 'cpp') proc.onInterrupt = rclcppShutdown(proc)
    }
  }

  // ---------------------------------------------------------- turtlesim

  const WORLD = 11.088889
  const SPAWN = Math.fround(WORLD / 2)
  const PEN = [179, 184, 255]
  const f32 = Math.fround
  const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a))

  function turtlesimNode (ctx) {
    const { proc, sim } = ctx
    const node = makeRosNode(ctx, 'turtlesim', 'cpp')
    const world = { node, bg: [69, 86, 255], turtles: [], alive: true, counter: 0 }
    const range = { min: 0, max: 255, step: 1 }
    node.declare('background_b', 'integer', 255, Object.assign({ desc: 'Blue channel of the background color' }, range))
    node.declare('background_g', 'integer', 86, Object.assign({ desc: 'Green channel of the background color' }, range))
    node.declare('background_r', 'integer', 69, Object.assign({ desc: 'Red channel of the background color' }, range))
    node.declare('holonomic', 'boolean', false, { desc: 'If true, then turtles will be holonomic' })
    const param = (n) => node.params.get(n).value
    const readBg = () => { world.bg = [param('background_r'), param('background_g'), param('background_b')] }
    const clear = () => { readBg(); for (const t of world.turtles) t.path = [] }
    // Wie in turtle_frame.cpp: ein Parameterereignis des eigenen Knotens zeichnet den Hintergrund neu
    node.onParamSet = (n) => { if (n.startsWith('background_')) clear() }

    node.log('INFO', 'Starting turtlesim with node name ' + node.fqn)

    function spawn (name, x, y, theta) {
      const t = {
        name, x: f32(x), y: f32(y), theta: f32(theta), lin: 0, linY: 0, ang: 0, lastCmd: 0,
        path: [], pen: { c: PEN.slice(), width: 3, off: false }, goal: null, teleports: [], parts: []
      }
      node.log('INFO', `Spawning turtle [${name}] at x=[${t.x.toFixed(6)}], y=[${t.y.toFixed(6)}], theta=[${t.theta.toFixed(6)}]`)
      t.posePub = node.pub(name + '/pose', 'turtlesim/msg/Pose', { depth: 10 })
      t.colorPub = node.pub(name + '/color_sensor', 'turtlesim/msg/Color', { depth: 10 })
      t.cmdSub = node.sub(name + '/cmd_vel', 'geometry_msgs/msg/Twist', { depth: 10 }, (m) => {
        t.lin = m.linear.x; t.linY = m.linear.y; t.ang = m.angular.z; t.lastCmd = Date.now()
      })
      t.parts.push(node.srv(name + '/set_pen', 'turtlesim/srv/SetPen', (req) => {
        t.pen = { c: [req.r, req.g, req.b], width: req.width, off: !!req.off }
        return {}
      }))
      t.parts.push(node.srv(name + '/teleport_absolute', 'turtlesim/srv/TeleportAbsolute', (req) => {
        t.teleports.push({ x: f32(req.x), y: f32(req.y), theta: f32(req.theta) }); return {}
      }))
      t.parts.push(node.srv(name + '/teleport_relative', 'turtlesim/srv/TeleportRelative', (req) => {
        t.teleports.push({ rel: true, linear: f32(req.linear), angular: f32(req.angular) }); return {}
      }))
      t.parts.push(node.action(name + '/rotate_absolute', 'turtlesim/action/RotateAbsolute', {
        sendGoal (goal, cb) {
          if (t.goal) {
            node.log('WARN', 'Rotation goal received before a previous goal finished. Aborting previous goal')
            const old = t.goal; t.goal = null; old.cb.done('ABORTED', { delta: f32(old.start - t.theta) })
          }
          const h = { theta: f32(goal.theta), start: t.theta, cb }
          t.goal = h
          return {
            cancel () {
              if (t.goal !== h) return
              t.goal = null; t.ang = 0
              node.log('INFO', 'Rotation goal canceled')
              cb.done('CANCELED', { delta: f32(h.start - t.theta) })
            }
          }
        }
      }))
      world.turtles.push(t)
      sim.emit('worlds')
      return t
    }

    function kill (t) {
      const g = sim.graph
      for (const ep of [t.posePub, t.colorPub, t.cmdSub]) g.removeEndpoint(ep)
      for (const e of t.parts) node.drop(e)
      if (t.goal) { const old = t.goal; t.goal = null; old.cb.done('ABORTED', { delta: f32(old.start - t.theta) }) }
      world.turtles = world.turtles.filter(x => x !== t)
      sim.emit('worlds')
    }

    function nextName () {
      let n
      do { n = 'turtle' + (++world.counter) } while (world.turtles.some(t => t.name === n))
      return n
    }

    node.srv('clear', 'std_srvs/srv/Empty', () => { node.log('INFO', 'Clearing turtlesim.'); clear(); return {} })
    node.srv('reset', 'std_srvs/srv/Empty', () => {
      node.log('INFO', 'Resetting turtlesim.')
      for (const t of world.turtles.slice()) kill(t)
      world.counter = 0
      clear()
      spawn(nextName(), SPAWN, SPAWN, 0)
      return {}
    })
    node.srv('spawn', 'turtlesim/srv/Spawn', (req) => {
      let name = req.name
      if (!name) name = nextName()
      else if (world.turtles.some(t => t.name === name)) {
        node.log('ERROR', `A turtle named [${name}] already exists`)
        return { name: '' }
      }
      spawn(name, req.x, req.y, req.theta)
      return { name }
    })
    node.srv('kill', 'turtlesim/srv/Kill', (req) => {
      const t = world.turtles.find(x => x.name === req.name)
      if (!t) node.log('ERROR', `Tried to kill turtle [${req.name}], which does not exist`)
      else kill(t)
      return {}
    })
    spawn(nextName(), SPAWN, SPAWN, 0)

    const dt = 0.016
    proc.every(16, () => {
      for (const t of world.turtles.slice()) {
        let ox = t.x; let oy = t.y
        for (const tp of t.teleports.splice(0)) {
          if (tp.rel) { t.theta = (t.theta + tp.angular) % (2 * Math.PI); t.x += Math.cos(t.theta) * tp.linear; t.y += Math.sin(t.theta) * tp.linear } else { t.x = tp.x; t.y = tp.y; t.theta = tp.theta }
          if (!t.pen.off) t.path.push([ox, oy, t.x, t.y, t.pen.c, t.pen.width])
          ox = t.x; oy = t.y
        }
        if (t.goal) {
          const rem = wrapPi(t.goal.theta - t.theta)
          if (Math.abs(rem) < 0.02) {
            const h = t.goal; t.goal = null; t.ang = 0; t.lin = 0
            node.log('INFO', 'Rotation goal completed successfully')
            h.cb.done('SUCCEEDED', { delta: f32(h.start - t.theta) })
          } else {
            h2(t, rem)
          }
        }
        if (Date.now() - t.lastCmd > 1000) { t.lin = 0; t.linY = 0; t.ang = 0 }
        t.theta = (t.theta + t.ang * dt) % (2 * Math.PI)
        const holo = param('holonomic')
        t.x += (Math.cos(t.theta) * t.lin - (holo ? Math.sin(t.theta) * t.linY : 0)) * dt
        t.y += (Math.sin(t.theta) * t.lin + (holo ? Math.cos(t.theta) * t.linY : 0)) * dt
        // turtlesim rechnet intern in Bildkoordinaten (y nach unten) und meldet die Wand
        // nur links, rechts und unten – so verhält sich Jazzy, siehe test/captures2
        const cy = WORLD - t.y
        if (t.x < 0 || t.x > WORLD || cy > WORLD) {
          node.log('WARN', `Oh no! I hit the wall! (Clamping from [x=${t.x.toFixed(6)}, y=${cy.toFixed(6)}])`)
        }
        t.x = Math.min(Math.max(t.x, 0), WORLD); t.y = Math.min(Math.max(t.y, 0), WORLD)
        if ((ox !== t.x || oy !== t.y) && !t.pen.off) {
          t.path.push([ox, oy, t.x, t.y, t.pen.c, t.pen.width]); if (t.path.length > 30000) t.path.shift()
        }
        t.posePub.publish({ x: f32(t.x), y: f32(t.y), theta: f32(t.theta), linear_velocity: f32(t.lin), angular_velocity: f32(t.ang) })
        const c = t.path.length && !t.pen.off ? t.pen.c : world.bg
        t.colorPub.publish({ r: c[0], g: c[1], b: c[2] })
      }
    })
    function h2 (t, rem) {
      t.goal.cb.feedback({ remaining: f32(rem) })
      t.ang = rem > 0 ? 1.0 : -1.0; t.lin = 0; t.lastCmd = Date.now()
    }
    proc.onInterrupt = rclcppShutdown(proc)
    sim.worlds.push(world)
    sim.emit('worlds')
    proc.defer(() => {
      world.alive = false
      for (const t of world.turtles) if (t.goal) { const h = t.goal; t.goal = null; h.cb.done('ABORTED', { delta: f32(h.start - t.theta) }) }
      sim.worlds = sim.worlds.filter(w => w !== world)
      sim.emit('worlds')
    })
  }

  // Tasten aus teleop_turtle_key.cpp
  const TELEOP_ROT = { g: 0, t: 0.25 * Math.PI, r: 0.5 * Math.PI, e: 0.75 * Math.PI, d: Math.PI, c: -0.75 * Math.PI, v: -0.5 * Math.PI, b: -0.25 * Math.PI }

  function teleopNode (ctx) {
    const { proc, sim } = ctx
    const node = makeRosNode(ctx, 'teleop_turtle', 'cpp')
    const pub = node.pub('turtle1/cmd_vel', 'geometry_msgs/msg/Twist', { depth: 1 })
    const actName = node.resolve('turtle1/rotate_absolute')
    node.actionClients.push([actName, 'turtlesim/action/RotateAbsolute'])
    sim.graph.emit('change')
    proc.print('Reading from keyboard\n---------------------------\nUse arrow keys to move the turtle.\n' +
      "Use g|b|v|c|d|e|r|t keys to rotate to absolute orientations. 'f' to cancel a rotation.\n'q' to quit.")
    proc.keyMode = true
    let goal = null
    proc.defer(() => { if (goal) goal.cancel() })
    proc.onKey = (key) => {
      const tw = { linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } }
      if (key === 'ArrowUp') tw.linear.x = 2.0
      else if (key === 'ArrowDown') tw.linear.x = -2.0
      else if (key === 'ArrowLeft') tw.angular.z = 2.0
      else if (key === 'ArrowRight') tw.angular.z = -2.0
      else if (key === 'q') { proc.print('quit'); proc.exit(); return true } else if (key === 'f') {
        if (goal) { goal.cancel(); goal = null }
        return true
      } else if (key in TELEOP_ROT) {
        const srv = sim.graph.view(node).findAction(actName)
        if (srv && srv.handler) {
          let mine = null
          mine = srv.handler.sendGoal({ theta: TELEOP_ROT[key] }, {
            feedback () {},
            done () { if (goal === mine) goal = null }
          })
          goal = mine
        }
        return true
      } else return false
      pub.publish(tw)
      return true
    }
  }

  // ======================================================================
  // tf: Puffer, tf2_echo, static_transform_publisher
  // ======================================================================

  // Ersatztypen für tf, solange keine Bagdatei die echten Beschreibungen mitbringt
  // (nicht "builtin": eine Bagdatei darf sie durch die Originale ersetzen)
  Object.assign(TYPES, {
    'builtin_interfaces/msg/Time': { fields: [['int32', 'sec'], ['uint32', 'nanosec']], noShow: true },
    'std_msgs/msg/Header': { fields: [['builtin_interfaces/msg/Time', 'stamp'], ['string', 'frame_id']], noShow: true },
    'geometry_msgs/msg/Quaternion': { fields: [['float64', 'x'], ['float64', 'y'], ['float64', 'z'], ['float64', 'w']], noShow: true },
    'geometry_msgs/msg/Transform': { fields: [['geometry_msgs/msg/Vector3', 'translation'], ['geometry_msgs/msg/Quaternion', 'rotation']], noShow: true },
    'geometry_msgs/msg/TransformStamped': { fields: [['std_msgs/msg/Header', 'header'], ['string', 'child_frame_id'], ['geometry_msgs/msg/Transform', 'transform']], noShow: true },
    'tf2_msgs/msg/TFMessage': { fields: [['geometry_msgs/msg/TransformStamped', 'transforms', { kind: 'seq' }]], noShow: true }
  })

  const qmul = (a, b) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] + a[1] * b[3] + a[2] * b[0] - a[0] * b[2],
    a[3] * b[2] + a[2] * b[3] + a[0] * b[1] - a[1] * b[0],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]]
  const qinv = (q) => [-q[0], -q[1], -q[2], q[3]]
  const qrot = (q, v) => {
    const [x, y, z, w] = q
    const tx = 2 * (y * v[2] - z * v[1]); const ty = 2 * (z * v[0] - x * v[2]); const tz = 2 * (x * v[1] - y * v[0])
    return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)]
  }
  const tfCompose = (A, B) => { const r = qrot(A.q, B.t); return { t: [A.t[0] + r[0], A.t[1] + r[1], A.t[2] + r[2]], q: qmul(A.q, B.q) } }
  const tfInverse = (A) => { const qi = qinv(A.q); const r = qrot(qi, A.t); return { t: [-r[0], -r[1], -r[2]], q: qi } }
  const yawOf = (q) => Math.atan2(2 * (q[3] * q[2] + q[0] * q[1]), 1 - 2 * (q[1] * q[1] + q[2] * q[2]))

  // Wie tf2::Quaternion::setRPY
  function quatFromRPY (roll, pitch, yaw) {
    const hy = yaw / 2; const hp = pitch / 2; const hr = roll / 2
    const cy = Math.cos(hy); const sy = Math.sin(hy); const cp = Math.cos(hp); const sp = Math.sin(hp); const cr = Math.cos(hr); const sr = Math.sin(hr)
    return [sr * cp * cy - cr * sp * sy, cr * sp * cy + sr * cp * sy, cr * cp * sy - sr * sp * cy, cr * cp * cy + sr * sp * sy]
  }

  // Wie tf2::Matrix3x3::setRotation
  function matrixOf (q) {
    const [x, y, z, w] = q
    const d = x * x + y * y + z * z + w * w; const s = 2 / d
    const xs = x * s; const ys = y * s; const zs = z * s
    const wx = w * xs; const wy = w * ys; const wz = w * zs
    const xx = x * xs; const xy = x * ys; const xz = x * zs; const yy = y * ys; const yz = y * zs; const zz = z * zs
    return [[1 - (yy + zz), xy - wz, xz + wy], [xy + wz, 1 - (xx + zz), yz - wx], [xz - wy, yz + wx, 1 - (xx + yy)]]
  }

  // Wie tf2::Matrix3x3::getRotation – tf2 gibt Ergebnisse von lookupTransform über diese Matrix zurück,
  // deshalb kann das Quaternion das umgekehrte Vorzeichen tragen (q und -q sind dieselbe Drehung)
  function rotationOf (m) {
    const trace = m[0][0] + m[1][1] + m[2][2]
    const t = [0, 0, 0, 0]
    if (trace > 0) {
      let s = Math.sqrt(trace + 1)
      t[3] = s * 0.5; s = 0.5 / s
      t[0] = (m[2][1] - m[1][2]) * s; t[1] = (m[0][2] - m[2][0]) * s; t[2] = (m[1][0] - m[0][1]) * s
    } else {
      const i = m[0][0] < m[1][1] ? (m[1][1] < m[2][2] ? 2 : 1) : (m[0][0] < m[2][2] ? 2 : 0)
      const j = (i + 1) % 3; const k = (i + 2) % 3
      let s = Math.sqrt(m[i][i] - m[j][j] - m[k][k] + 1)
      t[i] = s * 0.5; s = 0.5 / s
      t[3] = (m[k][j] - m[j][k]) * s; t[j] = (m[j][i] + m[i][j]) * s; t[k] = (m[k][i] + m[i][k]) * s
    }
    return t
  }

  // Wie tf2::Matrix3x3::getRPY (getEulerYPR, Lösung 1)
  function rpyOf (m) {
    if (Math.abs(m[2][0]) >= 1) {
      const yaw = 0
      if (m[2][0] < 0) return [yaw + Math.atan2(m[0][1], m[0][2]), Math.PI / 2, yaw]
      return [-yaw + Math.atan2(-m[0][1], -m[0][2]), -Math.PI / 2, yaw]
    }
    const pitch = -Math.asin(m[2][0])
    const c = Math.cos(pitch)
    return [Math.atan2(m[2][1] / c, m[2][2] / c), pitch, Math.atan2(m[1][0] / c, m[0][0] / c)]
  }

  // printf("%.3f"): auch -0.000
  const f3 = (v, n) => ((v < 0 || Object.is(v, -0)) ? '-' : '') + Math.abs(v).toFixed(n === undefined ? 3 : n)

  class TfBuffer {
    constructor () { this.edges = new Map() } // child -> { parent, t, q, stamp: BigInt ns, isStatic }
    add (tfmsg, isStatic) {
      for (const ts of tfmsg.transforms || []) {
        const child = String(ts.child_frame_id).replace(/^\//, ''); const parent = String(ts.header.frame_id).replace(/^\//, '')
        const tr = ts.transform.translation; const ro = ts.transform.rotation
        const stamp = BigInt(ts.header.stamp.sec) * 1000000000n + BigInt(ts.header.stamp.nanosec)
        const prev = this.edges.get(child)
        const same = prev && !isStatic && !prev.isStatic && prev.parent === parent
        this.edges.set(child, {
          parent,
          t: [tr.x, tr.y, tr.z],
          q: [ro.x, ro.y, ro.z, ro.w],
          stamp,
          isStatic,
          count: same ? prev.count + 1 : 1,
          first: same ? prev.first : stamp
        })
      }
    }

    frames () {
      const s = new Set()
      for (const [c, e] of this.edges) { s.add(c); s.add(e.parent) }
      return sorted([...s])
    }

    has (f) { return this.edges.has(f) || [...this.edges.values()].some(e => e.parent === f) }

    ancestors (f) {
      const out = [f]; let cur = f; let n = 0
      while (this.edges.has(cur) && n++ < 100) { cur = this.edges.get(cur).parent; out.push(cur) }
      return out
    }

    // Transformation top -> f über die Kanten unterhalb von top; Zeitstempel nur der dynamischen Kanten
    chain (f, top) {
      let T = { t: [0, 0, 0], q: [0, 0, 0, 1] }; let cur = f; let stamp = null
      const path = []
      while (cur !== top && this.edges.has(cur)) { const e = this.edges.get(cur); path.unshift(e); cur = e.parent }
      for (const e of path) {
        T = tfCompose(T, { t: e.t, q: e.q })
        if (!e.isStatic) stamp = stamp === null || e.stamp < stamp ? e.stamp : stamp
      }
      return { T, stamp }
    }

    // Lage von source im Rahmen target (wie lookupTransform(target, source))
    lookup (target, source) {
      if (!this.has(target)) return { error: `Invalid frame ID "${target}" passed to canTransform argument target_frame - frame does not exist` }
      if (!this.has(source)) return { error: `Invalid frame ID "${source}" passed to canTransform argument source_frame - frame does not exist` }
      const up = this.ancestors(source)
      const top = this.ancestors(target).find(f => up.includes(f))
      if (top === undefined) return { error: `Could not find a connection between '${target}' and '${source}' because they are not part of the same tree.Tf has two or more unconnected trees.` }
      const a = this.chain(target, top); const b = this.chain(source, top)
      const stamps = [a.stamp, b.stamp].filter(s => s !== null)
      const stamp = stamps.length ? stamps.reduce((x, y) => x < y ? x : y) : 0n
      const R = tfCompose(tfInverse(a.T), b.T)
      return { t: R.t, q: rotationOf(matrixOf(R.q)), stamp }
    }
  }

  // Wie tf2_ros::TransformListener: eigener Knoten, abonniert /tf und /tf_static
  function makeTfListener (ctx) {
    const g = ctx.sim.graph
    const node = g.addNode({ name: 'transform_listener_impl_' + randHex(12), lang: 'cpp', scope: ctx.sess && ctx.sess.scope ? ctx.sess.scope() : LAPTOP })
    ctx.proc.defer(() => g.removeNode(node))
    const buf = new TfBuffer()
    g.createSubscription(node, '/tf', 'tf2_msgs/msg/TFMessage', { depth: 100 }, (m) => buf.add(m, false))
    g.createSubscription(node, '/tf_static', 'tf2_msgs/msg/TFMessage', { depth: 100, durability: 'TRANSIENT_LOCAL' }, (m) => buf.add(m, true))
    return buf
  }

  const TF2_ECHO_USAGE = 'Usage: tf2_echo source_frame target_frame [options]\n\n' +
    'This will echo the transform from the coordinate frame of the source_frame\n' +
    'to the coordinate frame of the target_frame. \n' +
    'Note: This is the transform to get data from target_frame into the source_frame.\n\n' +
    'Options:\n  -r <rate>       Echo rate in Hz (default: 1.0)\n  -t <time>       Fixed time to do the lookup (in seconds)\n  -p <precision>  Output precision (default: 3)'

  function tfEchoBlock (r, prec) {
    const m = matrixOf(r.q); const rpy = rpyOf(m)
    const at = r.stamp === 0n ? '0.0' : `${r.stamp / 1000000000n}.${String(r.stamp % 1000000000n).padStart(9, '0')}`
    const F = (v) => f3(v, prec)
    return [
      'At time ' + at,
      `- Translation: [${r.t.map(F).join(', ')}]`,
      `- Rotation: in Quaternion (xyzw) [${r.q.map(F).join(', ')}]`,
      `- Rotation: in RPY (radian) [${rpy.map(F).join(', ')}]`,
      `- Rotation: in RPY (degree) [${rpy.map(v => F(v * 180 / Math.PI)).join(', ')}]`,
      '- Matrix:',
      ...[0, 1, 2].map(i => [m[i][0], m[i][1], m[i][2], r.t[i]].map(v => F(v).padStart(prec + 4)).join('')),
      [0, 0, 0, 1].map(v => F(v).padStart(prec + 4)).join('')
    ].join('\n')
  }

  function tf2EchoNode (ctx) {
    const { proc, argv } = ctx
    const pos = []; let rate = 1; let prec = 3
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === '--ros-args') break
      if (argv[i] === '-r') rate = parseFloat(argv[++i]) || 1
      else if (argv[i] === '-p') prec = parseInt(argv[++i], 10)
      else if (argv[i] === '-t') i++
      else pos.push(argv[i])
    }
    if (pos.length < 2) { proc.print(TF2_ECHO_USAGE + '\n[ros2run]: Process exited with failure 1'); proc.exit(); return }
    const [src, tgt] = pos
    const node = makeRosNode(ctx, 'tf2_echo', 'cpp')
    const buf = makeTfListener(ctx)
    let lastWait = 0
    const tick = () => {
      const r = buf.lookup(src, tgt)
      if (r.error) {
        if (Date.now() - lastWait >= 2000) { lastWait = Date.now(); node.log('INFO', `Waiting for transform ${src} ->  ${tgt}: ${r.error}`) }
        return
      }
      proc.print(tfEchoBlock(r, prec))
    }
    proc.after(300, tick)
    proc.every(1000 / rate, tick)
    proc.onInterrupt = rclcppShutdown(proc)
  }

  const STP_HELP = 'usage: static_transform_publisher [--x X] [--y Y] [--z Z] [--qx QX] [--qy QY] [--qz QZ] [--qw QW] [--roll ROLL] [--pitch PITCH] [--yaw YAW] --frame-id FRAME_ID --child-frame-id CHILD_FRAME_ID\n\n' +
    'A command line utility for manually sending a static transform.\n\n' +
    'If no translation or orientation is provided, the identity transform will be published.\n\n' +
    'The translation offsets are in meters.\n\n' +
    'The rotation may be provided with roll, pitch, yaw euler angles in radians, or as a quaternion.\n\n' +
    'required arguments:\n  --frame-id FRAME_ID parent frame\n  --child-frame-id CHILD_FRAME_ID child frame id\n\n' +
    'optional arguments:\n  --x X                 x component of translation\n  --y Y                 y component of translation\n  --z Z                 z component of translation\n' +
    '  --qx QX               x component of quaternion rotation\n  --qy QY               y component of quaternion rotation\n  --qz QZ               z component of quaternion rotation\n  --qw QW               w component of quaternion rotation\n' +
    '  --roll ROLL           roll component Euler rotation\n  --pitch PITCH         pitch component Euler rotation\n  --yaw YAW             yaw component Euler rotation'

  function staticTfNode (ctx) {
    const { proc, argv, sim } = ctx
    const a = argv.slice(0, argv.includes('--ros-args') ? argv.indexOf('--ros-args') : argv.length)
    if (a.includes('-h') || a.includes('--help')) { proc.print(STP_HELP); proc.exit(); return }
    const o = { x: 0, y: 0, z: 0 }; let q = null; let rpy = [0, 0, 0]; let parent = null; let child = null; const rest = []
    for (let i = 0; i < a.length; i++) {
      const k = a[i]; const v = a[i + 1]
      if (k === '--frame-id') { parent = v; i++ } else if (k === '--child-frame-id') { child = v; i++ } else if (['--x', '--y', '--z'].includes(k)) { o[k.slice(2)] = parseFloat(v); i++ } else if (['--qx', '--qy', '--qz', '--qw'].includes(k)) { q = q || [0, 0, 0, 1]; q['xyzw'.indexOf(k[3])] = parseFloat(v); i++ } else if (k === '--roll') { rpy[0] = parseFloat(v); i++ } else if (k === '--pitch') { rpy[1] = parseFloat(v); i++ } else if (k === '--yaw') { rpy[2] = parseFloat(v); i++ } else rest.push(k)
    }
    if (rest.length === 8 || rest.length === 9) {
      // alte Schreibweise: x y z yaw pitch roll parent child  bzw.  x y z qx qy qz qw parent child
      proc.print(`[WARN] [${stamp()}] []: Old-style arguments are deprecated; see --help for new-style arguments`, 'warn')
      const n = rest.map(Number)
      o.x = n[0]; o.y = n[1]; o.z = n[2]
      if (rest.length === 8) { rpy = [n[5], n[4], n[3]]; parent = rest[6]; child = rest[7] } else { q = [n[3], n[4], n[5], n[6]]; parent = rest[7]; child = rest[8] }
    } else if (rest.length) {
      proc.hint('Argumente nicht verstanden: ' + rest.join(' ') + '. Beispiel: ros2 run tf2_ros static_transform_publisher --x 1 --yaw 1.57 --frame-id welt --child-frame-id kamera')
      proc.exit(); return
    }
    if (!parent || !child) {
      proc.print(STP_HELP)
      proc.hint('--frame-id und --child-frame-id sind Pflicht.')
      proc.exit(); return
    }
    q = q || quatFromRPY(rpy[0], rpy[1], rpy[2])
    const node = makeRosNode(ctx, 'static_transform_publisher_' + Array.from({ length: 16 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]).join(''), 'cpp')
    const pub = node.pub('/tf_static', 'tf2_msgs/msg/TFMessage', { depth: 1, durability: 'TRANSIENT_LOCAL' })
    node.log('INFO', 'Spinning until stopped - publishing transform')
    const s6 = (v) => `'${v.toFixed(6)}'`
    proc.print(`translation: (${[o.x, o.y, o.z].map(s6).join(', ')})\nrotation: (${q.map(s6).join(', ')})\nfrom '${parent}' to '${child}'`)
    const now = Date.now()
    pub.publish({ transforms: [{ header: { stamp: { sec: Math.floor(now / 1000), nanosec: (now % 1000) * 1000000 }, frame_id: parent }, child_frame_id: child, transform: { translation: { x: o.x, y: o.y, z: o.z }, rotation: { x: q[0], y: q[1], z: q[2], w: q[3] } } }] })
    proc.onInterrupt = rclcppShutdown(proc)
    void sim
  }

  // ======================================================================
  // rviz2 (Draufsicht in 2D)
  // ======================================================================

  const RVIZ_TYPES = {
    LaserScan: { msg: 'sensor_msgs/msg/LaserScan', color: '#f5d000' },
    Odometry: { msg: 'nav_msgs/msg/Odometry', color: '#ff1900' },
    Pose: { msg: 'geometry_msgs/msg/PoseStamped', color: '#ff1900' },
    Path: { msg: 'nav_msgs/msg/Path', color: '#19ff00' },
    TF: { msg: null, color: '#ffffff' }
  }
  let rvizIds = 0

  function rvizAddDisplay (rv, type, topic, opts) {
    const d = Object.assign({ id: ++rvizIds, type, topic: topic || '', enabled: true, reliability: 'Reliable', color: RVIZ_TYPES[type].color, last: null, trail: [], count: 0 }, opts || {})
    rv.displays.push(d)
    rvizSubscribe(rv, d)
    return d
  }

  function rvizSubscribe (rv, d) {
    const g = rv.sim.graph
    if (d.sub) { g.removeEndpoint(d.sub); d.sub = null }
    d.last = null; d.trail = []; d.count = 0
    const T = RVIZ_TYPES[d.type]
    if (!T.msg || !d.enabled || !d.topic || !rv.node.alive) { rv.sim.emit('rviz'); return }
    d.sub = g.createSubscription(rv.node, topicArg(d.topic), T.msg, { depth: 5, reliability: d.reliability === 'Best Effort' ? 'BEST_EFFORT' : 'RELIABLE' }, (m) => {
      d.last = m; d.count++
      if (d.type === 'Odometry') { d.trail.push(m); if (d.trail.length > 100) d.trail.shift() }
    })
    rv.sim.emit('rviz')
  }

  function rvizRemoveDisplay (rv, d) {
    if (d.sub) rv.sim.graph.removeEndpoint(d.sub)
    rv.displays = rv.displays.filter(x => x !== d)
    rv.sim.emit('rviz')
  }

  // Konfiguration aus dem Makro: "LaserScan /scan; Odometry /odom; TF"
  function rvizApplyConfig (rv, cfg) {
    if (!cfg) return
    if (cfg.fixedFrame) rv.fixedFrame = cfg.fixedFrame
    for (const part of String(cfg.displays || '').split(/[;,]/).map(x => x.trim()).filter(Boolean)) {
      const [type, topic, rel] = part.split(/\s+/)
      if (RVIZ_TYPES[type]) rvizAddDisplay(rv, type, topic, rel ? { reliability: /^best/i.test(rel) ? 'Best Effort' : 'Reliable' } : {})
    }
  }

  function rvizNode (ctx) {
    const { proc, sim } = ctx
    const node = makeRosNode(ctx, 'rviz', 'cpp')
    // Der Knoten heißt /rviz, der Logger aber rviz2 – so unter Jazzy
    node.log('INFO', 'Stereo is NOT SUPPORTED', 'rviz2')
    node.log('INFO', 'OpenGl version: 4.6 (GLSL 4.6)', 'rviz2')
    node.log('INFO', 'Stereo is NOT SUPPORTED', 'rviz2')
    node.log('INFO', 'Stereo is NOT SUPPORTED', 'rviz2')
    node.pub('/clicked_point', 'geometry_msgs/msg/PointStamped', {})
    node.pub('/goal_pose', 'geometry_msgs/msg/PoseStamped', {})
    node.pub('/initialpose', 'geometry_msgs/msg/PoseWithCovarianceStamped', {})
    node.srv('~/reset_time', 'std_srvs/srv/Empty', () => ({}))
    const buf = makeTfListener(ctx)
    const rv = { sim, node, buf, displays: [], fixedFrame: 'map', alive: true }
    sim.rviz = rv
    rvizApplyConfig(rv, sim.rvizConfig)
    proc.defer(() => { rv.alive = false; if (sim.rviz === rv) sim.rviz = null; sim.emit('rviz') })
    proc.onInterrupt = rclcppShutdown(proc)
    sim.emit('rviz')
  }

  function rvizStatus (rv, d) {
    if (!d.enabled) return ['dis', 'Disabled']
    if (d.type === 'TF') return rv.buf.frames().length ? ['ok', 'OK: ' + rv.buf.frames().length + ' frames'] : ['warn', 'No transforms received']
    if (!d.topic) return ['err', 'Error subscribing: Empty topic name']
    const t = rv.sim.graph.view(rv.node).topics().get(topicArg(d.topic))
    if (t && t.pubs.length && !t.pubs.some(p => p.type === RVIZ_TYPES[d.type].msg)) return ['err', `Topic: type mismatch (${t.types[0]})`]
    // wie RViz: kein Hinweis auf die Ursache – die steht als Warnung im Terminal von rviz2
    if (!d.count) return ['warn', 'Topic: No messages received']
    const frame = d.type === 'Path' ? d.last.header.frame_id : (d.last.header && d.last.header.frame_id)
    const r = rv.buf.lookup(rv.fixedFrame, String(frame).replace(/^\//, ''))
    if (r.error && String(frame).replace(/^\//, '') !== rv.fixedFrame) {
      return ['err', `Transform: For frame [${frame}]: ` + (rv.buf.has(frame) ? `No transform to fixed frame [${rv.fixedFrame}]` : `Frame [${frame}] does not exist`)]
    }
    return ['ok', `OK: ${d.count} messages received`]
  }

  function defineRviz () {
    class Ros2Rviz extends HTMLElement {
      connectedCallback () {
        injectCss()
        sim.rvizConfig = { fixedFrame: this.getAttribute('fixed-frame') || '', displays: this.getAttribute('displays') || '' }
        this.innerHTML = `
<div class="r2-rviz">
  <div class="r2-rvbar"><b>RViz</b><span class="r2-rvhint">Ziehen: verschieben · Mausrad: zoomen · Doppelklick: zentrieren</span>
    <button class="r2-rvadd" title="Display hinzufügen">＋ Display</button></div>
  <div class="r2-rvbody">
    <div class="r2-rvpanel"></div>
    <div class="r2-rvview"><canvas role="img" aria-label="RViz-Ansicht"></canvas><span class="r2-rvoff"></span></div>
  </div>
</div>`
        this.panel = this.querySelector('.r2-rvpanel'); this.canvas = this.querySelector('canvas'); this.off = this.querySelector('.r2-rvoff')
        this.view = { x: 0, y: 0, scale: 60 }
        this.menuOpen = false
        this.querySelector('.r2-rvadd').onclick = () => { this.menuOpen = !this.menuOpen; this.renderPanel() }
        this.panel.addEventListener('change', (e) => this.onChange(e))
        this.panel.addEventListener('click', (e) => this.onClick(e))
        this.bindView()
        this.offs = [sim.on('rviz', () => this.renderPanel())]
        this.statusTimer = setInterval(() => this.renderStatus(), 500)
        const loop = () => { this.paint(); this.raf = requestAnimationFrame(loop) }
        loop()
        this.renderPanel()
      }

      disconnectedCallback () { (this.offs || []).forEach(f => f()); clearInterval(this.statusTimer); cancelAnimationFrame(this.raf) }

      bindView () {
        const c = this.canvas; let drag = null
        c.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y } })
        window.addEventListener('mouseup', () => { drag = null })
        c.addEventListener('mousemove', (e) => {
          if (!drag) return
          this.view.x = drag.vx - (e.clientX - drag.x) / this.view.scale
          this.view.y = drag.vy + (e.clientY - drag.y) / this.view.scale
        })
        c.addEventListener('wheel', (e) => { e.preventDefault(); this.view.scale = Math.min(400, Math.max(8, this.view.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15))) }, { passive: false })
        c.addEventListener('dblclick', () => { this.view = { x: 0, y: 0, scale: 60 } })
      }

      renderPanel () {
        const rv = sim.rviz
        if (!rv) { this.panel.innerHTML = ''; return }
        const frames = rv.buf.frames()
        const ffOpts = [...new Set([rv.fixedFrame].concat(frames))].map(f => `<option ${f === rv.fixedFrame ? 'selected' : ''}>${esc(f)}</option>`).join('')
        const gv = sim.graph.view(rv.node)
        const topicsOf = (type) => [...gv.topics().values()].filter(t => t.types.includes(RVIZ_TYPES[type].msg)).map(t => t.name)
        let html = `<div class="r2-rvrow r2-rvglobal"><b>Global Options</b> · Fixed Frame <select data-k="ff" aria-label="Fixed Frame">${ffOpts}</select>
          <div class="r2-rvst" data-s="global"></div></div>`
        for (const d of rv.displays) {
          const ts = [...new Set([d.topic].concat(topicsOf(d.type)).filter(Boolean))]
          html += `<div class="r2-rvrow" data-id="${d.id}">
            <label><input type="checkbox" data-k="en" ${d.enabled ? 'checked' : ''}> <b>${d.type}</b></label>
            ${RVIZ_TYPES[d.type].msg ? `<select data-k="topic" aria-label="Topic"><option value="">– Topic –</option>${ts.map(t => `<option ${t === d.topic ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
            <select data-k="rel" aria-label="Reliability Policy"><option ${d.reliability === 'Reliable' ? 'selected' : ''}>Reliable</option><option ${d.reliability === 'Best Effort' ? 'selected' : ''}>Best Effort</option></select>` : ''}
            <input type="color" data-k="color" value="${d.color}" aria-label="Farbe">
            <button data-k="del" title="Display entfernen">✕</button>
            <div class="r2-rvst" data-s="${d.id}"></div></div>`
        }
        if (this.menuOpen) {
          const byTopic = [...gv.topics().values()].flatMap(t => Object.keys(RVIZ_TYPES).filter(k => RVIZ_TYPES[k].msg && t.types.includes(RVIZ_TYPES[k].msg)).map(k => [k, t.name]))
          html += `<div class="r2-rvmenu"><div>Nach Typ:</div>${Object.keys(RVIZ_TYPES).map(k => `<button data-add="${k}">${k}</button>`).join('')}
            <div>Nach Topic:</div>${byTopic.map(([k, t]) => `<button data-add="${k}" data-topic="${esc(t)}">${esc(t)} (${k})</button>`).join('') || '<i>keine passenden Topics</i>'}</div>`
        }
        this.panel.innerHTML = html
        this.renderStatus()
      }

      renderStatus () {
        const rv = sim.rviz
        this.off.style.display = rv ? 'none' : 'flex'
        this.off.textContent = rv ? '' : 'rviz2 läuft nicht. Starte es in einem Terminal mit: ros2 run rviz2 rviz2'
        if (!rv) return
        const g = this.panel.querySelector('[data-s="global"]')
        if (g) {
          const ok = rv.buf.has(rv.fixedFrame)
          g.className = 'r2-rvst ' + (ok ? 'ok' : 'err')
          g.textContent = ok ? 'Fixed Frame: OK' : `Fixed Frame: Frame [${rv.fixedFrame}] does not exist`
        }
        for (const d of rv.displays) {
          const el = this.panel.querySelector(`[data-s="${d.id}"]`)
          if (!el) continue
          const [cls, txt] = rvizStatus(rv, d)
          el.className = 'r2-rvst ' + cls; el.textContent = txt
        }
        // neue Frames oder Topics: Auswahllisten auffrischen, aber nicht während einer Auswahl
        const sig = rv.buf.frames().join() + '|' + [...sim.graph.view(rv.node).topics().keys()].join()
        if (sig !== this.sig && !this.panel.contains(document.activeElement)) { this.sig = sig; this.renderPanel() }
      }

      onChange (e) {
        const rv = sim.rviz; if (!rv) return
        const k = e.target.dataset.k
        if (k === 'ff') { rv.fixedFrame = e.target.value; this.renderStatus(); return }
        const row = e.target.closest('[data-id]'); const d = row && rv.displays.find(x => x.id === +row.dataset.id)
        if (!d) return
        if (k === 'en') { d.enabled = e.target.checked; rvizSubscribe(rv, d) } else if (k === 'topic') { d.topic = e.target.value; rvizSubscribe(rv, d) } else if (k === 'rel') { d.reliability = e.target.value; rvizSubscribe(rv, d) } else if (k === 'color') d.color = e.target.value
      }

      onClick (e) {
        const rv = sim.rviz; if (!rv) return
        const add = e.target.dataset.add
        if (add) { rvizAddDisplay(rv, add, e.target.dataset.topic || ''); this.menuOpen = false; this.renderPanel(); return }
        if (e.target.dataset.k === 'del') {
          const row = e.target.closest('[data-id]'); const d = rv.displays.find(x => x.id === +row.dataset.id)
          if (d) rvizRemoveDisplay(rv, d)
        }
      }

      paint () {
        const c = this.canvas; const ctx = c.getContext('2d')
        const W = c.clientWidth || 400; const H = c.clientHeight || 320; const dpr = window.devicePixelRatio || 1
        if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr) }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.fillStyle = '#303030'; ctx.fillRect(0, 0, W, H)
        const v = this.view; const S = v.scale
        const X = (x) => W / 2 + (x - v.x) * S; const Y = (y) => H / 2 - (y - v.y) * S
        // Gitter: 10 x 10 Zellen à 1 m wie in RViz
        ctx.strokeStyle = 'rgba(160,160,164,0.5)'; ctx.lineWidth = 1; ctx.beginPath()
        for (let i = -5; i <= 5; i++) { ctx.moveTo(X(i), Y(-5)); ctx.lineTo(X(i), Y(5)); ctx.moveTo(X(-5), Y(i)); ctx.lineTo(X(5), Y(i)) }
        ctx.stroke()
        const rv = sim.rviz
        if (!rv) return
        const ff = rv.fixedFrame
        const pose2 = (frame) => {
          const f = String(frame || '').replace(/^\//, '')
          if (f === ff) return { x: 0, y: 0, yaw: 0 }
          const r = rv.buf.lookup(ff, f)
          return r.error ? null : { x: r.t[0], y: r.t[1], yaw: yawOf(r.q) }
        }
        const apply = (T, x, y) => [T.x + Math.cos(T.yaw) * x - Math.sin(T.yaw) * y, T.y + Math.sin(T.yaw) * x + Math.cos(T.yaw) * y]
        const arrow = (T, p, o, color, len) => {
          const [x, y] = apply(T, p.x, p.y); const yaw = T.yaw + yawOf([o.x, o.y, o.z, o.w])
          const ex = x + Math.cos(yaw) * len; const ey = y + Math.sin(yaw) * len
          ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2
          ctx.beginPath(); ctx.moveTo(X(x), Y(y)); ctx.lineTo(X(ex), Y(ey)); ctx.stroke()
          const h = len * 0.3
          ctx.beginPath(); ctx.moveTo(X(ex), Y(ey))
          ctx.lineTo(X(ex - h * Math.cos(yaw - 0.4)), Y(ey - h * Math.sin(yaw - 0.4)))
          ctx.lineTo(X(ex - h * Math.cos(yaw + 0.4)), Y(ey - h * Math.sin(yaw + 0.4))); ctx.fill()
        }
        for (const d of rv.displays) {
          if (!d.enabled) continue
          if (d.type === 'TF') {
            for (const f of rv.buf.frames()) {
              const T = pose2(f); if (!T) continue
              const L = 0.3
              ctx.lineWidth = 2
              ctx.strokeStyle = '#ff3333'; ctx.beginPath(); ctx.moveTo(X(T.x), Y(T.y)); ctx.lineTo(X(T.x + Math.cos(T.yaw) * L), Y(T.y + Math.sin(T.yaw) * L)); ctx.stroke()
              ctx.strokeStyle = '#33ff33'; ctx.beginPath(); ctx.moveTo(X(T.x), Y(T.y)); ctx.lineTo(X(T.x - Math.sin(T.yaw) * L), Y(T.y + Math.cos(T.yaw) * L)); ctx.stroke()
              ctx.fillStyle = '#ffffff'; ctx.font = '11px system-ui,sans-serif'; ctx.fillText(f, X(T.x) + 4, Y(T.y) - 4)
            }
            continue
          }
          const m = d.last; if (!m) continue
          if (d.type === 'LaserScan') {
            const T = pose2(m.header.frame_id); if (!T) continue
            ctx.fillStyle = d.color
            for (let i = 0; i < m.ranges.length; i++) {
              const r = m.ranges[i]
              if (!(r >= m.range_min && r <= m.range_max)) continue
              const a = m.angle_min + i * m.angle_increment
              const [x, y] = apply(T, r * Math.cos(a), r * Math.sin(a))
              ctx.fillRect(X(x) - 1.5, Y(y) - 1.5, 3, 3)
            }
          } else if (d.type === 'Odometry') {
            for (const o of d.trail) {
              const T = pose2(o.header.frame_id); if (!T) continue
              arrow(T, o.pose.pose.position, o.pose.pose.orientation, d.color, 0.4)
            }
          } else if (d.type === 'Pose') {
            const T = pose2(m.header.frame_id); if (T) arrow(T, m.pose.position, m.pose.orientation, d.color, 0.6)
          } else if (d.type === 'Path') {
            const T = pose2(m.header.frame_id); if (!T) continue
            ctx.strokeStyle = d.color; ctx.lineWidth = 2; ctx.beginPath()
            m.poses.forEach((p, i) => { const [x, y] = apply(T, p.pose.position.x, p.pose.position.y); if (i) ctx.lineTo(X(x), Y(y)); else ctx.moveTo(X(x), Y(y)) })
            ctx.stroke()
          }
        }
      }
    }
    if (!customElements.get('ros2-rviz')) customElements.define('ros2-rviz', Ros2Rviz)
  }

  // ======================================================================
  // Simulierter TurtleBot3 Burger „im WLAN“ (eigener Rechner, feste Domain)
  // Knoten und Topics nach turtlebot3_bringup (Jazzy), URDF aus turtlebot3_description
  // ======================================================================

  Object.assign(TYPES, {
    'geometry_msgs/msg/Point': { fields: [['float64', 'x'], ['float64', 'y'], ['float64', 'z']], noShow: true },
    'geometry_msgs/msg/Pose': { fields: [['geometry_msgs/msg/Point', 'position'], ['geometry_msgs/msg/Quaternion', 'orientation']], noShow: true },
    'geometry_msgs/msg/PoseWithCovariance': { fields: [['geometry_msgs/msg/Pose', 'pose'], ['float64', 'covariance', { kind: 'arr', size: 36 }]], noShow: true },
    'geometry_msgs/msg/TwistWithCovariance': { fields: [['geometry_msgs/msg/Twist', 'twist'], ['float64', 'covariance', { kind: 'arr', size: 36 }]], noShow: true },
    'geometry_msgs/msg/TwistStamped': { fields: [['std_msgs/msg/Header', 'header'], ['geometry_msgs/msg/Twist', 'twist']], noShow: true },
    'nav_msgs/msg/Odometry': { fields: [['std_msgs/msg/Header', 'header'], ['string', 'child_frame_id'], ['geometry_msgs/msg/PoseWithCovariance', 'pose'], ['geometry_msgs/msg/TwistWithCovariance', 'twist']], noShow: true },
    'sensor_msgs/msg/LaserScan': {
      fields: [['std_msgs/msg/Header', 'header'], ['float32', 'angle_min'], ['float32', 'angle_max'], ['float32', 'angle_increment'], ['float32', 'time_increment'],
        ['float32', 'scan_time'], ['float32', 'range_min'], ['float32', 'range_max'], ['float32', 'ranges', { kind: 'seq' }], ['float32', 'intensities', { kind: 'seq' }]],
      noShow: true
    },
    'sensor_msgs/msg/JointState': { fields: [['std_msgs/msg/Header', 'header'], ['string', 'name', { kind: 'seq' }], ['float64', 'position', { kind: 'seq' }], ['float64', 'velocity', { kind: 'seq' }], ['float64', 'effort', { kind: 'seq' }]], noShow: true }
  })

  // Raum aus tools/make_demo_bag.py: Wände 6 m x 4 m und eine Kiste (Strecken im Rahmen odom)
  const ROOM = [
    [-1.0, -1.5, 5.0, -1.5], [5.0, -1.5, 5.0, 2.5], [5.0, 2.5, -1.0, 2.5], [-1.0, 2.5, -1.0, -1.5],
    [2.4, 0.3, 3.0, 0.3], [3.0, 0.3, 3.0, 0.9], [3.0, 0.9, 2.4, 0.9], [2.4, 0.9, 2.4, 0.3]]
  const BURGER_URDF = "<?xml version=\"1.0\" ?>\n<robot name=\"turtlebot3_burger\"\n  xmlns:xacro=\"http://ros.org/wiki/xacro\">\n  <!-- <xacro:include filename=\"$(find turtlebot3_description)/urdf/common_properties.urdf\"/> -->\n\n  <xacro:arg name=\"namespace\" default=\"\"/>\n  <xacro:property name=\"namespace\" value=\"$(arg namespace)\"/>\n\n  <!-- Init colour -->\n  <material name=\"black\">\n      <color rgba=\"0.0 0.0 0.0 1.0\"/>\n  </material>\n\n  <material name=\"dark\">\n    <color rgba=\"0.3 0.3 0.3 1.0\"/>\n  </material>\n\n  <material name=\"light_black\">\n    <color rgba=\"0.4 0.4 0.4 1.0\"/>\n  </material>\n\n  <material name=\"blue\">\n    <color rgba=\"0.0 0.0 0.8 1.0\"/>\n  </material>\n\n  <material name=\"green\">\n    <color rgba=\"0.0 0.8 0.0 1.0\"/>\n  </material>\n\n  <material name=\"grey\">\n    <color rgba=\"0.5 0.5 0.5 1.0\"/>\n  </material>\n\n  <material name=\"orange\">\n    <color rgba=\"1.0 0.4235 0.0392 1.0\"/>\n  </material>\n\n  <material name=\"brown\">\n    <color rgba=\"0.8706 0.8118 0.7647 1.0\"/>\n  </material>\n\n  <material name=\"red\">\n    <color rgba=\"0.8 0.0 0.0 1.0\"/>\n  </material>\n\n  <material name=\"white\">\n    <color rgba=\"1.0 1.0 1.0 1.0\"/>\n  </material>\n\n  <link name=\"base_footprint\"/>\n\n  <joint name=\"base_joint\" type=\"fixed\">\n    <parent link=\"base_footprint\"/>\n    <child link=\"base_link\"/>\n    <origin xyz=\"0.0 0.0 0.010\" rpy=\"0 0 0\"/>\n  </joint>\n\n  <link name=\"base_link\">\n    <visual>\n      <origin xyz=\"-0.032 0 0.0\" rpy=\"0 0 0\"/>\n      <geometry>\n        <mesh filename=\"package://turtlebot3_description/meshes/bases/burger_base.stl\" scale=\"0.001 0.001 0.001\"/>\n      </geometry>\n      <material name=\"light_black\"/>\n    </visual>\n\n    <collision>\n      <origin xyz=\"-0.032 0 0.070\" rpy=\"0 0 0\"/>\n      <geometry>\n        <box size=\"0.140 0.140 0.143\"/>\n      </geometry>\n    </collision>\n\n    <inertial>\n      <origin xyz=\"0 0 0\" rpy=\"0 0 0\"/>\n      <mass value=\"8.2573504e-01\"/>\n      <inertia ixx=\"2.2124416e-03\" ixy=\"-1.2294101e-05\" ixz=\"3.4938785e-05\" iyy=\"2.1193702e-03\" iyz=\"-5.0120904e-06\" izz=\"2.0064271e-03\" />\n    </inertial>\n  </link>\n\n  <joint name=\"wheel_left_joint\" type=\"continuous\">\n    <parent link=\"base_link\"/>\n    <child link=\"wheel_left_link\"/>\n    <origin xyz=\"0.0 0.08 0.023\" rpy=\"-1.57 0 0\"/>\n    <axis xyz=\"0 0 1\"/>\n  </joint>\n\n  <link name=\"wheel_left_link\">\n    <visual>\n      <origin xyz=\"0 0 0\" rpy=\"1.57 0 0\"/>\n      <geometry>\n        <mesh filename=\"package://turtlebot3_description/meshes/wheels/left_tire.stl\" scale=\"0.001 0.001 0.001\"/>\n      </geometry>\n      <material name=\"dark\"/>\n    </visual>\n\n    <collision>\n      <origin xyz=\"0 0 0\" rpy=\"0 0 0\"/>\n      <geometry>\n        <cylinder length=\"0.018\" radius=\"0.033\"/>\n      </geometry>\n    </collision>\n\n    <inertial>\n      <origin xyz=\"0 0 0\" />\n      <mass value=\"2.8498940e-02\" />\n      <inertia ixx=\"1.1175580e-05\" ixy=\"-4.2369783e-11\" ixz=\"-5.9381719e-09\" iyy=\"1.1192413e-05\" iyz=\"-1.4400107e-11\" izz=\"2.0712558e-05\" />\n    </inertial>\n  </link>\n\n  <joint name=\"wheel_right_joint\" type=\"continuous\">\n    <parent link=\"base_link\"/>\n    <child link=\"wheel_right_link\"/>\n    <origin xyz=\"0.0 -0.080 0.023\" rpy=\"-1.57 0 0\"/>\n    <axis xyz=\"0 0 1\"/>\n  </joint>\n\n  <link name=\"wheel_right_link\">\n    <visual>\n      <origin xyz=\"0 0 0\" rpy=\"1.57 0 0\"/>\n      <geometry>\n        <mesh filename=\"package://turtlebot3_description/meshes/wheels/right_tire.stl\" scale=\"0.001 0.001 0.001\"/>\n      </geometry>\n      <material name=\"dark\"/>\n    </visual>\n\n    <collision>\n      <origin xyz=\"0 0 0\" rpy=\"0 0 0\"/>\n      <geometry>\n        <cylinder length=\"0.018\" radius=\"0.033\"/>\n      </geometry>\n    </collision>\n\n    <inertial>\n      <origin xyz=\"0 0 0\" />\n      <mass value=\"2.8498940e-02\" />\n      <inertia ixx=\"1.1175580e-05\" ixy=\"-4.2369783e-11\" ixz=\"-5.9381719e-09\" iyy=\"1.1192413e-05\" iyz=\"-1.4400107e-11\" izz=\"2.0712558e-05\" />\n    </inertial>\n  </link>\n\n  <joint name=\"caster_back_joint\" type=\"fixed\">\n    <parent link=\"base_link\"/>\n    <child link=\"caster_back_link\"/>\n    <origin xyz=\"-0.081 0 -0.004\" rpy=\"-1.57 0 0\"/>\n  </joint>\n\n  <link name=\"caster_back_link\">\n    <collision>\n      <origin xyz=\"0 0.001 0\" rpy=\"0 0 0\"/>\n      <geometry>\n        <box size=\"0.030 0.009 0.020\"/>\n      </geometry>\n    </collision>\n\n    <inertial>\n      <origin xyz=\"0 0 0\" />\n      <mass value=\"0.005\" />\n      <inertia ixx=\"0.001\" ixy=\"0.0\" ixz=\"0.0\" iyy=\"0.001\" iyz=\"0.0\" izz=\"0.001\" />\n    </inertial>\n  </link>\n\n  <joint name=\"imu_joint\" type=\"fixed\">\n    <parent link=\"base_link\"/>\n    <child link=\"imu_link\"/>\n    <origin xyz=\"-0.032 0 0.068\" rpy=\"0 0 0\"/>\n  </joint>\n\n  <link name=\"imu_link\"/>\n\n  <joint name=\"scan_joint\" type=\"fixed\">\n    <parent link=\"base_link\"/>\n    <child link=\"base_scan\"/>\n    <origin xyz=\"-0.032 0 0.172\" rpy=\"0 0 0\"/>\n  </joint>\n\n  <link name=\"base_scan\">\n    <visual>\n      <origin xyz=\"0 0 0.0\" rpy=\"0 0 0\"/>\n      <geometry>\n        <mesh filename=\"package://turtlebot3_description/meshes/sensors/lds.stl\" scale=\"0.001 0.001 0.001\"/>\n      </geometry>\n      <material name=\"dark\"/>\n    </visual>\n\n    <collision>\n      <origin xyz=\"0.015 0 -0.0065\" rpy=\"0 0 0\"/>\n      <geometry>\n        <cylinder length=\"0.0315\" radius=\"0.055\"/>\n      </geometry>\n    </collision>\n\n    <inertial>\n      <mass value=\"0.114\" />\n      <origin xyz=\"0 0 0\" />\n      <inertia ixx=\"0.001\" ixy=\"0.0\" ixz=\"0.0\" iyy=\"0.001\" iyz=\"0.0\" izz=\"0.001\" />\n    </inertial>\n  </link>\n\n</robot>\n"
  const BURGER_STATIC = [
    ['base_footprint', 'base_link', [0, 0, 0.010], [0, 0, 0]],
    ['base_link', 'caster_back_link', [-0.081, 0, -0.004], [-1.57, 0, 0]],
    ['base_link', 'imu_link', [-0.032, 0, 0.068], [0, 0, 0]],
    ['base_link', 'base_scan', [-0.032, 0, 0.172], [0, 0, 0]]]
  const BURGER_WHEELS = [['wheel_left_joint', 'wheel_left_link', [0, 0.08, 0.023]], ['wheel_right_joint', 'wheel_right_link', [0, -0.080, 0.023]]]
  // Lidar-Treiber je Modell (LDS-01: Name aus hls_lfcd_lds_driver geprüft; die anderen sind am Laborroboter zu prüfen)
  const LIDAR_NODES = { 'LDS-01': 'hlds_laser_publisher', 'LDS-02': 'ld08_driver', C1: 'sllidar_node' }

  function raycast (px, py, a, rmax, segs) {
    const dx = Math.cos(a); const dy = Math.sin(a); let best = Infinity
    for (const [x1, y1, x2, y2] of segs) {
      const ex = x2 - x1; const ey = y2 - y1; const den = dx * ey - dy * ex
      if (Math.abs(den) < 1e-12) continue
      const t = ((x1 - px) * ey - (y1 - py) * ex) / den; const u = ((x1 - px) * dy - (y1 - py) * dx) / den
      if (t > 0 && u >= 0 && u <= 1 && t < best) best = t
    }
    return best <= rmax ? best : Infinity
  }

  function segDist (px, py, [x1, y1, x2, y2]) {
    const ex = x2 - x1; const ey = y2 - y1
    const u = Math.max(0, Math.min(1, ((px - x1) * ex + (py - y1) * ey) / (ex * ex + ey * ey)))
    return Math.hypot(px - (x1 + u * ex), py - (y1 + u * ey))
  }

  const nowStamp = () => { const ms = Date.now(); return { sec: Math.floor(ms / 1000), nanosec: (ms % 1000) * 1000000 + Math.floor(Math.random() * 1000000) } }
  const tfOf = (parent, child, t, q, stamp) => ({ header: { stamp, frame_id: parent }, child_frame_id: child, transform: { translation: { x: t[0], y: t[1], z: t[2] }, rotation: { x: q[0], y: q[1], z: q[2], w: q[3] } } })

  function startRobot (sim, cfg) {
    const scope = { host: cfg.host || 'turtlebot', domain: cfg.domain, range: 'SUBNET' }
    // Die Konsole des Roboters ist nicht sichtbar – wie beim Laborroboter, an dem niemand arbeitet
    const sess = { sim, scope: () => scope, print () {}, hint () {}, procEnded () {}, notify () {} }
    const proc = new Proc(sess, 'turtlebot3 bringup')
    const ctx = { sim, sess, proc, remaps: [], argv: [] }
    const r = { cfg, scope, proc, x: cfg.x || 0, y: cfg.y || 0, yaw: cfg.yaw || 0, v: 0, w: 0, wheel: [0, 0], segs: ROOM, alive: true }

    const rsp = makeRosNode(ctx, 'robot_state_publisher', 'cpp')
    rsp.pub('robot_description', 'std_msgs/msg/String', { durability: 'TRANSIENT_LOCAL', depth: 1 }).publish({ data: BURGER_URDF })
    const tfStatic = rsp.pub('/tf_static', 'tf2_msgs/msg/TFMessage', { durability: 'TRANSIENT_LOCAL', depth: 1 })
    const tfWheels = rsp.pub('/tf', 'tf2_msgs/msg/TFMessage', { depth: 100 })
    const st = nowStamp()
    tfStatic.publish({ transforms: BURGER_STATIC.map(([p, c, t, rpy]) => tfOf(p, c, t, quatFromRPY(rpy[0], rpy[1], rpy[2]), st)) })
    rsp.sub('joint_states', 'sensor_msgs/msg/JointState', { depth: 10 }, (js) => {
      tfWheels.publish({
        transforms: BURGER_WHEELS.map(([j, link, t], i) => {
          const k = js.name.indexOf(j); const ang = k >= 0 ? js.position[k] : 0
          return tfOf('base_link', link, t, qmul(quatFromRPY(-1.57, 0, 0), quatFromRPY(0, 0, ang)), js.header.stamp)
        })
      })
    })

    const tb = makeRosNode(ctx, 'turtlebot3_node', 'cpp')
    const odomPub = tb.pub('odom', 'nav_msgs/msg/Odometry', { depth: 10 })
    const tfPub = tb.pub('/tf', 'tf2_msgs/msg/TFMessage', { depth: 100 })
    const jsPub = tb.pub('joint_states', 'sensor_msgs/msg/JointState', { depth: 10 })
    for (const [t, ty] of [['imu', 'sensor_msgs/msg/Imu'], ['battery_state', 'sensor_msgs/msg/BatteryState'], ['magnetic_field', 'sensor_msgs/msg/MagneticField'], ['sensor_state', 'turtlebot3_msgs/msg/SensorState']]) tb.pub(t, ty, { depth: 10 })
    const cmdType = cfg.cmdVel === 'Twist' ? 'geometry_msgs/msg/Twist' : 'geometry_msgs/msg/TwistStamped'
    tb.sub('cmd_vel', cmdType, { depth: 10 }, (m) => {
      const tw = m.twist || m
      r.v = Math.max(-0.22, Math.min(0.22, tw.linear.x)); r.w = Math.max(-2.84, Math.min(2.84, tw.angular.z))
      r.lastCmd = Date.now()
    })

    const ld = makeRosNode(ctx, LIDAR_NODES[cfg.lidar] || LIDAR_NODES['LDS-01'], 'cpp')
    const scanPub = ld.pub('scan', 'sensor_msgs/msg/LaserScan', { depth: 10, reliability: 'BEST_EFFORT' })

    const dt = 0.05
    proc.every(50, () => {
      // Der Burger hält die letzte Geschwindigkeit, bis ein neuer Befehl kommt
      const nyaw = r.yaw + r.w * dt
      const nx = r.x + r.v * Math.cos(nyaw) * dt; const ny = r.y + r.v * Math.sin(nyaw) * dt
      const blocked = r.segs.some(sg => segDist(nx, ny, sg) < 0.105)
      r.yaw = nyaw
      if (!blocked) { r.x = nx; r.y = ny }
      r.blocked = blocked && r.v !== 0
      const vl = (blocked ? 0 : r.v) - r.w * 0.08; const vr = (blocked ? 0 : r.v) + r.w * 0.08
      r.wheel[0] += vl / 0.033 * dt; r.wheel[1] += vr / 0.033 * dt
      const stamp = nowStamp(); const q = [0, 0, Math.sin(r.yaw / 2), Math.cos(r.yaw / 2)]
      odomPub.publish({
        header: { stamp, frame_id: 'odom' },
        child_frame_id: 'base_footprint',
        pose: { pose: { position: { x: r.x, y: r.y, z: 0 }, orientation: { x: 0, y: 0, z: q[2], w: q[3] } }, covariance: new Array(36).fill(0) },
        twist: { twist: { linear: { x: blocked ? 0 : r.v, y: 0, z: 0 }, angular: { x: 0, y: 0, z: r.w } }, covariance: new Array(36).fill(0) }
      })
      tfPub.publish({ transforms: [tfOf('odom', 'base_footprint', [r.x, r.y, 0], q, stamp)] })
      jsPub.publish({ header: { stamp, frame_id: '' }, name: ['wheel_left_joint', 'wheel_right_joint'], position: r.wheel.slice(), velocity: [], effort: [] })
    })
    proc.every(200, () => {
      const sx = r.x - 0.032 * Math.cos(r.yaw); const sy = r.y - 0.032 * Math.sin(r.yaw)
      const ranges = []
      for (let i = 0; i < 360; i++) {
        const d = raycast(sx, sy, r.yaw + i * Math.PI / 180, 3.5, r.segs)
        ranges.push(Number.isFinite(d) ? Math.fround(d + 0.004 * Math.sin(i * 12.9898 + r.x * 78.233)) : Infinity)
      }
      scanPub.publish({
        header: { stamp: nowStamp(), frame_id: 'base_scan' },
        angle_min: 0, angle_max: Math.fround(2 * Math.PI - Math.PI / 180), angle_increment: Math.fround(Math.PI / 180),
        time_increment: 0, scan_time: Math.fround(0.2), range_min: Math.fround(0.12), range_max: Math.fround(3.5), ranges, intensities: []
      })
    })
    proc.defer(() => { r.alive = false })
    r.stop = () => proc.exit()
    return r
  }


  // ---------------------------------------------------------- view_frames (tf2_tools)

  function framesInfo (buf) {
    return sorted([...buf.edges.keys()]).map(child => {
      const e = buf.edges.get(child)
      if (e.isStatic) return { child, parent: e.parent, rate: 10000, recent: 0, oldest: 0, len: 0 }
      const len = Number(e.stamp - e.first) / 1e9
      return { child, parent: e.parent, rate: e.count / Math.max(len, 0.0001), recent: Number(e.stamp) / 1e9, oldest: Number(e.first) / 1e9, len }
    })
  }

  function tfTreeSvg (info, recorded) {
    const kids = new Map(); const all = new Set()
    for (const f of info) { all.add(f.child); all.add(f.parent); if (!kids.has(f.parent)) kids.set(f.parent, []); kids.get(f.parent).push(f) }
    const roots = sorted([...all].filter(n => !info.some(f => f.child === n)))
    const pos = new Map(); let col = 0
    const place = (n, d) => {
      const ch = kids.get(n) || []
      if (!ch.length) { pos.set(n, { x: col++, d }); return }
      for (const f of ch) place(f.child, d + 1)
      const xs = ch.map(f => pos.get(f.child).x)
      pos.set(n, { x: (Math.min(...xs) + Math.max(...xs)) / 2, d })
    }
    for (const r of roots) place(r, 0)
    const CW = 240; const RH = 170
    const maxD = Math.max(0, ...[...pos.values()].map(p => p.d))
    const W = Math.max(1, col) * CW + 40; const H = (maxD + 1) * RH + 90
    const X = (p) => 20 + p.x * CW + CW / 2; const Y = (p) => 60 + p.d * RH
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" style="max-width:100%;height:auto;background:#fff;font-family:Times,serif">`
    svg += '<defs><marker id="vfa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z"/></marker></defs>'
    svg += `<text x="20" y="22" font-size="13" font-weight="bold">view_frames Result</text><text x="20" y="40" font-size="12">Recorded at time: ${esc(recorded)}</text>`
    for (const f of info) {
      const a = pos.get(f.parent); const b = pos.get(f.child)
      svg += `<line x1="${X(a)}" y1="${Y(a) + 18}" x2="${X(b)}" y2="${Y(b) - 18}" stroke="#000" marker-end="url(#vfa)"/>`
      const lines = ['Broadcaster: default_authority', 'Average rate: ' + pyFloat(Number(f.rate.toFixed(3))), 'Buffer length: ' + pyFloat(Number(f.len.toFixed(3))),
        'Most recent transform: ' + pyFloat(Number(f.recent.toFixed(6))), 'Oldest transform: ' + pyFloat(Number(f.oldest.toFixed(6)))]
      // Beschriftung über dem Kindknoten, damit sich Geschwister nicht überdecken
      const mx = (kids.get(f.parent) || []).length === 1 ? X(b) + 6 : X(b) - 100; const my = Y(b) - 88
      lines.forEach((l, i) => { svg += `<text x="${mx}" y="${my + i * 13}" font-size="10.5">${esc(l)}</text>` })
    }
    for (const [n, p] of pos) svg += `<ellipse cx="${X(p)}" cy="${Y(p)}" rx="${Math.max(40, n.length * 4.6)}" ry="18" fill="#fff" stroke="#000"/><text x="${X(p)}" y="${Y(p) + 5}" text-anchor="middle" font-size="14">${esc(n)}</text>`
    return svg + '</svg>'
  }

  function viewFramesNode (ctx) {
    const { proc, sim } = ctx
    const node = makeRosNode(ctx, 'view_frames', 'py')
    const buf = makeTfListener(ctx)
    node.log('INFO', 'Listening to tf data for 5.0 seconds...')
    proc.after(5000, () => {
      node.log('INFO', 'Generating graph...')
      const info = framesInfo(buf)
      const yaml = info.map(f => f.child + ': \n  parent: \'' + f.parent + "'\n  broadcaster: 'default_authority'\n  rate: " + f.rate.toFixed(3) +
        '\n  most_recent_transform: ' + f.recent.toFixed(6) + '\n  oldest_transform: ' + f.oldest.toFixed(6) + '\n  buffer_length: ' + f.len.toFixed(3) + '\n').join('')
      node.log('INFO', 'Result:tf2_msgs.srv.FrameGraph_Response(frame_yaml=' + pyStr(yaml) + ')')
      const d = new Date(); const p2 = (x) => String(x).padStart(2, '0')
      const base = `frames_${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}.${p2(d.getMinutes())}.${p2(d.getSeconds())}`
      const recorded = pyFloat(Date.now() / 1000)
      const roots = info.filter(f => !info.some(x => x.child === f.parent)).map(f => f.parent)
      const gv = 'digraph G {\n' + info.map(f => `"${f.parent}" -> "${f.child}"[label=" Broadcaster: default_authority\\nAverage rate: ${pyFloat(Number(f.rate.toFixed(3)))}\\nBuffer length: ${pyFloat(Number(f.len.toFixed(3)))}\\nMost recent transform: ${pyFloat(Number(f.recent.toFixed(6)))}\\nOldest transform: ${pyFloat(Number(f.oldest.toFixed(6)))}\\n"];\n`).join('') +
        `edge [style=invis];\n subgraph cluster_legend { style=bold; color=black; label ="view_frames Result";\n"Recorded at time: ${recorded}"[ shape=plaintext ] ;\n}->"${roots[0] || ''}";\n}`
      node.log('INFO', `Exporting graph in ${base}.pdf file...`)
      sim.home.set(base + '.gv', gv)
      sim.home.set(base + '.pdf', { pdf: true, title: base + '.pdf', svg: tfTreeSvg(info, recorded) })
      sim.emit('fs')
      if (!info.length) proc.hint('Es kamen keine tf-Daten an. Läuft etwas, das /tf oder /tf_static sendet – in derselben Domain?')
      proc.exit()
    })
  }

  const PACKAGES = {
    demo_nodes_cpp: {
      all: ['add_two_ints_client', 'add_two_ints_client_async', 'add_two_ints_server', 'allocator_tutorial',
        'content_filtering_publisher', 'content_filtering_subscriber', 'even_parameters_node',
        'introspection_client', 'introspection_service', 'list_parameters', 'list_parameters_async',
        'listener', 'listener_best_effort', 'listener_serialized_message', 'matched_event_detect',
        'one_off_timer', 'parameter_blackboard', 'parameter_event_handler', 'parameter_events',
        'parameter_events_async', 'reuse_timer', 'set_and_get_parameters', 'set_and_get_parameters_async',
        'set_parameters_callback', 'talker', 'talker_loaned_message', 'talker_serialized_message',
        'use_logger_service'],
      run: { talker: talker('cpp'), listener: listener('cpp'), listener_best_effort: listener('cpp', 'BEST_EFFORT') },
      desc: { talker: 'sendet "Hello World: n" auf /chatter', listener: 'gibt empfangene Nachrichten von /chatter aus', listener_best_effort: 'wie listener, aber mit QoS Best Effort' }
    },
    demo_nodes_py: {
      all: ['add_two_ints_client', 'add_two_ints_client_async', 'add_two_ints_server', 'async_param_client',
        'introspection', 'listener', 'listener_qos', 'listener_serialized', 'matched_event_detect',
        'set_parameters_callback', 'talker', 'talker_qos', 'use_logger_service'],
      run: { talker: talker('py'), listener: listener('py') },
      desc: { talker: 'sendet "Hello World: n" auf /chatter (Python)', listener: 'gibt empfangene Nachrichten von /chatter aus (Python)' }
    },
    tf2_ros: {
      all: ['buffer_server', 'static_transform_publisher', 'tf2_echo', 'tf2_monitor'],
      run: { tf2_echo: tf2EchoNode, static_transform_publisher: staticTfNode },
      desc: { tf2_echo: 'Transformation zwischen zwei Frames ausgeben', static_transform_publisher: 'feste Transformation veröffentlichen' }
    },
    tf2_tools: {
      all: ['view_frames'],
      run: { view_frames: viewFramesNode },
      desc: { view_frames: 'tf-Baum als PDF (5 s zuhören)' }
    },
    rviz2: {
      all: ['rviz1_to_rviz2.py', 'rviz2'],
      run: { rviz2: rvizNode },
      desc: { rviz2: 'Visualisierung (2D-Draufsicht)' }
    },
    turtlesim: {
      all: ['draw_square', 'mimic', 'turtle_teleop_key', 'turtlesim_node'],
      run: { turtlesim_node: turtlesimNode, turtle_teleop_key: teleopNode },
      desc: { turtlesim_node: 'Schildkröten-Simulator', turtle_teleop_key: 'Schildkröte mit Pfeiltasten steuern' }
    }
  }

  // ======================================================================
  // Typen aus ros2msg-Beschreibungen (z. B. aus einer Bagdatei)
  // ======================================================================

  const PRIMS = new Set(['bool', 'byte', 'char', 'float32', 'float64', 'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'int64', 'uint64', 'string', 'wstring'])

  function normRef (ref, pkg) {
    if (PRIMS.has(ref)) return ref
    if (ref === 'Header') return 'std_msgs/msg/Header'
    const parts = ref.split('/')
    if (parts.length === 1) return pkg + '/msg/' + ref
    if (parts.length === 2) return parts[0] + '/msg/' + parts[1]
    return ref
  }

  function parseFieldLine (line, pkg) {
    const l = line.replace(/#.*$/, '').trim()
    if (!l) return null
    const m = /^(\S+)\s+([A-Za-z]\w*)(.*)$/.exec(l)
    if (!m || /^\s*=/.test(m[3])) return null // Konstante
    let t = m[1]; let arr
    const am = /^(.*?)\[(<=)?(\d*)\]$/.exec(t)
    if (am) { t = am[1]; arr = am[3] === '' ? { kind: 'seq' } : am[2] ? { kind: 'bseq', size: +am[3] } : { kind: 'arr', size: +am[3] } }
    t = t.replace(/<=\d+$/, '')
    return arr ? [normRef(t, pkg), m[2], arr] : [normRef(t, pkg), m[2]]
  }

  // Registriert den Haupttyp und alle angehängten Abhängigkeiten ("MSG: paket/Typ")
  function registerRos2Msg (name, text) {
    const sections = String(text).split(/\n=+\n/)
    const defs = [[name, sections[0]]]
    for (const sec of sections.slice(1)) {
      const m = /^MSG: (\S+)\n?([\s\S]*)$/.exec(sec.replace(/^\n+/, ''))
      if (m) defs.push([normRef(m[1], ''), m[2]])
    }
    for (const [n, body] of defs) {
      if (TYPES[n] && TYPES[n].builtin) continue
      const pkg = n.split('/')[0]
      TYPES[n] = { fields: body.split('\n').map(l => parseFieldLine(l, pkg)).filter(Boolean), def: body.replace(/\n+$/, '') }
    }
  }

  // Text für `ros2 interface show` bei Typen aus einer Bagdatei: verschachtelte Typen eingerückt mit Tab
  function showOf (type) {
    const T = TYPES[type]
    if (!T) return null
    if (T.show) return T.show
    if (!T.def) return null
    const out = []
    const pkgOf = (t) => t.split('/')[0]
    const expand = (t, d) => {
      if (!TYPES[t] || !TYPES[t].def) return
      for (const raw of TYPES[t].def.split('\n')) {
        const c = raw.replace(/#.*$/, '').trim()
        if (!c) continue
        out.push('\t'.repeat(d) + c)
        const f = parseFieldLine(raw, pkgOf(t))
        if (f && isNested(f[0])) expand(f[0], d + 1)
      }
    }
    for (const raw of T.def.split('\n')) {
      out.push(raw)
      const f = parseFieldLine(raw, pkgOf(type))
      if (f && isNested(f[0])) expand(f[0], 1)
    }
    return out.join('\n')
  }

  // ros2msg-Text eines Typs (für das Schreiben von Bagdateien)
  function ros2msgOf (type) {
    const deps = []
    const defOf = (t) => TYPES[t].def || TYPES[t].fields.map(([ft, n, arr]) =>
      (isNested(ft) ? ft.replace('/msg/', '/') : ft) +
      (arr ? (arr.kind === 'seq' ? '[]' : arr.kind === 'bseq' ? `[<=${arr.size}]` : `[${arr.size}]`) : '') + ' ' + n).join('\n')
    const visit = (t) => {
      for (const [ft] of TYPES[t].fields) {
        if (isNested(ft) && !deps.includes(ft)) { deps.push(ft); visit(ft) }
      }
    }
    visit(type)
    let s = defOf(type)
    for (const d of deps) s += '\n' + '='.repeat(80) + '\nMSG: ' + d.replace('/msg/', '/') + '\n' + defOf(d)
    return s
  }

  // ======================================================================
  // CDR (XCDR1, little endian) – so serialisiert rmw unter Jazzy
  // ======================================================================

  const PRIM_SIZE = { bool: 1, byte: 1, char: 1, int8: 1, uint8: 1, int16: 2, uint16: 2, int32: 4, uint32: 4, float32: 4, int64: 8, uint64: 8, float64: 8 }

  class CdrReader {
    constructor (u8) {
      this.u8 = u8
      this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
      this.le = u8[1] === 1 || u8[1] === 3
      this.o = 4
    }

    align (n) { const r = (this.o - 4) % n; if (r) this.o += n - r }
    prim (t) {
      const n = PRIM_SIZE[t]; this.align(n)
      const dv = this.dv; const o = this.o; const le = this.le
      let v
      switch (t) {
        case 'bool': v = dv.getUint8(o) !== 0; break
        case 'int8': v = dv.getInt8(o); break
        case 'byte': case 'char': case 'uint8': v = dv.getUint8(o); break
        case 'int16': v = dv.getInt16(o, le); break
        case 'uint16': v = dv.getUint16(o, le); break
        case 'int32': v = dv.getInt32(o, le); break
        case 'uint32': v = dv.getUint32(o, le); break
        case 'float32': v = dv.getFloat32(o, le); break
        case 'float64': v = dv.getFloat64(o, le); break
        case 'int64': v = Number(dv.getBigInt64(o, le)); break
        case 'uint64': v = Number(dv.getBigUint64(o, le)); break
      }
      this.o += n
      return v
    }

    string () {
      const len = this.prim('uint32')
      const s = new TextDecoder().decode(this.u8.subarray(this.o, this.o + Math.max(0, len - 1)))
      this.o += len
      return s
    }

    value (t) {
      if (isNested(t)) return this.msg(t)
      if (t === 'string' || t === 'wstring') return this.string()
      return this.prim(t)
    }

    msg (type) {
      const T = TYPES[type]
      if (!T) throw new Error('unbekannter Typ ' + type)
      if (!T.fields.length) { this.prim('uint8'); return {} } // leere Nachricht: ein Füllbyte
      const m = {}
      for (const [t, n, arr] of T.fields) {
        if (arr) {
          const len = arr.kind === 'arr' ? arr.size : this.prim('uint32')
          const a = new Array(len)
          for (let i = 0; i < len; i++) a[i] = this.value(t)
          m[n] = a
        } else m[n] = this.value(t)
      }
      return m
    }
  }

  class CdrWriter {
    constructor () { this.buf = new Uint8Array(256); this.o = 4; this.buf.set([0, 1, 0, 0]) }
    ensure (n) {
      if (this.o + n <= this.buf.length) return
      const b = new Uint8Array(Math.max(this.buf.length * 2, this.o + n)); b.set(this.buf); this.buf = b
    }

    align (n) { const r = (this.o - 4) % n; if (r) { this.ensure(n - r); this.o += n - r } }
    prim (t, v) {
      const n = PRIM_SIZE[t]; this.align(n); this.ensure(n)
      const dv = new DataView(this.buf.buffer); const o = this.o
      switch (t) {
        case 'bool': dv.setUint8(o, v ? 1 : 0); break
        case 'int8': dv.setInt8(o, v); break
        case 'byte': case 'char': case 'uint8': dv.setUint8(o, v); break
        case 'int16': dv.setInt16(o, v, true); break
        case 'uint16': dv.setUint16(o, v, true); break
        case 'int32': dv.setInt32(o, v, true); break
        case 'uint32': dv.setUint32(o, v, true); break
        case 'float32': dv.setFloat32(o, v, true); break
        case 'float64': dv.setFloat64(o, v, true); break
        case 'int64': dv.setBigInt64(o, BigInt(Math.trunc(v)), true); break
        case 'uint64': dv.setBigUint64(o, BigInt(Math.trunc(v)), true); break
      }
      this.o += n
    }

    string (s) {
      const b = new TextEncoder().encode(s)
      this.prim('uint32', b.length + 1)
      this.ensure(b.length + 1); this.buf.set(b, this.o); this.o += b.length; this.buf[this.o++] = 0
    }

    value (t, v) {
      if (isNested(t)) this.msg(t, v)
      else if (t === 'string' || t === 'wstring') this.string(v)
      else this.prim(t, v)
    }

    msg (type, m) {
      const T = TYPES[type]
      if (!T.fields.length) { this.prim('uint8', 0); return }
      for (const [t, n, arr] of T.fields) {
        if (arr) {
          if (arr.kind !== 'arr') this.prim('uint32', m[n].length)
          for (const x of m[n]) this.value(t, x)
        } else this.value(t, m[n])
      }
    }

    bytes () { return this.buf.slice(0, this.o) }
  }

  const cdrDecode = (type, u8) => new CdrReader(u8).msg(type)
  const cdrEncode = (type, msg) => { const w = new CdrWriter(); w.msg(type, msg); return w.bytes() }

  // ======================================================================
  // MCAP lesen und schreiben (unkomprimiert, wie rosbag2 unter Jazzy)
  // ======================================================================

  const MCAP_MAGIC = [0x89, 0x4d, 0x43, 0x41, 0x50, 0x30, 0x0d, 0x0a]

  class McapError extends Error {}

  function readMcap (u8) {
    for (let i = 0; i < 8; i++) if (u8[i] !== MCAP_MAGIC[i]) throw new McapError('keine MCAP-Datei')
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
    const td = new TextDecoder()
    const res = { profile: '', library: '', schemas: new Map(), channels: new Map(), messages: [] }
    const str = (p) => { const n = dv.getUint32(p, true); return [td.decode(u8.subarray(p + 4, p + 4 + n)), p + 4 + n] }
    const map = (p) => {
      const n = dv.getUint32(p, true); const end = p + 4 + n; const m = {}; let q = p + 4
      while (q < end) { let k, v; [k, q] = str(q); [v, q] = str(q); m[k] = v }
      return [m, end]
    }
    const records = (start, end) => {
      let i = start
      while (i + 9 <= end) {
        const op = u8[i]; const len = Number(dv.getBigUint64(i + 1, true)); const b = i + 9; const e = b + len
        if (op === 0x0f) return false // DataEnd: danach folgt nur noch die Zusammenfassung
        if (op === 0x01) { [res.profile] = str(b); [res.library] = str(b + 4 + dv.getUint32(b, true)) } else if (op === 0x03) {
          const id = dv.getUint16(b, true); let p = b + 2; let name, enc
          ;[name, p] = str(p); [enc, p] = str(p)
          const n = dv.getUint32(p, true)
          res.schemas.set(id, { id, name, encoding: enc, data: td.decode(u8.subarray(p + 4, p + 4 + n)) })
        } else if (op === 0x04) {
          const id = dv.getUint16(b, true); const schemaId = dv.getUint16(b + 2, true); let p = b + 4; let topic, enc, meta
          ;[topic, p] = str(p); [enc, p] = str(p); [meta] = map(p)
          res.channels.set(id, { id, schemaId, topic, messageEncoding: enc, metadata: meta })
        } else if (op === 0x05) {
          res.messages.push({ channelId: dv.getUint16(b, true), logTime: dv.getBigUint64(b + 6, true), data: u8.subarray(b + 22, e) })
        } else if (op === 0x06) {
          let p = b + 28; let comp
          ;[comp, p] = str(p)
          const rl = Number(dv.getBigUint64(p, true)); p += 8
          if (comp) throw new McapError(`komprimierte Bagdatei (${comp})`)
          if (records(p, p + rl) === false) return false
        }
        i = e
      }
      return true
    }
    records(8, u8.length - 8)
    res.messages.sort((a, b) => (a.logTime < b.logTime ? -1 : a.logTime > b.logTime ? 1 : 0))
    return res
  }

  function writeMcap ({ schemas, channels, messages, metadataYaml }) {
    const parts = []; let size = 0
    const te = new TextEncoder()
    const push = (u8) => { parts.push(u8); size += u8.length }
    const enc = (fields) => {
      // fields: [['u8'|'u16'|'u32'|'u64'|'str'|'bytes4'|'bytes'|'map'], value]
      const chunks = []
      for (const [k, v] of fields) {
        if (k === 'str' || k === 'bytes4') {
          const b = typeof v === 'string' ? te.encode(v) : v
          const h = new Uint8Array(4); new DataView(h.buffer).setUint32(0, b.length, true); chunks.push(h, b)
        } else if (k === 'bytes') chunks.push(v)
        else if (k === 'map') {
          const inner = enc(Object.entries(v).flatMap(([a, c]) => [['str', a], ['str', c]]))
          const h = new Uint8Array(4); new DataView(h.buffer).setUint32(0, inner.length, true); chunks.push(h, inner)
        } else {
          const n = { u8: 1, u16: 2, u32: 4, u64: 8 }[k]; const b = new Uint8Array(n); const d = new DataView(b.buffer)
          if (k === 'u8') d.setUint8(0, v); else if (k === 'u16') d.setUint16(0, v, true); else if (k === 'u32') d.setUint32(0, v, true); else d.setBigUint64(0, BigInt(v), true)
          chunks.push(b)
        }
      }
      const len = chunks.reduce((s, c) => s + c.length, 0); const out = new Uint8Array(len); let o = 0
      for (const c of chunks) { out.set(c, o); o += c.length }
      return out
    }
    const rec = (op, fields) => {
      const body = enc(fields); const h = new Uint8Array(9); h[0] = op; new DataView(h.buffer).setBigUint64(1, BigInt(body.length), true)
      push(h); push(body)
    }
    const schemaRec = (s) => rec(0x03, [['u16', s.id], ['str', s.name], ['str', s.encoding], ['bytes4', te.encode(s.data)]])
    const channelRec = (c) => rec(0x04, [['u16', c.id], ['u16', c.schemaId], ['str', c.topic], ['str', c.messageEncoding], ['map', c.metadata]])
    push(new Uint8Array(MCAP_MAGIC))
    rec(0x01, [['str', 'ros2'], ['str', 'ROS2Sim ' + VERSION]])
    for (const s of schemas) schemaRec(s)
    for (const c of channels) channelRec(c)
    const counts = new Map()
    let seq = 0
    for (const m of messages) {
      rec(0x05, [['u16', m.channelId], ['u32', ++seq], ['u64', m.logTime], ['u64', m.logTime], ['bytes', m.data]])
      counts.set(m.channelId, (counts.get(m.channelId) || 0) + 1)
    }
    if (metadataYaml) rec(0x0c, [['str', 'rosbag2'], ['map', { serialized_metadata: metadataYaml }]])
    rec(0x0f, [['u32', 0]])
    const summaryStart = size
    for (const s of schemas) schemaRec(s)
    for (const c of channels) channelRec(c)
    const t0 = messages.length ? messages[0].logTime : 0n
    const t1 = messages.length ? messages[messages.length - 1].logTime : 0n
    const cm = new Uint8Array(counts.size * 10); const cmv = new DataView(cm.buffer); let ci = 0
    for (const [id, n] of counts) { cmv.setUint16(ci, id, true); cmv.setBigUint64(ci + 2, BigInt(n), true); ci += 10 }
    rec(0x0b, [['u64', messages.length], ['u16', schemas.length], ['u32', channels.length], ['u32', 0], ['u32', metadataYaml ? 1 : 0], ['u32', 0], ['u64', t0], ['u64', t1], ['bytes4', cm]])
    rec(0x02, [['u64', summaryStart], ['u64', 0], ['u32', 0]])
    push(new Uint8Array(MCAP_MAGIC))
    const out = new Uint8Array(size); let o = 0
    for (const p of parts) { out.set(p, o); o += p.length }
    return out
  }

  // ======================================================================
  // Bagdateien im simulierten Dateisystem
  // ======================================================================

  const INT64_MAX = 9223372036854775807n
  const QOS_META = (rel, dur) => `- history: unknown\n  depth: 0\n  reliability: ${rel}\n  durability: ${dur}\n  deadline:\n    sec: 9223372036\n    nsec: 854775807\n  lifespan:\n    sec: 9223372036\n    nsec: 854775807\n  liveliness: automatic\n  liveliness_lease_duration:\n    sec: 9223372036\n    nsec: 854775807\n  avoid_ros_namespace_conventions: false`

  // Bag aus MCAP-Bytes: registriert die Typen und liefert eine Beschreibung für info/play
  function bagFromMcap (name, mcapName, u8, metaText) {
    const r = readMcap(u8)
    for (const s of r.schemas.values()) if (s.encoding === 'ros2msg') registerRos2Msg(s.name, s.data)
    const topics = new Map()
    for (const c of r.channels.values()) {
      const s = r.schemas.get(c.schemaId)
      topics.set(c.id, { name: c.topic, type: s ? s.name : '?', format: c.messageEncoding, count: 0, qos: c.metadata.offered_qos_profiles || '' })
    }
    const messages = r.messages.map(m => { const t = topics.get(m.channelId); t.count++; return { topic: t.name, type: t.type, t: m.logTime, data: m.data } })
    const files = new Map([[mcapName, u8]])
    if (metaText) files.set('metadata.yaml', metaText)
    return { name, files, mcapName, topics: [...topics.values()], messages }
  }

  function bagMetadataYaml (bag) {
    const start = bag.messages.length ? bag.messages[0].t : INT64_MAX
    const dur = bag.messages.length ? bag.messages[bag.messages.length - 1].t - start : 0n
    const topicsYaml = bag.topics.map(t => {
      const hash = (TYPES[t.type] && TYPES[t.type].hash) || ''
      return `    - topic_metadata:\n        name: ${t.name}\n        type: ${t.type}\n        serialization_format: cdr\n        offered_qos_profiles:\n` +
        QOS_META(t.rel || 'reliable', t.dur || 'volatile').split('\n').map(l => '          ' + l).join('\n') +
        `\n        type_description_hash: ${hash}\n      message_count: ${t.count}`
    }).join('\n')
    return `rosbag2_bagfile_information:\n  version: 9\n  storage_identifier: mcap\n  duration:\n    nanoseconds: ${dur}\n  starting_time:\n    nanoseconds_since_epoch: ${start}\n  message_count: ${bag.messages.length}\n  topics_with_message_count:\n${topicsYaml || '    []'}\n  compression_format: ""\n  compression_mode: ""\n  relative_file_paths:\n    - ${bag.mcapName}\n  files:\n    - path: ${bag.mcapName}\n      starting_time:\n        nanoseconds_since_epoch: ${start}\n      duration:\n        nanoseconds: ${dur}\n      message_count: ${bag.messages.length}\n  custom_data: ~\n  ros_distro: jazzy\n`
  }

  // Aufgenommene Nachrichten (als Objekte) in eine Bag mit MCAP-Datei verwandeln
  function bagFromRecording (name, topics, recorded) {
    const schemas = []; const channels = []; const chanOf = new Map()
    for (const t of topics) {
      let s = schemas.find(x => x.name === t.type)
      if (!s) { s = { id: schemas.length + 1, name: t.type, encoding: 'ros2msg', data: ros2msgOf(t.type) }; schemas.push(s) }
      const c = { id: channels.length + 1, schemaId: s.id, topic: t.name, messageEncoding: 'cdr', metadata: { offered_qos_profiles: QOS_META(t.rel || 'reliable', t.dur || 'volatile'), topic_type_hash: (TYPES[t.type] && TYPES[t.type].hash) || '' } }
      channels.push(c); chanOf.set(t.name, c)
    }
    const msgs = recorded.map(r => ({ channelId: chanOf.get(r.topic).id, logTime: r.t, data: cdrEncode(r.type, r.msg) }))
    const bag = { name, mcapName: name + '_0.mcap', topics: topics.map(t => Object.assign({ count: recorded.filter(r => r.topic === t.name).length, format: 'cdr' }, t)), messages: recorded.map((r, i) => ({ topic: r.topic, type: r.type, t: r.t, data: msgs[i].data })) }
    const meta = bagMetadataYaml(bag)
    const u8 = writeMcap({ schemas, channels, messages: msgs, metadataYaml: meta })
    bag.files = new Map([[bag.mcapName, u8], ['metadata.yaml', meta]])
    return bag
  }

  function fileSize (f) { return typeof f === 'string' ? new TextEncoder().encode(f).length : f.length }

  // Wie rosbag2::format_file_size
  function formatSize (n) {
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
    let i = 0; let v = n
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
    return v.toFixed(1) + ' ' + units[i]
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  function formatStamp (ns) {
    const sec = ns / 1000000000n; const nsec = ns % 1000000000n
    const d = new Date(Number(sec) * 1000)
    const p2 = (x) => String(x).padStart(2, '0')
    const frac = String(nsec).padStart(9, '0')
    return `${MONTHS[d.getMonth()]} ${p2(d.getDate())} ${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}.${frac} (${sec}.${frac})`
  }

  // ======================================================================
  // Kommandozeile: Zerlegung wie in der Bash
  // ======================================================================

  function shellTokens (line) {
    const toks = []
    let i = 0; let cur = null
    let quote = null
    while (i < line.length) {
      const c = line[i]
      if (quote) {
        if (c === quote) { quote = null; i++; continue }
        if (quote === '"' && c === '\\' && i + 1 < line.length && '"\\$'.includes(line[i + 1])) { cur.v += line[i + 1]; i += 2; continue }
        cur.v += c; i++; continue
      }
      if (/\s/.test(c)) { if (cur) { cur.end = i; toks.push(cur); cur = null } i++; continue }
      if (!cur) cur = { v: '', start: i, end: i, quoted: false }
      if (c === '"' || c === "'") { quote = c; cur.quoted = true; i++; continue }
      if (c === '\\' && i + 1 < line.length) { cur.v += line[i + 1]; i += 2; continue }
      cur.v += c; i++
    }
    if (cur) { cur.end = line.length; toks.push(cur) }
    return { toks, open: quote, trailingSpace: !cur && /\s$/.test(line) }
  }

  function expandVars (s, env) {
    return s.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (_, k) => env[k] !== undefined ? env[k] : '')
  }

  // ======================================================================
  // ros2-Befehle
  // ======================================================================

  const ROS2_COMMANDS = ['action', 'bag', 'component', 'control', 'daemon', 'doctor', 'extension_points',
    'extensions', 'interface', 'launch', 'lifecycle', 'multicast', 'node', 'param', 'pkg', 'plugin',
    'run', 'security', 'service', 'topic', 'wtf']
  const VERBS = {
    topic: ['bw', 'delay', 'echo', 'find', 'hz', 'info', 'list', 'pub', 'type'],
    node: ['info', 'list'],
    interface: ['list', 'package', 'packages', 'proto', 'show'],
    pkg: ['create', 'executables', 'list', 'prefix', 'xml'],
    service: ['call', 'echo', 'find', 'info', 'list', 'type'],
    param: ['delete', 'describe', 'dump', 'get', 'list', 'load', 'set'],
    action: ['info', 'list', 'send_goal', 'type'],
    bag: ['burst', 'convert', 'info', 'list', 'play', 'record', 'reindex'],
    daemon: ['start', 'status', 'stop']
  }

  // Deutsche Kurzbeschreibungen für die Vervollständigung (gehören zur Simulation, nicht zu ROS)
  const DESC = {
    ros2: {
      run: 'Programm eines Pakets starten', node: 'Knoten auflisten und untersuchen', topic: 'Topics auflisten, mitlesen, senden',
      interface: 'Nachrichten-, Service- und Action-Typen ansehen', pkg: 'Pakete und Programme auflisten', service: 'Services auflisten und aufrufen',
      param: 'Parameter lesen und setzen', action: 'Actions auflisten und Ziele senden',
      bag: 'Bagdateien aufnehmen, untersuchen, abspielen', component: 'nicht nachgebildet', control: 'nicht nachgebildet',
      daemon: 'ros2-Daemon starten, stoppen, abfragen', doctor: 'nicht nachgebildet', extension_points: 'nicht nachgebildet',
      extensions: 'nicht nachgebildet', launch: 'nicht nachgebildet', lifecycle: 'nicht nachgebildet',
      multicast: 'nicht nachgebildet', plugin: 'nicht nachgebildet',
      security: 'nicht nachgebildet', wtf: 'nicht nachgebildet'
    },
    param: { list: 'Parameter auflisten', get: 'Wert lesen', set: 'Wert setzen', dump: 'alle Parameter eines Knotens als YAML', describe: 'Typ, Beschreibung und Grenzen', delete: 'Parameter löschen', load: 'nicht nachgebildet' },
    daemon: { start: 'Daemon starten', stop: 'Daemon beenden (z. B. nach Änderung von ROS_AUTOMATIC_DISCOVERY_RANGE)', status: 'läuft der Daemon?' },
    bag: { record: 'Topics aufnehmen', info: 'Inhalt einer Bagdatei', play: 'Bagdatei abspielen', burst: 'nicht nachgebildet', convert: 'nicht nachgebildet', list: 'nicht nachgebildet', reindex: 'nicht nachgebildet' },
    action: { list: 'alle Actions auflisten', info: 'Server und Clients einer Action', type: 'Typ einer Action', send_goal: 'Ziel senden und auf Ergebnis warten' },
    topic: {
      list: 'alle Topics auflisten', info: 'Typ und Zahl der Publisher/Subscriber', echo: 'Nachrichten mitlesen',
      hz: 'Senderate messen', pub: 'Nachrichten senden', type: 'Nachrichtentyp eines Topics', find: 'Topics eines Typs finden',
      bw: 'nicht nachgebildet', delay: 'nicht nachgebildet'
    },
    node: { list: 'alle Knoten auflisten', info: 'Publisher, Subscriber und Services eines Knotens' },
    interface: { show: 'Felder eines Typs anzeigen', proto: 'Vorlage für eine Nachricht', list: 'nachgebildete Typen auflisten', package: 'nicht nachgebildet', packages: 'nicht nachgebildet' },
    pkg: { executables: 'Programme eines Pakets', list: 'Pakete auflisten', create: 'nicht nachgebildet', prefix: 'nicht nachgebildet', xml: 'nicht nachgebildet' },
    service: { list: 'alle Services auflisten', call: 'Service aufrufen', echo: 'nicht nachgebildet', find: 'Services eines Typs finden', info: 'nicht nachgebildet', type: 'Typ eines Services' }
  }

  const QOS_CHOICES = {
    '--qos-reliability': ['system_default', 'reliable', 'best_effort', 'unknown', 'best_available'],
    '--qos-durability': ['system_default', 'transient_local', 'volatile', 'unknown', 'best_available'],
    '--qos-history': ['system_default', 'keep_last', 'keep_all', 'unknown'],
    '--qos-liveliness': ['system_default', 'automatic', 'manual_by_topic', 'unknown', 'best_available'],
    '--qos-profile': ['unknown', 'default', 'system_default', 'sensor_data', 'services_default', 'parameters', 'parameter_events', 'action_status_default', 'best_available']
  }
  const QOS_OPTS = Object.fromEntries(Object.keys(QOS_CHOICES).map(k => [k, { arg: 'Q', choices: QOS_CHOICES[k] }]))

  // Argumentbeschreibung je Befehl. arg: Option erwartet einen Wert.
  const SPECS = {
    'topic list': {
      opts: {
        '-t': { key: 't', d: 'mit Nachrichtentyp' },
        '--show-types': { key: 't', d: 'mit Nachrichtentyp' },
        '-c': { key: 'c', d: 'nur die Anzahl' },
        '--count-topics': { key: 'c', d: 'nur die Anzahl' },
        '-v': { key: 'v', d: 'nach Publishern und Subscribern getrennt' },
        '--verbose': { key: 'v', d: 'nach Publishern und Subscribern getrennt' },
        '--include-hidden-topics': { key: 'hidden', d: 'auch versteckte Topics' },
        '--spin-time': { arg: 'N' },
        '-s': { key: 'sim' },
        '--use-sim-time': { key: 'sim' },
        '--no-daemon': { key: 'nd' }
      },
      pos: []
    },
    'topic info': {
      opts: { '-v': { key: 'v', d: 'mit Knoten und QoS' }, '--verbose': { key: 'v', d: 'mit Knoten und QoS' }, '--spin-time': { arg: 'N' }, '-s': {}, '--no-daemon': {} },
      pos: [['topic_name', 'topic']]
    },
    'topic echo': {
      opts: Object.assign({
        '--once': { key: 'once', d: 'nur eine Nachricht, dann beenden' },
        '--field': { arg: 'FIELD', key: 'field', d: 'nur ein Feld ausgeben, z. B. data' },
        '--no-arr': { key: 'noArr', d: 'keine Arrays' },
        '--no-str': { key: 'noStr', d: 'keine Zeichenketten' },
        '--full-length': { key: 'full' },
        '-f': { key: 'full' },
        '--truncate-length': { arg: 'N' },
        '-l': { arg: 'N' },
        '--timeout': { arg: 'N', key: 'timeout', d: 'nach N Sekunden ohne Nachricht beenden' },
        '--qos-depth': { arg: 'N' },
        '--qos-liveliness-lease-duration-seconds': { arg: 'N' },
        '--csv': { key: 'unsup' },
        '--raw': { key: 'unsup' },
        '--flow-style': { key: 'unsup' },
        '--filter': { arg: 'EXPR', key: 'unsupArg' },
        '--include-message-info': { key: 'unsup' },
        '-i': { key: 'unsup' },
        '--no-lost-messages': {},
        '--spin-time': { arg: 'N' },
        '-s': {},
        '--use-sim-time': {},
        '--no-daemon': {}
      }, QOS_OPTS),
      pos: [['topic_name', 'topic'], ['message_type?', 'topicType']]
    },
    'topic hz': {
      opts: { '--window': { arg: 'WINDOW', key: 'window', d: 'Fenstergröße' }, '-w': { arg: 'WINDOW', key: 'window' }, '--filter': { arg: 'EXPR', key: 'unsupArg' }, '--wall-time': {}, '--spin-time': { arg: 'N' }, '-s': {}, '--use-sim-time': {} },
      pos: [['topic_name', 'topic']]
    },
    'topic pub': {
      opts: Object.assign({
        '-1': { key: 'once', d: 'genau eine Nachricht senden' },
        '--once': { key: 'once', d: 'genau eine Nachricht senden' },
        '-r': { arg: 'N', key: 'rate', d: 'Senderate in Hz (Standard 1)' },
        '--rate': { arg: 'N', key: 'rate', d: 'Senderate in Hz (Standard 1)' },
        '-t': { arg: 'TIMES', key: 'times', d: 'nach TIMES Nachrichten beenden' },
        '--times': { arg: 'TIMES', key: 'times', d: 'nach TIMES Nachrichten beenden' },
        '-p': { arg: 'N', key: 'print', d: 'nur jede N-te Nachricht anzeigen' },
        '--print': { arg: 'N', key: 'print' },
        '-w': { arg: 'N', key: 'wait', d: 'auf N passende Subscriber warten' },
        '--wait-matching-subscriptions': { arg: 'N', key: 'wait' },
        '--max-wait-time-secs': { arg: 'N', key: 'maxWait' },
        '--keep-alive': { arg: 'N', key: 'keepAlive' },
        '-n': { arg: 'NODE_NAME', key: 'nodeName', d: 'Name des Sendeknotens' },
        '--node-name': { arg: 'NODE_NAME', key: 'nodeName' },
        '--qos-depth': { arg: 'N' },
        '--qos-liveliness-lease-duration-seconds': { arg: 'N' },
        '--stdin': { key: 'unsup' },
        '--spin-time': { arg: 'N' },
        '-s': {},
        '--use-sim-time': {}
      }, QOS_OPTS),
      pos: [['topic_name', 'anyTopic'], ['message_type', 'pubType'], ['values?', 'yaml']]
    },
    'topic type': { opts: { '--spin-time': { arg: 'N' }, '-s': {}, '--no-daemon': {} }, pos: [['topic_name', 'topic']] },
    'topic find': {
      opts: { '-c': { key: 'c', d: 'nur die Anzahl' }, '--count-topics': { key: 'c' }, '--include-hidden-topics': {}, '--spin-time': { arg: 'N' }, '-s': {}, '--no-daemon': {} },
      pos: [['topic_type', 'type']]
    },
    'node list': {
      opts: { '-a': { key: 'a', d: 'auch versteckte Knoten' }, '--all': { key: 'a', d: 'auch versteckte Knoten' }, '-c': { key: 'c', d: 'nur die Anzahl' }, '--count-nodes': { key: 'c' }, '--spin-time': { arg: 'N' }, '-s': {}, '--no-daemon': {} },
      pos: []
    },
    'node info': { opts: { '--include-hidden': { key: 'hidden', d: 'auch versteckte Topics/Services' }, '--spin-time': { arg: 'N' }, '-s': {}, '--no-daemon': {} }, pos: [['node_name', 'node']] },
    'interface show': { opts: { '--all-comments': {}, '--no-comments': { key: 'noComments', d: 'ohne Kommentare' } }, pos: [['type', 'type']] },
    'interface proto': { opts: { '--no-quotes': { key: 'noQuotes', d: 'ohne Anführungszeichen' } }, pos: [['type', 'type']] },
    'interface list': { opts: { '-m': { key: 'm', d: 'nur Nachrichten' }, '--only-msgs': { key: 'm' }, '-s': {}, '--only-srvs': {}, '-a': {}, '--only-actions': {} }, pos: [] },
    'pkg executables': { opts: { '--full-path': { key: 'unsup' } }, pos: [['package_name?', 'pkg']] },
    'pkg list': { opts: {}, pos: [] },
    'service list': { opts: { '-t': { key: 't', d: 'mit Typ' }, '--show-types': { key: 't' }, '-c': { key: 'c', d: 'nur die Anzahl' }, '--count-services': { key: 'c' }, '--include-hidden-services': {}, '--spin-time': { arg: 'N' }, '-s': {}, '--no-daemon': {} }, pos: [] },
    'service type': { opts: { '--spin-time': { arg: 'N' }, '-s': {}, '--no-daemon': {}, '--include-hidden-services': {} }, pos: [['service_name', 'service']] },
    'service find': { opts: { '-c': { key: 'c', d: 'nur die Anzahl' }, '--count-services': { key: 'c' }, '--include-hidden-services': {}, '--spin-time': { arg: 'N' }, '-s': {}, '--no-daemon': {} }, pos: [['service_type', 'srvTypeAll']] },
    'service call': { opts: { '-r': { arg: 'N', key: 'rate', d: 'wiederholt mit N Hz aufrufen' }, '--rate': { arg: 'N', key: 'rate' }, '--stdin': { key: 'unsup' } }, pos: [['service_name', 'service'], ['service_type', 'srvType'], ['values?', 'srvYaml']] },
    'param list': {
      opts: { '--filter': { arg: 'FILTER', key: 'filter', d: 'nur Namen, die zum regulären Ausdruck passen' }, '--param-type': { key: 'paramType', d: 'mit Typ' }, '--param-prefixes': { arg: 'PARAM_PREFIXES', key: 'unsupArg' }, '--include-hidden-nodes': {}, '--spin-time': { arg: 'N' }, '-s': {}, '--no-daemon': {} },
      pos: [['node_name?', 'node']]
    },
    'param get': { opts: { '--hide-type': { key: 'hideType', d: 'nur den Wert' }, '--timeout': { arg: 'N' }, '--include-hidden-nodes': {}, '--spin-time': { arg: 'N' }, '-s': {}, '--no-daemon': {} }, pos: [['node_name', 'node'], ['parameter_name', 'param']] },
    'param set': { opts: { '--timeout': { arg: 'N' }, '--include-hidden-nodes': {}, '--spin-time': { arg: 'N' }, '-s': {}, '--no-daemon': {} }, pos: [['node_name', 'node'], ['parameter_name', 'param'], ['value', 'paramValue']] },
    'param dump': { opts: { '--output-dir': { arg: 'OUTPUT_DIR', key: 'outputDir' }, '--print': {}, '--timeout': { arg: 'N' }, '--include-hidden-nodes': {}, '--spin-time': { arg: 'N' }, '-s': {}, '--no-daemon': {} }, pos: [['node_name', 'node']] },
    'param describe': { opts: { '--timeout': { arg: 'N' }, '--include-hidden-nodes': {}, '--spin-time': { arg: 'N' }, '-s': {}, '--no-daemon': {} }, pos: [['node_name', 'node'], ['parameter_names', 'param']], rest: true },
    'param delete': { opts: { '--timeout': { arg: 'N' }, '--include-hidden-nodes': {}, '--spin-time': { arg: 'N' }, '-s': {}, '--no-daemon': {} }, pos: [['node_name', 'node'], ['parameter_names', 'param']], rest: true },
    'action list': { opts: { '-t': { key: 't', d: 'mit Typ' }, '--show-types': { key: 't' }, '-c': { key: 'c', d: 'nur die Anzahl' }, '--count-actions': { key: 'c' } }, pos: [] },
    'action info': { opts: { '-t': { key: 't', d: 'mit Typ' }, '--show-types': { key: 't' }, '-c': { key: 'c', d: 'nur die Anzahl' }, '--count': { key: 'c' } }, pos: [['action_name', 'action']] },
    'action type': { opts: {}, pos: [['action_name', 'action']] },
    'daemon start': { opts: { '--debug': {} }, pos: [] },
    'daemon stop': { opts: {}, pos: [] },
    'daemon status': { opts: {}, pos: [] },
    'bag info': { opts: { '-t': { key: 't', d: 'nur Topic-Namen' }, '--topic-name': { key: 't' }, '-s': { arg: 'STORAGE', choices: ['sqlite3', 'mcap'] }, '--storage': { arg: 'STORAGE', choices: ['sqlite3', 'mcap'] }, '-v': { key: 'unsup' }, '--verbose': { key: 'unsup' }, '--sort': { arg: 'SORT', choices: ['type', 'name', 'count'] } }, pos: [['bag_path', 'bag']] },
    'bag record': {
      opts: {
        '-o': { arg: 'OUTPUT', key: 'output', d: 'Name des Ordners' }, '--output': { arg: 'OUTPUT', key: 'output' },
        '--topics': { multi: true, key: 'topics', d: 'diese Topics aufnehmen' },
        '-a': { key: 'all', d: 'alle Topics aufnehmen' }, '--all': { key: 'all' }, '--all-topics': { key: 'all', d: 'alle Topics aufnehmen' },
        '-s': { arg: 'STORAGE', choices: ['mcap', 'sqlite3'] }, '--storage': { arg: 'STORAGE', choices: ['mcap', 'sqlite3'] },
        '-e': { arg: 'REGEX', key: 'unsupArg' }, '--regex': { arg: 'REGEX', key: 'unsupArg' },
        '--exclude-topics': { multi: true, key: 'unsupArg' }, '--include-hidden-topics': { key: 'unsup' },
        '--max-bag-size': { arg: 'N', key: 'unsupArg' }, '-b': { arg: 'N', key: 'unsupArg' },
        '--max-bag-duration': { arg: 'N', key: 'unsupArg' }, '-d': { arg: 'N', key: 'unsupArg' },
        '--compression-mode': { arg: 'MODE', key: 'unsupArg' }, '--compression-format': { arg: 'FORMAT', key: 'unsupArg' },
        '--use-sim-time': { key: 'unsup' }, '--no-discovery': { key: 'unsup' }
      },
      pos: [['topics?', 'recTopic']],
      rest: true
    },
    'bag play': {
      opts: {
        '-r': { arg: 'RATE', key: 'rate', d: 'Abspielrate, z. B. 2.0' }, '--rate': { arg: 'RATE', key: 'rate' },
        '-l': { key: 'loop', d: 'endlos wiederholen' }, '--loop': { key: 'loop' },
        '--topics': { multi: true, key: 'topics', d: 'nur diese Topics abspielen' },
        '--remap': { multi: true, key: 'remap', d: 'Topics umbenennen: alt:=neu' }, '-m': { multi: true, key: 'remap' },
        '-d': { arg: 'DELAY', key: 'delay', d: 'Sekunden warten vor dem Start' }, '--delay': { arg: 'DELAY', key: 'delay' },
        '-p': { key: 'startPaused', d: 'pausiert starten' }, '--start-paused': { key: 'startPaused' },
        '-s': { arg: 'STORAGE', choices: ['mcap', 'sqlite3'] }, '--storage': { arg: 'STORAGE', choices: ['mcap', 'sqlite3'] },
        '--clock': { key: 'unsup' }, '--start-offset': { arg: 'N', key: 'unsupArg' }, '--disable-keyboard-controls': {},
        '--read-ahead-queue-size': { arg: 'N' }, '--log-level': { arg: 'LEVEL' }
      },
      pos: [['bag_path?', 'bag']]
    },
    'action send_goal': { opts: { '-f': { key: 'feedback', d: 'Zwischenstände (Feedback) anzeigen' }, '--feedback': { key: 'feedback', d: 'Zwischenstände (Feedback) anzeigen' }, '--stdin': { key: 'unsup' }, '-t': { arg: 'N', key: 'unsupArg' } }, pos: [['action_name', 'action'], ['action_type', 'actType'], ['goal?', 'actYaml']] }
  }

  function usageOf (prog) {
    const h = help()[prog]
    if (!h) return 'usage: ros2 ' + prog
    return h.split('\n\n')[0]
  }

  function argError (sess, prog, msg) {
    sess.print(usageOf(prog) + '\n' + ('ros2 ' + prog).trim() + ': error: ' + msg, 'err')
  }

  // Liefert {opts, pos} oder null (Fehler wurde bereits ausgegeben)
  function parseArgs (sess, prog, args) {
    const spec = SPECS[prog]
    const o = { _unsup: [] }
    const pos = []
    for (let i = 0; i < args.length; i++) {
      let a = args[i]
      if (a === '-h' || a === '--help') { sess.print(help()[prog] || usageOf(prog)); return null }
      let val = null
      if (a.startsWith('--') && a.includes('=')) { val = a.slice(a.indexOf('=') + 1); a = a.slice(0, a.indexOf('=')) }
      const isNum = /^-\d+(\.\d+)?$/.test(a) && !spec.opts[a]
      if (a.startsWith('-') && a !== '-' && !isNum) {
        const os = spec.opts[a]
        if (!os) {
          sess.print(usageOf('') + '\nros2: error: unrecognized arguments: ' + a, 'err')
          return null
        }
        if (os.multi) {
          const vals = val !== null ? [val] : []
          while (i + 1 < args.length && !(args[i + 1].startsWith('-') && args[i + 1] !== '-')) vals.push(args[++i])
          if (!vals.length) { argError(sess, prog, `argument ${a}: expected at least one argument`); return null }
          o[os.key || a] = (o[os.key || a] || []).concat(vals)
        } else if (os.arg) {
          if (val === null) {
            if (i + 1 >= args.length) { argError(sess, prog, `argument ${a}: expected one argument`); return null }
            val = args[++i]
          }
          if (os.choices && !os.choices.includes(val)) {
            argError(sess, prog, `argument ${a}: invalid choice: '${val}' (choose from ${os.choices.map(c => "'" + c + "'").join(', ')})`)
            return null
          }
          o[os.key || a] = val
          if (os.key === 'unsupArg') o._unsup.push(a)
        } else {
          o[os.key || a] = true
          if (os.key === 'unsup') o._unsup.push(a)
        }
      } else pos.push(a)
    }
    const req = spec.pos.filter(p => !p[0].endsWith('?'))
    if (pos.length < req.length) {
      argError(sess, prog, 'the following arguments are required: ' + req.slice(pos.length).map(p => p[0]).join(', '))
      return null
    }
    if (pos.length > spec.pos.length && !spec.rest) {
      sess.print(usageOf('') + '\nros2: error: unrecognized arguments: ' + pos.slice(spec.pos.length).join(' '), 'err')
      return null
    }
    for (const u of o._unsup) sess.hint(`Die Option ${u} ist in dieser Simulation nicht nachgebildet und wird ignoriert.`)
    return { o, pos }
  }

  function didYouMean (sess, word, cands) {
    const c = closest(word, cands)
    if (c) sess.hint(`Meintest du „${c}“?`)
  }

  function cliNode (sess, name) {
    const g = sess.sim.graph
    g.ensureDaemon(sess.scope())
    const node = g.addNode({
      scope: sess.scope(),
      name: name || '_ros2cli_' + g.nextPid(),
      logger: (lvl, txt) => sess.print(`[${lvl}] [${stamp()}] [${node.name}]: ${txt}`, lvl.toLowerCase())
    })
    return node
  }

  function topicArg (name) {
    return name.startsWith('/') ? name : '/' + name
  }

  function checkTypeForUse (sess, type) {
    const st = typeStatus(type)
    if (st === 'ok') return true
    if (st === 'internal') {
      sess.hint(`Der Inhalt von ${type} ist in dieser Simulation nicht nachgebildet.`)
      return false
    }
    if (st === 'unmodelled') {
      sess.hint(`Den Typ ${type} gibt es in ROS 2, er ist in dieser Simulation aber nicht nachgebildet. Nachgebildet: ${MSG_TYPES().join(', ')}`)
      return false
    }
    sess.print('The passed message type is invalid', 'err')
    didYouMean(sess, type, MSG_TYPES())
    return false
  }

  const qosBlock = (q) => [
    'QoS profile:',
    '  Reliability: ' + q.reliability,
    '  History (Depth): UNKNOWN',
    '  Durability: ' + q.durability,
    '  Lifespan: Infinite',
    '  Deadline: Infinite',
    '  Liveliness: AUTOMATIC',
    '  Liveliness lease duration: Infinite'
  ]

  const IMPL = {}

  IMPL.topic = (sess, args) => verbDispatch(sess, 'topic', args, {
    list (sess, a) {
      const p = parseArgs(sess, 'topic list', a); if (!p) return
      const g = sess.view()
      const topics = [...g.topics().values()].sort((x, y) => x.name < y.name ? -1 : 1)
      if (p.o.c) { sess.print(String(topics.length)); return }
      if (p.o.v) {
        const out = ['Published topics:']
        for (const t of topics.filter(t => t.pubs.length)) out.push(` * ${t.name} [${t.types.join(', ')}] ${t.pubs.length} publisher${t.pubs.length > 1 ? 's' : ''}`)
        out.push('', 'Subscribed topics:')
        for (const t of topics.filter(t => t.subs.length)) out.push(` * ${t.name} [${t.types.join(', ')}] ${t.subs.length} subscriber${t.subs.length > 1 ? 's' : ''}`)
        out.push('')
        sess.print(out.join('\n'))
        return
      }
      sess.print(topics.map(t => t.name + (p.o.t ? ' [' + t.types.join(', ') + ']' : '')).join('\n'))
    },
    info (sess, a) {
      const p = parseArgs(sess, 'topic info', a); if (!p) return
      const g = sess.view()
      const name = topicArg(p.pos[0])
      const t = g.topics().get(name)
      if (!t) { sess.print(`Unknown topic '${name}'`, 'err'); didYouMean(sess, name, g.topicNames()); return }
      if (!p.o.v) {
        sess.print(`Type: ${t.types[0]}\nPublisher count: ${t.pubs.length}\nSubscription count: ${t.subs.length}`)
        return
      }
      const block = (ep) => {
        const hash = (TYPES[ep.type] && TYPES[ep.type].hash) || INTERNAL_TYPES[ep.type]
        return ['Node name: ' + ep.node.name, 'Node namespace: ' + ep.node.ns, 'Topic type: ' + ep.type]
          .concat(hash ? ['Topic type hash: ' + hash] : [])
          .concat(['Endpoint type: ' + (ep.kind === 'pub' ? 'PUBLISHER' : 'SUBSCRIPTION'), 'GID: ' + ep.gid])
          .concat(qosBlock(ep.qos), [''])
      }
      let out = [`Type: ${t.types[0]}`, '', `Publisher count: ${t.pubs.length}`, '']
      for (const ep of t.pubs) out = out.concat(block(ep))
      out.push(`Subscription count: ${t.subs.length}`, '')
      for (const ep of t.subs) out = out.concat(block(ep))
      sess.print(out.join('\n'))
      if (t.pubs.concat(t.subs).some(ep => !(TYPES[ep.type] && TYPES[ep.type].hash) && !INTERNAL_TYPES[ep.type])) {
        sess.hint('Für diesen Typ liegt kein mitgeschnittener „Topic type hash“ vor; die Zeile fehlt deshalb.')
      }
    },
    type (sess, a) {
      const p = parseArgs(sess, 'topic type', a); if (!p) return
      const g = sess.view()
      const t = g.topics().get(topicArg(p.pos[0]))
      if (t) sess.print(t.types.join('\n'))
    },
    find (sess, a) {
      const p = parseArgs(sess, 'topic find', a); if (!p) return
      const g = sess.view()
      const type = normalizeType(p.pos[0])
      const hits = [...g.topics().values()].filter(t => t.types.includes(type)).map(t => t.name).sort()
      if (p.o.c) sess.print(String(hits.length))
      else if (hits.length) sess.print(hits.join('\n'))
    },
    echo (sess, a) {
      const p = parseArgs(sess, 'topic echo', a); if (!p) return
      const g = sess.view()
      const name = topicArg(p.pos[0])
      const err = validateTopic(name)
      if (err) { sess.print(`rclpy._rclpy_pybind11.InvalidTopicNameException: Invalid topic name: ${err}:\n  '${name}'`, 'err'); return }
      const t = g.topics().get(name)
      let type = p.pos[1] ? normalizeType(p.pos[1]) : null
      if (!type) {
        if (!t || !t.pubs.length) {
          sess.print(`WARNING: topic [${name}] does not appear to be published yet`, 'warn')
          if (!t) {
            sess.print('Could not determine the type for the passed topic', 'err')
            didYouMean(sess, name, g.topicNames())
            return
          }
        }
        type = t.types[0]
      }
      if (!checkTypeForUse(sess, type)) return
      const proc = sess.spawn('ros2 topic echo ' + name)
      const node = cliNode(sess)
      proc.defer(() => g.removeNode(node))
      const pubs = t ? t.pubs.filter(ep => ep.type === type) : []
      const rel = p.o['--qos-reliability'] && !['system_default', 'unknown', 'best_available'].includes(p.o['--qos-reliability'])
        ? p.o['--qos-reliability'] : (pubs.some(ep => ep.qos.reliability === 'BEST_EFFORT') ? 'best_effort' : 'reliable')
      const dur = p.o['--qos-durability'] && !['system_default', 'unknown', 'best_available'].includes(p.o['--qos-durability'])
        ? p.o['--qos-durability'] : (pubs.length && pubs.every(ep => ep.qos.durability === 'TRANSIENT_LOCAL') ? 'transient_local' : 'volatile')
      let got = false
      g.createSubscription(node, name, type, { reliability: rel, durability: dur }, (msg) => {
        got = true
        let lines
        if (p.o.field) {
          let v = msg; let ft = type
          for (const part of p.o.field.split('.')) {
            const f = TYPES[ft] && TYPES[ft].fields.find(x => x[1] === part)
            if (!f) { proc.print(`Invalid field '${p.o.field}': '${ft.split('/').pop()}' object has no attribute '${part}'`, 'err'); proc.exit(); return }
            v = v[part]; ft = f[0]
          }
          lines = isNested(ft) ? yamlMsg(ft, v, '', { full: p.o.full }) : [yamlScalar(ft, v, { full: p.o.full })]
        } else lines = yamlMsg(type, msg, '', { full: p.o.full, noStr: p.o.noStr })
        proc.print(lines.concat('---').join('\n'))
        if (p.o.once) proc.exit()
      })
      if (p.o.timeout) proc.after(parseFloat(p.o.timeout) * 1000, () => { if (!got) proc.exit() })
    },
    hz (sess, a) {
      const p = parseArgs(sess, 'topic hz', a); if (!p) return
      const g = sess.view()
      const name = topicArg(p.pos[0])
      const proc = sess.spawn('ros2 topic hz ' + name)
      const node = cliNode(sess)
      proc.defer(() => g.removeNode(node))
      const win = parseInt(p.o.window || '10000', 10)
      const times = []
      let lastPrinted = 0
      let subscribed = false
      const trySub = () => {
        if (subscribed) return
        const t = g.topics().get(name)
        if (!t || !t.pubs.length) return
        subscribed = true
        const pubs = t.pubs
        const rel = pubs.some(ep => ep.qos.reliability === 'BEST_EFFORT') ? 'best_effort' : 'reliable'
        g.createSubscription(node, name, pubs[0].type, { reliability: rel }, () => {
          times.push(Date.now() / 1000); if (times.length > win) times.shift()
        })
      }
      trySub()
      if (!subscribed) sess.print(`WARNING: topic [${name}] does not appear to be published yet`, 'warn')
      proc.every(250, trySub)
      proc.every(1000, () => {
        if (times.length < 2 || times[times.length - 1] === lastPrinted) return
        lastPrinted = times[times.length - 1]
        const d = []
        for (let i = 1; i < times.length; i++) d.push(times[i] - times[i - 1])
        const mean = d.reduce((s, x) => s + x, 0) / d.length
        const std = Math.sqrt(d.reduce((s, x) => s + (x - mean) * (x - mean), 0) / d.length)
        proc.print(`average rate: ${(1 / mean).toFixed(3)}\n\tmin: ${Math.min(...d).toFixed(3)}s max: ${Math.max(...d).toFixed(3)}s std dev: ${std.toFixed(5)}s window: ${times.length}`)
      })
    },
    pub (sess, a) {
      const p = parseArgs(sess, 'topic pub', a); if (!p) return
      const g = sess.sim.graph
      const name = topicArg(p.pos[0])
      const type = normalizeType(p.pos[1])
      if (!checkTypeForUse(sess, type)) return
      const r = msgFromYaml(type, p.pos[2] || '')
      if (r.error) {
        sess.print(r.error, 'err')
        if (/YAML/.test(r.error)) sess.hint('Werte in YAML-Schreibweise angeben, z. B. "' + yamlSkeleton(type) + '" – mit Anführungszeichen, damit die Shell sie nicht zerlegt.')
        return
      }
      const err = validateTopic(name)
      if (err) { sess.print(`rclpy._rclpy_pybind11.InvalidTopicNameException: Invalid topic name: ${err}:\n  '${name}'`, 'err'); return }
      const rate = parseFloat(p.o.rate || '1')
      if (!(rate > 0)) { sess.print('rate must be greater than zero', 'err'); return }
      const times = p.o.once ? 1 : (p.o.times ? parseInt(p.o.times, 10) : Infinity)
      const wait = p.o.wait !== undefined ? parseInt(p.o.wait, 10) : (times !== Infinity ? 1 : 0)
      const every = Math.max(1, parseInt(p.o.print || '1', 10))
      const proc = sess.spawn('ros2 topic pub ' + name)
      const node = cliNode(sess, p.o.nodeName)
      proc.defer(() => g.removeNode(node))
      const qos = {
        reliability: p.o['--qos-reliability'] === 'best_effort' ? 'BEST_EFFORT' : 'RELIABLE',
        durability: p.o['--qos-durability'] === 'transient_local' ? 'TRANSIENT_LOCAL' : 'VOLATILE'
      }
      const ep = g.createPublisher(node, name, type, qos)
      let n = 0
      const start = () => {
        proc.print('publisher: beginning loop')
        const tick = () => {
          n++
          ep.publish(r.msg)
          if (n % every === 0) proc.print(`publishing #${n}: ${pyRepr(type, r.msg)}\n`)
          if (n >= times) proc.after(1000 * parseFloat(p.o.keepAlive || '0.1'), () => proc.exit())
        }
        tick()
        if (n < times) {
          const h = setInterval(() => { if (!proc.alive || n >= times) { clearInterval(h); return } tick() }, 1000 / rate)
          proc.defer(() => clearInterval(h))
        }
      }
      if (wait > 0) {
        let lastMsg = 0
        const waited = Date.now()
        const check = () => {
          if (!proc.alive) return
          if (g.matchingSubs(ep).length >= wait) { start(); return }
          if (p.o.maxWait && (Date.now() - waited) / 1000 > parseFloat(p.o.maxWait)) {
            proc.print(`Timed out waiting for subscribers: ${g.matchingSubs(ep).length} matching subscription(s) after ${p.o.maxWait} seconds`, 'err')
            proc.exit(); return
          }
          if (Date.now() - lastMsg >= 1000) {
            lastMsg = Date.now()
            proc.print(`Waiting for at least ${wait} matching subscription(s)...`)
          }
          proc.after(100, check)
        }
        check()
      } else start()
    }
  })

  IMPL.node = (sess, args) => verbDispatch(sess, 'node', args, {
    list (sess, a) {
      const p = parseArgs(sess, 'node list', a); if (!p) return
      const g = sess.view()
      const names = sorted(g.nodes.filter(n => p.o.a || !n.hidden).map(n => n.fqn))
      if (p.o.c) { sess.print(String(names.length)); return }
      if (new Set(names).size !== names.length) {
        sess.print('WARNING: Be aware that there are nodes in the graph that share an exact name, which can have unintended side effects.', 'warn')
      }
      if (names.length) sess.print(names.join('\n'))
    },
    info (sess, a) {
      const p = parseArgs(sess, 'node info', a); if (!p) return
      const g = sess.view()
      const fqn = p.pos[0]
      const matches = g.nodes.filter(n => n.fqn === fqn)
      if (!matches.length) {
        sess.print(`Unable to find node '${fqn}'`, 'err')
        if (!fqn.startsWith('/') && g.nodeByFqn('/' + fqn)) sess.hint(`Knotennamen beginnen mit „/“ – versuche ${'/' + fqn}.`)
        else didYouMean(sess, fqn, g.nodes.filter(n => !n.hidden).map(n => n.fqn))
        return
      }
      if (matches.length > 1) {
        sess.print(`There are ${matches.length} nodes in the graph with the exact name "${fqn}". You are seeing information about only one of them.`, 'warn')
      }
      const n = matches[0]
      const group = (eps) => {
        const m = new Map()
        for (const ep of eps) {
          if (!m.has(ep.topic)) m.set(ep.topic, [])
          if (!m.get(ep.topic).includes(ep.type)) m.get(ep.topic).push(ep.type)
        }
        return sorted([...m.keys()]).map(k => `    ${k}: ${m.get(k).join(', ')}`)
      }
      const list = (pairs) => sorted(pairs.map(([s, t]) => `    ${s}: ${t}`))
      const sec = (title, items) => ['  ' + title + ':'].concat(items.length ? items : [''])
      sess.print([n.fqn].concat(sec('Subscribers', group(n.subs)), sec('Publishers', group(n.pubs)),
        sec('Service Servers', list(n.services)), sec('Service Clients', []),
        sec('Action Servers', list(n.actionServers)), sec('Action Clients', list(n.actionClients))).join('\n'))
    }
  })

  IMPL.interface = (sess, args) => verbDispatch(sess, 'interface', args, {
    show (sess, a) {
      const p = parseArgs(sess, 'interface show', a); if (!p) return
      const type = normalizeType(p.pos[0])
      const show = (TYPES[type] && type.includes('/msg/') && showOf(type)) || (SRVS[type] && SRVS[type].show) || (ACTIONS[type] && ACTIONS[type].show)
      if (show) {
        const txt = p.o.noComments ? show.split('\n').filter(l => !l.startsWith('#')).join('\n').replace(/^\n+/, '') : show
        sess.print(txt); return
      }
      const all = MSG_TYPES().concat(Object.keys(SRVS), Object.keys(ACTIONS))
      const pkg = type.split('/')[0]
      const pkgs = new Set(KNOWN_PKGS.concat([...REAL_SRVS, ...REAL_ACTIONS].map(t => t.split('/')[0]), ['std_srvs']))
      if (!pkgs.has(pkg)) { sess.print(`Unknown package '${pkg}'`, 'err'); didYouMean(sess, type, all); return }
      sess.hint(`Den Typ ${type} zeigt diese Simulation nicht an. Nachgebildet: ${all.join(', ')}`)
    },
    proto (sess, a) {
      const p = parseArgs(sess, 'interface proto', a); if (!p) return
      const type = normalizeType(p.pos[0])
      if (!TYPES[type]) { if (checkTypeForUse(sess, type)) return; return }
      const body = protoYaml(type).join('\n') + '\n'
      sess.print(p.o.noQuotes ? body : '"' + body + '"')
    },
    list (sess, a) {
      const p = parseArgs(sess, 'interface list', a); if (!p) return
      sess.print('Messages:\n' + sorted(MSG_TYPES()).map(t => '    ' + t).join('\n'))
      sess.hint('Unter ROS 2 Jazzy stehen hier mehrere hundert Typen; die Simulation zeigt nur die nachgebildeten.')
    }
  })

  IMPL.pkg = (sess, args) => verbDispatch(sess, 'pkg', args, {
    executables (sess, a) {
      const p = parseArgs(sess, 'pkg executables', a); if (!p) return
      const pk = p.pos[0]
      if (pk && !PACKAGES[pk]) { sess.print(`Package '${pk}' not found`, 'err'); didYouMean(sess, pk, Object.keys(PACKAGES)); return }
      const pkgs = pk ? [pk] : sorted(Object.keys(PACKAGES))
      sess.print(pkgs.flatMap(k => PACKAGES[k].all.map(e => k + ' ' + e)).join('\n'))
      if (!pk) sess.hint('Gezeigt werden nur die Pakete der Simulation.')
    },
    list (sess, a) {
      const p = parseArgs(sess, 'pkg list', a); if (!p) return
      sess.print(sorted(Object.keys(PACKAGES)).join('\n'))
      sess.hint('Unter ROS 2 Jazzy (ros-jazzy-desktop) stehen hier rund 300 Pakete; die Simulation zeigt nur die nachgebildeten.')
    }
  })

  function checkInterface (sess, kind, type) {
    const known = kind === 'service' ? SRVS : ACTIONS
    const real = kind === 'service' ? REAL_SRVS : REAL_ACTIONS
    if (known[type]) return true
    if (real.has(type)) {
      sess.hint(`Den ${kind === 'service' ? 'Service' : 'Action'}-Typ ${type} gibt es in ROS 2, er ist in dieser Simulation aber nicht nachgebildet. Nachgebildet: ${Object.keys(known).join(', ')}`)
      return false
    }
    sess.print(`The passed ${kind} type is invalid`, 'err')
    didYouMean(sess, type, Object.keys(known))
    return false
  }

  function yamlBlock (type, msg, indent) {
    return yamlMsg(type, msg, indent).join('\n')
  }

  IMPL.service = (sess, args) => verbDispatch(sess, 'service', args, {
    list (sess, a) {
      const p = parseArgs(sess, 'service list', a); if (!p) return
      const g = sess.view()
      const m = new Map()
      for (const n of g.nodes) if (!n.hidden) for (const [s, t] of n.services) m.set(s, t)
      const names = sorted([...m.keys()])
      if (p.o.c) { sess.print(String(names.length)); return }
      if (names.length) sess.print(names.map(s => s + (p.o.t ? ` [${m.get(s)}]` : '')).join('\n'))
    },
    type (sess, a) {
      const p = parseArgs(sess, 'service type', a); if (!p) return
      const g = sess.view()
      const s = g.findService(topicArg(p.pos[0]))
      if (s) sess.print(s.type)
    },
    find (sess, a) {
      const p = parseArgs(sess, 'service find', a); if (!p) return
      const g = sess.view()
      const hits = new Set()
      for (const n of g.nodes) if (!n.hidden) for (const [s, t] of n.services) if (t === p.pos[0]) hits.add(s)
      if (p.o.c) sess.print(String(hits.size))
      else if (hits.size) sess.print(sorted([...hits]).join('\n'))
    },
    call (sess, a) {
      const p = parseArgs(sess, 'service call', a); if (!p) return
      const g = sess.sim.graph.view(sess.scope())
      const name = topicArg(p.pos[0])
      const type = p.pos[1]
      if (!checkInterface(sess, 'service', type)) return
      const reqT = type + '_Request'; const resT = type + '_Response'
      const r = msgFromYaml(reqT, p.pos[2] || '')
      if (r.error) {
        sess.print(r.error, 'err')
        if (/YAML/.test(r.error)) sess.hint('Werte in YAML-Schreibweise angeben, z. B. "' + yamlSkeleton(reqT) + '"')
        return
      }
      const proc = sess.spawn('ros2 service call ' + name)
      const node = cliNode(sess)
      proc.defer(() => g.removeNode(node))
      proc.print('waiting for service to become available...')
      const rate = p.o.rate ? parseFloat(p.o.rate) : 0
      let warned = false
      const attempt = () => {
        if (!proc.alive) return
        const s = g.findService(name)
        if (!s || s.type !== type || !s.handler) {
          if (!warned && Date.now() - started > 2000) {
            warned = true
            if (s && s.type !== type) sess.hint(`Der Service ${name} hat den Typ ${s.type}, nicht ${type}. Die echte Kommandozeile wartet in diesem Fall ebenfalls ohne Meldung – mit Strg+C abbrechen.`)
            else if (!s) { sess.hint(`Es gibt (noch) keinen Service ${name}. Beenden mit Strg+C.`); didYouMean(sess, name, [...new Set(g.nodes.flatMap(n => n.services.map(x => x[0])))]) }
          }
          proc.after(100, attempt); return
        }
        proc.print(`requester: making request: ${pyRepr(reqT, r.msg)}\n\nresponse:`)
        const res = Object.assign(defaultMsg(resT), s.handler(JSON.parse(JSON.stringify(r.msg))) || {})
        proc.print(pyRepr(resT, res) + '\n')
        if (rate > 0) proc.after(1000 / rate, attempt)
        else proc.exit()
      }
      const started = Date.now()
      proc.after(0, attempt)
    }
  })

  IMPL.param = (sess, args) => verbDispatch(sess, 'param', args, {
    list (sess, a) {
      const p = parseArgs(sess, 'param list', a); if (!p) return
      const g = sess.view()
      const show = (n, indent) => sorted([...n.params.keys()])
        .filter(k => !p.o.filter || new RegExp(p.o.filter).test(k))
        .map(k => indent + k + (p.o.paramType ? ` (type: ${n.params.get(k).type})` : ''))
      if (p.pos[0]) {
        const n = g.nodeByFqn(p.pos[0])
        if (!n) { sess.print('Node not found', 'err'); didYouMean(sess, p.pos[0], g.nodes.filter(x => !x.hidden).map(x => x.fqn)); return }
        sess.print(show(n, '  ').join('\n'))
        return
      }
      const out = []
      for (const n of g.nodes.filter(x => !x.hidden).sort((x, y) => x.fqn < y.fqn ? -1 : 1)) out.push(n.fqn + ':', ...show(n, '  '))
      if (out.length) sess.print(out.join('\n'))
    },
    get (sess, a) {
      const p = parseArgs(sess, 'param get', a); if (!p) return
      const g = sess.view()
      const n = g.nodeByFqn(p.pos[0])
      if (!n) { sess.print('Node not found', 'err'); return }
      const d = n.params.get(p.pos[1])
      if (!d) {
        sess.print('Parameter not set', 'err')
        if (n.lang === 'cpp') n.log('WARN', 'Failed to get parameters: ' + p.pos[1], 'rclcpp')
        didYouMean(sess, p.pos[1], [...n.params.keys()])
        return
      }
      const val = d.type === 'boolean' ? (d.value ? 'True' : 'False') : d.type === 'double' ? pyFloat(d.value) : String(d.value)
      const label = { integer: 'Integer', boolean: 'Boolean', double: 'Double', string: 'String' }[d.type]
      sess.print(p.o.hideType ? val : `${label} value is: ${val}`)
    },
    set (sess, a) {
      const p = parseArgs(sess, 'param set', a); if (!p) return
      const g = sess.view()
      const n = g.nodeByFqn(p.pos[0])
      if (!n) { sess.print('Node not found', 'err'); return }
      const err = setParam(n, p.pos[1], p.pos[2])
      sess.print(err ? 'Setting parameter failed: ' + err : 'Set parameter successful', err ? 'err' : '')
    },
    dump (sess, a) {
      const p = parseArgs(sess, 'param dump', a); if (!p) return
      const g = sess.view()
      const n = g.nodeByFqn(p.pos[0])
      if (!n) { sess.print('Node not found', 'err'); return }
      const tree = {}
      for (const k of n.params.keys()) {
        const parts = k.split('.')
        let o = tree
        for (const part of parts.slice(0, -1)) o = o[part] = o[part] || {}
        o[parts[parts.length - 1]] = n.params.get(k)
      }
      const out = [n.fqn + ':', '  ros__parameters:']
      const walk = (o, ind) => {
        for (const k of sorted(Object.keys(o))) {
          const v = o[k]
          if (v.type === undefined) { out.push(ind + k + ':'); walk(v, ind + '  ') } else {
            const s = v.type === 'boolean' ? String(v.value) : v.type === 'double' ? pyFloat(v.value) : v.type === 'string' ? yamlStr(v.value) : String(v.value)
            out.push(ind + k + ': ' + s)
          }
        }
      }
      walk(tree, '    ')
      out.push('')
      sess.print(out.join('\n'))
      if (p.o.outputDir) sess.hint('Dateien schreibt die Simulation nicht; die Ausgabe steht oben.')
    },
    describe (sess, a) {
      const p = parseArgs(sess, 'param describe', a); if (!p) return
      const g = sess.view()
      const n = g.nodeByFqn(p.pos[0])
      if (!n) { sess.print('Node not found', 'err'); return }
      const out = []
      for (const name of p.pos.slice(1)) {
        const d = n.params.get(name)
        if (!d) { out.push(`Parameter not set: ${name}`); continue }
        out.push('Parameter name: ' + name, '  Type: ' + d.type)
        if (d.desc) out.push('  Description: ' + d.desc)
        out.push('  Constraints:')
        if (d.readOnly && d.desc) out.push('    Read only: true')
        if (d.min !== undefined) out.push('    Min value: ' + d.min, '    Max value: ' + d.max, '    Step: ' + d.step)
      }
      sess.print(out.join('\n'))
    },
    delete (sess, a) {
      const p = parseArgs(sess, 'param delete', a); if (!p) return
      const g = sess.view()
      const n = g.nodeByFqn(p.pos[0])
      if (!n) { sess.print('Node not found', 'err'); return }
      sess.print('Deleting parameter failed: cannot undeclare a statically typed parameter', 'err')
    }
  })

  IMPL.action = (sess, args) => verbDispatch(sess, 'action', args, {
    list (sess, a) {
      const p = parseArgs(sess, 'action list', a); if (!p) return
      const g = sess.view()
      const acts = [...g.actions().values()].sort((x, y) => x.name < y.name ? -1 : 1)
      if (p.o.c) { sess.print(String(acts.length)); return }
      if (acts.length) sess.print(acts.map(x => x.name + (p.o.t ? ` [${x.types.join(', ')}]` : '')).join('\n'))
    },
    info (sess, a) {
      const p = parseArgs(sess, 'action info', a); if (!p) return
      const g = sess.view()
      const name = topicArg(p.pos[0])
      const x = g.actions().get(name) || { clients: [], servers: [], types: [] }
      const ty = (n) => p.o.t ? ` [${(n.actionServers.concat(n.actionClients).find(e => e[0] === name) || [])[1]}]` : ''
      const out = ['Action: ' + name, 'Action clients: ' + x.clients.length]
      if (!p.o.c) for (const n of x.clients) out.push('    ' + n.fqn + ty(n))
      out.push('Action servers: ' + x.servers.length)
      if (!p.o.c) for (const n of x.servers) out.push('    ' + n.fqn + ty(n))
      sess.print(out.join('\n'))
    },
    type (sess, a) {
      const p = parseArgs(sess, 'action type', a); if (!p) return
      const g = sess.view()
      const x = g.actions().get(topicArg(p.pos[0]))
      if (x) sess.print(x.types.join('\n'))
    },
    send_goal (sess, a) {
      const p = parseArgs(sess, 'action send_goal', a); if (!p) return
      const g = sess.sim.graph.view(sess.scope())
      const name = topicArg(p.pos[0])
      const type = p.pos[1]
      if (!checkInterface(sess, 'action', type)) return
      const goalT = type + '_Goal'
      const r = msgFromYaml(goalT, p.pos[2] || '')
      if (r.error) { sess.print(r.error, 'err'); return }
      const proc = sess.spawn('ros2 action send_goal ' + name)
      const node = cliNode(sess)
      node.actionClients.push([name, type])
      g.emit('change')
      proc.defer(() => g.removeNode(node))
      proc.print('Waiting for an action server to become available...')
      let handle = null
      let hinted = false
      const started = Date.now()
      const attempt = () => {
        const s = g.findAction(name)
        if (!s || s.type !== type || !s.handler) {
          if (!hinted && Date.now() - started > 2000) {
            hinted = true
            sess.hint(`Es gibt (noch) keinen Action-Server ${name}${s ? ' mit dem Typ ' + type : ''}. Beenden mit Strg+C.`)
          }
          proc.after(100, attempt); return
        }
        proc.print('Sending goal:\n' + yamlBlock(goalT, r.msg, '     ') + '\n')
        proc.print('Goal accepted with ID: ' + randHex(32) + '\n')
        handle = s.handler.sendGoal(JSON.parse(JSON.stringify(r.msg)), {
          feedback (fb) { if (p.o.feedback && proc.alive) proc.print('Feedback:\n' + yamlBlock(type + '_Feedback', fb, '    ') + '\n') },
          done (status, result) {
            handle = null
            if (!proc.alive || canceling) return
            proc.print('Result:\n' + yamlBlock(type + '_Result', result, '    ') + '\n')
            proc.print('Goal finished with status: ' + status)
            proc.exit()
          }
        })
      }
      let canceling = false
      proc.onInterrupt = () => {
        // Jazzy gibt danach nichts mehr aus (siehe test/captures2/send_goal_int.txt)
        if (handle) { proc.print('Canceling goal...'); canceling = true; const h = handle; handle = null; h.cancel() }
      }
      proc.after(0, attempt)
    }
  })

  IMPL.run = (sess, args) => {
    if (args[0] === '-h' || args[0] === '--help') { sess.print(help().run); return }
    let i = 0
    if (args[0] === '--prefix') i = 2
    const pkg = args[i]; const exe = args[i + 1]
    if (!pkg || !exe) {
      const missing = !pkg ? 'package_name, executable_name, argv' : 'executable_name, argv'
      argError(sess, 'run', 'the following arguments are required: ' + missing)
      return
    }
    const P = PACKAGES[pkg]
    if (!P) { sess.print(`Package '${pkg}' not found`, 'err'); didYouMean(sess, pkg, Object.keys(PACKAGES)); return }
    if (!P.all.includes(exe)) { sess.print('No executable found', 'err'); didYouMean(sess, exe, P.all); return }
    const fn = P.run[exe]
    if (!fn) {
      sess.hint(`${pkg} ${exe} gibt es unter ROS 2 Jazzy, in dieser Simulation ist es aber nicht nachgebildet. Nachgebildet: ${Object.keys(P.run).join(', ')}`)
      return
    }
    const { remaps, params, ignored } = parseRosArgs(args.slice(i + 2))
    if (ignored.length) sess.hint('Ignoriert (nicht nachgebildet): ' + ignored.join(' '))
    const proc = sess.spawn(`ros2 run ${pkg} ${exe}`)
    fn({ sim: sess.sim, sess, proc, remaps, argv: args.slice(i + 2) })
    // Doppelte Knotennamen: ROS meldet beim Start nichts, die Folgen sind für Lernende aber schwer zu durchschauen
    for (const n of proc.nodes || []) {
      const other = sess.sim.graph.nodes.find(x => x !== n && x.fqn === n.fqn && sees(x, n))
      if (!other) continue
      const os = [...sess.sim.sessions.values()].find(x => x.proc && (x.proc.nodes || []).includes(other))
      const where = os ? (os.views.size ? ` in einem anderen Terminal („${os.proc.label}“)` : ` auf einer anderen Seite („${os.proc.label}“)`) : ''
      sess.hint(`Es läuft bereits ein Knoten ${n.fqn}${where}. Zwei Knoten mit gleichem Namen teilen sich Topics und Services; Aufrufe landen dann bei einem der beiden. Abhilfe: dort Strg+C, „Alles beenden“ im Graphen oder ein anderer Name mit --ros-args -r __node:=…`)
    }
    // Startwerte aus --ros-args -p name:=wert (unbekannte Namen ignoriert ROS ebenfalls)
    for (const prm of params) {
      for (const n of proc.nodes || []) {
        if (!n.params.has(prm.name)) continue
        const err = setParam(n, prm.name, prm.value)
        if (err) sess.hint(`Startparameter ${prm.name}: ${err} (Unter ROS bricht der Knoten in diesem Fall mit einer Ausnahme ab.)`)
      }
    }
  }

  // ---------------------------------------------------------- ros2 bag

  function bagLog (proc, node, lvl, txt, logger) {
    proc.print(`[${lvl}] [${stamp()}] [${logger || node.name}]: ${txt}`, lvl.toLowerCase())
  }

  function findBag (sess, path) {
    const fs = sess.sim.fs
    const p = String(path || '').replace(/\/+$/, '')
    if (fs.has(p)) return { bag: fs.get(p), file: null }
    const m = /^([^/]+)\/([^/]+)$/.exec(p)
    if (m && fs.has(m[1]) && fs.get(m[1]).files.has(m[2]) && m[2].endsWith('.mcap')) return { bag: fs.get(m[1]), file: m[2] }
    return null
  }

  function bagPathError (sess, prog, path) {
    argError(sess, prog, `argument bag_path: Bag path '${path}' does not exist!`)
    didYouMean(sess, path, [...sess.sim.fs.keys()])
  }

  const nowNs = (() => {
    let last = 0n
    return () => {
      let t = BigInt(Date.now()) * 1000000n + BigInt(Math.floor(Math.random() * 1000000))
      if (t <= last) t = last + 1000n
      last = t
      return t
    }
  })()

  function defaultBagName () {
    const d = new Date(); const p2 = (x) => String(x).padStart(2, '0')
    return `rosbag2_${d.getFullYear()}_${p2(d.getMonth() + 1)}_${p2(d.getDate())}-${p2(d.getHours())}_${p2(d.getMinutes())}_${p2(d.getSeconds())}`
  }

  IMPL.bag = (sess, args) => verbDispatch(sess, 'bag', args, {
    info (sess, a) {
      const p = parseArgs(sess, 'bag info', a); if (!p) return
      const f = findBag(sess, p.pos[0])
      if (!f) { bagPathError(sess, 'bag info', p.pos[0]); return }
      const bag = f.bag
      const topics = bag.topics.slice().sort((x, y) => x.name < y.name ? -1 : 1)
      if (p.o.t) { sess.print(topics.map(t => t.name).join('\n')); return }
      const size = f.file ? fileSize(bag.files.get(f.file)) : [...bag.files.values()].reduce((s, x) => s + fileSize(x), 0)
      const start = bag.messages.length ? bag.messages[0].t : INT64_MAX
      const end = bag.messages.length ? bag.messages[bag.messages.length - 1].t : INT64_MAX
      const dur = end - start
      const durS = `${dur / 1000000000n}.${String(dur % 1000000000n).padStart(9, '0')}s`
      const tl = topics.map((t, i) => (i ? ' '.repeat(19) : '') + `Topic: ${t.name} | Type: ${t.type} | Count: ${t.count} | Serialization Format: ${t.format || 'cdr'}`)
      sess.print([
        '',
        'Files:             ' + (f.file ? bag.name + '/' + f.file : bag.mcapName),
        'Bag size:          ' + formatSize(size),
        'Storage id:        mcap',
        'ROS Distro:        jazzy',
        'Duration:          ' + durS,
        'Start:             ' + formatStamp(start),
        'End:               ' + formatStamp(end),
        'Messages:          ' + bag.messages.length,
        'Topic information: ' + (tl.join('\n') || ''),
        'Service:           0',
        'Service information: '
      ].join('\n'))
    },

    record (sess, a) {
      const p = parseArgs(sess, 'bag record', a); if (!p) return
      const g = sess.sim.graph; const fs = sess.sim.fs
      const positional = p.pos.slice()
      if (positional.length) sess.print('[WARN] [ros2bag]: Positional "topics" argument deprecated. Please use optional "--topics" argument instead.', 'warn')
      const wanted = positional.concat(p.o.topics || []).map(topicArg)
      if (!wanted.length && !p.o.all) {
        sess.print('[ERROR] [ros2bag]: Need to specify at least one option out of --all, --all-topics, --all-services, --services, --topics, --topic-types or --regex', 'err')
        return
      }
      const name = (p.o.output || defaultBagName()).replace(/\/+$/, '')
      if (fs.has(name)) { sess.print(`[ERROR] [ros2bag]: Output folder '${name}' already exists.`, 'err'); return }
      const proc = sess.spawn('ros2 bag record ' + (p.o.all ? '-a' : wanted.join(' ')))
      const node = g.addNode({ name: 'rosbag2_recorder', lang: 'cpp', scope: sess.scope() })
      node.log = (lvl, txt) => bagLog(proc, node, lvl, txt)
      proc.defer(() => g.removeNode(node))
      g.createPublisher(node, '/events/write_split', 'rosbag2_interfaces/msg/WriteSplitEvent', {})
      const L = (txt) => bagLog(proc, node, 'INFO', txt)
      L('Press SPACE for pausing/resuming')
      L('Event publisher thread: Started')
      L(`Starting recording to '${name}'`)
      if (p.o.all) bagLog(proc, node, 'WARN', 'Hidden topics are not recorded. Enable them with --include-hidden-topics', 'ROSBAG2_TRANSPORT')
      L('Listening for topics...')
      L('Recording...')
      L('Topics discovery started.')
      if (p.o.all) sess.hint('/rosout, /parameter_events und /events/write_split zeichnet die Simulation nicht auf; ihr Inhalt ist nicht nachgebildet.')
      const subscribed = new Map() // Topic -> { name, type, rel, dur }
      const recorded = []
      let paused = false; let discovering = true
      const discover = () => {
        if (!discovering) return
        for (const t of g.view(node).topics().values()) {
          if (subscribed.has(t.name) || !t.pubs.length) continue
          if (!p.o.all && !wanted.includes(t.name)) continue
          if (DEBUG_TOPICS.includes(t.name) || t.name === '/events/write_split') continue
          const type = t.types[0]
          if (!TYPES[type] || !type.includes('/msg/')) continue
          const rel = t.pubs.some(e => e.qos.reliability === 'BEST_EFFORT') ? 'best_effort' : 'reliable'
          const dur = t.pubs.every(e => e.qos.durability === 'TRANSIENT_LOCAL') ? 'transient_local' : 'volatile'
          subscribed.set(t.name, { name: t.name, type, rel, dur })
          g.createSubscription(node, t.name, type, { reliability: rel, durability: dur }, (msg) => {
            if (!paused) recorded.push({ topic: t.name, type, t: nowNs(), msg: JSON.parse(JSON.stringify(msg)) })
          })
          L(`Subscribed to topic '${t.name}'`)
        }
        if (!p.o.all && wanted.every(w => subscribed.has(w))) {
          L('All requested topics are subscribed. Stopping discovery...')
          L('Topics discovery stopped.')
          discovering = false
        }
      }
      proc.after(400, () => { discover(); proc.every(500, discover) })
      proc.keyMode = true
      proc.keyHint = 'Leertaste: Pause'
      proc.onKey = (k) => {
        if (k !== ' ') return false
        paused = !paused
        L(paused ? 'Pausing recording.' : 'Resuming recording.')
        return true
      }
      proc.onInterrupt = () => {
        if (discovering) L('Topics discovery stopped.')
        if (!paused) L('Pausing recording.')
        bagLog(proc, node, 'INFO', 'Writing remaining messages from cache to the bag. It may take a while', 'rosbag2_cpp')
        L('Recording stopped')
        L('Event publisher thread: Exited')
        fs.set(name, bagFromRecording(name, [...subscribed.values()], recorded))
        sess.sim.emit('fs')
      }
    },

    play (sess, a) {
      const p = parseArgs(sess, 'bag play', a); if (!p) return
      const g = sess.sim.graph
      const f = p.pos[0] && findBag(sess, p.pos[0])
      if (!p.pos[0]) { argError(sess, 'bag play', 'the following arguments are required: bag_path'); return }
      if (!f) { bagPathError(sess, 'bag play', p.pos[0]); return }
      const bag = f.bag
      let rate = p.o.rate !== undefined ? parseFloat(p.o.rate) : 1
      if (!(rate > 0)) { sess.print('Invalid rate value: ' + p.o.rate, 'err'); return }
      const only = p.o.topics ? p.o.topics.map(topicArg) : null
      const remaps = (p.o.remap || []).map(r => /^(.+?):=(.*)$/.exec(r)).filter(Boolean).map(m => ({ from: topicArg(m[1]), to: topicArg(m[2]) }))
      const target = (t) => { const r = remaps.find(x => x.from === t); return r ? r.to : t }
      const msgs = bag.messages.filter(m => !only || only.includes(m.topic))
      const undecodable = [...new Set(msgs.filter(m => !TYPES[m.type]).map(m => m.type))]
      if (undecodable.length) sess.hint('Für diese Typen fehlt die Beschreibung in der Bagdatei; sie werden übersprungen: ' + undecodable.join(', '))
      const proc = sess.spawn('ros2 bag play ' + bag.name)
      const node = g.addNode({ name: 'rosbag2_player', lang: 'cpp', scope: sess.scope() })
      node.log = (lvl, txt) => bagLog(proc, node, lvl, txt)
      proc.defer(() => g.removeNode(node))
      const pubs = new Map()
      for (const t of bag.topics) {
        if (only && !only.includes(t.name)) continue
        if (!TYPES[t.type]) continue
        const rel = /reliability: best_effort/.test(t.qos || '') ? 'BEST_EFFORT' : 'RELIABLE'
        const dur = /durability: transient_local/.test(t.qos || '') ? 'TRANSIENT_LOCAL' : 'VOLATILE'
        pubs.set(t.name, g.createPublisher(node, target(t.name), t.type, { reliability: rel, durability: dur }))
      }
      const L = (txt) => bagLog(proc, node, 'INFO', txt)
      const fmtRate = (r) => String(Number(r.toPrecision(6)))
      L('Set rate to ' + fmtRate(rate))
      L('Adding keyboard callbacks.')
      L('Press SPACE for Pause/Resume')
      L('Press CURSOR_RIGHT for Play Next Message')
      L('Press CURSOR_UP for Increase Rate 10%')
      L('Press CURSOR_DOWN for Decrease Rate 10%')
      L('Playback until timestamp: -1')
      let i = 0; let paused = !!p.o.startPaused; let timer = null
      let base = msgs.length ? msgs[0].t : 0n
      let wall = Date.now() + 1000 * parseFloat(p.o.delay || '0')
      const decodeCache = new Map()
      const publishOne = () => {
        const m = msgs[i++]
        const pub = pubs.get(m.topic)
        if (!pub) return
        let msg = decodeCache.get(m)
        if (!msg) { try { msg = cdrDecode(m.type, m.data) } catch (e) { return } if (msgs.length < 5000) decodeCache.set(m, msg) }
        pub.publish(msg)
      }
      const due = (m) => wall + Number(m.t - base) / 1e6 / rate
      const pump = () => {
        timer = null
        if (!proc.alive || paused) return
        const now = Date.now()
        while (i < msgs.length && due(msgs[i]) <= now) publishOne()
        if (i >= msgs.length) {
          if (p.o.loop && msgs.length) { i = 0; base = msgs[0].t; wall = Date.now() } else { proc.exit(); return }
        }
        timer = setTimeout(pump, Math.max(0, Math.min(250, due(msgs[i]) - Date.now())))
      }
      proc.defer(() => clearTimeout(timer))
      // Zeitbezug neu setzen, damit Pause und Ratenänderung ohne Sprung weiterlaufen
      const rebase = () => { if (i < msgs.length) { base = msgs[i].t; wall = Date.now() } }
      proc.keyMode = true
      proc.keyHint = 'Leertaste, → ↑ ↓'
      proc.onKey = (k) => {
        if (k === ' ') {
          paused = !paused
          L(paused ? 'Pausing play.' : 'Resuming play.')
          if (!paused) { rebase(); pump() } else clearTimeout(timer)
          return true
        }
        if (k === 'ArrowRight') { if (paused && i < msgs.length) { publishOne(); rebase() } return true }
        if (k === 'ArrowUp' || k === 'ArrowDown') {
          rebase(); rate *= k === 'ArrowUp' ? 1.1 : 0.9
          L('Set rate to ' + fmtRate(rate)); return true
        }
        return false
      }
      proc.onInterrupt = () => L('Stopping playback.')
      if (!msgs.length) { proc.after(0, () => proc.exit()); return }
      proc.after(0, pump)
    }
  })

  function verbDispatch (sess, cmd, args, impl) {
    const verb = args[0]
    if (!verb || verb === '-h' || verb === '--help') { sess.print(help()[cmd] || ''); return }
    if (verb.startsWith('-')) {
      if (cmd === 'topic' && verb === '--include-hidden-topics') return verbDispatch(sess, cmd, args.slice(1), impl)
      sess.print(usageOf('') + '\nros2: error: unrecognized arguments: ' + verb, 'err'); return
    }
    if (!VERBS[cmd].includes(verb)) {
      sess.print(usageOf(cmd) + `\nros2 ${cmd}: error: argument Call \`ros2 ${cmd} <command> -h\` for more detailed usage.: invalid choice: '${verb}' (choose from ${VERBS[cmd].map(v => "'" + v + "'").join(', ')})`, 'err')
      didYouMean(sess, verb, VERBS[cmd])
      return
    }
    if (!impl[verb]) { sess.hint(`„ros2 ${cmd} ${verb}“ ist in dieser Simulation nicht nachgebildet.`); return }
    return impl[verb](sess, args.slice(1))
  }

  // DDS-Teilnehmer lassen sich mit ungültiger ROS_DOMAIN_ID nicht anlegen (Ausgaben von Fast DDS bzw. ros2cli unter Jazzy)
  function domainError (sess, sc, run) {
    if (sc.error === 'high') {
      const d = new Date(); const p2 = (x) => String(x).padStart(2, '0')
      const ts = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
      sess.print(`${ts} [RTPS Error] Calculated port number is too high. Probably the domainId is over 232 or portBase is too high. -> Function getMulticastPort\nCalculated port number is too high. Probably the domainId is over 232 or portBase is too high.` + (run ? '\n[ros2run]: Process exited with failure 1' : ''), 'err')
    } else {
      sess.print(`Traceback (most recent call last):\n  …\nValueError: invalid literal for int() with base 10: '${sc.raw}'`, 'err')
      sess.hint('Traceback gekürzt. ROS_DOMAIN_ID muss eine ganze Zahl von 0 bis 232 sein.')
    }
  }

  const NEEDS_DDS = ['run', 'node', 'topic', 'service', 'param', 'action', 'bag', 'daemon']

  IMPL.daemon = (sess, args) => verbDispatch(sess, 'daemon', args, {
    status (sess) {
      const d = sess.sim.graph.daemons && sess.sim.graph.daemons.get(sess.scope().domain)
      sess.print(d && d.alive ? 'The daemon is running' : 'The daemon is not running')
    },
    start (sess) {
      const g = sess.sim.graph; const d = g.daemons && g.daemons.get(sess.scope().domain)
      if (d && d.alive) { sess.print('The daemon is already running'); return }
      g.ensureDaemon(sess.scope()); sess.print('The daemon has been started')
    },
    stop (sess) {
      sess.print(sess.sim.graph.stopDaemon(sess.scope().domain) ? 'The daemon has been stopped' : 'The daemon is not running')
    }
  })

  function ros2Main (sess, a) {
    if (!a.length || a[0] === '-h' || a[0] === '--help') { sess.print(help()[''] || ''); return }
    const cmd = a[0]
    if (cmd.startsWith('-')) { sess.print(usageOf('') + '\nros2: error: unrecognized arguments: ' + cmd, 'err'); return }
    if (!ROS2_COMMANDS.includes(cmd)) {
      sess.print(usageOf('') + "\nros2: error: argument Call `ros2 <command> -h` for more detailed usage.: invalid choice: '" + cmd +
        "' (choose from " + ROS2_COMMANDS.map(c => "'" + c + "'").join(', ') + ')', 'err')
      didYouMean(sess, cmd, ROS2_COMMANDS)
      return
    }
    if (!IMPL[cmd]) {
      sess.hint(`„ros2 ${cmd}“ ist in dieser Simulation nicht nachgebildet. Nachgebildet sind: run, node, topic, param, service, action, bag, daemon, interface, pkg.`)
      return
    }
    const helpOnly = a.includes('-h') || a.includes('--help') || a.length === 1
    if (NEEDS_DDS.includes(cmd) && !helpOnly && !(cmd === 'bag' && a[1] === 'info')) {
      const sc = sess.scope()
      if (sc.error) { domainError(sess, sc, cmd === 'run'); return }
      if (sc.range === 'OFF' && cmd !== 'run' && cmd !== 'daemon') {
        sess.print('Warning: ROS_AUTOMATIC_DISCOVERY_RANGE=OFF with no ROS_STATIC_PEERS configured.\nNo discovery mechanism is available. Results will be empty.\nEither:\n  - Set ROS_STATIC_PEERS to specify peers explicitly, or\n  - Change ROS_AUTOMATIC_DISCOVERY_RANGE to LOCALHOST or SUBNET', 'warn')
      }
    }
    return IMPL[cmd](sess, a.slice(1))
  }

  const SHELL_HELP = [
    'ℹ ROS2Sim – simulierte Shell mit ROS 2 Jazzy',
    '  ros2 run <paket> <programm> [--ros-args -r alt:=neu -p name:=wert]',
    '  ros2 node list | info',
    '  ros2 topic list | info | echo | hz | pub | type | find',
    '  ros2 param list | get | set | dump | describe',
    '  ros2 service list | type | find | call',
    '  ros2 action list | info | type | send_goal',
    '  ros2 bag record | info | play',
    '  ros2 daemon start | stop | status',
    '  ros2 interface show | proto | list',
    '  ros2 pkg executables | list',
    '  ls, cat, rm, pwd, echo, export, unset, env, printenv, source, bash, xdg-open',
    '  … | grep MUSTER      … > datei      … >> datei',
    '',
    '  Tab        vervollständigen (zweimal: Auswahl durchblättern)',
    '  →          grauen Vorschlag übernehmen',
    '  ↑ / ↓      frühere Befehle',
    '  Strg+C     laufendes Programm beenden',
    '  Strg+L     Bildschirm leeren'
  ].join('\n')

  const homePath = (p) => String(p || '').replace(/^(~|\/home\/ros)\/?/, '').replace(/\/+$/, '')

  function shellLs (sess, args) {
    const fs = sess.sim.fs; const home = sess.sim.home
    const all = args.some(a => /^-[a-zA-Z]*a/.test(a))
    if (args.some(a => a.startsWith('-') && !/^-a+$/.test(a))) sess.hint('Von den Optionen für ls ist nur -a nachgebildet.')
    const paths = args.filter(a => !a.startsWith('-')).map(homePath)
    if (!paths.length || paths.every(p => p === '')) {
      const names = sorted([...fs.keys()].concat([...home.keys()]).filter(n => all || !n.startsWith('.')))
      if (all) names.unshift('.', '..')
      if (names.length) sess.print(names.join('  '), [...home.keys()].some(n => names.includes(n)) ? '' : 'dir')
      return
    }
    for (const d of paths) {
      if (fs.has(d)) { if (paths.length > 1) sess.print(d + ':'); sess.print(sorted([...fs.get(d).files.keys()]).join('  ')) } else if (home.has(d) || findBag(sess, d)) sess.print(d)
      else sess.print(`ls: cannot access '${d}': No such file or directory`, 'err')
    }
  }

  function shellRm (sess, args) {
    const rec = args.some(a => /^-[a-zA-Z]*[rR]/.test(a) || a === '--recursive')
    const force = args.some(a => /^-[a-zA-Z]*f/.test(a))
    for (const p of args.filter(a => !a.startsWith('-'))) {
      const d = homePath(p)
      if (sess.sim.fs.has(d)) {
        if (!rec) { sess.print(`rm: cannot remove '${p}': Is a directory`, 'err'); continue }
        sess.sim.fs.delete(d); sess.sim.emit('fs')
      } else if (sess.sim.home.has(d)) { sess.sim.home.delete(d); sess.sim.emit('fs') } else if (findBag(sess, d)) sess.hint('Einzelne Dateien in einem Bag-Ordner löscht die Simulation nicht; nutze rm -r ' + d.split('/')[0])
      else if (!force) sess.print(`rm: cannot remove '${p}': No such file or directory`, 'err')
    }
  }

  function shellCat (sess, args) {
    for (const p of args) {
      const d = homePath(p)
      if (sess.sim.fs.has(d)) { sess.print(`cat: ${p}: Is a directory`, 'err'); continue }
      if (sess.sim.home.has(d)) {
        const f = sess.sim.home.get(d)
        if (typeof f === 'string') { if (f) sess.print(f.replace(/\n$/, '')) } else sess.hint(`${p} ist eine PDF-Datei. Öffnen mit: xdg-open ${p}`)
        continue
      }
      const m = /^([^/]+)\/([^/]+)$/.exec(d)
      const f = m && sess.sim.fs.has(m[1]) && sess.sim.fs.get(m[1]).files.get(m[2])
      if (f === undefined || f === null || f === false) { sess.print(`cat: ${p}: No such file or directory`, 'err'); continue }
      if (typeof f === 'string') sess.print(f.replace(/\n$/, ''))
      else sess.hint(`${p} ist eine Binärdatei (MCAP, ${formatSize(f.length)}). Ihren Inhalt zeigt ros2 bag info ${m[1]}.`)
    }
  }

  // Zeilen aus ~/.bashrc auswerten: export-Zeilen und Zuweisungen, source wird übergangen
  function applyBashrc (sess) {
    const rc = sess.sim.home.get('.bashrc')
    if (typeof rc !== 'string') return
    for (const raw of rc.split('\n')) {
      const l = raw.replace(/#.*$/, '').trim()
      let m = /^export\s+([A-Za-z_]\w*)=(.*)$/.exec(l)
      if (m) { sess.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2'); delete sess.vars[m[1]]; continue }
      m = /^export\s+([A-Za-z_]\w*)$/.exec(l)
      if (m && sess.vars[m[1]] !== undefined) { sess.env[m[1]] = sess.vars[m[1]]; delete sess.vars[m[1]]; continue }
      m = /^unset\s+([A-Za-z_]\w*)$/.exec(l)
      if (m) { delete sess.env[m[1]]; delete sess.vars[m[1]]; continue }
      m = /^([A-Za-z_]\w*)=(.*)$/.exec(l)
      if (m) sess.vars[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  }

  // Eine Pipeline/Umleitung um einen Befehl legen: Ausgabezeilen filtern oder in eine Datei schreiben
  function withOutput (sess, filter, redirect, fn) {
    const collected = []
    const sink = { filter, collect: redirect ? collected : null }
    sess.sinks.push(sink)
    const before = sess.proc
    try { fn() } finally {
      const finish = () => {
        sess.sinks = sess.sinks.filter(x => x !== sink)
        if (redirect) {
          const prev = redirect.append ? (typeof sess.sim.home.get(redirect.file) === 'string' ? sess.sim.home.get(redirect.file) : '') : ''
          sess.sim.home.set(redirect.file, prev + collected.map(l => l + '\n').join(''))
          sess.sim.emit('fs')
        }
      }
      if (sess.proc && sess.proc !== before) sess.proc.defer(finish)
      else finish()
    }
  }

  function runShell (sess, line) {
    const { toks, open } = shellTokens(line)
    if (open) { sess.hint('Ein Anführungszeichen ist nicht geschlossen. (Die echte Bash würde auf weitere Eingabe warten.)'); return }
    if (!toks.length) return
    // Pipeline: nur `… | grep MUSTER` ist nachgebildet
    const stages = [[]]
    for (const t of toks) { if (t.v === '|' && !t.quoted) stages.push([]); else stages[stages.length - 1].push(t) }
    let redirect = null
    const first = stages[0]
    const last = stages[stages.length - 1]
    for (let i = 0; i < last.length; i++) {
      const t = last[i]
      if (t.quoted) continue
      const m = /^(>>?)(.*)$/.exec(t.v)
      if (!m) continue
      const file = m[2] || (last[i + 1] && last[i + 1].v)
      if (!file) { sess.print("bash: syntax error near unexpected token `newline'", 'err'); return }
      redirect = { append: m[1] === '>>', file: homePath(expandVars(file, Object.assign({}, sess.vars, sess.env))) }
      last.splice(i, m[2] ? 1 : 2)
      break
    }
    const vars = Object.assign({}, sess.vars, sess.env)
    const words = (ts) => ts.map(t => t.quoted && line[t.start] === "'" ? t.v : expandVars(t.v, vars))
    const greps = []
    for (const st of stages.slice(1)) {
      const w = words(st)
      if (w[0] !== 'grep') { sess.hint(`In Pipelines ist nur grep nachgebildet, nicht ${w[0] || '(leer)'}.`); return }
      const flags = w.filter(x => /^-[a-zA-Z]+$/.test(x)).join('')
      const pat = w.filter(x => !/^-[a-zA-Z]+$/.test(x))[1]
      if (pat === undefined) { sess.print('Usage: grep [OPTION]... PATTERNS [FILE]...', 'err'); return }
      let re
      try { re = new RegExp(pat, flags.includes('i') ? 'i' : '') } catch (e) { re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }
      greps.push((l) => flags.includes('v') ? !re.test(l) : re.test(l))
    }
    const filter = greps.length ? (l) => greps.every(f => f(l)) : null
    const run = () => runCommand(sess, words(first))
    if (filter || redirect) withOutput(sess, filter, redirect, run)
    else run()
  }

  function runCommand (sess, w) {
    // Zuweisungen vor dem Befehl: VAR=wert befehl  bzw.  VAR=wert allein (Shell-Variable, nicht exportiert)
    const assigns = []
    while (w.length && /^[A-Za-z_]\w*=/.test(w[0])) { const a = w.shift(); assigns.push([a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)]) }
    if (!w.length) { for (const [k, v] of assigns) { if (k in sess.env) sess.env[k] = v; else sess.vars[k] = v } return }
    const saved = {}
    for (const [k, v] of assigns) { saved[k] = sess.env[k]; sess.env[k] = v }
    try { return builtin(sess, w) } finally {
      // nur für diesen einen Befehl gültig – laufende Programme behalten ihre Werte im eigenen scope
      for (const [k] of assigns) { if (saved[k] === undefined) delete sess.env[k]; else sess.env[k] = saved[k] }
    }
  }

  function builtin (sess, words) {
    const cmd = words[0]
    switch (cmd) {
      case 'ros2': return ros2Main(sess, words.slice(1))
      case 'clear': sess.clear(); return
      case 'help': sess.print(SHELL_HELP, 'hint'); return
      case 'history': sess.print(sess.history.map((h, i) => String(i + 1).padStart(5) + '  ' + h).join('\n')); return
      case 'echo': sess.print(words.slice(1).filter(x => x !== '-e' && x !== '-n').join(' ')); return
      case 'pwd': sess.print('/home/ros'); return
      case 'cd': if (words[1] && homePath(words[1]) !== '') sess.hint('Die Simulation kennt nur das Heimatverzeichnis /home/ros.'); return
      case 'ls': return shellLs(sess, words.slice(1))
      case 'rm': return shellRm(sess, words.slice(1))
      case 'cat': return shellCat(sess, words.slice(1))
      case 'source': case '.': {
        const f = homePath(words[1])
        if (f === '.bashrc') { applyBashrc(sess); return }
        if (/^\/opt\/ros\/jazzy\/setup\.(bash|sh)$/.test(words[1] || '') || /install\/(local_)?setup\.bash$/.test(words[1] || '')) return
        if (!words[1]) { sess.print('bash: source: filename argument required\nsource: usage: source filename [arguments]', 'err'); return }
        if (!sess.sim.home.has(f)) { sess.print(`bash: ${words[1]}: No such file or directory`, 'err'); return }
        sess.hint('Nur ~/.bashrc und setup.bash werden ausgewertet.')
        return
      }
      case 'bash': case 'exec':
        if (cmd === 'exec' && words[1] !== 'bash') { sess.hint('Nachgebildet ist nur exec bash.'); return }
        // neue Shell: erbt die exportierten Variablen, liest ~/.bashrc erneut
        sess.vars = {}
        applyBashrc(sess)
        return
      case 'export': {
        if (words.length === 1) { sess.print(Object.keys(sess.env).sort().map(k => `declare -x ${k}="${sess.env[k]}"`).join('\n')); return }
        for (const a of words.slice(1)) {
          const m = /^([A-Za-z_]\w*)(=(.*))?$/.exec(a)
          if (!m) { sess.print(`bash: export: \`${a}': not a valid identifier`, 'err'); continue }
          if (m[2] !== undefined) sess.env[m[1]] = m[3]
          else if (sess.vars[m[1]] !== undefined) sess.env[m[1]] = sess.vars[m[1]]
          else sess.env[m[1]] = sess.env[m[1]] === undefined ? '' : sess.env[m[1]]
          delete sess.vars[m[1]]
        }
        return
      }
      case 'unset': for (const k of words.slice(1)) { delete sess.env[k]; delete sess.vars[k] } return
      case 'env': case 'printenv': {
        if (cmd === 'printenv' && words[1]) { if (sess.env[words[1]] !== undefined) sess.print(sess.env[words[1]]); return }
        sess.print(Object.keys(sess.env).map(k => `${k}=${sess.env[k]}`).join('\n'))
        return
      }
      case 'xdg-open': case 'evince': case 'open': {
        const f = homePath(words[1])
        const c = sess.sim.home.get(f)
        if (c && typeof c === 'object' && c.svg) { sess.notify('open', c); return }
        if (c === undefined && !sess.sim.fs.has(f)) { sess.print(`xdg-open: file '${words[1] || ''}' does not exist`, 'err'); return }
        sess.hint('Diese Datei kann die Simulation nicht anzeigen.')
        return
      }
      case 'nano': case 'vim': case 'vi': case 'gedit': case 'code':
        sess.hint(`Einen Editor gibt es in der Simulation nicht. Eine Zeile anhängen: echo 'export ROS_DOMAIN_ID=23' >> ~/.bashrc – ansehen: cat ~/.bashrc`)
        return
      default:
        sess.print(`${cmd}: command not found`, 'err')
        sess.hint('Diese Simulation versteht ros2, ls, cat, rm, pwd, echo, export, unset, env, printenv, source, bash, xdg-open, clear, history und help.')
    }
  }

  // ======================================================================
  // Vervollständigung
  // ======================================================================

  function topicItems (g, opts) {
    const ts = g.topics()
    return sorted([...ts.keys()])
      .filter(n => !(opts && opts.noDebug && DEBUG_TOPICS.includes(n)))
      .map(n => ({ value: n, desc: ts.get(n).types.join(', '), kind: 'topic' }))
  }

  function complete (sess, line) {
    const sc0 = sess.scope()
    const g = sess.sim.graph.view(sc0.error ? LAPTOP : sc0)
    const { toks, open, trailingSpace } = shellTokens(line)
    let cur; let start; let words
    if (!toks.length || trailingSpace) { cur = ''; start = line.length; words = toks.map(t => t.v) } else {
      const last = toks[toks.length - 1]
      cur = line.slice(last.start); start = last.start; words = toks.slice(0, -1).map(t => t.v)
    }
    const res = { start, cur, items: [], usage: '', argIndex: -1, open }
    const mk = (list, kind) => list.map(x => typeof x === 'string' ? { value: x, kind } : x)

    if (words.length === 0) {
      res.items = mk([{ value: 'ros2', desc: 'ROS-2-Kommandozeile' }, { value: 'export', desc: 'Umgebungsvariable setzen' },
        { value: 'printenv', desc: 'Umgebungsvariablen anzeigen' }, { value: 'echo', desc: 'Text ausgeben' },
        { value: 'source', desc: 'Datei in dieser Shell ausführen, z. B. ~/.bashrc' }, { value: 'unset', desc: 'Variable löschen' },
        { value: 'ls', desc: 'Dateien auflisten' }, { value: 'cat', desc: 'Datei anzeigen' }, { value: 'rm', desc: 'löschen' },
        { value: 'xdg-open', desc: 'Datei öffnen (z. B. PDF aus view_frames)' }, { value: 'bash', desc: 'neue Shell (liest ~/.bashrc)' },
        { value: 'clear', desc: 'Bildschirm leeren' }, { value: 'history', desc: 'frühere Befehle' }, { value: 'help', desc: 'Hilfe zur Simulation' }])
      return filter(res)
    }
    const ROSVARS = [{ value: 'ROS_DOMAIN_ID=', desc: '0 … 232, muss zum Roboter passen', noSpace: true },
      { value: 'ROS_AUTOMATIC_DISCOVERY_RANGE=', desc: 'SUBNET (Standard), LOCALHOST, OFF', noSpace: true }]
    if (words[0] === 'export' || words[0] === 'unset' || words[0] === 'printenv') {
      const m = /^ROS_AUTOMATIC_DISCOVERY_RANGE=(.*)$/.exec(cur)
      if (m && words[0] === 'export') res.items = ['SUBNET', 'LOCALHOST', 'OFF'].map(v => ({ value: 'ROS_AUTOMATIC_DISCOVERY_RANGE=' + v, desc: v === 'SUBNET' ? 'alle Rechner im Netz (Standard)' : v === 'LOCALHOST' ? 'nur dieser Rechner' : 'keine Discovery' }))
      else res.items = words[0] === 'export' ? ROSVARS : Object.keys(sess.env).map(k => ({ value: k, desc: sess.env[k] }))
      return filter(res)
    }
    if (['cat', 'rm', 'xdg-open', 'source', 'ls'].includes(words[0])) {
      res.items = [...sess.sim.home.keys()].concat([...sess.sim.fs.keys()]).filter(f => words[0] !== 'xdg-open' || f.endsWith('.pdf'))
        .map(f => ({ value: f === '.bashrc' ? '~/.bashrc' : f, noSpace: sess.sim.fs.has(f) }))
      return filter(res)
    }
    if (words[0] === 'echo') {
      if (cur.startsWith('$')) res.items = Object.keys(sess.env).map(k => ({ value: '$' + k, desc: sess.env[k] }))
      return filter(res)
    }
    if (words[0] !== 'ros2') return res
    if (words.length === 1) {
      res.usage = 'ros2 ‹befehl› …'
      res.items = ROS2_COMMANDS.map(c => ({ value: c, desc: DESC.ros2[c], dim: !IMPL[c] }))
        .sort((a, b) => (a.dim - b.dim) || (a.value < b.value ? -1 : 1))
      return filter(res)
    }
    const cmd = words[1]
    if (cmd === 'run') {
      const rest = words.slice(2)
      const pkg = rest[0]; const exe = rest[1]
      res.usage = 'ros2 run ‹paket› ‹programm› [--ros-args -r alt:=neu …]'
      if (rest.length === 0) {
        res.argIndex = 0
        res.items = sorted(Object.keys(PACKAGES)).map(p => ({ value: p, desc: 'Paket' }))
      } else if (rest.length === 1) {
        res.argIndex = 1
        const P = PACKAGES[pkg]
        if (P) {
          res.items = P.all.map(e => ({ value: e, desc: P.desc[e] || 'nicht nachgebildet', dim: !P.run[e] }))
            .sort((a, b) => (a.dim - b.dim) || (a.value < b.value ? -1 : 1))
        }
      } else {
        res.argIndex = 2
        const prev = words[words.length - 1]
        const own = rest.slice(2)
        if (pkg === 'tf2_ros' && exe === 'tf2_echo' && !rest.includes('--ros-args') && own.length < 2) {
          res.usage = 'ros2 run tf2_ros tf2_echo ‹source_frame› ‹target_frame›'
          res.argIndex = own.length + 2
          res.items = sess.sim.tfSeen.frames().filter(f => f !== own[0]).map(f => ({ value: f, desc: own.length ? 'target_frame' : 'source_frame' }))
          return filter(res)
        }
        if (pkg === 'tf2_ros' && exe === 'static_transform_publisher' && !rest.includes('--ros-args')) {
          res.usage = 'ros2 run tf2_ros static_transform_publisher [--x X] [--y Y] [--z Z] [--roll R] [--pitch P] [--yaw Y] --frame-id ‹eltern› --child-frame-id ‹kind›'
          if (['--x', '--y', '--z', '--roll', '--pitch', '--yaw', '--qx', '--qy', '--qz', '--qw'].includes(prev)) { res.expect = prev + ' Zahl (Meter bzw. Radiant)'; res.items = []; return res }
          if (prev === '--frame-id' || prev === '--child-frame-id') { res.expect = prev + ' Name'; res.items = sess.sim.tfSeen.frames().map(f => ({ value: f })); return filter(res) }
          const d = { '--x': 'Verschiebung x (m)', '--y': 'Verschiebung y (m)', '--z': 'Verschiebung z (m)', '--roll': 'Drehung um x (rad)', '--pitch': 'Drehung um y (rad)', '--yaw': 'Drehung um z (rad)', '--frame-id': 'Eltern-Frame (Pflicht)', '--child-frame-id': 'Kind-Frame (Pflicht)' }
          res.items = Object.keys(d).filter(k => !own.includes(k)).map(k => ({ value: k, desc: d[k] }))
          return filter(res)
        }
        if (!rest.includes('--ros-args')) res.items = [{ value: '--ros-args', desc: 'ab hier folgen ROS-Argumente' }]
        else if (prev === '-r' || prev === '--remap') {
          const names = exeTopics(pkg, exe)
          res.items = names.map(n => ({ value: n + ':=', desc: 'Topic umbenennen', noSpace: true }))
            .concat([{ value: '__node:=', desc: 'Knoten umbenennen', noSpace: true }, { value: '__ns:=', desc: 'Namensraum setzen', noSpace: true }])
        } else res.items = [{ value: '-r', desc: 'Remapping: alt:=neu' }]
      }
      return filter(res)
    }
    if (!VERBS[cmd]) return res
    if (words.length === 2) {
      res.usage = `ros2 ${cmd} ‹unterbefehl› …`
      res.items = VERBS[cmd].map(v => ({ value: v, desc: DESC[cmd][v], dim: !SPECS[cmd + ' ' + v] }))
        .sort((a, b) => (a.dim - b.dim) || (a.value < b.value ? -1 : 1))
      return filter(res)
    }
    const prog = cmd + ' ' + words[2]
    const spec = SPECS[prog]
    if (!spec) return res
    const args = words.slice(3)
    // Positionsargumente und Optionen auszählen
    const pos = []
    let expectArgFor = null
    let multiFor = null; const multiVals = []
    for (let i = 0; i < args.length; i++) {
      const a = args[i]
      const os = spec.opts[a]
      if (os && os.multi) { multiFor = a; multiVals.length = 0; continue }
      const isOpt = a.startsWith('-') && !/^-\d/.test(a)
      if (isOpt) multiFor = null
      if (os && os.arg) { if (i === args.length - 1) expectArgFor = a; else i++ } else if (!isOpt) { if (multiFor) multiVals.push(a); else pos.push(a) }
    }
    res.usage = 'ros2 ' + prog + ' [optionen] ' + spec.pos.map(p => '‹' + p[0].replace('?', '') + '›' + (p[0].endsWith('?') ? '?' : '')).join(' ')
    res.argIndex = pos.length
    res.posNames = spec.pos.map(p => p[0])
    if (expectArgFor) {
      const os = spec.opts[expectArgFor]
      res.argIndex = -1
      res.expect = expectArgFor + ' ' + os.arg
      if (os.choices) res.items = os.choices.map(c => ({ value: c }))
      else res.items = []
      return filter(res)
    }
    if (multiFor && !cur.startsWith('-')) {
      const bag = prog === 'bag play' && pos[0] && sess.sim.fs.get(pos[0].replace(/\/+$/, ''))
      const names = prog === 'bag play' ? (bag ? bag.topics.map(t => t.name) : []) : [...g.topics().keys()].filter(t => !DEBUG_TOPICS.includes(t))
      res.argIndex = -1
      res.expect = multiFor + ' (mehrere Werte möglich)'
      res.items = sorted(names).filter(n => !multiVals.includes(n))
        .map(n => multiFor === '--remap' || multiFor === '-m' ? { value: n + ':=', desc: 'umbenennen', noSpace: true } : { value: n })
      if (!(prog === 'bag play' && pos[0])) res.items = res.items.concat([])
      return filter(res)
    }
    if (cur.startsWith('-')) {
      const used = new Set(args)
      res.items = Object.keys(spec.opts).filter(k => !used.has(k) && spec.opts[k].d)
        .map(k => ({ value: k, desc: spec.opts[k].d + (spec.opts[k].arg ? ' (' + spec.opts[k].arg + ')' : '') }))
      return filter(res)
    }
    const slot = spec.pos[pos.length] || (spec.rest ? spec.pos[spec.pos.length - 1] : null)
    if (!slot) return res
    if (spec.rest && pos.length >= spec.pos.length) res.argIndex = spec.pos.length - 1
    const kind = slot[1]
    const ts = g.topics()
    const services = () => {
      const m = new Map()
      for (const n of g.nodes) if (!n.hidden) for (const [s, t] of n.services) m.set(s, t)
      return m
    }
    const nodeOf = () => g.nodeByFqn(pos[0] || '')
    if (kind === 'bag') {
      res.items = sorted([...sess.sim.fs.keys()]).map(b => { const x = sess.sim.fs.get(b); return { value: b, desc: `${x.messages.length} Nachrichten, ${x.topics.length} Topics` } })
      return filter(res)
    }
    if (kind === 'recTopic') {
      res.items = topicItems(g, { noDebug: true }).filter(it => !pos.includes(it.value))
      return filter(res)
    }
    if (kind === 'service') {
      const m = services()
      // Services der Anwendung zuerst, die sieben Parameter-Services jedes Knotens danach
      res.items = sorted([...m.keys()]).map(s => ({ value: s, desc: m.get(s), dim: !SRVS[m.get(s)] }))
        .sort((a, b) => a.dim - b.dim)
      return filter(res)
    }
    if (kind === 'srvType' || kind === 'srvTypeAll') {
      const s = kind === 'srvType' ? services().get(topicArg(pos[0] || '')) : null
      res.items = (s ? [{ value: s, desc: 'Typ des Services' }] : [])
        .concat(Object.keys(SRVS).filter(x => x !== s).map(x => ({ value: x })))
      return filter(res)
    }
    if (kind === 'srvYaml' || kind === 'actYaml') {
      const t = pos[1] + (kind === 'srvYaml' ? '_Request' : '_Goal')
      if (TYPES[t] && TYPES[t].fields.length) res.items = [{ value: '"' + yamlSkeleton(t, '') + '"', desc: kind === 'srvYaml' ? 'Anfrage als YAML' : 'Ziel als YAML', yaml: true }]
      return filter(res)
    }
    if (kind === 'action') {
      res.items = [...g.actions().values()].map(x => ({ value: x.name, desc: x.types.join(', ') }))
      return filter(res)
    }
    if (kind === 'actType') {
      const x = g.actions().get(topicArg(pos[0] || ''))
      res.items = (x ? x.types.map(t => ({ value: t, desc: 'Typ der Action' })) : [])
        .concat(Object.keys(ACTIONS).filter(t => !(x && x.types.includes(t))).map(t => ({ value: t })))
      return filter(res)
    }
    if (kind === 'param') {
      const n = nodeOf()
      if (n) {
        res.items = sorted([...n.params.keys()]).map(k => ({ value: k, desc: n.params.get(k).type + ' = ' + String(n.params.get(k).value), dim: k.startsWith('qos_overrides') }))
          .sort((a, b) => a.dim - b.dim)
      }
      return filter(res)
    }
    if (kind === 'paramValue') {
      const n = nodeOf(); const d = n && n.params.get(pos[1])
      if (d) {
        res.expect = d.type + (d.min !== undefined ? ` von ${d.min} bis ${d.max}` : '') + (d.readOnly ? ', schreibgeschützt' : '')
        res.items = [{ value: String(d.value), desc: 'aktueller Wert' }]
        if (d.type === 'boolean') res.items = [{ value: 'true' }, { value: 'false' }]
      }
      return filter(res)
    }
    if (kind === 'topic' || kind === 'anyTopic') res.items = topicItems(g, { noDebug: false }).sort((a, b) => (DEBUG_TOPICS.includes(a.value) - DEBUG_TOPICS.includes(b.value)))
    else if (kind === 'topicType') {
      const t = ts.get(topicArg(pos[0] || ''))
      res.items = t ? t.types.map(x => ({ value: x, desc: 'Typ des Topics' })) : []
    } else if (kind === 'pubType') {
      const t = ts.get(topicArg(pos[0] || ''))
      const first = t ? t.types.filter(x => TYPES[x]) : []
      res.items = first.map(x => ({ value: x, desc: 'Typ des Topics' }))
        .concat(MSG_TYPES().filter(x => !first.includes(x)).map(x => ({ value: x })))
    } else if (kind === 'type') res.items = MSG_TYPES().map(x => ({ value: x }))
    else if (kind === 'node') res.items = sorted(g.nodes.filter(n => !n.hidden).map(n => n.fqn)).map(n => ({ value: n, desc: 'Knoten' }))
    else if (kind === 'pkg') res.items = sorted(Object.keys(PACKAGES)).map(p => ({ value: p }))
    else if (kind === 'yaml') {
      const type = normalizeType(pos[1] || '')
      if (TYPES[type]) {
        res.items = [{ value: '"' + yamlSkeleton(type) + '"', desc: 'Werte als YAML', yaml: true }]
        const st = g.stats.get(topicArg(pos[0] || ''))
        if (st && st.last && st.lastType === type) {
          const flow = (tp, m) => '{' + TYPES[tp].fields.map(([t, n]) => n + ': ' + (isNested(t) ? flow(t, m[n]) : t === 'string' ? "'" + m[n].replace(/'/g, "''") + "'" : yamlScalar(t, m[n]))).join(', ') + '}'
          res.items.push({ value: '"' + flow(type, st.last) + '"', desc: 'zuletzt gesendete Nachricht', yaml: true })
        }
      }
    }
    return filter(res)
  }

  function exeTopics (pkg, exe) {
    if (exe === 'talker' || exe.startsWith('listener')) return ['chatter']
    if (exe === 'turtlesim_node') return ['turtle1/cmd_vel', 'turtle1/pose', 'turtle1/color_sensor']
    if (exe === 'turtle_teleop_key') return ['turtle1/cmd_vel']
    return []
  }

  function filter (res) {
    const cur = res.cur
    if (!cur) return res
    const pre = []; const sub = []
    const lc = cur.toLowerCase()
    for (const it of res.items) {
      if (it.value.startsWith(cur)) pre.push(it)
      else if (it.yaml && (it.value.startsWith('"' + cur) || cur.startsWith('"') || cur.startsWith('{'))) pre.push(it)
      else if (cur.length >= 3 && it.value.toLowerCase().includes(lc)) sub.push(Object.assign({ fuzzy: true }, it))
    }
    res.items = pre.concat(sub)
    return res
  }

  function applyCompletion (line, res, item) {
    const insert = item.value
    const tail = item.noSpace || insert.endsWith('/') ? '' : ' '
    return line.slice(0, res.start) + insert + tail
  }

  // ======================================================================
  // Sitzungen (je Terminal) und Simulation
  // ======================================================================

  class Session {
    constructor (sim, id) {
      this.sim = sim
      this.id = id
      this.lines = []
      this.history = []
      this.proc = null
      this.draft = ''
      this.steps = []
      this.stepsText = ''
      this.stepIdx = 0
      this.views = new Set()
      this.host = 'laptop'
      this.vars = {}
      this.sinks = []
      // wie nach `source /opt/ros/jazzy/setup.bash`; ROS_DOMAIN_ID ist unter Jazzy anfangs nicht gesetzt
      this.env = { SHELL: '/bin/bash', HOME: '/home/ros', USER: 'ros', PWD: '/home/ros', ROS_VERSION: '2', ROS_PYTHON_VERSION: '3', ROS_DISTRO: 'jazzy' }
      applyBashrc(this)
    }

    // Wie dieses Terminal am DDS-Netz teilnimmt
    scope () {
      const raw = this.env.ROS_DOMAIN_ID
      let domain = 0
      if (raw !== undefined && String(raw).trim() !== '') {
        if (!/^\s*-?\d+\s*$/.test(raw)) return { error: 'abc', raw }
        domain = Math.max(0, parseInt(raw, 10))
        if (domain > 232) return { error: 'high', raw }
      }
      let range = String(this.env.ROS_AUTOMATIC_DISCOVERY_RANGE || 'SUBNET').toUpperCase()
      if (!['SUBNET', 'LOCALHOST', 'OFF'].includes(range)) range = 'SUBNET'
      return { host: this.host, domain, range }
    }

    // Sicht der Kommandozeilenwerkzeuge: über den Daemon dieser Domain
    view () {
      const g = this.sim.graph
      const sc = this.scope()
      return g.view(g.ensureDaemon(sc.error ? LAPTOP : sc))
    }

    notify (what, data) { for (const v of this.views) { try { v.onSession(what, data) } catch (e) { console.error(e) } } }

    print (text, cls) {
      // Logzeilen und Fehler gehen wie stderr an grep und > vorbei
      const stderr = ['info', 'warn', 'err', 'error', 'debug', 'fatal'].includes(cls)
      for (const t of String(text).split('\n')) {
        let show = true
        if (!stderr) {
          for (const s of this.sinks) {
            if (s.filter && !s.filter(t)) { show = false; break }
            if (s.collect) { s.collect.push(t); show = false; break }
          }
        }
        if (show) this.lines.push({ t, c: cls || '' })
      }
      if (this.lines.length > 2500) this.lines.splice(0, this.lines.length - 2000)
      this.notify('lines')
    }

    hint (text) { this.lines.push({ t: 'ℹ ' + text, c: 'hint' }); this.notify('lines') }
    clear () { this.lines = []; this.notify('clear') }

    // Befehle zum Nachmachen auf dem eigenen Rechner: vorbereitete Schritte,
    // sonst die eingegebenen Befehle (ohne das simulationseigene help), sonst der vorbereitete Befehl
    copyText () {
      if (this.stepsText) return { text: this.stepsText, n: this.steps.length }
      const cmds = this.history.filter(h => !/^\s*help(\s|$)/.test(h))
      if (!cmds.length && this.draft && this.draft.trim()) return { text: this.draft.trim(), n: 1 }
      return { text: cmds.join('\n'), n: cmds.length }
    }

    spawn (label) {
      const p = new Proc(this, label)
      this.proc = p
      this.notify('state')
      return p
    }

    procEnded (p) {
      if (this.proc === p) { this.proc = null; this.notify('state') }
    }

    exec (line) {
      this.lines.push({ t: line, c: 'cmd' })
      if (line.trim() && this.history[this.history.length - 1] !== line) this.history.push(line)
      if (this.steps.length && this.stepIdx < this.steps.length && line.trim() === this.steps[this.stepIdx].trim()) this.stepIdx++
      try { runShell(this, line) } catch (e) {
        this.print('ROS2Sim: interner Fehler – ' + e.message, 'err'); console.error(e)
      }
      this.notify('lines'); this.notify('state')
    }

    interrupt (currentInput) {
      if (this.proc) { this.print('^C', 'ctrl'); this.proc.interrupt() } else {
        this.lines.push({ t: (currentInput || '') + '^C', c: 'cmd' }); this.notify('lines')
      }
    }

    key (k) { return this.proc && this.proc.onKey ? this.proc.onKey(k) : false }
    complete (line) { return complete(this, line) }
  }

  class Simulation {
    constructor () {
      this.graph = new Graph()
      this.sessions = new Map()
      this.worlds = []
      this.handlers = {}
      this.fs = new Map() // Ordnername -> Bag; bleibt beim Zurücksetzen erhalten (wie Dateien auf der Platte)
      this.home = new Map([['.bashrc', '# ~/.bashrc (in der Simulation gekürzt)\nsource /opt/ros/jazzy/setup.bash\n']])
      this.rviz = null
      this.rvizConfig = null
      this.robots = new Map()
      // Frames, die im Graphen zu sehen waren – nur für die Vervollständigung von tf2_echo
      this.tfSeen = new TfBuffer()
      this.graph.on('message', ({ ep, msg }) => { if (ep.topic === '/tf' || ep.topic === '/tf_static') { try { this.tfSeen.add(msg, ep.topic === '/tf_static') } catch (e) {} } })
    }

    on (ev, fn) { return Graph.prototype.on.call(this, ev, fn) }
    emit (ev, d) { return Graph.prototype.emit.call(this, ev, d) }

    session (id) {
      if (!this.sessions.has(id)) this.sessions.set(id, new Session(this, id))
      return this.sessions.get(id)
    }

    reset (reason) {
      for (const s of this.sessions.values()) {
        const running = !!s.proc
        if (running) { s.print('^C', 'ctrl'); s.proc.exit() }
        s.stepIdx = 0
        if (reason === 'slide') { if (running) s.hint('Beim Folienwechsel beendet – jede Folie startet mit einem leeren ROS-Graphen.') } else s.hint('Simulation zurückgesetzt – alle Programme wurden beendet.')
        s.notify('state')
      }
      for (const r of this.robots.values()) r.stop()
      this.robots.clear()
      this.graph.reset()
      this.worlds = []
      this.emit('worlds')
      this.emit('reset')
    }

    addRobot (cfg) {
      const host = cfg.host || 'turtlebot'
      const old = this.robots.get(host)
      if (old && old.alive) return old
      const r = startRobot(this, cfg)
      this.robots.set(host, r)
      this.emit('robots')
      return r
    }

    // Für Prüfaufgaben: Zustand des Graphen abfragen
    state () {
      const g = this.graph
      return {
        nodes: g.nodes.filter(n => !n.hidden).map(n => n.fqn),
        topics: [...g.topics().values()].map(t => ({ name: t.name, types: t.types, publishers: t.pubs.map(e => e.node.fqn), subscribers: t.subs.map(e => e.node.fqn) })),
        running: [...this.sessions.values()].filter(s => s.proc).map(s => ({ terminal: s.id, command: s.proc.label }))
      }
    }
  }

  const sim = new Simulation()

  // Schrittfolge für den Vorführmodus; bleibt beim erneuten Aufruf derselben Folge erhalten
  function setSteps (id, text) {
    const s = sim.session(id)
    const steps = String(text || '').split('\n').map(x => x.trim()).filter(x => x && !x.startsWith('#'))
    if (steps.join('\n') === s.steps.join('\n')) return
    s.steps = steps
    // für „kopieren“: die Folge so, wie sie im Kurs steht, mit Kommentaren
    s.stepsText = String(text || '').split('\n').map(x => x.trim()).join('\n').replace(/^\n+|\n+$/g, '')
    s.stepIdx = 0
    s.notify('state')
  }

  // ======================================================================
  // Oberfläche (nur im Browser)
  // ======================================================================

  const CSS = `
.r2-term{--r2-bg:#1d1f21;--r2-fg:#e6e6e6;--r2-dim:#7f8487;--r2-prompt:#8ae234;--r2-path:#729fcf;
  font-family:"DejaVu Sans Mono","Ubuntu Mono",Menlo,Consolas,monospace;font-size:14px;line-height:1.35;
  background:var(--r2-bg);color:var(--r2-fg);border-radius:8px;overflow:hidden;display:flex;flex-direction:column;
  box-shadow:0 2px 10px rgba(0,0,0,.25);margin:.5em 0;text-align:left}
.r2-bar{display:flex;align-items:center;gap:.5em;background:#2d2f31;padding:4px 8px;font-family:system-ui,sans-serif;font-size:12.5px;color:#c8c8c8}
.r2-dots{color:#ff5f56;letter-spacing:2px;font-size:11px}
.r2-title{font-weight:600}
.r2-status{flex:1;color:#8ae234;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.r2-btn{background:#45484b;color:#eee;border:0;border-radius:4px;padding:2px 8px;font-size:12px;cursor:pointer;font-family:inherit}
.r2-btn:hover{background:#5a5e62}.r2-btn[hidden]{display:none}
.r2-btn.r2-step{background:#2e6b2e}.r2-btn.r2-step:hover{background:#3c8a3c}
.r2-screen{overflow-y:auto;overflow-x:hidden;padding:6px 8px;cursor:text}
.r2-line{white-space:pre-wrap;word-break:break-all;min-height:1.35em}
.r2-p{color:var(--r2-prompt);font-weight:bold}.r2-pp{color:var(--r2-path);font-weight:bold}
.r2-warn{color:#e9c46a}.r2-dir{color:#729fcf;font-weight:bold}.r2-err{color:#ff6b6b}.r2-ctrl{color:var(--r2-dim)}
.r2-hint{color:#7fd1e8;font-style:italic;font-family:system-ui,sans-serif;font-size:13px}
.r2-inrow{display:flex;white-space:normal;align-items:baseline}
.r2-prompt{white-space:pre;flex:none}
.r2-field{position:relative;flex:1;min-width:0}
.r2-field input{all:unset;display:block;box-sizing:border-box;width:100%;color:var(--r2-fg);caret-color:#fff;font:inherit;line-height:1.35;position:relative;z-index:1;background:transparent}
.r2-ghost{position:absolute;left:0;top:0;white-space:pre;color:transparent;pointer-events:none;overflow:hidden;right:0}
.r2-ghost b{color:var(--r2-dim);font-weight:normal}
.r2-panel{border-top:1px solid #3a3d40;background:#25272a;font-size:13px;max-height:11.5em;overflow-y:auto}
.r2-panel[hidden]{display:none}
.r2-usage{padding:3px 8px;color:#a9b1b6;font-family:system-ui,sans-serif;font-size:12px;border-bottom:1px solid #33363a}
.r2-usage em{color:#fff;font-style:normal;background:#3d5a80;border-radius:3px;padding:0 3px}
.r2-sugg{list-style:none;margin:0;padding:0}
.r2-sugg li{padding:1px 8px;display:flex;gap:1em;cursor:pointer;white-space:nowrap}
.r2-sugg li:hover{background:#34373b}
.r2-sugg li[aria-selected="true"]{background:#3d5a80;color:#fff}
.r2-sugg .v{flex:0 1 auto;overflow:hidden;text-overflow:ellipsis}
.r2-sugg .d{color:#8a9196;font-family:system-ui,sans-serif;font-size:12px;overflow:hidden;text-overflow:ellipsis}
.r2-sugg li.dim .v{color:#777}
.r2-sugg li.fuzzy .v::after{content:" ≈";color:#777}
.r2-running .r2-inrow{opacity:.55}
.r2-graph{border:1px solid rgba(128,128,128,.4);border-radius:8px;margin:.5em 0;font-family:system-ui,sans-serif;font-size:13px;background:#fbfbfd;color:#222;overflow:hidden;text-align:left}
.r2-gbar{display:flex;flex-wrap:wrap;gap:.8em;align-items:center;padding:4px 8px;background:#eef0f4;border-bottom:1px solid #dde}
.r2-gbar b{margin-right:auto}
.r2-gbar label{display:flex;gap:.3em;align-items:center;cursor:pointer}
.r2-gbar button{font:inherit;font-size:12px;border:1px solid #bbb;background:#fff;border-radius:4px;padding:1px 8px;cursor:pointer}
.r2-gsvg{display:block;width:100%;height:auto;min-height:120px}
.r2-gsvg text{font-family:system-ui,sans-serif;font-size:12px;fill:#222;pointer-events:none}
.r2-gnode ellipse{fill:#dfe9fb;stroke:#3367d6;stroke-width:1.5}
.r2-gnode.hidden ellipse{fill:#f1f1f1;stroke:#888;stroke-dasharray:4 3}
.r2-gtopic rect{fill:#fff3e0;stroke:#e37400;stroke-width:1.5}
.r2-gnode,.r2-gtopic{cursor:pointer}
.r2-gnode.sel ellipse,.r2-gtopic.sel rect{stroke-width:3}
.r2-gedge{fill:none;stroke:#555;stroke-width:1.4}
.r2-gedge.bad{stroke:#d33;stroke-dasharray:6 4}
.r2-pulse{fill:#2e9d4c}
.r2-ginfo{border-top:1px solid #dde;padding:6px 10px;background:#fff;font-size:12.5px;max-height:14em;overflow:auto}
.r2-ginfo pre{margin:.3em 0 0;background:#f4f4f6;padding:4px 6px;border-radius:4px;font-size:12px;white-space:pre-wrap}
.r2-gempty{padding:1.5em;color:#666;text-align:center}
.r2-ts{display:inline-block;border-radius:8px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.25);margin:.5em 0;max-width:100%;text-align:left}
.r2-tsbar{background:#2d2f31;color:#ddd;font:12.5px system-ui,sans-serif;padding:4px 10px}
.r2-ts canvas{display:block;width:100%;max-width:500px;aspect-ratio:1/1;background:rgb(69,86,255)}
.r2-tsoff{position:relative}
.r2-tsoff span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font:14px system-ui,sans-serif;text-align:center;padding:1em;background:rgba(0,0,0,.35)}
.r2-bagbox{font:13px system-ui,sans-serif;padding:4px 8px;margin:.3em 0;border-left:4px solid #3367d6;background:rgba(51,103,214,.08)}
.r2-bagerr{border-left-color:#d33;background:rgba(211,51,51,.08)}
.r2-rviz{border-radius:8px;overflow:hidden;margin:.5em 0;box-shadow:0 2px 10px rgba(0,0,0,.25);font:13px system-ui,sans-serif;background:#2b2b2b;color:#ddd;text-align:left}
.r2-rvbar{display:flex;gap:.8em;align-items:center;background:#3c3f41;padding:4px 8px}
.r2-rvhint{flex:1;color:#999;font-size:11.5px}
.r2-rvbar button,.r2-rvrow button,.r2-rvmenu button{font:inherit;font-size:12px;background:#4a4d50;color:#eee;border:0;border-radius:3px;padding:2px 8px;cursor:pointer}
.r2-rvbody{display:flex;flex-wrap:wrap}
.r2-rvpanel{flex:1 1 260px;max-width:100%;max-height:360px;overflow:auto;border-right:1px solid #444}
.r2-rvview{flex:2 1 320px;position:relative;min-height:320px}
.r2-rvview canvas{display:block;width:100%;height:360px;cursor:grab}
.r2-rvoff{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:1em;background:rgba(0,0,0,.55);color:#fff}
.r2-rvrow{padding:5px 8px;border-bottom:1px solid #3a3a3a;display:flex;flex-wrap:wrap;gap:.4em;align-items:center}
.r2-rvrow select{font:inherit;font-size:12px;background:#1f1f1f;color:#eee;border:1px solid #555;border-radius:3px;max-width:11em}
.r2-rvrow input[type=color]{width:22px;height:18px;padding:0;border:0;background:none}
.r2-rvst{flex-basis:100%;font-size:11.5px}
.r2-rvst.ok{color:#8ae234}.r2-rvst.warn{color:#e9c46a}.r2-rvst.err{color:#ff6b6b}.r2-rvst.dis{color:#888}
.r2-rvmenu{padding:6px 8px;display:flex;flex-wrap:wrap;gap:.3em;align-items:center;background:#333}
.r2-rvmenu div{flex-basis:100%;color:#aaa;font-size:11.5px}
.r2-modal{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:10000;padding:16px}
.r2-modalwin{background:#fff;color:#000;border-radius:6px;max-width:min(1000px,100%);max-height:100%;display:flex;flex-direction:column;box-shadow:0 4px 30px rgba(0,0,0,.5)}
.r2-modalbar{display:flex;justify-content:space-between;gap:1em;align-items:center;padding:6px 10px;background:#eee;font:13px system-ui,sans-serif}
.r2-modalbody{overflow:auto;padding:10px}
.r2-robot{margin:.5em 0;border-left:4px solid #2e9d4c;background:rgba(46,157,76,.08);font:13px system-ui,sans-serif;padding:6px 10px;display:flex;flex-wrap:wrap;gap:.8em;align-items:center;text-align:left}
.r2-robot canvas{background:#f4f4f0;border:1px solid #ccc;border-radius:4px;width:240px;height:160px}
.r2-robot .r2-rtext{flex:1;min-width:200px}
.r2-reset{font:inherit;border:1px solid #b55;color:#b33;background:#fff;border-radius:4px;padding:3px 10px;cursor:pointer}
`

  function injectCss () {
    if (typeof document === 'undefined' || document.getElementById('ros2sim-css')) return
    const st = document.createElement('style')
    st.id = 'ros2sim-css'
    st.textContent = CSS
    document.head.appendChild(st)
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const PROMPT = '<span class="r2-p">ros@sim</span>:<span class="r2-pp">~</span>$ '
  let autoId = 0

  // ---------------------------------------------------------- Terminal

  function defineTerminal () {
    class Ros2Terminal extends HTMLElement {
      connectedCallback () {
        injectCss()
        const sid = this.getAttribute('sid') || ('auto' + (++autoId))
        this.sess = sim.session(sid)
        const s = this.sess
        if (!s.initialized) {
          s.initialized = true
          const cmd = (this.getAttribute('cmd') || '').trim()
          if (cmd && !/^@\d$/.test(cmd)) s.draft = cmd
          if (this.getAttribute('steps')) setSteps(sid, this.getAttribute('steps'))
        }
        const title = this.getAttribute('title') && !/^@\d$/.test(this.getAttribute('title')) ? this.getAttribute('title') : 'Terminal'
        this.removeAttribute('title')
        const rows = parseInt(this.getAttribute('rows') || '14', 10)
        this.innerHTML = `
<div class="r2-term">
  <div class="r2-bar"><span class="r2-dots" aria-hidden="true">● ● ●</span><span class="r2-title">${esc(title)}</span>
    <span class="r2-status" aria-live="polite"></span>
    <button class="r2-btn r2-step" hidden></button>
    <button class="r2-btn r2-ctrlc" title="Laufendes Programm beenden (Strg+C)" hidden>Strg+C</button>
    <button class="r2-btn r2-copy" title="Befehle zum Nachmachen auf dem eigenen Rechner kopieren (ohne Prompt und Ausgabe)">⧉ kopieren</button>
    <button class="r2-btn r2-clr" title="Bildschirm leeren">clear</button></div>
  <div class="r2-screen" role="log" aria-label="${esc(title)}: Ausgabe" style="height:${rows * 1.35}em">
    <div class="r2-lines"></div>
    <div class="r2-inrow"><span class="r2-prompt">${PROMPT}</span><span class="r2-field">
      <span class="r2-ghost" aria-hidden="true"></span>
      <input type="text" spellcheck="false" autocomplete="off" autocapitalize="off" role="combobox"
        aria-autocomplete="list" aria-expanded="false" aria-label="${esc(title)}: Befehl eingeben">
    </span></div>
  </div>
  <div class="r2-panel" hidden><div class="r2-usage"></div><ul class="r2-sugg" role="listbox"></ul></div>
</div>`
        this.$ = (q) => this.querySelector(q)
        this.input = this.$('input'); this.screen = this.$('.r2-screen'); this.linesEl = this.$('.r2-lines')
        this.ghost = this.$('.r2-ghost'); this.panel = this.$('.r2-panel'); this.list = this.$('.r2-sugg'); this.usage = this.$('.r2-usage')
        const lid = 'r2l-' + sid.replace(/\W/g, '_')
        this.list.id = lid; this.input.setAttribute('aria-controls', lid)
        this.rendered = 0
        this.comp = null; this.sel = -1; this.active = false; this.hpos = -1
        this.input.value = s.draft || ''
        this.input.addEventListener('keydown', (e) => this.onKey(e))
        this.input.addEventListener('input', () => { s.draft = this.input.value; this.hpos = -1; this.active = false; this.sel = -1; this.refresh() })
        this.input.addEventListener('blur', () => setTimeout(() => { if (!this.contains(document.activeElement)) this.hidePanel() }, 150))
        this.input.addEventListener('focus', () => this.refresh())
        this.screen.addEventListener('click', () => { if (!window.getSelection().toString()) this.input.focus({ preventScroll: true }) })
        this.$('.r2-clr').onclick = () => { s.clear(); this.input.focus() }
        this.$('.r2-copy').onclick = () => this.copyCommands()
        this.$('.r2-ctrlc').onclick = () => { s.interrupt(this.input.value); this.input.focus() }
        this.$('.r2-step').onclick = () => {
          if (s.stepIdx < s.steps.length) { this.input.value = s.draft = s.steps[s.stepIdx]; this.input.focus(); this.refresh() }
        }
        this.list.addEventListener('mousedown', (e) => {
          const li = e.target.closest('li'); if (!li) return
          e.preventDefault(); this.accept(parseInt(li.dataset.i, 10))
        })
        s.views.add(this)
        this.renderLines(true); this.updateState()
      }

      disconnectedCallback () { if (this.sess) this.sess.views.delete(this) }

      copyCommands () {
        const btn = this.$('.r2-copy')
        const { text, n } = this.sess.copyText()
        const flash = (msg) => {
          btn.textContent = msg; clearTimeout(this.copyTimer)
          this.copyTimer = setTimeout(() => { btn.textContent = '⧉ kopieren' }, 1800)
        }
        if (!text) { flash('noch keine Befehle'); return }
        const done = () => flash(n === 1 ? '✔ 1 Befehl kopiert' : `✔ ${n} Befehle kopiert`)
        const fallback = () => {
          const ta = document.createElement('textarea')
          ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0'
          document.body.appendChild(ta); ta.select()
          let ok = false; try { ok = document.execCommand('copy') } catch (e) {}
          ta.remove(); ok ? done() : flash('Kopieren nicht erlaubt')
        }
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback)
        else fallback()
      }

      // Ein „Dokument“ (z. B. frames_….pdf aus view_frames) in einem Fenster über der Seite zeigen
      openDoc (doc) {
        const box = document.createElement('div')
        box.className = 'r2-modal'
        box.innerHTML = `<div class="r2-modalwin" role="dialog" aria-label="${esc(doc.title)}"><div class="r2-modalbar"><b>${esc(doc.title)}</b><button type="button">Schließen</button></div><div class="r2-modalbody">${doc.svg}</div></div>`
        const close = () => { box.remove(); this.input.focus() }
        box.querySelector('button').onclick = close
        box.addEventListener('click', (e) => { if (e.target === box) close() })
        box.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close() })
        document.body.appendChild(box)
        box.querySelector('button').focus()
      }

      onSession (what, data) {
        if (what === 'open') { this.openDoc(data); return }
        if (what === 'clear') this.renderLines(true)
        else if (what === 'lines') this.scheduleLines()
        else if (what === 'state') this.updateState()
      }

      scheduleLines () {
        if (this.pending) return
        this.pending = true
        requestAnimationFrame(() => { this.pending = false; this.renderLines(false) })
      }

      renderLines (full) {
        const s = this.sess
        const atBottom = this.screen.scrollHeight - this.screen.scrollTop - this.screen.clientHeight < 40
        if (full || this.rendered > s.lines.length || this.linesEl.childElementCount > 1500) {
          this.linesEl.innerHTML = ''
          this.rendered = Math.max(0, s.lines.length - 1000)
        }
        const frag = document.createDocumentFragment()
        for (let i = this.rendered; i < s.lines.length; i++) {
          const l = s.lines[i]
          const d = document.createElement('div')
          d.className = 'r2-line' + (l.c && l.c !== 'cmd' ? ' r2-' + l.c : '')
          if (l.c === 'cmd') d.innerHTML = PROMPT + esc(l.t)
          else d.textContent = l.t
          frag.appendChild(d)
        }
        this.rendered = s.lines.length
        this.linesEl.appendChild(frag)
        while (this.linesEl.childElementCount > 1200) this.linesEl.removeChild(this.linesEl.firstChild)
        if (atBottom || full) this.screen.scrollTop = this.screen.scrollHeight
      }

      updateState () {
        const s = this.sess
        const run = !!s.proc
        this.$('.r2-term').classList.toggle('r2-running', run)
        this.$('.r2-status').textContent = run ? '▶ ' + s.proc.label + (s.proc.keyMode ? '  –  ' + (s.proc.keyHint || 'Pfeiltasten steuern') : '') : ''
        this.$('.r2-ctrlc').hidden = !run
        this.input.readOnly = run
        this.$('.r2-prompt').style.visibility = run ? 'hidden' : 'visible'
        if (run) { this.input.value = ''; this.hidePanel() } else this.input.value = s.draft || ''
        const st = this.$('.r2-step')
        st.hidden = !s.steps.length
        if (s.steps.length) {
          st.textContent = s.stepIdx < s.steps.length ? `▶ Schritt ${s.stepIdx + 1}/${s.steps.length}` : '✓ alle Schritte'
          st.disabled = run || s.stepIdx >= s.steps.length
        }
        this.renderGhost()
      }

      onKey (e) {
        const s = this.sess
        const k = e.key
        // Tasten im Terminal gehören dem Terminal – ältere LiaScript-Versionen blättern sonst mit ← →
        e.stopPropagation()
        if (e.ctrlKey && (k === 'c' || k === 'C')) {
          if (this.input.selectionStart !== this.input.selectionEnd) return
          e.preventDefault(); s.interrupt(this.input.value); s.draft = ''; this.input.value = ''; this.hidePanel(); return
        }
        if (e.ctrlKey && (k === 'l' || k === 'L')) { e.preventDefault(); s.clear(); return }
        if (s.proc) {
          if (s.proc.onKey && s.key(k)) e.preventDefault()
          else if (k.startsWith('Arrow')) e.preventDefault()
          return
        }
        const open = !this.panel.hidden && this.comp && this.comp.items.length
        if (k === 'Tab') {
          e.preventDefault()
          if (!this.comp) this.refresh()
          const c = this.comp
          if (!c || !c.items.length) return
          if (c.items.length === 1) { this.accept(0); return }
          const pre = commonPrefix(c.items.filter(i => !i.fuzzy).map(i => i.value))
          if (!this.active && pre.length > c.cur.length) {
            this.input.value = s.draft = this.input.value.slice(0, c.start) + pre
            this.toEnd(); this.refresh(); return
          }
          this.active = true
          this.sel = (this.sel + (e.shiftKey ? -1 : 1) + c.items.length) % c.items.length
          this.renderPanel(); return
        }
        if ((k === 'ArrowDown' || k === 'ArrowUp') && open && this.active) {
          e.preventDefault()
          this.sel = (this.sel + (k === 'ArrowDown' ? 1 : -1) + this.comp.items.length) % this.comp.items.length
          this.renderPanel(); return
        }
        if (k === 'ArrowUp' || k === 'ArrowDown') {
          e.preventDefault()
          if (!s.history.length) return
          if (this.hpos === -1) { this.saved = this.input.value; this.hpos = s.history.length }
          this.hpos += k === 'ArrowUp' ? -1 : 1
          if (this.hpos < 0) this.hpos = 0
          if (this.hpos >= s.history.length) { this.hpos = -1; this.input.value = this.saved || '' } else this.input.value = s.history[this.hpos]
          s.draft = this.input.value
          this.toEnd(); this.hidePanel(); this.renderGhost(); return
        }
        if (k === 'ArrowRight' && this.ghostText && this.input.selectionStart === this.input.value.length) {
          e.preventDefault()
          this.input.value = s.draft = this.input.value + this.ghostText
          this.toEnd(); this.refresh(); return
        }
        if (k === 'Escape') { if (open) { e.preventDefault(); this.active = false; this.sel = -1; this.hidePanel() } return }
        if (k === 'Enter') {
          e.preventDefault()
          if (open && this.active && this.sel >= 0) { this.accept(this.sel); return }
          const line = this.input.value
          this.input.value = ''; s.draft = ''; this.hpos = -1; this.active = false; this.sel = -1
          this.hidePanel()
          s.exec(line)
          this.refresh()
        }
      }

      accept (i) {
        const c = this.comp; const it = c && c.items[i]
        if (!it) return
        this.input.value = this.sess.draft = applyCompletion(this.input.value, c, it)
        this.active = false; this.sel = -1
        this.input.focus()
        this.toEnd()
        this.refresh()
      }

      toEnd () {
        const n = this.input.value.length
        this.input.setSelectionRange(n, n)
        this.input.scrollLeft = this.input.scrollWidth
      }

      refresh () {
        if (this.sess.proc) { this.hidePanel(); return }
        const v = this.input.value
        const atEnd = this.input.selectionStart === v.length
        this.comp = atEnd ? this.sess.complete(v) : null
        this.renderPanel()
        this.renderGhost()
      }

      renderGhost () {
        const c = this.comp
        const v = this.input.value
        this.ghostText = ''
        if (!this.sess.proc && c && c.items.length && c.cur && document.activeElement === this.input) {
          const it = c.items[this.sel >= 0 ? this.sel : 0]
          if (!it.fuzzy && it.value.startsWith(c.cur) && it.value !== c.cur) this.ghostText = it.value.slice(c.cur.length)
        }
        if (this.input.scrollLeft > 0) this.ghostText = ''
        this.ghost.innerHTML = esc(v) + '<b>' + esc(this.ghostText) + '</b>'
      }

      renderPanel () {
        const c = this.comp
        const show = !!c && document.activeElement === this.input && (c.items.length > 0 || !!c.usage) && this.input.value.length > 0
        if (!show) { this.hidePanel(); return }
        let usage = esc(c.usage || '')
        if (c.argIndex >= 0 && c.usage) {
          let k = -1
          usage = usage.replace(/‹[^›]*›\??/g, (m) => { k++; return k === c.argIndex ? '<em>' + m + '</em>' : m })
        }
        if (c.expect) usage += ' &nbsp;– erwartet: <em>' + esc(c.expect) + '</em>'
        this.usage.innerHTML = usage || '&nbsp;'
        this.usage.hidden = !usage
        const items = c.items.slice(0, 60)
        this.list.innerHTML = items.map((it, i) =>
          `<li role="option" id="${this.list.id}-${i}" data-i="${i}" aria-selected="${i === this.sel}" class="${it.dim ? 'dim' : ''} ${it.fuzzy ? 'fuzzy' : ''}"><span class="v">${esc(it.value)}</span>${it.desc ? '<span class="d">' + esc(it.desc) + '</span>' : ''}</li>`).join('')
        this.panel.hidden = false
        this.input.setAttribute('aria-expanded', items.length ? 'true' : 'false')
        if (this.sel >= 0) {
          this.input.setAttribute('aria-activedescendant', this.list.id + '-' + this.sel)
          const li = this.list.children[this.sel]; if (li) li.scrollIntoView({ block: 'nearest' })
        } else this.input.removeAttribute('aria-activedescendant')
      }

      hidePanel () {
        if (!this.panel) return
        this.panel.hidden = true
        this.input.setAttribute('aria-expanded', 'false')
      }
    }
    if (!customElements.get('ros2-terminal')) customElements.define('ros2-terminal', Ros2Terminal)
  }

  // ---------------------------------------------------------- Graph-Ansicht

  function defineGraph () {
    const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

    class Ros2Graph extends HTMLElement {
      connectedCallback () {
        injectCss()
        this.showHidden = this.getAttribute('hidden-nodes') !== 'false'
        this.showDebug = false
        this.selected = null
        this.innerHTML = `
<div class="r2-graph">
  <div class="r2-gbar"><b>ROS-Graph</b>
    <label><input type="checkbox" class="r2-ch-hidden" ${this.showHidden ? 'checked' : ''}> Werkzeug-Knoten (_ros2cli)</label>
    <select class="r2-gdom" aria-label="Domain" hidden></select>
    <label><input type="checkbox" class="r2-ch-debug"> /rosout, /parameter_events</label>
    <button class="r2-greset" title="Alle Programme in allen Terminals beenden">Alles beenden</button></div>
  <svg class="r2-gsvg" role="img" aria-label="ROS-Graph"></svg>
  <div class="r2-ginfo" hidden></div>
</div>`
        this.svg = this.querySelector('svg')
        this.info = this.querySelector('.r2-ginfo')
        this.querySelector('.r2-ch-hidden').onchange = (e) => { this.showHidden = e.target.checked; this.draw() }
        this.querySelector('.r2-ch-debug').onchange = (e) => { this.showDebug = e.target.checked; this.draw() }
        this.domainFilter = null
        this.querySelector('.r2-gdom').onchange = (e) => { this.domainFilter = e.target.value === '' ? null : Number(e.target.value); this.draw() }
        this.querySelector('.r2-greset').onclick = () => sim.reset()
        this.svg.addEventListener('click', (e) => {
          const el = e.target.closest('[data-key]')
          this.selected = el ? el.dataset.key : null
          this.draw()
        })
        this.pulses = []
        this.lastPulse = new Map()
        this.offs = [
          sim.graph.on('change', () => this.scheduleDraw()),
          sim.graph.on('message', (m) => this.onMessage(m))
        ]
        this.infoTimer = setInterval(() => this.renderInfo(), 500)
        this.draw()
      }

      disconnectedCallback () {
        (this.offs || []).forEach(f => f())
        clearInterval(this.infoTimer)
        cancelAnimationFrame(this.raf)
      }

      scheduleDraw () {
        if (this.drawPending) return
        this.drawPending = true
        setTimeout(() => { this.drawPending = false; this.draw() }, 30)
      }

      model () {
        const g = sim.graph
        const all = g.nodes.filter(n => n.kind !== 'daemon' && (this.showHidden || !n.hidden))
        this.domains = sorted([...new Set(all.map(n => n.domain))].map(String)).map(Number).sort((a, b) => a - b)
        const nodes = all.filter(n => this.domainFilter === null || this.domainFilter === undefined || n.domain === this.domainFilter)
        const multi = new Set(nodes.map(n => n.domain)).size > 1
        const topics = new Map()
        const edges = []
        this.labels = new Map(); this.tinfo = new Map()
        // Topics gibt es je Domain getrennt
        const tid = (ep) => ep.topic + '|' + ep.node.domain
        this.tid = tid
        for (const n of nodes) {
          this.labels.set('n:' + nodeKey(n), n.fqn + (n.host !== 'laptop' ? ' @' + n.host : '') + (multi ? ` [${n.domain}]` : ''))
          for (const ep of n.pubs.concat(n.subs)) {
            if (!this.showDebug && DEBUG_TOPICS.includes(ep.topic)) continue
            const id = tid(ep)
            if (!topics.has(id)) {
              topics.set(id, { id, name: ep.topic, domain: n.domain, pubs: [], subs: [] })
              this.labels.set('t:' + id, ep.topic + (multi ? ` [${n.domain}]` : '')); this.tinfo.set('t:' + id, { name: ep.topic, domain: n.domain })
            }
            topics.get(id)[ep.kind === 'pub' ? 'pubs' : 'subs'].push(ep)
          }
        }
        for (const t of topics.values()) {
          for (const p of t.pubs) edges.push({ from: 'n:' + nodeKey(p.node), to: 't:' + t.id, ep: p })
          for (const s of t.subs) {
            // nur Publisher, die der Subscriber überhaupt entdecken kann (Rechner, Discovery-Bereich)
            const vis = t.pubs.filter(p => sees(p.node, s.node))
            const disc = t.pubs.length > 0 && !vis.length
            const bad = vis.some(p => p.type === s.type && qosProblem(p.qos, s.qos)) && !vis.some(p => p.type === s.type && !qosProblem(p.qos, s.qos))
            const typeBad = vis.length > 0 && !vis.some(p => p.type === s.type)
            edges.push({ from: 't:' + t.id, to: 'n:' + nodeKey(s.node), ep: s, bad: disc || bad || typeBad, why: disc ? 'Discovery' : bad ? 'QoS' : typeBad ? 'Typ' : '' })
          }
        }
        // Spalten: Sender links, Empfänger rechts
        const rank = new Map()
        for (const n of nodes) rank.set('n:' + nodeKey(n), 0)
        for (const t of topics.keys()) rank.set('t:' + t, 1)
        for (let it = 0; it < 10; it++) {
          for (const [name, t] of topics) {
            const pr = t.pubs.map(p => rank.get('n:' + nodeKey(p.node)))
            const sr = t.subs.map(s => rank.get('n:' + nodeKey(s.node)))
            rank.set('t:' + name, pr.length ? Math.max(...pr) + 1 : Math.max(0, Math.min(...sr) - 1))
          }
          for (const n of nodes) {
            const sr = n.subs.filter(s => topics.has(tid(s)) && !topics.get(tid(s)).pubs.every(p => p.node === n) ||
              (topics.has(tid(s)) && !topics.get(tid(s)).pubs.length))
              .map(s => rank.get('t:' + tid(s)))
            rank.set('n:' + nodeKey(n), sr.length ? Math.min(Math.max(...sr) + 1, 12) : 0)
          }
        }
        return { nodes, topics, edges, rank }
      }

      draw () {
        const { nodes, topics, edges, rank } = this.model()
        const sel = this.querySelector('.r2-gdom')
        if (sel) {
          const opts = [''].concat(this.domains.map(String))
          if (this.domainFilter !== null && !this.domains.includes(this.domainFilter)) opts.push(String(this.domainFilter))
          const html = opts.map(d => `<option value="${d}" ${String(this.domainFilter ?? '') === d ? 'selected' : ''}>${d === '' ? 'alle Domains' : 'Domain ' + d}</option>`).join('')
          if (sel.innerHTML !== html) sel.innerHTML = html
          sel.hidden = this.domains.length < 2 && this.domainFilter === null
        }
        this.edges = edges
        if (!nodes.length) {
          this.svg.setAttribute('viewBox', '0 0 600 90')
          this.svg.innerHTML = '<text x="300" y="50" text-anchor="middle" style="fill:#777">Keine Knoten aktiv – starte z. B. ros2 run demo_nodes_cpp talker</text>'
          this.svg.setAttribute('aria-label', 'ROS-Graph: keine Knoten aktiv')
          this.pos = new Map(); this.renderInfo(); return
        }
        const cols = new Map()
        for (const [k, r] of rank) {
          if (k.startsWith('t:') && !topics.has(k.slice(2))) continue
          if (!cols.has(r)) cols.set(r, [])
          cols.get(r).push(k)
        }
        const maxR = Math.max(...cols.keys())
        const colW = 190; const rowH = 58
        const pos = new Map()
        let maxRows = 1
        for (const [r, keys] of cols) {
          keys.sort()
          maxRows = Math.max(maxRows, keys.length)
          keys.forEach((k, i) => pos.set(k, { x: 100 + r * colW, y: 40 + i * rowH, col: keys.length }))
        }
        for (const p of pos.values()) p.y += (maxRows - p.col) * rowH / 2
        const W = 200 + maxR * colW; const H = 30 + maxRows * rowH
        this.pos = pos
        const label = (k) => this.labels.get(k) || k.slice(2)
        const width = (k) => Math.max(70, label(k).length * 7 + 22)
        let svg = '<defs><marker id="r2arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#555"/></marker></defs>'
        for (const e of edges) {
          const a = pos.get(e.from); const b = pos.get(e.to)
          if (!a || !b) continue
          const x1 = a.x + width(e.from) / 2; const x2 = b.x - width(e.to) / 2
          const mx = (x1 + x2) / 2
          e.path = [x1, a.y, mx, a.y, mx, b.y, x2, b.y]
          svg += `<path class="r2-gedge${e.bad ? ' bad' : ''}" marker-end="url(#r2arrow)" d="M${x1} ${a.y} C${mx} ${a.y} ${mx} ${b.y} ${x2} ${b.y}"><title>${e.bad ? 'keine Zustellung (' + e.why + ' unverträglich)' : ''}</title></path>`
          if (e.bad) svg += `<text x="${mx}" y="${(a.y + b.y) / 2 - 4}" text-anchor="middle" style="fill:#d33;font-size:11px">✕ ${e.why}</text>`
        }
        for (const [k, p] of pos) {
          const w = width(k)
          const sel = this.selected === k ? ' sel' : ''
          if (k.startsWith('n:')) {
            const n = nodes.find(x => 'n:' + nodeKey(x) === k)
            svg += `<g class="r2-gnode${n && n.hidden ? ' hidden' : ''}${sel}" data-key="${esc(k)}"><ellipse cx="${p.x}" cy="${p.y}" rx="${w / 2}" ry="18"/><text x="${p.x}" y="${p.y + 4}" text-anchor="middle">${esc(label(k))}</text></g>`
          } else {
            svg += `<g class="r2-gtopic${sel}" data-key="${esc(k)}"><rect x="${p.x - w / 2}" y="${p.y - 15}" width="${w}" height="30" rx="3"/><text x="${p.x}" y="${p.y + 4}" text-anchor="middle">${esc(label(k))}</text></g>`
          }
        }
        svg += '<g class="r2-pulses"></g>'
        this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
        this.svg.style.maxHeight = Math.max(160, H * 1.3) + 'px'
        this.svg.innerHTML = svg
        this.pulseLayer = this.svg.querySelector('.r2-pulses')
        this.svg.setAttribute('aria-label', 'ROS-Graph: ' + nodes.filter(n => !n.hidden).map(n => n.fqn).join(', ') +
          '; Topics: ' + [...topics.keys()].join(', '))
        this.renderInfo()
      }

      onMessage ({ ep, delivered }) {
        if (!this.pos || reduced()) return
        if (!this.showDebug && DEBUG_TOPICS.includes(ep.topic)) return
        const now = performance.now()
        const k = nodeKey(ep.node) + '>' + ep.topic + '|' + ep.node.domain
        if (now - (this.lastPulse.get(k) || 0) < 350) return
        this.lastPulse.set(k, now)
        const e1 = this.edges.find(e => e.ep === ep)
        if (!e1 || !e1.path) return
        this.pulses.push({ path: e1.path, t0: now, dur: 450 })
        for (const s of delivered) {
          const e2 = this.edges.find(e => e.ep === s)
          if (e2 && e2.path) this.pulses.push({ path: e2.path, t0: now + 450, dur: 450 })
        }
        if (!this.raf) this.raf = requestAnimationFrame(() => this.animate())
      }

      animate () {
        this.raf = null
        if (!this.pulseLayer) return
        const now = performance.now()
        this.pulses = this.pulses.filter(p => now < p.t0 + p.dur)
        let html = ''
        for (const p of this.pulses) {
          const u = (now - p.t0) / p.dur
          if (u < 0) continue
          const [x0, y0, x1, y1, x2, y2, x3, y3] = p.path
          const v = 1 - u
          const x = v * v * v * x0 + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3
          const y = v * v * v * y0 + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y3
          html += `<circle class="r2-pulse" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5"/>`
        }
        this.pulseLayer.innerHTML = html
        if (this.pulses.length) this.raf = requestAnimationFrame(() => this.animate())
      }

      renderInfo () {
        const k = this.selected
        if (!k || !this.pos || !this.pos.has(k)) { this.info.hidden = true; return }
        const g = sim.graph
        let html = ''
        if (k.startsWith('t:')) {
          const ti = this.tinfo && this.tinfo.get(k)
          if (!ti) { this.info.hidden = true; return }
          const name = ti.name
          const t = g.view({ host: 'laptop', domain: ti.domain, range: 'SUBNET' }).topics().get(name)
          if (!t) { this.info.hidden = true; return }
          const st = g.stats.get(name)
          let rate = '–'
          if (st && st.times.length > 1 && Date.now() - st.times[st.times.length - 1] < 3000) {
            const span = (st.times[st.times.length - 1] - st.times[0]) / 1000
            if (span > 0) rate = ((st.times.length - 1) / span).toFixed(1) + ' Hz'
          }
          html = `<b>Topic ${esc(name)}</b> – Typ <code>${esc(t.types.join(', '))}</code> – Rate ${rate}<br>` +
            `Publisher: ${esc(t.pubs.map(p => p.node.fqn).join(', ') || '–')}<br>Subscriber: ${esc(t.subs.map(s => s.node.fqn).join(', ') || '–')}`
          if (st && st.last && TYPES[st.lastType]) html += '<pre>' + esc(yamlMsg(st.lastType, st.last).join('\n')) + '</pre>'
        } else {
          const n = g.nodes.find(x => 'n:' + nodeKey(x) === k)
          if (!n) { this.info.hidden = true; return }
          const f = (eps) => esc(sorted([...new Set(eps.filter(e => !DEBUG_TOPICS.includes(e.topic)).map(e => e.topic + ' [' + e.type + ']'))]).join(', ') || '–')
          html = `<b>Knoten ${esc(n.fqn)}</b>${n.hidden ? ' (versteckter Werkzeug-Knoten von ros2 topic …)' : ''}<br>Publiziert: ${f(n.pubs)}<br>Abonniert: ${f(n.subs)}`
        }
        this.info.innerHTML = html
        this.info.hidden = false
      }
    }
    if (!customElements.get('ros2-graph')) customElements.define('ros2-graph', Ros2Graph)
  }

  const nodeKeys = new WeakMap(); let nodeKeyN = 0
  function nodeKey (n) {
    if (!nodeKeys.has(n)) nodeKeys.set(n, n.fqn + '#' + (++nodeKeyN))
    return nodeKeys.get(n)
  }

  // ---------------------------------------------------------- turtlesim-Fenster

  function defineTurtlesim () {
    class Ros2Turtlesim extends HTMLElement {
      connectedCallback () {
        injectCss()
        this.innerHTML = `<div class="r2-ts"><div class="r2-tsbar">TurtleSim</div><div class="r2-tsoff">
          <canvas width="500" height="500" role="img" aria-label="turtlesim-Fenster"></canvas><span></span></div></div>`
        this.canvas = this.querySelector('canvas')
        this.msg = this.querySelector('.r2-tsoff span')
        this.bar = this.querySelector('.r2-tsbar')
        this.ctx = this.canvas.getContext('2d')
        const loop = () => { this.paint(); this.raf = requestAnimationFrame(loop) }
        loop()
      }

      disconnectedCallback () { cancelAnimationFrame(this.raf) }

      paint () {
        const w = sim.worlds[sim.worlds.length - 1]
        const c = this.ctx; const S = 500 / WORLD
        if (!w) {
          c.fillStyle = 'rgb(69,86,255)'; c.fillRect(0, 0, 500, 500)
          this.msg.textContent = 'turtlesim_node läuft nicht. Starte es in einem Terminal mit: ros2 run turtlesim turtlesim_node'
          this.msg.style.display = 'flex'
          return
        }
        this.msg.style.display = 'none'
        const bar = sim.worlds.length > 1 ? `TurtleSim – ${sim.worlds.length} turtlesim-Knoten laufen, gezeigt wird der zuletzt gestartete` : 'TurtleSim'
        if (this.bar.textContent !== bar) this.bar.textContent = bar
        c.fillStyle = `rgb(${w.bg.join(',')})`; c.fillRect(0, 0, 500, 500)
        c.lineCap = 'round'
        for (const t of w.turtles) {
          // Segmente gleicher Farbe und Breite in einem Zug zeichnen
          let key = null
          for (const [x1, y1, x2, y2, col, width] of t.path) {
            const k = (col || PEN).join(',') + '/' + (width || 3)
            if (k !== key) {
              if (key) c.stroke()
              key = k; c.strokeStyle = `rgb(${(col || PEN).join(',')})`; c.lineWidth = width || 3; c.beginPath()
            }
            c.moveTo(x1 * S, 500 - y1 * S); c.lineTo(x2 * S, 500 - y2 * S)
          }
          if (key) c.stroke()
        }
        for (const t of w.turtles) drawTurtle(c, t.x * S, 500 - t.y * S, t.theta)
        this.canvas.setAttribute('aria-label', 'turtlesim: ' + (w.turtles.map(t => `${t.name} bei x=${t.x.toFixed(2)}, y=${t.y.toFixed(2)}, theta=${t.theta.toFixed(2)}`).join('; ') || 'keine Schildkröte'))
      }
    }
    if (!customElements.get('ros2-turtlesim')) customElements.define('ros2-turtlesim', Ros2Turtlesim)
  }

  function drawTurtle (c, x, y, theta) {
    c.save()
    c.translate(x, y); c.rotate(-theta)
    c.fillStyle = '#5a8f3c'; c.strokeStyle = '#2f4f1f'; c.lineWidth = 1.5
    for (const [lx, ly] of [[8, -10], [8, 10], [-8, -10], [-8, 10]]) {
      c.beginPath(); c.ellipse(lx, ly, 5, 3.5, 0, 0, 2 * Math.PI); c.fill(); c.stroke()
    }
    c.beginPath(); c.ellipse(17, 0, 6, 5, 0, 0, 2 * Math.PI); c.fill(); c.stroke()
    c.fillStyle = '#7a5230'
    c.beginPath(); c.ellipse(0, 0, 14, 11, 0, 0, 2 * Math.PI); c.fill(); c.stroke()
    c.strokeStyle = '#4b321c'; c.beginPath(); c.moveTo(-6, -8); c.lineTo(-6, 8); c.moveTo(4, -9); c.lineTo(4, 9); c.stroke()
    c.restore()
  }

  // ---------------------------------------------------------- Reset-Knopf

  function defineReset () {
    class Ros2Reset extends HTMLElement {
      connectedCallback () {
        injectCss()
        this.innerHTML = '<button class="r2-reset" type="button">⟲ Simulation zurücksetzen</button>'
        this.querySelector('button').onclick = () => sim.reset()
      }
    }
    if (!customElements.get('ros2-reset')) customElements.define('ros2-reset', Ros2Reset)
  }

  // Folienwechsel: LiaScript ändert die Adresse per history.pushState, ohne hashchange-Ereignis.
  // Deshalb wird die Foliennummer im Hash regelmäßig verglichen. Abschalten mit
  // window.ROS2Sim.resetOnSlideChange = false (z. B. für Abläufe über mehrere Folien).
  if (typeof window !== 'undefined' && typeof location !== 'undefined' && root === window) {
    const slideOf = () => parseInt(String(location.hash || '').replace(/^#/, ''), 10) || 1
    let lastSlide = slideOf()
    setInterval(() => {
      const now = slideOf()
      if (now === lastSlide) return
      lastSlide = now
      if (root.ROS2Sim && root.ROS2Sim.resetOnSlideChange !== false) sim.reset('slide')
    }, 250)
  }

  function defineRobot () {
    class Ros2Robot extends HTMLElement {
      connectedCallback () {
        injectCss()
        const domain = parseInt(this.getAttribute('domain') || '0', 10) || 0
        this.cfg = { domain, host: this.getAttribute('host') || 'turtlebot', lidar: this.getAttribute('lidar') || 'LDS-01', cmdVel: this.getAttribute('cmd-vel') || 'TwistStamped' }
        this.innerHTML = `<div class="r2-robot"><canvas width="480" height="320" role="img" aria-label="Blick ins Labor: Position des Roboters"></canvas><div class="r2-rtext"></div></div>`
        this.canvas = this.querySelector('canvas'); this.text = this.querySelector('.r2-rtext')
        const start = () => { this.robot = sim.addRobot(this.cfg) }
        start()
        this.off = sim.on('reset', () => setTimeout(() => { if (this.isConnected) start() }, 0))
        const loop = () => { this.paint(); this.raf = requestAnimationFrame(loop) }
        loop()
      }

      disconnectedCallback () { if (this.off) this.off(); cancelAnimationFrame(this.raf) }

      paint () {
        const r = sim.robots.get(this.cfg.host)
        const c = this.canvas.getContext('2d'); const W = 480; const H = 320
        c.fillStyle = '#f4f4f0'; c.fillRect(0, 0, W, H)
        const S = 70; const X = (x) => 20 + (x + 1.2) * S; const Y = (y) => H - 20 - (y + 1.6) * S
        c.strokeStyle = '#555'; c.lineWidth = 3; c.beginPath()
        for (const [x1, y1, x2, y2] of ROOM) { c.moveTo(X(x1), Y(y1)); c.lineTo(X(x2), Y(y2)) }
        c.stroke()
        if (r && r.alive) {
          c.fillStyle = r.blocked ? '#d33' : '#333'; c.beginPath(); c.arc(X(r.x), Y(r.y), 0.105 * S, 0, 2 * Math.PI); c.fill()
          c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(X(r.x), Y(r.y)); c.lineTo(X(r.x + 0.1 * Math.cos(r.yaw)), Y(r.y + 0.1 * Math.sin(r.yaw))); c.stroke()
        }
        const t = `🤖 TurtleBot3 Burger (simuliert) im WLAN – Rechner ${this.cfg.host}, ROS_DOMAIN_ID=${this.cfg.domain}. Die Treiber starten selbst; am Roboter wird nichts geändert.` +
          (r && r.blocked ? ' ⚠ Der Roboter steht an einem Hindernis.' : '')
        if (this.text.textContent !== t) this.text.textContent = t
      }
    }
    if (!customElements.get('ros2-robot')) customElements.define('ros2-robot', Ros2Robot)
  }

  function defineBag () {
    class Ros2Bag extends HTMLElement {
      connectedCallback () {
        injectCss()
        const name = this.getAttribute('name'); const src = this.getAttribute('src')
        const box = document.createElement('div')
        box.className = 'r2-bagbox'; box.setAttribute('aria-live', 'polite')
        this.innerHTML = ''; this.appendChild(box)
        const show = () => {
          const b = sim.fs.get(name)
          box.textContent = b ? `📦 Bagdatei ${name}: ${b.messages.length} Nachrichten auf ${b.topics.map(t => t.name).join(', ')} – im Terminal z. B. ros2 bag info ${name}` : `📦 ${name} wird geladen …`
        }
        if (sim.fs.has(name) || !src) { show(); return }
        show()
        if (!loading.has(name)) {
          loading.set(name, fetch(src).then(r => { if (!r.ok) throw new Error(r.status + ' ' + r.statusText); return r.arrayBuffer() })
            .then(buf => { root.ROS2Sim.loadBag(name, new Uint8Array(buf)) }))
        }
        loading.get(name).then(show).catch(e => { box.textContent = `📦 ${name} konnte nicht geladen werden: ${e.message}`; box.classList.add('r2-bagerr') })
      }
    }
    if (!customElements.get('ros2-bag')) customElements.define('ros2-bag', Ros2Bag)
  }
  const loading = new Map()

  if (typeof customElements !== 'undefined' && typeof HTMLElement !== 'undefined') {
    defineTerminal(); defineGraph(); defineTurtlesim(); defineReset(); defineBag(); defineRviz(); defineRobot()
  }

  root.ROS2Sim = {
    version: VERSION,
    sim,
    session: (id) => sim.session(id),
    reset: () => sim.reset(),
    state: () => sim.state(),
    setSteps,
    resetOnSlideChange: true,
    setBashrc (text) {
      const t = String(text || '').replace(/\n?$/, '\n')
      if (sim.bashrcPreset === t) return
      sim.bashrcPreset = t
      sim.home.set('.bashrc', t)
      for (const s of sim.sessions.values()) {
        if (s.history.length) continue
        s.vars = {}
        for (const k of Object.keys(s.env)) if (!['SHELL', 'HOME', 'USER', 'PWD', 'ROS_VERSION', 'ROS_PYTHON_VERSION', 'ROS_DISTRO'].includes(k)) delete s.env[k]
        applyBashrc(s)
      }
    },
    // Bagdatei (MCAP) unter einem Ordnernamen bereitstellen, z. B. für vorbereitete Aufnahmen
    loadBag (name, u8, metadataYaml) {
      const bag = bagFromMcap(name, name + '_0.mcap', u8 instanceof Uint8Array ? u8 : new Uint8Array(u8))
      bag.files.set('metadata.yaml', metadataYaml || bagMetadataYaml(bag))
      sim.fs.set(name, bag)
      sim.emit('fs')
      return { messages: bag.messages.length, topics: bag.topics.map(t => t.name + ' [' + t.type + ']') }
    },
    files: (name) => { const b = sim.fs.get(name); return b ? Object.fromEntries(b.files) : null },
    // für Tests
    _internal: { framesInfo, sees, TfBuffer, tfEchoBlock, rvizSubscribe, rvizStatus, cdrDecode, cdrEncode, readMcap, writeMcap, registerRos2Msg, showOf, TYPES, parseYaml, msgFromYaml, pyRepr, yamlMsg, pyFloat, yamlStr, shellTokens, complete, applyCompletion, validateTopic, Simulation }
  }
})(typeof window !== 'undefined' ? window : globalThis)

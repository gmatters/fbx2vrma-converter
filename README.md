# FBX to VRMA Converter v2.1

Convert FBX animation files to VRMA (VRM Animation) format.
Compatible with VRoid Hub, @pixiv/three-vrm-animation, and other VRM 1.0 tools.

English README | [日本語 README](README-jp.md)

## Features

- **FBX to VRMA conversion** — Converts Mixamo FBX animations to VRMA format
- **GLB binary output** — Outputs standard GLB binary format, compatible with VRoid Hub
- **52-bone support** — Full humanoid mapping including all finger bones (30 bones)
- **VRMA spec compliant** — Filters illegal scale/translation channels per VRMC_vrm_animation 1.0
- **Batch conversion** — Convert an entire directory of FBX files at once
- **Cross-platform** — macOS, Windows, Linux; binary path auto-detected by OS

## Requirements

- Node.js 18+
- FBX2glTF binary (downloaded automatically by setup script)
- macOS (Apple Silicon requires Rosetta 2), Windows, or Linux

## Installation

```bash
git clone https://github.com/TK-256/fbx2vrma-converter.git
cd fbx2vrma-converter
npm install
```

`npm install` automatically downloads the FBX2glTF binary via the setup script.
If the download fails, run it manually:

```bash
# macOS / Linux
./setup.sh

# Windows
setup.bat
```

### Apple Silicon (M1/M2/M3)

The FBX2glTF binary is x64-only. Install Rosetta 2 to run it:

```bash
softwareupdate --install-rosetta --agree-to-license
```

### Manual binary download

If the script fails, download the binary from the [FBX2glTF releases page](https://github.com/facebookincubator/FBX2glTF/releases/tag/v0.9.7) and place it in the project directory:

| Platform | Binary filename |
|---|---|
| macOS | `FBX2glTF-darwin-x64` |
| Windows | `FBX2glTF-windows-x64.exe` |
| Linux | `FBX2glTF-linux-x64` |

## Usage

### Single file

`-o` is optional. If omitted, the output is saved in the same directory as the input with the same filename and a `.vrma` extension.

```bash
# Output saved as input.vrma in the same directory
node fbx2vrma-converter.js -i input.fbx

# Output saved as input.vrma in the specified directory
node fbx2vrma-converter.js -i input.fbx -o ./output/

# Output saved with an explicit filename
node fbx2vrma-converter.js -i input.fbx -o ./output/animation.vrma
```

### Batch conversion

Specify a directory for `-i` to convert all FBX files at once. `-o` defaults to the input directory if omitted.

```bash
node fbx2vrma-converter.js -i ./FBX/ -o ./VRMA/
```

Output filenames are derived from the input filenames (`Walk.fbx` → `Walk.vrma`).

### Loop trimming

Trim points are specified in seconds, matching glTF animation sampler time units. The converter shifts the trimmed in point to time `0` and excludes the exact out point to avoid duplicating the loop pose.

```bash
node fbx2vrma-converter.js -i input.fbx -o loop.vrma --trim-in 1.25 --trim-out 3.75
```

If you are choosing loop points in an editor such as Blender, you can specify frame numbers instead. Frame numbers are converted to seconds using the input FBX framerate detected from `GlobalSettings.TimeMode`, or `CustomFrameRate` when the FBX uses a custom time mode.

```bash
node fbx2vrma-converter.js -i input.fbx -o loop.vrma --trim-in-frame 45 --trim-out-frame 120
```

Use `--loop-smoothing` to blend the tail of the clip toward the first pose. When smoothing is enabled, the converter ensures a sample exists one source-FBX frame before the out point, adding it only if necessary, but still does not include the exact out pose.

```bash
node fbx2vrma-converter.js -i input.fbx -o loop.vrma --trim-in 1.25 --trim-out 3.75 --loop-smoothing 0.25
```

### Animation framerate

FBX source framerate detection is default-on. The converter reads `GlobalSettings.TimeMode` from the input FBX, uses `CustomFrameRate` for custom time mode, and passes the matching bake option to FBX2glTF:

| Detected source fps | FBX2glTF argument |
|---:|---|
| `24` | `--anim-framerate bake24` |
| `30` | `--anim-framerate bake30` |
| `60` | `--anim-framerate bake60` |

If the detected source framerate is not supported by FBX2glTF baking, conversion fails with a message like `Detected FBX framerate 25 fps is not supported by FBX2glTF animation baking. Re-run with --bake-framerate <24|30|60>.`

Use `--bake-framerate <24|30|60>` only when you need to override the detected bake rate or when the detected source framerate is unsupported. Frame trim arguments still use the detected input FBX framerate when available.

### Options

| Option | Description | Default |
|---|---|---|
| `-i, --input <path>` | Input FBX file or directory (required) | — |
| `-o, --output <path>` | Output VRMA file or directory | Same directory as input |
| `--fbx2gltf <path>` | Path to FBX2glTF binary | Auto-detected by OS |
| `--bake-framerate <fps>` | Override FBX2glTF baked animation framerate; supported values are `24`, `30`, and `60` | Detected from input FBX |
| `--trim-in <seconds>` | Trim start time; shifted to output time `0` | — |
| `--trim-out <seconds>` | Trim end time; exact out pose is excluded | — |
| `--trim-in-frame <frame>` | Trim start frame, converted with the detected input FBX framerate | — |
| `--trim-out-frame <frame>` | Trim end frame, converted with the detected input FBX framerate; exact out pose is excluded | — |
| `--loop-smoothing <seconds>` | Blend tail samples toward the first pose over this duration | `0` |
| `--no-shift-hip-origin` | Disable shifting hips world X/Z so the reference frame starts at the origin without changing world Y altitude | Enabled |
| `--bone-profile <name>` | Bone mapping profile to use | `default` |
| `--apply-corrections <path>` | Apply rest-pose correction JSON to matching humanoid rotation channels | — |
| `--apply-rest-pose <path>` | Overwrite mapped humanoid node rotations from a rest-pose JSON profile | — |
| `--dump-nodes <path>` | Write a glTF node hierarchy and animation-target report for mapping debug | — |
| `-V, --version` | Show version | — |
| `-h, --help` | Show help | — |

Available bone profiles:

- `default` / `mixamo`: Mixamo bone names, with or without the `mixamorig:` prefix
- `auto`: Score the glTF node names against every concrete profile and use the best match
- `mimem-unity`: Mimem.ai Unity-style export names
- `sj-mizuki`: SJ_A-002_MIZUKI-style Mixamo-like names with `Spine3` mapped as `upperChest`

The converter logs the selected bone mapping profile at the start of each conversion, including whether it came from the default profile or an explicit `--bone-profile` argument:

```text
Bone mapping profile: mixamo (resolved to mixamo); reason: default profile
Bone mapping profile: mimem-unity (resolved to mimem-unity); reason: explicit --bone-profile unity-style
Bone mapping profile: sj-mizuki (resolved to sj-mizuki); reason: auto-selected best match (52 unique bones, 53 matched nodes, 0 unmatched bone-like nodes; scores: sj-mizuki=5253, mixamo=5242, mimem-unity=-530)
```

`auto` is opt-in. If no `--bone-profile` is passed, the converter uses `default`, not best-fit detection.

### Debugging bone mappings

Use `--dump-nodes` to inspect every glTF node after FBX2glTF conversion. The report includes node index, name, parent, children, mapped VRM bone, animation channels, transform fields, mesh, and skin.

```bash
node fbx2vrma-converter.js -i input.fbx --dump-nodes nodes.txt
```

### Correction And Modification Passes

Bone mapping uses `--bone-profile` or the `default` profile when no profile is passed. The other correction and modification passes are explicit unless noted below.

Default-on passes:

- `--no-shift-hip-origin` disables the default hip-origin shift. When enabled, the converter shifts hips world X/Z so the reference sample starts at horizontal origin while preserving world Y altitude. If trim-in is specified, that trimmed first sample is used as the reference; otherwise the second sample is used because the first frame may be exceptional.
- VRMA compliance filtering always removes scale animation channels on humanoid bones and translation animation channels on humanoid bones other than `hips`.
- VRMA node cleanup always strips non-animation scene attachments from output nodes. Output nodes keep only `name`, `children`, `translation`, and `rotation`.
- Ancestor-transform reporting always logs non-humanoid parent/wrapper nodes that affect mapped humanoid world transforms. These nodes can affect the final world position or rotation through static translation/rotation/scale/matrix values or through animation channels targeting the wrapper node.

Opt-in passes:

- `--apply-corrections <path>` applies rotation offsets to animation keyframes. It never runs unless this argument is passed, and it does not inspect animation data to infer corrections.
- `--apply-rest-pose <path>` overwrites static humanoid node rotations from a rest-pose profile. It never runs unless this argument is passed, and it does not modify animation keyframes.
- `--loop-smoothing <seconds>` blends tail samples toward the first pose over the requested window. It only runs when set to a value greater than `0`.
- `--trim-in`, `--trim-out`, `--trim-in-frame`, and `--trim-out-frame` trim sampler data and shift the trim-in point to output time `0`. They only run when trim arguments are provided.

When correction files are applied, the converter prints a summary:

- `Applied correction file to N rotation sampler(s): ...`
- `Applied rest-pose rotations to N humanoid node(s)`
- unmatched correction/rest-pose keys are reported with `Skipped N unmatched ...`

When wrapper nodes affect mapped humanoid bones, the converter prints entries like:

```text
Non-humanoid ancestor nodes affecting humanoid world transforms (1):
  [1] Armature: T=[1,2,3]; animated=Walk:rotation; affects 52 bone(s): hips, spine, chest, ...
```

Use this report to account for transforms outside the humanoid bones themselves. Identity wrapper nodes without animation are not listed.

Apply a reviewed correction JSON during conversion. The file can either contain a `corrections` array or a per-VRM-bone `bones` object such as `vrm_bone_rotation_offsets.example.json` or `vrm_bone_euler_offsets.example.json`.

```bash
node fbx2vrma-converter.js -i input.fbx -o output.vrma --bone-profile mimem-unity --apply-corrections corrections.json
```

`--apply-corrections` supports two config shapes:

```json
{
  "corrections": [
    {
      "vrmBone": "leftUpperArm",
      "localPostCorrectionQuaternion": [0, 0, 0, 1]
    }
  ]
}
```

or:

```json
{
  "rotationFormat": "euler_xyz_degrees",
  "bones": {
    "leftUpperArm": [-10, 0, 0]
  }
}
```

Corrections can be keyed by `vrmBone`, `hierarchyPath`, or unique `nodeName` in the `corrections` array form. Per-bone `bones` configs are keyed by VRM bone name. Supported `rotationFormat` values for animation corrections are `"quaternion_xyzw"`, `"quaternion_wxyz"`, and `"euler_xyz_degrees"`. Euler entries are `[xDegrees, yDegrees, zDegrees]`. Set `"invert": true` or `"application": "inversePostMultiplyAnimation"` to apply the inverse of the listed rotations.

Apply a rest-pose profile to overwrite static humanoid node rotations without changing animation keyframes:

```bash
node fbx2vrma-converter.js -i input.fbx -o output.vrma --bone-profile mimem-unity --apply-rest-pose mimem_unity_rest_pose.mimem_in_t_pose.json
```

Rest-pose profiles are keyed by VRM bone name and support `"rotationFormat": "quaternion_xyzw"` or `"quaternion_wxyz"`:

```json
{
  "type": "vrma-rest-pose-profile",
  "boneProfile": "mimem-unity",
  "rotationFormat": "quaternion_xyzw",
  "bones": {
    "rightUpperArm": {
      "nodeName": "arm_stretch.r",
      "rotation": [0, 0, 0, 1]
    }
  }
}
```

To regenerate a rest-pose profile from an updated golden FBX, first convert that FBX without applying an existing rest-pose profile:

```bash
node fbx2vrma-converter.js -i golden_pose.fbx -o golden_pose.vrma --bone-profile mimem-unity --no-shift-hip-origin
```

Then extract the mapped humanoid static node rotations from the generated VRMA:

```bash
node - <<'NODE'
const fs = require('fs');
const input = 'golden_pose.vrma';
const output = 'mimem_unity_rest_pose.golden_pose.json';

function readGlbJson(file) {
  const buffer = fs.readFileSync(file);
  let offset = 12;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.toString('utf8', offset + 4, offset + 8);
    offset += 8;
    if (type === 'JSON') {
      return JSON.parse(buffer.slice(offset, offset + length).toString('utf8').trim());
    }
    offset += length;
  }
  throw new Error('No JSON chunk found');
}

const gltf = readGlbJson(input);
const humanBones = gltf.extensions?.VRMC_vrm_animation?.humanoid?.humanBones;
if (!humanBones) throw new Error('No VRMC_vrm_animation humanoid bones found');

const bones = {};
for (const [vrmBone, binding] of Object.entries(humanBones).sort(([a], [b]) => a.localeCompare(b))) {
  const node = gltf.nodes?.[binding.node];
  if (!node) continue;
  bones[vrmBone] = {
    nodeName: node.name || null,
    nodeIndex: binding.node,
    rotation: node.rotation ? node.rotation.map(value => Number(value.toFixed(9))) : [0, 0, 0, 1],
  };
}

fs.writeFileSync(output, `${JSON.stringify({
  type: 'vrma-rest-pose-profile',
  source: input,
  boneProfile: 'mimem-unity',
  rotationFormat: 'quaternion_xyzw',
  description: `Static humanoid node rotations extracted from ${input}.`,
  bones,
}, null, 2)}\n`);
console.log(`Wrote ${output} with ${Object.keys(bones).length} bones`);
NODE
```

## How it works

1. Detect the input FBX framerate from `GlobalSettings.TimeMode` / `CustomFrameRate`
2. Convert FBX → glTF using FBX2glTF with a matching `--anim-framerate bake24`, `bake30`, or `bake60`
3. Embed binary buffer as base64
4. Optionally trim animation samplers and apply loop smoothing
5. Shift hips world X/Z to origin unless disabled
6. Analyze animation timing (duration, frame count)
7. Map source bone names to VRM humanoid bone names
8. Optionally apply animation rotation corrections and static rest-pose rotations
9. Filter channels that violate VRMA spec (scale on humanoid bones, translation on non-hips bones)
10. Strip non-animation scene attachments from nodes
11. Output as GLB binary

## Bone mapping

The converter maps 52 Mixamo bones to the VRM 1.0 humanoid specification.

**Body (22 bones)**

| Mixamo | VRM |
|---|---|
| `mixamorig:Hips` | `hips` |
| `mixamorig:Spine` | `spine` |
| `mixamorig:Spine1` | `chest` |
| `mixamorig:Spine2` | `upperChest` |
| `mixamorig:Neck` | `neck` |
| `mixamorig:Head` | `head` |
| `mixamorig:LeftShoulder` / `RightShoulder` | `leftShoulder` / `rightShoulder` |
| `mixamorig:LeftArm` / `RightArm` | `leftUpperArm` / `rightUpperArm` |
| `mixamorig:LeftForeArm` / `RightForeArm` | `leftLowerArm` / `rightLowerArm` |
| `mixamorig:LeftHand` / `RightHand` | `leftHand` / `rightHand` |
| `mixamorig:LeftUpLeg` / `RightUpLeg` | `leftUpperLeg` / `rightUpperLeg` |
| `mixamorig:LeftLeg` / `RightLeg` | `leftLowerLeg` / `rightLowerLeg` |
| `mixamorig:LeftFoot` / `RightFoot` | `leftFoot` / `rightFoot` |
| `mixamorig:LeftToeBase` / `RightToeBase` | `leftToes` / `rightToes` |

**Fingers (30 bones)**

Each hand has 15 bones covering thumb, index, middle, ring, and little fingers (proximal / intermediate / distal), mapped to the corresponding VRM 1.0 names (e.g. `leftThumbMetacarpal`, `rightIndexDistal`).

## Output format

- **Format**: GLB binary (standard glTF 2.0 binary container)
- **Extension**: `VRMC_vrm_animation` v1.0
- **Compatible with**: VRoid Hub, @pixiv/three-vrm-animation v3.4.1+, Three.js r177+

## Testing

```bash
npm test
```

Runs 30 unit tests covering bone mapping, animation channel filtering, GLB output, output path resolution, batch conversion, and input validation.

## Project structure

```
fbx2vrma-converter/
├── fbx2vrma-converter.js   # Main converter
├── test.js                 # Unit tests
├── scripts/
│   └── postinstall.js      # Skips setup if binary already exists
├── setup.sh                # FBX2glTF download script (macOS/Linux)
├── setup.bat               # FBX2glTF download script (Windows)
├── package.json
├── LICENSE
└── .gitignore
```

## License

MIT — see [LICENSE](LICENSE) for details.

## Acknowledgments

- [FBX2glTF](https://github.com/facebookincubator/FBX2glTF) — FBX to glTF conversion
- [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) — VRM support for Three.js
- [Mixamo](https://www.mixamo.com/) — Animation source

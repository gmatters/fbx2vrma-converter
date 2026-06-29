#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { Command } = require('commander');

function getDefaultBinaryName() {
  const platform = os.platform(); // 'darwin' | 'linux' | 'win32'
  const arch = os.arch();         // 'x64' | 'arm64' etc.

  if (platform === 'win32') {
    return 'FBX2glTF-windows-x64.exe';
  }
  if (platform === 'linux') {
    return 'FBX2glTF-linux-x64';
  }
  // darwin: use x64 binary via Rosetta 2 even on arm64
  return 'FBX2glTF-darwin-x64';
}

const COMPONENT_TYPE_FLOAT = 5126;
const ACCESSOR_COMPONENTS = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};

const MIXAMO_BONE_MAPPING = {
  'mixamorig:Hips': 'hips',
  'mixamorig:Spine': 'spine',
  'mixamorig:Spine1': 'chest',
  'mixamorig:Spine2': 'upperChest',
  'mixamorig:Neck': 'neck',
  'mixamorig:Head': 'head',
  'mixamorig:LeftShoulder': 'leftShoulder',
  'mixamorig:LeftArm': 'leftUpperArm',
  'mixamorig:LeftForeArm': 'leftLowerArm',
  'mixamorig:LeftHand': 'leftHand',
  'mixamorig:RightShoulder': 'rightShoulder',
  'mixamorig:RightArm': 'rightUpperArm',
  'mixamorig:RightForeArm': 'rightLowerArm',
  'mixamorig:RightHand': 'rightHand',
  'mixamorig:LeftUpLeg': 'leftUpperLeg',
  'mixamorig:LeftLeg': 'leftLowerLeg',
  'mixamorig:LeftFoot': 'leftFoot',
  'mixamorig:RightUpLeg': 'rightUpperLeg',
  'mixamorig:RightLeg': 'rightLowerLeg',
  'mixamorig:RightFoot': 'rightFoot',
  'mixamorig:LeftToeBase': 'leftToes',
  'mixamorig:RightToeBase': 'rightToes',

  // Left hand finger bones (Mixamo -> VRM 1.0)
  'mixamorig:LeftHandThumb1':  'leftThumbMetacarpal',
  'mixamorig:LeftHandThumb2':  'leftThumbProximal',
  'mixamorig:LeftHandThumb3':  'leftThumbDistal',
  'mixamorig:LeftHandIndex1':  'leftIndexProximal',
  'mixamorig:LeftHandIndex2':  'leftIndexIntermediate',
  'mixamorig:LeftHandIndex3':  'leftIndexDistal',
  'mixamorig:LeftHandMiddle1': 'leftMiddleProximal',
  'mixamorig:LeftHandMiddle2': 'leftMiddleIntermediate',
  'mixamorig:LeftHandMiddle3': 'leftMiddleDistal',
  'mixamorig:LeftHandRing1':   'leftRingProximal',
  'mixamorig:LeftHandRing2':   'leftRingIntermediate',
  'mixamorig:LeftHandRing3':   'leftRingDistal',
  'mixamorig:LeftHandPinky1':  'leftLittleProximal',
  'mixamorig:LeftHandPinky2':  'leftLittleIntermediate',
  'mixamorig:LeftHandPinky3':  'leftLittleDistal',

  // Right hand finger bones (Mixamo -> VRM 1.0)
  'mixamorig:RightHandThumb1':  'rightThumbMetacarpal',
  'mixamorig:RightHandThumb2':  'rightThumbProximal',
  'mixamorig:RightHandThumb3':  'rightThumbDistal',
  'mixamorig:RightHandIndex1':  'rightIndexProximal',
  'mixamorig:RightHandIndex2':  'rightIndexIntermediate',
  'mixamorig:RightHandIndex3':  'rightIndexDistal',
  'mixamorig:RightHandMiddle1': 'rightMiddleProximal',
  'mixamorig:RightHandMiddle2': 'rightMiddleIntermediate',
  'mixamorig:RightHandMiddle3': 'rightMiddleDistal',
  'mixamorig:RightHandRing1':   'rightRingProximal',
  'mixamorig:RightHandRing2':   'rightRingIntermediate',
  'mixamorig:RightHandRing3':   'rightRingDistal',
  'mixamorig:RightHandPinky1':  'rightLittleProximal',
  'mixamorig:RightHandPinky2':  'rightLittleIntermediate',
  'mixamorig:RightHandPinky3':  'rightLittleDistal',
};

const SJ_MIZUKI_BONE_MAPPING = {
  ...MIXAMO_BONE_MAPPING,
  'mixamorig:Spine3': 'upperChest',
};

const MIMEM_UNITY_BONE_MAPPING = {
  'root.x': 'hips',
  'spine_01.x': 'spine',
  'spine_02.x': 'chest',
  'spine_03.x': 'upperChest',
  'neck.x': 'neck',
  'head.x': 'head',

  'shoulder.l': 'leftShoulder',
  'arm_stretch.l': 'leftUpperArm',
  'forearm_stretch.l': 'leftLowerArm',
  'hand.l': 'leftHand',
  'thigh_stretch.l': 'leftUpperLeg',
  'leg_stretch.l': 'leftLowerLeg',
  'foot.l': 'leftFoot',
  'toes_01.l': 'leftToes',

  'shoulder.r': 'rightShoulder',
  'arm_stretch.r': 'rightUpperArm',
  'forearm_stretch.r': 'rightLowerArm',
  'hand.r': 'rightHand',
  'thigh_stretch.r': 'rightUpperLeg',
  'leg_stretch.r': 'rightLowerLeg',
  'foot.r': 'rightFoot',
  'toes_01.r': 'rightToes',

  'c_thumb1.l': 'leftThumbMetacarpal',
  'c_thumb2.l': 'leftThumbProximal',
  'c_thumb3.l': 'leftThumbDistal',
  'c_index1.l': 'leftIndexProximal',
  'c_index2.l': 'leftIndexIntermediate',
  'c_index3.l': 'leftIndexDistal',
  'c_middle1.l': 'leftMiddleProximal',
  'c_middle2.l': 'leftMiddleIntermediate',
  'c_middle3.l': 'leftMiddleDistal',
  'c_ring1.l': 'leftRingProximal',
  'c_ring2.l': 'leftRingIntermediate',
  'c_ring3.l': 'leftRingDistal',
  'c_pinky1.l': 'leftLittleProximal',
  'c_pinky2.l': 'leftLittleIntermediate',
  'c_pinky3.l': 'leftLittleDistal',

  'c_thumb1.r': 'rightThumbMetacarpal',
  'c_thumb2.r': 'rightThumbProximal',
  'c_thumb3.r': 'rightThumbDistal',
  'c_index1.r': 'rightIndexProximal',
  'c_index2.r': 'rightIndexIntermediate',
  'c_index3.r': 'rightIndexDistal',
  'c_middle1.r': 'rightMiddleProximal',
  'c_middle2.r': 'rightMiddleIntermediate',
  'c_middle3.r': 'rightMiddleDistal',
  'c_ring1.r': 'rightRingProximal',
  'c_ring2.r': 'rightRingIntermediate',
  'c_ring3.r': 'rightRingDistal',
  'c_pinky1.r': 'rightLittleProximal',
  'c_pinky2.r': 'rightLittleIntermediate',
  'c_pinky3.r': 'rightLittleDistal',
};

function parseOptionalNumber(value, name) {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${name} must be a number`);
  }
  return number;
}

class FBXToVRMAConverterFixed {
  constructor({ parse = false } = {}) {
    this.program = new Command();
    this.setupCommands(parse);
    this.boneMappingProfiles = {
      mixamo: {
        aliases: ['auto'],
        mapping: MIXAMO_BONE_MAPPING,
        normalizeName: name => name && (name.startsWith('mixamorig:') ? name : `mixamorig:${name}`),
      },
      'mimem-unity': {
        aliases: ['mimem_unity', 'unity-style', 'unity'],
        mapping: MIMEM_UNITY_BONE_MAPPING,
      },
      'sj-mizuki': {
        aliases: ['sj_mizuki', 'mizuki'],
        mapping: SJ_MIZUKI_BONE_MAPPING,
        normalizeName: name => name && (name.startsWith('mixamorig:') ? name : `mixamorig:${name}`),
      },
    };
    this.boneProfileName = 'auto';
    this.humanoidBoneMapping = MIXAMO_BONE_MAPPING;
  }

  setupCommands(parse) {
    this.program
      .name('fbx-to-vrma-converter-fixed')
      .description('Convert FBX to VRMA with improved animation timing (Fixed Version)')
      .version('1.0.0')
      .requiredOption('-i, --input <path>', 'Input FBX file path')
      .option('-o, --output <path>', 'Output VRMA file path (default: same name as input with .vrma extension)')
      .option('--fbx2gltf <path>', 'Path to FBX2glTF binary', `./${getDefaultBinaryName()}`)
      .option('--framerate <fps>', 'Animation framerate', '30')
      .option('--trim-in <seconds>', 'Trim start time in seconds')
      .option('--trim-out <seconds>', 'Trim end time in seconds')
      .option('--trim-in-frame <frame>', 'Trim start frame, converted to seconds using --framerate')
      .option('--trim-out-frame <frame>', 'Trim end frame, converted to seconds using --framerate')
      .option('--loop-smoothing <seconds>', 'Blend this many seconds before the loop point toward the first pose', '0')
      .option('--no-shift-hip-origin', 'Disable shifting hip translation X/Z so the animation starts at the origin')
      .option('--bone-profile <name>', 'Bone mapping profile to use', 'auto')
      .option('--apply-corrections <path>', 'Apply rest-pose correction JSON to matching humanoid rotation channels')
      .option('--apply-rest-pose <path>', 'Apply static humanoid node rotations from a rest-pose JSON profile')
      .option('--dump-nodes <path>', 'Write a glTF node hierarchy and animation-target report');

    if (parse) {
      this.program.parse();
    }
  }

  async convert(inputPath, outputPath, fbx2gltfPath, framerate, trimOptions = {}, debugOptions = {}, mappingOptions = {}) {
    // Declared outside try so it's accessible in finally
    const tempGltfPath = path.join(path.dirname(outputPath), `temp_${Date.now()}.gltf`);
    try {
      // Check input file existence
      if (!await fs.pathExists(inputPath)) {
        throw new Error(`Input FBX file not found: ${inputPath}`);
      }

      // Check FBX2glTF binary existence
      const fbx2gltfFullPath = path.resolve(fbx2gltfPath);
      if (!await fs.pathExists(fbx2gltfFullPath)) {
        throw new Error(`FBX2glTF binary not found: ${fbx2gltfFullPath}\nRun 'npm run setup' to download it.`);
      }

      console.log(`Converting ${inputPath} to ${outputPath}...`);
      this.setBoneProfile(mappingOptions.boneProfile || 'auto');
      const correctionData = await this.loadCorrectionData(mappingOptions);
      const restPoseData = await this.loadRestPoseData(mappingOptions);

      // Step 1: Convert FBX to glTF (JSON + embedded)
      await this.convertFBXToGLTF(inputPath, tempGltfPath, fbx2gltfPath);

      // Step 2: Load glTF file
      const gltfData = await fs.readJson(tempGltfPath);

      if (debugOptions.dumpNodes) {
        await this.dumpNodes(gltfData, debugOptions.dumpNodes);
      }

      // Step 3: Embed binary data
      const embeddedGltfData = await this.embedBinaryData(gltfData, path.dirname(tempGltfPath));

      // Step 4: Trim animation data before timing metadata is calculated
      const trimmedGltfData = this.trimAnimationData(embeddedGltfData, trimOptions);

      // Step 5: Shift hip locomotion to begin at X/Z origin unless explicitly disabled
      const originShiftedGltfData = this.shiftHipTranslationXZToOrigin(trimmedGltfData, {
        enabled: mappingOptions.shiftHipOrigin !== false,
        useTrimInPoint: this.hasTrimInOption(trimOptions),
      });

      // Step 6: Analyze and enhance animation timing
      const enhancedGltfData = this.enhanceAnimationTiming(originShiftedGltfData, parseInt(framerate));

      // Step 7: Convert to VRMA format
      const vrmaData = this.convertToVRMAWithTiming(enhancedGltfData, { correctionData, restPoseData });

      // Step 8: Save VRMA as GLB binary
      await this.saveAsGLB(vrmaData, outputPath);

      console.log(`Successfully converted to ${outputPath}`);
      return true;
    } catch (error) {
      console.error('Conversion failed:', error.message);
      return false;
    } finally {
      // Step 9: Clean up temp files regardless of errors
      await this.cleanupTempFiles([tempGltfPath]);
    }
  }

  async convertFBXToGLTF(inputPath, outputPath, fbx2gltfPath) {
    const fbx2gltfFullPath = path.resolve(fbx2gltfPath);
    const outputDir = path.dirname(outputPath);
    const outputName = path.basename(outputPath, '.gltf');

    // Run FBX2glTF with embedded output
    const args = ['-i', inputPath, '-o', path.join(outputDir, outputName), '--embed'];
    console.log(`Executing: ${fbx2gltfFullPath} ${args.join(' ')}`);

    try {
      execFileSync(fbx2gltfFullPath, args, { stdio: 'pipe' });

      const actualOutputPath = path.join(outputDir, `${outputName}_out`, `${outputName}.gltf`);
      if (await fs.pathExists(actualOutputPath)) {
        await fs.move(actualOutputPath, outputPath);
        // Remove temp directory
        await fs.remove(path.join(outputDir, `${outputName}_out`));
      }
    } catch (error) {
      // Fall back to normal conversion if embed fails
      console.log('Embed failed, trying normal conversion...');
      await this.convertFBXToGLTFNormal(inputPath, outputPath, fbx2gltfPath);
    }
  }

  async convertFBXToGLTFNormal(inputPath, outputPath, fbx2gltfPath) {
    const fbx2gltfFullPath = path.resolve(fbx2gltfPath);
    const outputDir = path.dirname(outputPath);
    const outputName = path.basename(outputPath, '.gltf');

    const args = ['-i', inputPath, '-o', path.join(outputDir, outputName)];

    try {
      execFileSync(fbx2gltfFullPath, args, { stdio: 'pipe' });

      const actualOutputPath = path.join(outputDir, `${outputName}_out`, `${outputName}.gltf`);
      if (await fs.pathExists(actualOutputPath)) {
        await fs.move(actualOutputPath, outputPath);
        // Move the .bin file as well
        const actualBinPath = path.join(outputDir, `${outputName}_out`, 'buffer.bin');
        const targetBinPath = path.join(outputDir, `${outputName}.bin`);
        if (await fs.pathExists(actualBinPath)) {
          await fs.move(actualBinPath, targetBinPath);
        }
        // Remove temp directory
        await fs.remove(path.join(outputDir, `${outputName}_out`));
      }
    } catch (error) {
      throw new Error(`FBX2glTF conversion failed: ${error.message}`);
    }
  }

  enhanceAnimationTiming(gltfData, framerate) {
    console.log('Enhancing animation timing data...');

    if (!gltfData.animations || gltfData.animations.length === 0) {
      console.log('No animations found');
      return gltfData;
    }

    // Calculate detailed animation duration
    let maxDuration = 0;

    gltfData.animations.forEach((animation, animIndex) => {
      console.log(`Processing animation ${animIndex}: ${animation.name}`);

      if (animation.samplers && gltfData.accessors) {
        animation.samplers.forEach((sampler, samplerIndex) => {
          if (sampler.input !== undefined && gltfData.accessors[sampler.input]) {
            const timeAccessor = gltfData.accessors[sampler.input];

            // Analyze time accessor data
            if (timeAccessor.type === 'SCALAR' && timeAccessor.max && timeAccessor.max.length > 0) {
              const endTime = timeAccessor.max[0];
              if (endTime > maxDuration) {
                maxDuration = endTime;
              }

              console.log(`  Sampler ${samplerIndex}: ${timeAccessor.count} frames, max time: ${endTime}s`);
            }
          }
        });
      }
    });

    console.log(`Calculated max animation duration: ${maxDuration} seconds`);

    // Inject additional metadata for VRM animation
    if (!gltfData.extras) {
      gltfData.extras = {};
    }

    gltfData.extras.animationMetadata = {
      maxDuration: maxDuration,
      framerate: framerate,
      frameCount: Math.ceil(maxDuration * framerate),
      calculatedAt: new Date().toISOString()
    };

    return gltfData;
  }

  async embedBinaryData(gltfData, gltfDir) {
    if (!gltfData.buffers || gltfData.buffers.length === 0) {
      console.log('No buffers to embed');
      return gltfData;
    }

    for (let i = 0; i < gltfData.buffers.length; i++) {
      const buffer = gltfData.buffers[i];

      if (buffer.uri && !buffer.uri.startsWith('data:')) {
        // External file reference
        const bufferPath = path.join(gltfDir, buffer.uri);

        if (await fs.pathExists(bufferPath)) {
          const bufferData = await fs.readFile(bufferPath);
          const base64Data = bufferData.toString('base64');
          const dataUri = `data:application/octet-stream;base64,${base64Data}`;

          gltfData.buffers[i].uri = dataUri;
          console.log(`Embedded buffer: ${buffer.uri} (${bufferData.length} bytes)`);
        } else {
          console.warn(`Buffer file not found: ${buffer.uri}`);
        }
      }
    }

    return gltfData;
  }

  async dumpNodes(gltfData, outputPath) {
    const report = this.formatNodeDump(gltfData);
    await fs.outputFile(outputPath, report);
    console.log(`Wrote node dump: ${outputPath}`);
  }

  formatNodeDump(gltfData) {
    const nodes = gltfData.nodes || [];
    const parents = new Map();
    nodes.forEach((node, index) => {
      (node.children || []).forEach(childIndex => parents.set(childIndex, index));
    });

    const animatedPaths = new Map();
    (gltfData.animations || []).forEach((animation, animationIndex) => {
      (animation.channels || []).forEach(channel => {
        const nodeIndex = channel.target?.node;
        if (nodeIndex === undefined) return;
        if (!animatedPaths.has(nodeIndex)) animatedPaths.set(nodeIndex, []);
        animatedPaths.get(nodeIndex).push(`${animation.name || `Animation${animationIndex}`}:${channel.target?.path || 'unknown'}`);
      });
    });

    const roots = nodes
      .map((_, index) => index)
      .filter(index => !parents.has(index));
    const lines = [
      `Node count: ${nodes.length}`,
      `Scene roots: ${roots.join(', ') || '(none)'}`,
      '',
    ];

    const writeNode = (index, depth = 0) => {
      const node = nodes[index];
      if (!node) return;
      const indent = '  '.repeat(depth);
      const parentIndex = parents.has(index) ? parents.get(index) : 'none';
      const mappedBone = this.getVRMBoneName(node.name) || 'unmapped';
      const animated = animatedPaths.get(index)?.join(', ') || 'no';
      const transformFlags = [
        node.translation ? 'T' : null,
        node.rotation ? 'R' : null,
        node.scale ? 'S' : null,
        node.matrix ? 'M' : null,
      ].filter(Boolean).join('') || 'none';
      const childList = (node.children || []).join(', ') || 'none';

      lines.push(`${indent}[${index}] ${node.name || '(unnamed)'}`);
      lines.push(`${indent}  parent: ${parentIndex}; children: ${childList}; mapped: ${mappedBone}; animated: ${animated}; transforms: ${transformFlags}; mesh: ${node.mesh ?? 'none'}; skin: ${node.skin ?? 'none'}`);
      (node.children || []).forEach(childIndex => writeNode(childIndex, depth + 1));
    };

    roots.forEach(rootIndex => writeNode(rootIndex));

    const unreachable = nodes
      .map((_, index) => index)
      .filter(index => !roots.includes(index) && !parents.has(index));
    if (unreachable.length > 0) {
      lines.push('');
      lines.push(`Unreachable/non-parented nodes: ${unreachable.join(', ')}`);
    }

    return `${lines.join('\n')}\n`;
  }

  trimAnimationData(gltfData, options = {}) {
    const trimIn = parseOptionalNumber(options.trimIn, '--trim-in');
    const trimOut = parseOptionalNumber(options.trimOut, '--trim-out');
    const trimInFrame = parseOptionalNumber(options.trimInFrame, '--trim-in-frame');
    const trimOutFrame = parseOptionalNumber(options.trimOutFrame, '--trim-out-frame');
    const loopSmoothing = parseOptionalNumber(options.loopSmoothing, '--loop-smoothing') ?? 0;
    const framerate = parseOptionalNumber(options.framerate, '--framerate') ?? 30;
    const usesSeconds = trimIn !== undefined || trimOut !== undefined;
    const usesFrames = trimInFrame !== undefined || trimOutFrame !== undefined;

    if (!usesSeconds && !usesFrames) {
      return gltfData;
    }
    if (usesSeconds && usesFrames) {
      throw new Error('Use either seconds trim options or frame trim options, not both');
    }
    if (trimIn !== undefined && trimIn < 0) {
      throw new Error('--trim-in must be greater than or equal to 0');
    }
    if (trimOut !== undefined && trimOut <= 0) {
      throw new Error('--trim-out must be greater than 0');
    }
    if (trimIn !== undefined && trimOut !== undefined && trimOut <= trimIn) {
      throw new Error('--trim-out must be greater than --trim-in');
    }
    if (loopSmoothing < 0) {
      throw new Error('--loop-smoothing must be greater than or equal to 0');
    }
    if (framerate <= 0) {
      throw new Error('--framerate must be greater than 0');
    }
    if (trimInFrame !== undefined && trimInFrame < 0) {
      throw new Error('--trim-in-frame must be greater than or equal to 0');
    }
    if (trimOutFrame !== undefined && trimOutFrame <= 0) {
      throw new Error('--trim-out-frame must be greater than 0');
    }
    if (trimInFrame !== undefined && trimOutFrame !== undefined && trimOutFrame <= trimInFrame) {
      throw new Error('--trim-out-frame must be greater than --trim-in-frame');
    }
    if (!gltfData.animations?.length) {
      return gltfData;
    }

    const start = usesFrames ? (trimInFrame ?? 0) / framerate : (trimIn ?? 0);
    const fallbackEnd = this.getAnimationDuration(gltfData);
    const end = usesFrames
      ? (trimOutFrame !== undefined ? trimOutFrame / framerate : fallbackEnd)
      : (trimOut ?? fallbackEnd);
    if (!(end > start)) {
      throw new Error('Trim range must have a positive duration');
    }

    console.log(`Trimming animations: ${start}s to ${end}s${loopSmoothing > 0 ? `, smoothing ${loopSmoothing}s` : ''}`);

    const buffers = this.decodeBuffers(gltfData);
    for (const animation of gltfData.animations) {
      for (const sampler of animation.samplers || []) {
        this.trimSampler(gltfData, buffers, sampler, start, end, loopSmoothing, framerate);
      }
    }
    this.encodeBuffers(gltfData, buffers);
    return gltfData;
  }

  hasTrimInOption(options = {}) {
    return options.trimIn !== undefined || options.trimInFrame !== undefined;
  }

  shiftHipTranslationXZToOrigin(gltfData, options = {}) {
    if (options.enabled === false) return gltfData;
    if (!gltfData.animations?.length || !gltfData.buffers?.length) return gltfData;

    const hipNode = this.generateHumanBones(gltfData).hips?.node;
    if (hipNode === undefined) {
      console.log('Skipped hip origin shift: no hips bone mapped');
      return gltfData;
    }

    const referenceSampleIndex = options.useTrimInPoint ? 0 : 1;
    const buffers = this.decodeBuffers(gltfData);
    let shiftedSamplerCount = 0;

    for (const animation of gltfData.animations) {
      const shiftedSamplers = new Set();
      for (const channel of animation.channels || []) {
        if (channel.target?.node !== hipNode || channel.target?.path !== 'translation') {
          continue;
        }
        if (shiftedSamplers.has(channel.sampler)) {
          continue;
        }

        const sampler = animation.samplers?.[channel.sampler];
        const outputAccessor = gltfData.accessors?.[sampler?.output];
        if (!sampler || !outputAccessor || outputAccessor.type !== 'VEC3') {
          continue;
        }

        const translations = this.readAccessorElements(gltfData, buffers, sampler.output);
        if (translations.length === 0) {
          continue;
        }

        const selectedIndex = Math.min(referenceSampleIndex, translations.length - 1);
        const localOffset = this.getLocalOffsetForWorldHorizontalOrigin(gltfData, hipNode, translations[selectedIndex]);
        const shiftedTranslations = translations.map(([x, y, z]) => [
          x - localOffset[0],
          y - localOffset[1],
          z - localOffset[2],
        ]);
        sampler.output = this.appendAccessorData(gltfData, buffers, shiftedTranslations, {
          type: outputAccessor.type,
          componentType: outputAccessor.componentType,
        });
        shiftedSamplers.add(channel.sampler);
        shiftedSamplerCount++;
        console.log(`Shifted hips world X/Z to origin using sample ${selectedIndex}; local delta [${localOffset.map(value => value.toFixed(6)).join(', ')}]`);
      }
    }

    if (shiftedSamplerCount > 0) {
      this.encodeBuffers(gltfData, buffers);
    } else {
      console.log('Skipped hip origin shift: no hips translation channel found');
    }
    return gltfData;
  }

  getLocalOffsetForWorldHorizontalOrigin(gltfData, nodeIndex, localTranslation) {
    const parentLinear = this.getParentWorldLinearTransform(gltfData, nodeIndex);
    const worldPosition = this.multiplyMat3Vec3(parentLinear, localTranslation);
    const worldHorizontalOffset = [worldPosition[0], 0, worldPosition[2]];
    return this.multiplyMat3Vec3(this.invertMat3(parentLinear), worldHorizontalOffset);
  }

  getParentWorldLinearTransform(gltfData, nodeIndex) {
    const parents = this.getNodeParentMap(gltfData);
    const ancestorIndices = [];
    let current = parents.get(nodeIndex);
    while (current !== undefined) {
      ancestorIndices.push(current);
      current = parents.get(current);
    }

    return ancestorIndices.reverse().reduce(
      (matrix, ancestorIndex) => this.multiplyMat3(matrix, this.getNodeLocalLinearTransform(gltfData.nodes[ancestorIndex])),
      this.identityMat3()
    );
  }

  getNodeParentMap(gltfData) {
    const parents = new Map();
    (gltfData.nodes || []).forEach((node, index) => {
      (node.children || []).forEach(childIndex => parents.set(childIndex, index));
    });
    return parents;
  }

  getNodeLocalLinearTransform(node = {}) {
    if (Array.isArray(node.matrix) && node.matrix.length === 16) {
      return [
        node.matrix[0], node.matrix[4], node.matrix[8],
        node.matrix[1], node.matrix[5], node.matrix[9],
        node.matrix[2], node.matrix[6], node.matrix[10],
      ];
    }

    const rotation = node.rotation || [0, 0, 0, 1];
    const scale = node.scale || [1, 1, 1];
    const matrix = this.quaternionToMat3(rotation);
    return [
      matrix[0] * scale[0], matrix[1] * scale[1], matrix[2] * scale[2],
      matrix[3] * scale[0], matrix[4] * scale[1], matrix[5] * scale[2],
      matrix[6] * scale[0], matrix[7] * scale[1], matrix[8] * scale[2],
    ];
  }

  identityMat3() {
    return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  }

  quaternionToMat3(quaternion) {
    const [x, y, z, w] = this.normalizeQuat(quaternion);
    const xx = x * x;
    const yy = y * y;
    const zz = z * z;
    const xy = x * y;
    const xz = x * z;
    const yz = y * z;
    const wx = w * x;
    const wy = w * y;
    const wz = w * z;
    return [
      1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy),
      2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx),
      2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy),
    ];
  }

  multiplyMat3(a, b) {
    return [
      a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
      a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
      a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
      a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
      a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
      a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
      a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
      a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
      a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
    ];
  }

  multiplyMat3Vec3(matrix, vector) {
    return [
      matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2],
      matrix[3] * vector[0] + matrix[4] * vector[1] + matrix[5] * vector[2],
      matrix[6] * vector[0] + matrix[7] * vector[1] + matrix[8] * vector[2],
    ];
  }

  invertMat3(matrix) {
    const [
      a, b, c,
      d, e, f,
      g, h, i,
    ] = matrix;
    const cofactor00 = e * i - f * h;
    const cofactor01 = c * h - b * i;
    const cofactor02 = b * f - c * e;
    const cofactor10 = f * g - d * i;
    const cofactor11 = a * i - c * g;
    const cofactor12 = c * d - a * f;
    const cofactor20 = d * h - e * g;
    const cofactor21 = b * g - a * h;
    const cofactor22 = a * e - b * d;
    const determinant = a * cofactor00 + b * cofactor10 + c * cofactor20;
    if (Math.abs(determinant) < 1e-12) {
      throw new Error('Cannot shift hip origin through a non-invertible parent transform');
    }
    const invDeterminant = 1 / determinant;
    return [
      cofactor00 * invDeterminant, cofactor01 * invDeterminant, cofactor02 * invDeterminant,
      cofactor10 * invDeterminant, cofactor11 * invDeterminant, cofactor12 * invDeterminant,
      cofactor20 * invDeterminant, cofactor21 * invDeterminant, cofactor22 * invDeterminant,
    ];
  }

  getAnimationDuration(gltfData) {
    let maxDuration = 0;
    for (const animation of gltfData.animations || []) {
      for (const sampler of animation.samplers || []) {
        const accessor = gltfData.accessors?.[sampler.input];
        if (accessor?.type === 'SCALAR' && accessor.max?.length) {
          maxDuration = Math.max(maxDuration, accessor.max[0]);
        }
      }
    }
    return maxDuration;
  }

  trimSampler(gltfData, buffers, sampler, start, end, loopSmoothing, framerate) {
    if (sampler.input === undefined || sampler.output === undefined) return;
    if (sampler.interpolation === 'CUBICSPLINE') {
      throw new Error('Trimming CUBICSPLINE animation samplers is not currently supported');
    }

    const inputAccessor = gltfData.accessors[sampler.input];
    const outputAccessor = gltfData.accessors[sampler.output];
    const times = this.readAccessorElements(gltfData, buffers, sampler.input).map(item => item[0]);
    const values = this.readAccessorElements(gltfData, buffers, sampler.output);
    if (times.length !== values.length) {
      throw new Error('Animation sampler input/output counts do not match');
    }

    const trimmedTimes = [];
    const trimmedValues = [];
    this.pushTrimmedSample(trimmedTimes, trimmedValues, 0, this.sampleAt(times, values, start, sampler.interpolation, outputAccessor.type));

    for (let i = 0; i < times.length; i++) {
      const time = times[i];
      if (time > start && time < end) {
        trimmedTimes.push(time - start);
        trimmedValues.push(values[i]);
      }
    }

    const duration = end - start;
    this.addPreLoopSample(trimmedTimes, trimmedValues, times, values, start, end, duration, loopSmoothing, framerate, sampler.interpolation, outputAccessor.type);
    this.applyLoopSmoothing(trimmedTimes, trimmedValues, duration, loopSmoothing, outputAccessor.type);

    if (trimmedTimes.length === 0) {
      throw new Error('Trim produced no animation samples');
    }

    const inputIndex = this.appendAccessorData(gltfData, buffers, trimmedTimes.map(time => [time]), {
      type: 'SCALAR',
      componentType: inputAccessor.componentType,
    });
    const outputIndex = this.appendAccessorData(gltfData, buffers, trimmedValues, {
      type: outputAccessor.type,
      componentType: outputAccessor.componentType,
    });

    sampler.input = inputIndex;
    sampler.output = outputIndex;
  }

  pushTrimmedSample(times, values, time, value) {
    times.push(time);
    values.push(value);
  }

  addPreLoopSample(trimmedTimes, trimmedValues, sourceTimes, sourceValues, start, end, duration, loopSmoothing, framerate, interpolation, type) {
    if (loopSmoothing <= 0) return;
    const preLoopTime = Math.max(0, duration - (1 / framerate));
    const lastTime = trimmedTimes[trimmedTimes.length - 1];
    if (preLoopTime <= lastTime + 1e-6) return;

    trimmedTimes.push(preLoopTime);
    trimmedValues.push(this.sampleAt(sourceTimes, sourceValues, start + preLoopTime, interpolation, type));
  }

  sampleAt(times, values, targetTime, interpolation, type) {
    if (targetTime <= times[0]) return [...values[0]];
    if (targetTime >= times[times.length - 1]) return [...values[values.length - 1]];

    for (let i = 0; i < times.length - 1; i++) {
      const t0 = times[i];
      const t1 = times[i + 1];
      if (targetTime < t0 || targetTime > t1) continue;
      if (targetTime === t0 || interpolation === 'STEP') return [...values[i]];
      if (targetTime === t1) return [...values[i + 1]];
      const amount = (targetTime - t0) / (t1 - t0);
      return this.interpolateValue(values[i], values[i + 1], amount, type);
    }

    return [...values[values.length - 1]];
  }

  applyLoopSmoothing(times, values, duration, smoothingSeconds, type) {
    if (smoothingSeconds <= 0 || values.length < 2) return;

    const windowStart = Math.max(0, duration - smoothingSeconds);
    const firstValue = values[0];
    for (let i = 1; i < values.length; i++) {
      if (times[i] < windowStart) continue;
      const amount = Math.min(1, Math.max(0, (times[i] - windowStart) / Math.max(duration - windowStart, Number.EPSILON)));
      const eased = amount * amount * (3 - 2 * amount);
      values[i] = this.interpolateValue(values[i], firstValue, eased, type);
    }
  }

  interpolateValue(a, b, amount, type) {
    if (type === 'VEC4') {
      return this.normalizeQuat(this.lerpArray(a, this.alignQuaternion(a, b), amount));
    }
    return this.lerpArray(a, b, amount);
  }

  lerpArray(a, b, amount) {
    return a.map((value, index) => value + (b[index] - value) * amount);
  }

  alignQuaternion(a, b) {
    const dot = a.reduce((sum, value, index) => sum + value * b[index], 0);
    return dot < 0 ? b.map(value => -value) : b;
  }

  normalizeQuat(value) {
    const length = Math.hypot(...value);
    return length > 0 ? value.map(item => item / length) : value;
  }

  decodeBuffers(gltfData) {
    return (gltfData.buffers || []).map(buffer => {
      if (!buffer.uri?.startsWith('data:')) {
        throw new Error('Animation trimming requires embedded buffer data');
      }
      return Buffer.from(buffer.uri.split(',')[1], 'base64');
    });
  }

  encodeBuffers(gltfData, buffers) {
    buffers.forEach((buffer, index) => {
      gltfData.buffers[index].byteLength = buffer.length;
      gltfData.buffers[index].uri = `data:application/octet-stream;base64,${buffer.toString('base64')}`;
    });
  }

  readAccessorElements(gltfData, buffers, accessorIndex) {
    const accessor = gltfData.accessors[accessorIndex];
    if (accessor.componentType !== COMPONENT_TYPE_FLOAT) {
      throw new Error(`Only FLOAT animation accessors are supported, got componentType ${accessor.componentType}`);
    }

    const bufferView = gltfData.bufferViews[accessor.bufferView];
    const components = ACCESSOR_COMPONENTS[accessor.type];
    const elementByteLength = components * 4;
    const stride = bufferView.byteStride || elementByteLength;
    const baseOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const buffer = buffers[bufferView.buffer || 0];
    const elements = [];

    for (let i = 0; i < accessor.count; i++) {
      const elementOffset = baseOffset + i * stride;
      const element = [];
      for (let j = 0; j < components; j++) {
        element.push(buffer.readFloatLE(elementOffset + j * 4));
      }
      elements.push(element);
    }
    return elements;
  }

  appendAccessorData(gltfData, buffers, elements, { type, componentType }) {
    if (componentType !== COMPONENT_TYPE_FLOAT) {
      throw new Error(`Only FLOAT animation accessors are supported, got componentType ${componentType}`);
    }

    const bufferIndex = 0;
    const components = ACCESSOR_COMPONENTS[type];
    const padding = (4 - (buffers[bufferIndex].length % 4)) % 4;
    const byteOffset = buffers[bufferIndex].length + padding;
    const data = Buffer.alloc(elements.length * components * 4);

    elements.forEach((element, elementIndex) => {
      for (let componentIndex = 0; componentIndex < components; componentIndex++) {
        data.writeFloatLE(element[componentIndex], (elementIndex * components + componentIndex) * 4);
      }
    });

    buffers[bufferIndex] = Buffer.concat([
      buffers[bufferIndex],
      Buffer.alloc(padding, 0),
      data,
    ]);

    const bufferViewIndex = gltfData.bufferViews.length;
    gltfData.bufferViews.push({
      buffer: bufferIndex,
      byteOffset,
      byteLength: data.length,
    });

    const flattened = elements[0].map((_, componentIndex) => elements.map(element => element[componentIndex]));
    const accessorIndex = gltfData.accessors.length;
    gltfData.accessors.push({
      bufferView: bufferViewIndex,
      componentType,
      count: elements.length,
      type,
      min: flattened.map(values => Math.min(...values)),
      max: flattened.map(values => Math.max(...values)),
    });

    return accessorIndex;
  }

  convertToVRMAWithTiming(gltfData, options = {}) {
    console.log('Converting to VRMA with enhanced timing...');

    // Retrieve animation duration from metadata
    let animationDuration = 5.0; // default

    if (gltfData.extras && gltfData.extras.animationMetadata) {
      animationDuration = gltfData.extras.animationMetadata.maxDuration;
      console.log(`Using calculated duration: ${animationDuration} seconds`);
    }

    // Build VRMA output
    const humanBones = this.generateHumanBones(gltfData);
    const boneCount = Object.keys(humanBones).length;
    if (boneCount === 0) {
      throw new Error('No humanoid bones matched. Check input skeleton bone names or add mappings before converting to VRMA.');
    }
    if (options.correctionData) {
      this.applyCorrectionData(gltfData, humanBones, options.correctionData);
    }
    if (options.restPoseData) {
      this.applyRestPoseData(gltfData, humanBones, options.restPoseData);
    }
    const metadata = gltfData.extras?.animationMetadata;
    const vrmaData = {
      asset: gltfData.asset,
      scene: gltfData.scene,
      scenes: gltfData.scenes,
      nodes: gltfData.nodes?.map(node => this.stripNodeForVRMA(node)),
      animations: this.processAnimationsWithTiming(gltfData.animations, animationDuration, humanBones),
      accessors: gltfData.accessors,
      bufferViews: gltfData.bufferViews,
      buffers: gltfData.buffers,
      extensionsUsed: ['VRMC_vrm_animation'],
      extensions: {
        'VRMC_vrm_animation': {
          specVersion: '1.0',
          humanoid: {
            humanBones: humanBones
          }
        }
      },
      // Store non-spec metadata in extras
      extras: {
        duration: animationDuration,
        frameCount: metadata?.frameCount ?? 0,
        framerate: metadata?.framerate ?? 30
      }
    };

    console.log(`Generated VRMA with ${boneCount} bones and ${animationDuration}s duration`);

    return vrmaData;
  }

  stripNodeForVRMA(node) {
    const stripped = {};
    for (const key of ['name', 'children', 'translation', 'rotation']) {
      if (node[key] !== undefined) {
        stripped[key] = node[key];
      }
    }
    return stripped;
  }

  processAnimationsWithTiming(animations, duration, humanBones = {}) {
    if (!animations || animations.length === 0) {
      return [];
    }

    // Build a reverse map from node index to bone name
    const nodeToHumanBone = {};
    for (const [boneName, boneData] of Object.entries(humanBones)) {
      nodeToHumanBone[boneData.node] = boneName;
    }

    return animations.map((animation, index) => {
      // Remove channels that violate the VRMA spec:
      //   - scale: prohibited on all humanoid bones
      //   - translation: prohibited on humanoid bones other than hips
      const usedSamplerIndices = new Set();
      const filteredChannels = (animation.channels || []).filter(channel => {
        const nodeIndex = channel.target?.node;
        const path = channel.target?.path;
        const boneName = nodeToHumanBone[nodeIndex];

        if (boneName === undefined) return true; // pass through non-humanoid bones

        if (path === 'scale') {
          console.log(`  Removed scale channel for bone: ${boneName}`);
          return false;
        }
        if (path === 'translation' && boneName !== 'hips') {
          console.log(`  Removed translation channel for non-hips bone: ${boneName}`);
          return false;
        }
        return true;
      });

      // Collect only samplers referenced by remaining channels and reindex them
      filteredChannels.forEach(ch => usedSamplerIndices.add(ch.sampler));
      const oldToNewSampler = {};
      const filteredSamplers = [];
      [...usedSamplerIndices].sort((a, b) => a - b).forEach(oldIdx => {
        oldToNewSampler[oldIdx] = filteredSamplers.length;
        filteredSamplers.push(animation.samplers[oldIdx]);
      });

      const remappedChannels = filteredChannels.map(ch => ({
        ...ch,
        sampler: oldToNewSampler[ch.sampler],
      }));

      const removedCount = (animation.channels?.length ?? 0) - filteredChannels.length;
      if (removedCount > 0) {
        console.log(`  Animation "${animation.name}": removed ${removedCount} invalid channel(s)`);
      }

      return {
        name: animation.name || `VRMAnimation${index}`,
        channels: remappedChannels,
        samplers: filteredSamplers,
      };
    });
  }

  applyCorrectionData(gltfData, humanBones, correctionData) {
    const correctionMap = this.buildCorrectionMap(correctionData);
    if (correctionMap.size === 0) {
      console.log('No correction entries found to apply');
      return;
    }
    this.applyRotationCorrectionMap(gltfData, humanBones, correctionMap, 'correction file');
  }

  async loadCorrectionData(mappingOptions = {}) {
    return mappingOptions.applyCorrections
      ? await fs.readJson(mappingOptions.applyCorrections)
      : null;
  }

  async loadRestPoseData(mappingOptions = {}) {
    return mappingOptions.applyRestPose
      ? await fs.readJson(mappingOptions.applyRestPose)
      : null;
  }

  applyRestPoseData(gltfData, humanBones, restPoseData) {
    const rotationMap = this.buildRestPoseRotationMap(restPoseData);
    if (rotationMap.size === 0) {
      console.log('No rest-pose entries found to apply');
      return;
    }

    let appliedCount = 0;
    const unmatchedKeys = [];
    for (const [vrmBone, rotation] of rotationMap.entries()) {
      const nodeIndex = humanBones[vrmBone]?.node;
      const node = nodeIndex !== undefined ? gltfData.nodes?.[nodeIndex] : undefined;
      if (!node) {
        unmatchedKeys.push(vrmBone);
        continue;
      }
      node.rotation = rotation;
      appliedCount++;
    }

    if (unmatchedKeys.length > 0) {
      console.warn(`Skipped ${unmatchedKeys.length} unmatched rest-pose bone(s): ${unmatchedKeys.slice(0, 10).join(', ')}${unmatchedKeys.length > 10 ? ', ...' : ''}`);
    }
    if (appliedCount > 0) {
      console.log(`Applied rest-pose rotations to ${appliedCount} humanoid node(s)`);
    } else {
      console.log('No mapped bones found for rest-pose profile');
    }
  }

  buildRestPoseRotationMap(restPoseData) {
    if (!restPoseData?.bones || typeof restPoseData.bones !== 'object') {
      throw new Error('Rest-pose JSON must contain a bones object');
    }

    const rotationFormat = restPoseData.rotationFormat || 'quaternion_xyzw';
    if (!['quaternion_xyzw', 'quaternion_wxyz'].includes(rotationFormat)) {
      throw new Error(`Unsupported rotationFormat for rest-pose profile: ${rotationFormat}`);
    }

    const rotationMap = new Map();
    for (const [vrmBone, entry] of Object.entries(restPoseData.bones)) {
      if (entry === null || entry === undefined) continue;
      const value = Array.isArray(entry) ? entry : entry.rotation;
      if (!Array.isArray(value) || value.length !== 4 || value.some(item => !Number.isFinite(item))) {
        throw new Error(`Rest-pose rotation for ${vrmBone} must be a quaternion with 4 numbers`);
      }
      const quaternion = rotationFormat === 'quaternion_wxyz'
        ? [value[1], value[2], value[3], value[0]]
        : value;
      rotationMap.set(vrmBone, this.normalizeQuat(quaternion));
    }
    return rotationMap;
  }

  buildCorrectionMap(correctionData) {
    if (correctionData?.bones && typeof correctionData.bones === 'object') {
      return this.buildBoneRotationOffsetMap(correctionData);
    }

    const entries = Array.isArray(correctionData)
      ? correctionData
      : correctionData?.corrections;
    if (!Array.isArray(entries)) {
      throw new Error('Correction JSON must contain a corrections array');
    }

    const correctionMap = new Map();
    for (const entry of entries) {
      const correctionKey = entry?.vrmBone || entry?.hierarchyPath || entry?.nodeName;
      if (!correctionKey) continue;
      const quaternion = entry.localPostCorrectionQuaternion;
      if (!Array.isArray(quaternion) || quaternion.length !== 4 || quaternion.some(value => !Number.isFinite(value))) {
        throw new Error(`Correction for ${correctionKey} must include localPostCorrectionQuaternion with 4 numbers`);
      }
      correctionMap.set(correctionKey, this.normalizeQuat(quaternion));
    }
    return correctionMap;
  }

  buildBoneRotationOffsetMap(correctionData) {
    const rotationFormat = correctionData.rotationFormat || 'quaternion_xyzw';
    if (!['quaternion_xyzw', 'quaternion_wxyz', 'euler_xyz_degrees'].includes(rotationFormat)) {
      throw new Error(`Unsupported rotationFormat for bones config: ${rotationFormat}`);
    }
    const invert = correctionData.invert === true || correctionData.application === 'inversePostMultiplyAnimation';

    const correctionMap = new Map();
    for (const [vrmBone, value] of Object.entries(correctionData.bones)) {
      if (value === null || value === undefined) continue;
      if (!Array.isArray(value) || value.some(item => !Number.isFinite(item))) {
        throw new Error(`Bone offset for ${vrmBone} must be null or a numeric array`);
      }
      const quaternion = this.parseBoneRotationOffset(vrmBone, value, rotationFormat);
      const normalized = this.normalizeQuat(quaternion);
      correctionMap.set(vrmBone, invert ? this.invertQuaternion(normalized) : normalized);
    }
    return correctionMap;
  }

  parseBoneRotationOffset(vrmBone, value, rotationFormat) {
    if (rotationFormat === 'euler_xyz_degrees') {
      if (value.length !== 3) {
        throw new Error(`Euler bone offset for ${vrmBone} must have 3 numbers`);
      }
      return this.quaternionFromEulerXYZDegrees(value);
    }
    if (value.length !== 4) {
      throw new Error(`Quaternion bone offset for ${vrmBone} must have 4 numbers`);
    }
    return rotationFormat === 'quaternion_wxyz'
      ? [value[1], value[2], value[3], value[0]]
      : value;
  }

  applyRotationCorrectionMap(gltfData, humanBones, correctionMap, label) {
    if (!gltfData.animations?.length || !gltfData.buffers?.length) return;

    const nodeCorrections = new Map();
    const pathToNode = this.getNodePathMap(gltfData);
    const nameToNodes = this.getNodeNameMap(gltfData);
    const unmatchedKeys = [];
    for (const [correctionKey, correction] of correctionMap.entries()) {
      const node = humanBones[correctionKey]?.node
        ?? this.resolveNodeByPath(correctionKey, pathToNode)
        ?? (nameToNodes.get(correctionKey)?.length === 1 ? nameToNodes.get(correctionKey)[0] : undefined);
      if (node !== undefined) {
        nodeCorrections.set(node, { correctionKey, correction });
      } else {
        unmatchedKeys.push(correctionKey);
      }
    }
    if (nodeCorrections.size === 0) {
      console.log(`No mapped bones found for ${label}`);
      return;
    }
    if (unmatchedKeys.length > 0) {
      console.warn(`Skipped ${unmatchedKeys.length} unmatched correction key(s): ${unmatchedKeys.slice(0, 10).join(', ')}${unmatchedKeys.length > 10 ? ', ...' : ''}`);
    }

    const buffers = this.decodeBuffers(gltfData);
    let correctedSamplerCount = 0;
    const correctedBones = new Set();

    for (const animation of gltfData.animations) {
      for (const channel of animation.channels || []) {
        const nodeCorrection = nodeCorrections.get(channel.target?.node);
        if (channel.target?.path !== 'rotation' || !nodeCorrection) {
          continue;
        }

        const sampler = animation.samplers?.[channel.sampler];
        const accessor = gltfData.accessors?.[sampler?.output];
        if (!sampler || !accessor || accessor.type !== 'VEC4') {
          continue;
        }

        const rotations = this.readAccessorElements(gltfData, buffers, sampler.output);
        const correctedRotations = rotations.map(rotation => (
          this.normalizeQuat(this.multiplyQuaternions(rotation, nodeCorrection.correction))
        ));
        sampler.output = this.appendAccessorData(gltfData, buffers, correctedRotations, {
          type: accessor.type,
          componentType: accessor.componentType,
        });
        correctedSamplerCount++;
        correctedBones.add(nodeCorrection.correctionKey);
      }
    }

    if (correctedSamplerCount > 0) {
      this.encodeBuffers(gltfData, buffers);
      console.log(`Applied ${label} to ${correctedSamplerCount} rotation sampler(s): ${[...correctedBones].join(', ')}`);
    }
  }

  getNodePathMap(gltfData) {
    const nodes = gltfData.nodes || [];
    const pathMap = new Map();
    const visit = (nodeIndex, currentPath) => {
      const node = nodes[nodeIndex];
      if (!node) return;
      const pathValue = currentPath ? `${currentPath}/${node.name || `(unnamed-${nodeIndex})`}` : (node.name || `(unnamed-${nodeIndex})`);
      pathMap.set(pathValue, nodeIndex);
      (node.children || []).forEach(childIndex => visit(childIndex, pathValue));
    };
    const childNodes = new Set();
    nodes.forEach(node => (node.children || []).forEach(childIndex => childNodes.add(childIndex)));
    nodes.forEach((_, index) => {
      if (!childNodes.has(index)) visit(index, '');
    });
    return pathMap;
  }

  resolveNodeByPath(correctionPath, pathToNode) {
    if (pathToNode.has(correctionPath)) {
      return pathToNode.get(correctionPath);
    }

    const suffix = `/${correctionPath}`;
    const matches = [...pathToNode.entries()]
      .filter(([nodePath]) => nodePath.endsWith(suffix))
      .map(([, nodeIndex]) => nodeIndex);
    return matches.length === 1 ? matches[0] : undefined;
  }

  getNodeNameMap(gltfData) {
    const nameMap = new Map();
    (gltfData.nodes || []).forEach((node, index) => {
      if (!node.name) return;
      if (!nameMap.has(node.name)) nameMap.set(node.name, []);
      nameMap.get(node.name).push(index);
    });
    return nameMap;
  }

  quaternionFromAxisAngle(axis, degrees) {
    const radians = degrees * Math.PI / 180;
    const half = radians / 2;
    const sin = Math.sin(half);
    return this.normalizeQuat([
      axis[0] * sin,
      axis[1] * sin,
      axis[2] * sin,
      Math.cos(half),
    ]);
  }

  quaternionFromEulerXYZDegrees(eulerDegrees) {
    const [xDegrees, yDegrees, zDegrees] = eulerDegrees;
    const qx = this.quaternionFromAxisAngle([1, 0, 0], xDegrees);
    const qy = this.quaternionFromAxisAngle([0, 1, 0], yDegrees);
    const qz = this.quaternionFromAxisAngle([0, 0, 1], zDegrees);
    return this.normalizeQuat(this.multiplyQuaternions(this.multiplyQuaternions(qx, qy), qz));
  }

  multiplyQuaternions(a, b) {
    const [ax, ay, az, aw] = a;
    const [bx, by, bz, bw] = b;
    return [
      aw * bx + ax * bw + ay * bz - az * by,
      aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw,
      aw * bw - ax * bx - ay * by - az * bz,
    ];
  }

  invertQuaternion(quaternion) {
    const [x, y, z, w] = quaternion;
    const lengthSquared = x * x + y * y + z * z + w * w;
    if (lengthSquared === 0) return [0, 0, 0, 1];
    return [-x / lengthSquared, -y / lengthSquared, -z / lengthSquared, w / lengthSquared];
  }

  generateHumanBones(gltfData) {
    const humanBones = {};

    if (!gltfData.nodes) {
      return humanBones;
    }

    gltfData.nodes.forEach((node, index) => {
      const vrmBoneName = this.getVRMBoneName(node.name);
      if (vrmBoneName) {
        humanBones[vrmBoneName] = {
          node: index
        };
      }
    });

    this.logUnmatchedBones(gltfData.nodes);

    return humanBones;
  }

  logUnmatchedBones(nodes = []) {
    const unmatchedBones = nodes
      .map((node, index) => ({ name: node.name, index }))
      .filter(({ name }) => name && this.isLikelyBoneName(name) && !this.getVRMBoneName(name));

    if (unmatchedBones.length === 0) return;

    console.warn(`Unmatched bone-like nodes (${unmatchedBones.length}):`);
    unmatchedBones.forEach(({ name, index }) => {
      console.warn(`  [${index}] ${name}`);
    });
  }

  isLikelyBoneName(name) {
    return /bone|joint|mixamorig|hips|spine|chest|neck|head|shoulder|arm|forearm|hand|thumb|index|middle|ring|pinky|leg|upleg|foot|toe/i.test(name);
  }

  getVRMBoneName(nodeName) {
    if (!nodeName) return undefined;
    const profile = this.getBoneProfile(this.boneProfileName);
    return this.getVRMBoneNameFromProfile(nodeName, profile);
  }

  getVRMBoneNameFromProfile(nodeName, profile) {
    if (!nodeName || !profile) return undefined;
    const normalizedName = profile.normalizeName ? profile.normalizeName(nodeName) : nodeName;
    return profile.mapping[nodeName] || profile.mapping[normalizedName];
  }

  setBoneProfile(profileName = 'auto') {
    this.boneProfileName = this.resolveBoneProfileName(profileName);
    this.humanoidBoneMapping = this.getBoneProfile(this.boneProfileName).mapping;
  }

  resolveBoneProfileName(profileName = 'auto') {
    if (this.boneMappingProfiles[profileName]) return profileName;

    for (const [name, profile] of Object.entries(this.boneMappingProfiles)) {
      if ((profile.aliases || []).includes(profileName)) {
        return name;
      }
    }

    const available = Object.keys(this.boneMappingProfiles).join(', ');
    throw new Error(`Unknown bone profile "${profileName}". Available profiles: ${available}`);
  }

  getBoneProfile(profileName = this.boneProfileName) {
    return this.boneMappingProfiles[this.resolveBoneProfileName(profileName)];
  }

  async saveAsGLB(vrmaData, outputPath) {
    // Extract the base64 data URI buffer and convert it to binary
    const jsonData = JSON.parse(JSON.stringify(vrmaData));
    let binBuffer = Buffer.alloc(0);

    if (jsonData.buffers?.length > 0 && jsonData.buffers[0].uri?.startsWith('data:')) {
      const base64 = jsonData.buffers[0].uri.split(',')[1];
      binBuffer = Buffer.from(base64, 'base64');
      delete jsonData.buffers[0].uri; // GLB buffers have no URI
    }

    // JSON chunk (aligned to 4-byte boundary, padded with spaces)
    const jsonBytes = Buffer.from(JSON.stringify(jsonData), 'utf8');
    const jsonPadded = Math.ceil(jsonBytes.length / 4) * 4;
    const jsonChunk = Buffer.alloc(jsonPadded, 0x20);
    jsonBytes.copy(jsonChunk);

    // BIN chunk (aligned to 4-byte boundary, padded with zeros)
    const hasBin = binBuffer.length > 0;
    const binPadded = hasBin ? Math.ceil(binBuffer.length / 4) * 4 : 0;
    const binChunk = Buffer.alloc(binPadded, 0x00);
    if (hasBin) binBuffer.copy(binChunk);

    // Calculate total file size
    const totalLength = 12                            // GLB header
      + 8 + jsonPadded                               // JSON chunk
      + (hasBin ? 8 + binPadded : 0);               // BIN chunk

    const glb = Buffer.alloc(totalLength);
    let offset = 0;

    // GLB header
    glb.writeUInt32LE(0x46546C67, offset); offset += 4; // magic "glTF"
    glb.writeUInt32LE(2,           offset); offset += 4; // version 2
    glb.writeUInt32LE(totalLength, offset); offset += 4; // total length

    // JSON chunk header + data
    glb.writeUInt32LE(jsonPadded,   offset); offset += 4; // chunk length
    glb.writeUInt32LE(0x4E4F534A,  offset); offset += 4; // chunk type "JSON"
    jsonChunk.copy(glb, offset); offset += jsonPadded;

    // BIN chunk header + data
    if (hasBin) {
      glb.writeUInt32LE(binPadded,    offset); offset += 4; // chunk length
      glb.writeUInt32LE(0x004E4942,  offset); offset += 4; // chunk type "BIN\0"
      binChunk.copy(glb, offset);
    }

    await fs.writeFile(outputPath, glb);
    console.log(`Saved GLB: ${totalLength} bytes (JSON: ${jsonPadded}, BIN: ${binPadded})`);
  }

  async convertDirectory(inputDir, outputDir, fbx2gltfPath, framerate, trimOptions = {}, debugOptions = {}, mappingOptions = {}) {
    const entries = await fs.readdir(inputDir);
    const fbxFiles = entries.filter(f => path.extname(f).toLowerCase() === '.fbx');

    if (fbxFiles.length === 0) {
      console.error(`No FBX files found in: ${inputDir}`);
      return false;
    }

    await fs.ensureDir(outputDir);
    console.log(`Found ${fbxFiles.length} FBX file(s) in ${inputDir}`);

    let successCount = 0;
    for (const file of fbxFiles) {
      const inputPath  = path.join(inputDir, file);
      const outputPath = path.join(outputDir, path.basename(file, path.extname(file)) + '.vrma');
      console.log(`\n[${successCount + 1}/${fbxFiles.length}] ${file}`);
      const fileDebugOptions = { ...debugOptions };
      if (debugOptions.dumpNodes) {
        fileDebugOptions.dumpNodes = this.resolveBatchDebugOutputPath(debugOptions.dumpNodes, file, '.txt');
      }
      const ok = await this.convert(inputPath, outputPath, fbx2gltfPath, framerate, trimOptions, fileDebugOptions, mappingOptions);
      if (ok) successCount++;
    }

    console.log(`\nBatch complete: ${successCount}/${fbxFiles.length} succeeded.`);
    return successCount === fbxFiles.length;
  }

  async cleanupTempFiles(filePaths) {
    for (const filePath of filePaths) {
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
      }

      const binPath = filePath.replace(/\.gltf$/, '.bin');
      if (await fs.pathExists(binPath)) {
        await fs.remove(binPath);
      }
    }
  }

  resolveBatchDebugOutputPath(outputPath, inputFile, defaultExt) {
    const dumpExt = path.extname(outputPath);
    const dumpBase = dumpExt
      ? outputPath.slice(0, -dumpExt.length)
      : outputPath;
    return `${dumpBase}_${path.basename(inputFile, path.extname(inputFile))}${dumpExt || defaultExt}`;
  }

  async resolveOutputPath(inputPath, outputOption) {
    const inputName = path.parse(inputPath).name;

    if (!outputOption) {
      // No output specified: save alongside the input file
      return path.join(path.dirname(inputPath), inputName + '.vrma');
    }

    // Check if the specified output is an existing directory
    const stat = await fs.stat(outputOption).catch(() => null);
    if (stat?.isDirectory()) {
      return path.join(outputOption, inputName + '.vrma');
    }

    // Trailing separator indicates a directory path (may not exist yet)
    if (outputOption.endsWith('/') || outputOption.endsWith(path.sep)) {
      return path.join(outputOption, inputName + '.vrma');
    }

    // Otherwise treat as a full file path
    return outputOption;
  }

  async run() {
    const options = this.program.opts();
    const inputStat = await fs.stat(options.input).catch(() => null);
    const trimOptions = {
      trimIn: options.trimIn,
      trimOut: options.trimOut,
      trimInFrame: options.trimInFrame,
      trimOutFrame: options.trimOutFrame,
      loopSmoothing: options.loopSmoothing,
      framerate: options.framerate,
    };
    const debugOptions = {
      dumpNodes: options.dumpNodes,
    };
    const mappingOptions = {
      boneProfile: options.boneProfile,
      applyCorrections: options.applyCorrections,
      applyRestPose: options.applyRestPose,
      shiftHipOrigin: options.shiftHipOrigin,
    };

    let success;
    if (inputStat?.isDirectory()) {
      // Batch conversion mode: output defaults to the input directory
      const outputDir = options.output || options.input;
      success = await this.convertDirectory(
        options.input,
        outputDir,
        options.fbx2gltf,
        options.framerate,
        trimOptions,
        debugOptions,
        mappingOptions
      );
    } else {
      // Single file conversion mode
      const outputPath = await this.resolveOutputPath(options.input, options.output);
      success = await this.convert(
        options.input,
        outputPath,
        options.fbx2gltf,
        options.framerate,
        trimOptions,
        debugOptions,
        mappingOptions
      );
    }
    process.exit(success ? 0 : 1);
  }
}

// Entry point
if (require.main === module) {
  const converter = new FBXToVRMAConverterFixed({ parse: true });
  converter.run().catch(console.error);
}

module.exports = FBXToVRMAConverterFixed;
module.exports.getDefaultBinaryName = getDefaultBinaryName;

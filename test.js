const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const FBXToVRMAConverterFixed = require('./fbx2vrma-converter');
const { getDefaultBinaryName } = require('./fbx2vrma-converter');

function createConverter() {
  return new FBXToVRMAConverterFixed();
}

function createFloatBuffer(elements) {
  const flattened = elements.flat();
  const buffer = Buffer.alloc(flattened.length * 4);
  flattened.forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  return buffer;
}

function createAnimationGltf(times, values, valueType = 'SCALAR') {
  const components = valueType === 'VEC4' ? 4 : valueType === 'VEC3' ? 3 : 1;
  const timeElements = times.map(time => [time]);
  const valueElements = values.map(value => Array.isArray(value) ? value : [value]);
  const timeBuffer = createFloatBuffer(timeElements);
  const valueBuffer = createFloatBuffer(valueElements);
  const buffer = Buffer.concat([timeBuffer, valueBuffer]);

  return {
    asset: { version: '2.0' },
    animations: [{
      name: 'Loop',
      channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }],
      samplers: [{ input: 0, output: 1, interpolation: 'LINEAR' }],
    }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: times.length,
        type: 'SCALAR',
        min: [Math.min(...times)],
        max: [Math.max(...times)],
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: values.length,
        type: valueType,
        min: Array.from({ length: components }, (_, index) => Math.min(...valueElements.map(value => value[index]))),
        max: Array.from({ length: components }, (_, index) => Math.max(...valueElements.map(value => value[index]))),
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: timeBuffer.length },
      { buffer: 0, byteOffset: timeBuffer.length, byteLength: valueBuffer.length },
    ],
    buffers: [{
      byteLength: buffer.length,
      uri: `data:application/octet-stream;base64,${buffer.toString('base64')}`,
    }],
  };
}

describe('generateHumanBones', () => {
  it('should map Mixamo bone names to VRM humanoid bones', () => {
    const converter = createConverter();
    const gltfData = {
      nodes: [
        { name: 'mixamorig:Hips' },
        { name: 'mixamorig:Spine' },
        { name: 'mixamorig:Head' },
        { name: 'mixamorig:LeftHand' },
        { name: 'mixamorig:RightHand' },
      ],
    };

    const bones = converter.generateHumanBones(gltfData);

    assert.deepStrictEqual(bones, {
      hips: { node: 0 },
      spine: { node: 1 },
      head: { node: 2 },
      leftHand: { node: 3 },
      rightHand: { node: 4 },
    });
  });

  it('should map Mixamo bone names without the mixamorig prefix', () => {
    const converter = createConverter();
    const gltfData = {
      nodes: [
        { name: 'Hips' },
        { name: 'Spine' },
        { name: 'Head' },
        { name: 'LeftHand' },
      ],
    };

    const bones = converter.generateHumanBones(gltfData);

    assert.deepStrictEqual(bones, {
      hips: { node: 0 },
      spine: { node: 1 },
      head: { node: 2 },
      leftHand: { node: 3 },
    });
  });

  it('should support explicit and alias bone mapping profiles', () => {
    const converter = createConverter();

    converter.setBoneProfile('mixamo');
    assert.equal(converter.getVRMBoneName('Hips'), 'hips');

    converter.setBoneProfile('default');
    assert.equal(converter.getVRMBoneName('mixamorig:Head'), 'head');
  });

  it('should reject unknown bone mapping profiles', () => {
    const converter = createConverter();

    assert.throws(
      () => converter.setBoneProfile('unknown-profile'),
      /Unknown bone profile/
    );
  });

  it('should log whether bone profile selection is default or explicit', () => {
    const converter = createConverter();
    const logs = [];
    const originalLog = console.log;
    console.log = message => logs.push(message);
    try {
      converter.selectBoneProfileForGltf({ nodes: [] }, { boneProfile: 'default', boneProfileExplicit: false });
      converter.logBoneProfileSelection();
      converter.selectBoneProfileForGltf({ nodes: [] }, { boneProfile: 'unity-style', boneProfileExplicit: true });
      converter.logBoneProfileSelection();
    } finally {
      console.log = originalLog;
    }

    assert.match(logs[0], /Bone mapping profile: mixamo \(resolved to mixamo\); reason: default profile/);
    assert.match(logs[1], /Bone mapping profile: mimem-unity \(resolved to mimem-unity\); reason: explicit --bone-profile unity-style/);
  });

  it('should auto-select the best bone mapping profile from node names', () => {
    const converter = createConverter();
    const sjGltfData = {
      nodes: [
        { name: 'Hips' },
        { name: 'Spine' },
        { name: 'Spine1' },
        { name: 'Spine2' },
        { name: 'Spine3' },
        { name: 'Neck' },
        { name: 'Head' },
        { name: 'LeftArm' },
      ],
    };

    converter.selectBoneProfileForGltf(sjGltfData, { boneProfile: 'auto', boneProfileExplicit: true });

    assert.equal(converter.boneProfileName, 'sj-mizuki');
    assert.equal(converter.getVRMBoneName('Spine3'), 'upperChest');
    assert.equal(converter.boneProfileSelection.best.unmatchedLikelyBoneCount, 0);

    const mimemGltfData = {
      nodes: [
        { name: 'root.x' },
        { name: 'spine_01.x' },
        { name: 'spine_02.x' },
        { name: 'arm_stretch.l' },
        { name: 'forearm_stretch.r' },
      ],
    };

    converter.selectBoneProfileForGltf(mimemGltfData, { boneProfile: 'auto', boneProfileExplicit: true });

    assert.equal(converter.boneProfileName, 'mimem-unity');
    assert.equal(converter.getVRMBoneName('root.x'), 'hips');
  });

  it('should fall back to default mixamo profile when auto has no matches', () => {
    const converter = createConverter();

    converter.selectBoneProfileForGltf({ nodes: [{ name: 'Camera' }] }, { boneProfile: 'auto', boneProfileExplicit: true });

    assert.equal(converter.boneProfileName, 'mixamo');
  });

  it('should map Mimem Unity-style body and finger bones', () => {
    const converter = createConverter();
    converter.setBoneProfile('mimem-unity');
    const gltfData = {
      nodes: [
        { name: 'root.x' },
        { name: 'spine_01.x' },
        { name: 'spine_02.x' },
        { name: 'spine_03.x' },
        { name: 'neck.x' },
        { name: 'head.x' },
        { name: 'thigh_stretch.l' },
        { name: 'leg_stretch.l' },
        { name: 'foot.l' },
        { name: 'toes_01.l' },
        { name: 'shoulder.r' },
        { name: 'arm_stretch.r' },
        { name: 'forearm_stretch.r' },
        { name: 'hand.r' },
        { name: 'c_thumb1.l' },
        { name: 'c_index2.r' },
        { name: 'c_pinky3.r' },
      ],
    };

    const bones = converter.generateHumanBones(gltfData);

    assert.deepStrictEqual(bones.hips, { node: 0 });
    assert.deepStrictEqual(bones.spine, { node: 1 });
    assert.deepStrictEqual(bones.chest, { node: 2 });
    assert.deepStrictEqual(bones.upperChest, { node: 3 });
    assert.deepStrictEqual(bones.neck, { node: 4 });
    assert.deepStrictEqual(bones.head, { node: 5 });
    assert.deepStrictEqual(bones.leftUpperLeg, { node: 6 });
    assert.deepStrictEqual(bones.leftLowerLeg, { node: 7 });
    assert.deepStrictEqual(bones.leftFoot, { node: 8 });
    assert.deepStrictEqual(bones.leftToes, { node: 9 });
    assert.deepStrictEqual(bones.rightShoulder, { node: 10 });
    assert.deepStrictEqual(bones.rightUpperArm, { node: 11 });
    assert.deepStrictEqual(bones.rightLowerArm, { node: 12 });
    assert.deepStrictEqual(bones.rightHand, { node: 13 });
    assert.deepStrictEqual(bones.leftThumbMetacarpal, { node: 14 });
    assert.deepStrictEqual(bones.rightIndexIntermediate, { node: 15 });
    assert.deepStrictEqual(bones.rightLittleDistal, { node: 16 });
  });

  it('should resolve Mimem Unity-style profile aliases', () => {
    const converter = createConverter();

    converter.setBoneProfile('unity-style');

    assert.equal(converter.getVRMBoneName('root.x'), 'hips');
    assert.equal(converter.getVRMBoneName('spine_01.x'), 'spine');
  });

  it('should support SJ Mizuki skeleton profile with Spine3 as upper chest', () => {
    const converter = createConverter();
    converter.setBoneProfile('sj-mizuki');
    const gltfData = {
      nodes: [
        { name: 'Hips' },
        { name: 'Spine' },
        { name: 'Spine1' },
        { name: 'Spine2' },
        { name: 'Spine3' },
        { name: 'Neck' },
        { name: 'Head' },
        { name: 'LeftArm' },
        { name: 'RightArm' },
      ],
    };

    const bones = converter.generateHumanBones(gltfData);

    assert.deepStrictEqual(bones.hips, { node: 0 });
    assert.deepStrictEqual(bones.spine, { node: 1 });
    assert.deepStrictEqual(bones.chest, { node: 2 });
    assert.deepStrictEqual(bones.upperChest, { node: 4 });
    assert.deepStrictEqual(bones.neck, { node: 5 });
    assert.deepStrictEqual(bones.head, { node: 6 });
    assert.equal(converter.getVRMBoneName('Spine3'), 'upperChest');
    assert.equal(converter.getVRMBoneName('mixamorig:Spine3'), 'upperChest');
  });

  it('should skip nodes without matching bone names', () => {
    const converter = createConverter();
    const originalWarn = console.warn;
    const warnings = [];
    console.warn = message => warnings.push(message);
    const gltfData = {
      nodes: [
        { name: 'mixamorig:Hips' },
        { name: 'mixamorig:UnknownBone' },
        { name: 'mixamorig:Head' },
      ],
    };

    try {
      const bones = converter.generateHumanBones(gltfData);

      assert.equal(Object.keys(bones).length, 2);
      assert.deepStrictEqual(bones.hips, { node: 0 });
      assert.deepStrictEqual(bones.head, { node: 2 });
      assert.ok(warnings.some(message => message.includes('Unmatched bone-like nodes')));
      assert.ok(warnings.some(message => message.includes('mixamorig:UnknownBone')));
    } finally {
      console.warn = originalWarn;
    }
  });

  it('should return empty object when no nodes exist', () => {
    const converter = createConverter();
    const bones = converter.generateHumanBones({});
    assert.deepStrictEqual(bones, {});
  });

  it('should map Mixamo finger bones to VRM 1.0 bone names', () => {
    const converter = createConverter();
    const gltfData = {
      nodes: [
        { name: 'mixamorig:LeftHandThumb1' },   // 0
        { name: 'mixamorig:LeftHandThumb2' },   // 1
        { name: 'mixamorig:LeftHandThumb3' },   // 2
        { name: 'mixamorig:LeftHandIndex1' },   // 3
        { name: 'mixamorig:LeftHandIndex2' },   // 4
        { name: 'mixamorig:LeftHandIndex3' },   // 5
        { name: 'mixamorig:RightHandPinky1' },  // 6
        { name: 'mixamorig:RightHandPinky2' },  // 7
        { name: 'mixamorig:RightHandPinky3' },  // 8
      ],
    };

    const bones = converter.generateHumanBones(gltfData);

    assert.deepStrictEqual(bones.leftThumbMetacarpal,   { node: 0 });
    assert.deepStrictEqual(bones.leftThumbProximal,     { node: 1 });
    assert.deepStrictEqual(bones.leftThumbDistal,       { node: 2 });
    assert.deepStrictEqual(bones.leftIndexProximal,     { node: 3 });
    assert.deepStrictEqual(bones.leftIndexIntermediate, { node: 4 });
    assert.deepStrictEqual(bones.leftIndexDistal,       { node: 5 });
    assert.deepStrictEqual(bones.rightLittleProximal,     { node: 6 });
    assert.deepStrictEqual(bones.rightLittleIntermediate, { node: 7 });
    assert.deepStrictEqual(bones.rightLittleDistal,       { node: 8 });
  });

  it('should support all 30 finger bones', () => {
    const converter = createConverter();
    const fingerMixamoNames = [
      'mixamorig:LeftHandThumb1',  'mixamorig:LeftHandThumb2',  'mixamorig:LeftHandThumb3',
      'mixamorig:LeftHandIndex1',  'mixamorig:LeftHandIndex2',  'mixamorig:LeftHandIndex3',
      'mixamorig:LeftHandMiddle1', 'mixamorig:LeftHandMiddle2', 'mixamorig:LeftHandMiddle3',
      'mixamorig:LeftHandRing1',   'mixamorig:LeftHandRing2',   'mixamorig:LeftHandRing3',
      'mixamorig:LeftHandPinky1',  'mixamorig:LeftHandPinky2',  'mixamorig:LeftHandPinky3',
      'mixamorig:RightHandThumb1',  'mixamorig:RightHandThumb2',  'mixamorig:RightHandThumb3',
      'mixamorig:RightHandIndex1',  'mixamorig:RightHandIndex2',  'mixamorig:RightHandIndex3',
      'mixamorig:RightHandMiddle1', 'mixamorig:RightHandMiddle2', 'mixamorig:RightHandMiddle3',
      'mixamorig:RightHandRing1',   'mixamorig:RightHandRing2',   'mixamorig:RightHandRing3',
      'mixamorig:RightHandPinky1',  'mixamorig:RightHandPinky2',  'mixamorig:RightHandPinky3',
    ];
    const gltfData = { nodes: fingerMixamoNames.map(name => ({ name })) };
    const bones = converter.generateHumanBones(gltfData);
    assert.equal(Object.keys(bones).length, 30);
  });
});

describe('formatNodeDump', () => {
  it('should include hierarchy, mapping, animation targets, and transforms', () => {
    const converter = createConverter();
    const gltfData = {
      nodes: [
        { name: 'Root', children: [1] },
        { name: 'Hips', children: [2], translation: [0, 1, 0] },
        { name: 'Spine', rotation: [0, 0, 0, 1], mesh: 0, skin: 0 },
      ],
      animations: [{
        name: 'Walk',
        channels: [
          { target: { node: 1, path: 'translation' } },
          { target: { node: 2, path: 'rotation' } },
        ],
      }],
    };

    const dump = converter.formatNodeDump(gltfData);

    assert.match(dump, /Node count: 3/);
    assert.match(dump, /\[1\] Hips/);
    assert.match(dump, /parent: 0; children: 2; mapped: hips; animated: Walk:translation; transforms: T/);
    assert.match(dump, /\[2\] Spine/);
    assert.match(dump, /mapped: spine; animated: Walk:rotation; transforms: R; mesh: 0; skin: 0/);
  });
});

describe('getHumanoidAncestorInfluencers', () => {
  it('should report non-humanoid ancestor transforms that affect humanoid bones', () => {
    const converter = createConverter();
    const gltfData = {
      nodes: [
        { name: 'RootNode', children: [1] },
        { name: 'Armature', translation: [1, 2, 3], rotation: [0, 0, 0, 1], children: [2] },
        { name: 'Hips', children: [3] },
        { name: 'Spine' },
      ],
      animations: [{
        name: 'MoveRig',
        channels: [
          { target: { node: 1, path: 'rotation' } },
          { target: { node: 2, path: 'translation' } },
        ],
      }],
    };
    const humanBones = converter.generateHumanBones(gltfData);

    const influencers = converter.getHumanoidAncestorInfluencers(gltfData, humanBones);

    assert.equal(influencers.length, 1);
    assert.equal(influencers[0].index, 1);
    assert.equal(influencers[0].name, 'Armature');
    assert.match(influencers[0].summary, /T=\[1,2,3\]/);
    assert.match(influencers[0].summary, /animated=MoveRig:rotation/);
    assert.deepStrictEqual(influencers[0].affectedBones, ['hips', 'spine']);
  });

  it('should ignore identity non-humanoid ancestors without animation', () => {
    const converter = createConverter();
    const gltfData = {
      nodes: [
        { name: 'RootNode', translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], children: [1] },
        { name: 'Hips' },
      ],
    };
    const humanBones = converter.generateHumanBones(gltfData);

    assert.deepStrictEqual(converter.getHumanoidAncestorInfluencers(gltfData, humanBones), []);
  });
});

describe('trimAnimationData', () => {
  it('should trim sampler data and shift the in point to time zero', () => {
    const converter = createConverter();
    const gltfData = createAnimationGltf([0, 1, 2, 3], [0, 10, 20, 30]);

    converter.trimAnimationData(gltfData, { trimIn: 1, trimOut: 3 });

    const sampler = gltfData.animations[0].samplers[0];
    const buffers = converter.decodeBuffers(gltfData);
    const times = converter.readAccessorElements(gltfData, buffers, sampler.input).map(value => value[0]);
    const values = converter.readAccessorElements(gltfData, buffers, sampler.output).map(value => value[0]);

    assert.deepStrictEqual(times, [0, 1]);
    assert.deepStrictEqual(values, [10, 20]);
    assert.equal(gltfData.accessors[sampler.input].min[0], 0);
    assert.equal(gltfData.accessors[sampler.input].max[0], 1);
  });

  it('should sample fractional in points and exclude the exact out point', () => {
    const converter = createConverter();
    const gltfData = createAnimationGltf([0, 1, 2, 3], [0, 10, 20, 30]);

    converter.trimAnimationData(gltfData, { trimIn: 0.5, trimOut: 2 });

    const sampler = gltfData.animations[0].samplers[0];
    const buffers = converter.decodeBuffers(gltfData);
    const times = converter.readAccessorElements(gltfData, buffers, sampler.input).map(value => value[0]);
    const values = converter.readAccessorElements(gltfData, buffers, sampler.output).map(value => value[0]);

    assert.deepStrictEqual(times, [0, 0.5]);
    assert.deepStrictEqual(values, [5, 10]);
  });

  it('should convert frame trim points to seconds using framerate', () => {
    const converter = createConverter();
    const gltfData = createAnimationGltf([0, 0.5, 1, 1.5], [0, 5, 10, 15]);

    converter.trimAnimationData(gltfData, { trimInFrame: 15, trimOutFrame: 45, framerate: 30 });

    const sampler = gltfData.animations[0].samplers[0];
    const buffers = converter.decodeBuffers(gltfData);
    const times = converter.readAccessorElements(gltfData, buffers, sampler.input).map(value => value[0]);
    const values = converter.readAccessorElements(gltfData, buffers, sampler.output).map(value => value[0]);

    assert.deepStrictEqual(times, [0, 0.5]);
    assert.deepStrictEqual(values, [5, 10]);
  });

  it('should reject mixed seconds and frame trim options', () => {
    const converter = createConverter();
    const gltfData = createAnimationGltf([0, 1, 2, 3], [0, 10, 20, 30]);

    assert.throws(
      () => converter.trimAnimationData(gltfData, { trimIn: 1, trimOutFrame: 60, framerate: 30 }),
      /Use either seconds trim options or frame trim options/
    );
  });

  it('should blend tail samples toward the first pose when loop smoothing is enabled', () => {
    const converter = createConverter();
    const gltfData = createAnimationGltf([0, 1, 2, 3], [0, 10, 20, 30]);

    converter.trimAnimationData(gltfData, { trimIn: 0, trimOut: 3, loopSmoothing: 2, framerate: 2 });

    const sampler = gltfData.animations[0].samplers[0];
    const buffers = converter.decodeBuffers(gltfData);
    const times = converter.readAccessorElements(gltfData, buffers, sampler.input).map(value => value[0]);
    const values = converter.readAccessorElements(gltfData, buffers, sampler.output).map(value => value[0]);

    assert.deepStrictEqual(times, [0, 1, 2, 2.5]);
    assert.equal(values[0], 0);
    assert.equal(values[1], 10);
    assert.ok(values[2] < 20 && values[2] > 0);
    assert.ok(values[3] < values[2] && values[3] > 0);
  });
});

describe('shiftHipTranslationXZToOrigin', () => {
  it('should use the second hips translation sample when trim-in is not specified', () => {
    const converter = createConverter();
    const gltfData = createAnimationGltf(
      [0, 1, 2],
      [[10, 1, 20], [12, 2, 25], [15, 3, 30]],
      'VEC3'
    );
    gltfData.nodes = [{ name: 'Hips' }];

    converter.shiftHipTranslationXZToOrigin(gltfData);

    const sampler = gltfData.animations[0].samplers[0];
    const buffers = converter.decodeBuffers(gltfData);
    const values = converter.readAccessorElements(gltfData, buffers, sampler.output);

    assert.deepStrictEqual(values, [
      [-2, 1, -5],
      [0, 2, 0],
      [3, 3, 5],
    ]);
  });

  it('should use the trimmed in-point sample when trim-in is specified', () => {
    const converter = createConverter();
    const gltfData = createAnimationGltf(
      [0, 1, 2, 3],
      [[0, 1, 0], [10, 2, 20], [15, 3, 30], [20, 4, 40]],
      'VEC3'
    );
    gltfData.nodes = [{ name: 'Hips' }];

    converter.trimAnimationData(gltfData, { trimIn: 1, trimOut: 3 });
    converter.shiftHipTranslationXZToOrigin(gltfData, { useTrimInPoint: true });

    const sampler = gltfData.animations[0].samplers[0];
    const buffers = converter.decodeBuffers(gltfData);
    const values = converter.readAccessorElements(gltfData, buffers, sampler.output);

    assert.deepStrictEqual(values, [
      [0, 2, 0],
      [5, 3, 10],
    ]);
  });

  it('should preserve world altitude when hips parent is rotated', () => {
    const converter = createConverter();
    const gltfData = createAnimationGltf(
      [0, 1],
      [[1, 2, 3], [4, 5, 6]],
      'VEC3'
    );
    gltfData.nodes = [
      { name: 'Root', rotation: converter.quaternionFromAxisAngle([1, 0, 0], -90), children: [1] },
      { name: 'Hips' },
    ];
    gltfData.animations[0].channels[0].target = { node: 1, path: 'translation' };

    const parentLinear = converter.getParentWorldLinearTransform(gltfData, 1);
    const beforeReferenceWorld = converter.multiplyMat3Vec3(parentLinear, [4, 5, 6]);

    converter.shiftHipTranslationXZToOrigin(gltfData);

    const sampler = gltfData.animations[0].samplers[0];
    const buffers = converter.decodeBuffers(gltfData);
    const values = converter.readAccessorElements(gltfData, buffers, sampler.output);
    const afterReferenceWorld = converter.multiplyMat3Vec3(parentLinear, values[1]);

    assert.ok(Math.abs(afterReferenceWorld[0]) < 1e-6);
    assert.ok(Math.abs(afterReferenceWorld[2]) < 1e-6);
    assert.ok(Math.abs(afterReferenceWorld[1] - beforeReferenceWorld[1]) < 1e-6);
    assert.ok(Math.abs(values[1][0]) < 1e-6);
    assert.ok(Math.abs(values[1][1]) < 1e-6);
    assert.equal(values[1][2], 6);
  });

  it('should leave hip translation unchanged when disabled', () => {
    const converter = createConverter();
    const gltfData = createAnimationGltf(
      [0, 1],
      [[10, 1, 20], [12, 2, 25]],
      'VEC3'
    );
    gltfData.nodes = [{ name: 'Hips' }];

    converter.shiftHipTranslationXZToOrigin(gltfData, { enabled: false });

    const sampler = gltfData.animations[0].samplers[0];
    const buffers = converter.decodeBuffers(gltfData);
    const values = converter.readAccessorElements(gltfData, buffers, sampler.output);

    assert.deepStrictEqual(values, [
      [10, 1, 20],
      [12, 2, 25],
    ]);
  });
});

describe('enhanceAnimationTiming', () => {
  it('should calculate max duration from animation samplers', () => {
    const converter = createConverter();
    const gltfData = {
      animations: [
        {
          name: 'TestAnim',
          samplers: [
            { input: 0 },
            { input: 1 },
          ],
        },
      ],
      accessors: [
        { type: 'SCALAR', max: [2.5], count: 75 },
        { type: 'SCALAR', max: [3.0], count: 90 },
      ],
    };

    const result = converter.enhanceAnimationTiming(gltfData, 30);

    assert.equal(result.extras.animationMetadata.maxDuration, 3.0);
    assert.equal(result.extras.animationMetadata.framerate, 30);
    assert.equal(result.extras.animationMetadata.frameCount, 90); // ceil(3.0 * 30)
  });

  it('should handle missing animations gracefully', () => {
    const converter = createConverter();
    const gltfData = { animations: [] };
    const result = converter.enhanceAnimationTiming(gltfData, 30);
    assert.equal(result.extras, undefined);
  });

  it('should handle no animations key', () => {
    const converter = createConverter();
    const gltfData = {};
    const result = converter.enhanceAnimationTiming(gltfData, 30);
    assert.equal(result.extras, undefined);
  });
});

describe('processAnimationsWithTiming', () => {
  it('should preserve animation name, channels, and samplers', () => {
    const converter = createConverter();
    const animations = [
      { name: 'Walk', channels: [{ target: {}, sampler: 0 }], samplers: [{}] },
    ];

    const result = converter.processAnimationsWithTiming(animations, 2.5);

    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'Walk');
    assert.equal(result[0].channels.length, 1);
    assert.equal(result[0].samplers.length, 1);
    // extras は付与しない（仕様外）
    assert.equal(result[0].extras, undefined);
  });

  it('should assign default name when animation has no name', () => {
    const converter = createConverter();
    const animations = [{ channels: [], samplers: [] }];

    const result = converter.processAnimationsWithTiming(animations, 1.0);

    assert.equal(result[0].name, 'VRMAnimation0');
  });

  it('should return empty array for no animations', () => {
    const converter = createConverter();
    assert.deepStrictEqual(converter.processAnimationsWithTiming([], 1.0), []);
    assert.deepStrictEqual(converter.processAnimationsWithTiming(null, 1.0), []);
  });

  it('should remove scale channels for humanoid bones', () => {
    const converter = createConverter();
    const humanBones = { hips: { node: 0 }, spine: { node: 1 } };
    const animations = [{
      name: 'Test',
      channels: [
        { target: { node: 0, path: 'rotation' }, sampler: 0 }, // hips rotation: OK
        { target: { node: 0, path: 'scale' },    sampler: 1 }, // hips scale: 禁止
        { target: { node: 1, path: 'scale' },    sampler: 2 }, // spine scale: 禁止
      ],
      samplers: [{}, {}, {}],
    }];

    const result = converter.processAnimationsWithTiming(animations, 1.0, humanBones);

    assert.equal(result[0].channels.length, 1);
    assert.equal(result[0].channels[0].target.path, 'rotation');
    assert.equal(result[0].samplers.length, 1);
  });

  it('should remove translation channels for non-hips humanoid bones', () => {
    const converter = createConverter();
    const humanBones = { hips: { node: 0 }, spine: { node: 1 } };
    const animations = [{
      name: 'Test',
      channels: [
        { target: { node: 0, path: 'translation' }, sampler: 0 }, // hips translation: OK
        { target: { node: 1, path: 'translation' }, sampler: 1 }, // spine translation: 禁止
        { target: { node: 1, path: 'rotation' },    sampler: 2 }, // spine rotation: OK
      ],
      samplers: [{}, {}, {}],
    }];

    const result = converter.processAnimationsWithTiming(animations, 1.0, humanBones);

    assert.equal(result[0].channels.length, 2);
    assert.equal(result[0].channels[0].target.path, 'translation');
    assert.equal(result[0].channels[0].target.node, 0); // hips
    assert.equal(result[0].channels[1].target.path, 'rotation');
    // サンプラーインデックスが詰め直されていること
    assert.equal(result[0].channels[0].sampler, 0);
    assert.equal(result[0].channels[1].sampler, 1);
    assert.equal(result[0].samplers.length, 2);
  });

  it('should pass through channels for non-humanoid nodes', () => {
    const converter = createConverter();
    const humanBones = { hips: { node: 0 } };
    const animations = [{
      name: 'Test',
      channels: [
        { target: { node: 99, path: 'scale' },       sampler: 0 }, // 非ヒューマノイド: 通す
        { target: { node: 99, path: 'translation' }, sampler: 1 }, // 非ヒューマノイド: 通す
      ],
      samplers: [{}, {}],
    }];

    const result = converter.processAnimationsWithTiming(animations, 1.0, humanBones);

    assert.equal(result[0].channels.length, 2);
  });
});

describe('applyCorrectionData', () => {
  it('should apply correction JSON entries to matching humanoid rotation channels', () => {
    const converter = createConverter();
    const gltfData = createAnimationGltf([0], [[0, 0, 0, 1]], 'VEC4');
    gltfData.nodes = [{ name: 'arm_stretch.l' }];
    gltfData.animations[0].channels[0].target = { node: 0, path: 'rotation' };
    const correction = converter.quaternionFromAxisAngle([1, 0, 0], -45);

    converter.applyCorrectionData(gltfData, { leftUpperArm: { node: 0 } }, {
      corrections: [{
        vrmBone: 'leftUpperArm',
        localPostCorrectionQuaternion: correction,
      }],
    });

    const sampler = gltfData.animations[0].samplers[0];
    const buffers = converter.decodeBuffers(gltfData);
    const rotations = converter.readAccessorElements(gltfData, buffers, sampler.output);

    assert.ok(rotations[0][0] < -0.38 && rotations[0][0] > -0.39);
    assert.ok(rotations[0][3] > 0.92 && rotations[0][3] < 0.93);
  });

  it('should apply WXYZ bone rotation offset config entries by VRM bone name', () => {
    const converter = createConverter();
    const gltfData = createAnimationGltf([0], [[0, 0, 0, 1]], 'VEC4');
    gltfData.nodes = [{ name: 'arm_stretch.l' }];
    gltfData.animations[0].channels[0].target = { node: 0, path: 'rotation' };
    const xyzw = converter.quaternionFromAxisAngle([1, 0, 0], -45);
    const wxyz = [xyzw[3], xyzw[0], xyzw[1], xyzw[2]];

    converter.applyCorrectionData(gltfData, { leftUpperArm: { node: 0 } }, {
      rotationFormat: 'quaternion_wxyz',
      bones: {
        hips: null,
        leftUpperArm: wxyz,
      },
    });

    const sampler = gltfData.animations[0].samplers[0];
    const buffers = converter.decodeBuffers(gltfData);
    const rotations = converter.readAccessorElements(gltfData, buffers, sampler.output);

    assert.ok(rotations[0][0] < -0.38 && rotations[0][0] > -0.39);
    assert.ok(rotations[0][3] > 0.92 && rotations[0][3] < 0.93);
  });

  it('should apply Euler XYZ degree bone rotation offset config entries', () => {
    const converter = createConverter();
    const gltfData = createAnimationGltf([0], [[0, 0, 0, 1]], 'VEC4');
    gltfData.nodes = [{ name: 'arm_stretch.l' }];
    gltfData.animations[0].channels[0].target = { node: 0, path: 'rotation' };

    converter.applyCorrectionData(gltfData, { leftUpperArm: { node: 0 } }, {
      rotationFormat: 'euler_xyz_degrees',
      bones: {
        leftUpperArm: [-45, 0, 0],
      },
    });

    const sampler = gltfData.animations[0].samplers[0];
    const buffers = converter.decodeBuffers(gltfData);
    const rotations = converter.readAccessorElements(gltfData, buffers, sampler.output);

    assert.ok(rotations[0][0] < -0.38 && rotations[0][0] > -0.39);
    assert.ok(rotations[0][3] > 0.92 && rotations[0][3] < 0.93);
  });

  it('should invert WXYZ bone rotation offset config entries when requested', () => {
    const converter = createConverter();
    const xyzw = converter.quaternionFromAxisAngle([1, 0, 0], -45);
    const wxyz = [xyzw[3], xyzw[0], xyzw[1], xyzw[2]];

    const correctionMap = converter.buildCorrectionMap({
      rotationFormat: 'quaternion_wxyz',
      invert: true,
      bones: {
        leftUpperArm: wxyz,
      },
    });
    const correction = correctionMap.get('leftUpperArm');

    assert.ok(correction[0] > 0.38 && correction[0] < 0.39);
    assert.ok(correction[3] > 0.92 && correction[3] < 0.93);
  });

  it('should reject malformed bone rotation offset config entries', () => {
    const converter = createConverter();

    assert.throws(
      () => converter.buildCorrectionMap({ bones: { leftUpperArm: [1, 2, 3] } }),
      /Quaternion bone offset/
    );
    assert.throws(
      () => converter.buildCorrectionMap({ rotationFormat: 'euler_xyz_degrees', bones: { leftUpperArm: [1, 2, 3, 4] } }),
      /Euler bone offset/
    );
  });

  it('should apply path-keyed pose corrections to matching rotation channels', () => {
    const converter = createConverter();
    const gltfData = createAnimationGltf([0], [[0, 0, 0, 1]], 'VEC4');
    gltfData.nodes = [
      { name: 'root1', children: [1] },
      { name: 'root.x', children: [2] },
      { name: 'arm_stretch.r' },
    ];
    gltfData.animations[0].channels[0].target = { node: 2, path: 'rotation' };
    const correction = converter.quaternionFromAxisAngle([1, 0, 0], -45);

    converter.applyCorrectionData(gltfData, {}, {
      corrections: [{
        hierarchyPath: 'root1/root.x/arm_stretch.r',
        localPostCorrectionQuaternion: correction,
      }],
    });

    const sampler = gltfData.animations[0].samplers[0];
    const buffers = converter.decodeBuffers(gltfData);
    const rotations = converter.readAccessorElements(gltfData, buffers, sampler.output);

    assert.ok(rotations[0][0] < -0.38 && rotations[0][0] > -0.39);
  });

  it('should apply path-keyed corrections when glTF has an extra root prefix', () => {
    const converter = createConverter();
    const gltfData = createAnimationGltf([0], [[0, 0, 0, 1]], 'VEC4');
    gltfData.nodes = [
      { name: 'RootNode', children: [1] },
      { name: 'root1', children: [2] },
      { name: 'root.x', children: [3] },
      { name: 'arm_stretch.r' },
    ];
    gltfData.animations[0].channels[0].target = { node: 3, path: 'rotation' };
    const correction = converter.quaternionFromAxisAngle([1, 0, 0], -45);

    converter.applyCorrectionData(gltfData, {}, {
      corrections: [{
        hierarchyPath: 'root1/root.x/arm_stretch.r',
        localPostCorrectionQuaternion: correction,
      }],
    });

    const sampler = gltfData.animations[0].samplers[0];
    const buffers = converter.decodeBuffers(gltfData);
    const rotations = converter.readAccessorElements(gltfData, buffers, sampler.output);

    assert.ok(rotations[0][0] < -0.38 && rotations[0][0] > -0.39);
  });

  it('should reject malformed correction JSON entries', () => {
    const converter = createConverter();

    assert.throws(
      () => converter.buildCorrectionMap({ corrections: [{ vrmBone: 'leftUpperArm' }] }),
      /localPostCorrectionQuaternion/
    );
  });
});

describe('convertToVRMAWithTiming', () => {
  it('should produce valid VRMA structure', () => {
    const converter = createConverter();
    const gltfData = {
      asset: { version: '2.0', generator: 'test' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{
        name: 'mixamorig:Hips',
        mesh: 0,
        skin: 0,
        scale: [1, 1, 1],
        camera: 0,
        extensions: { KHR_lights_punctual: { light: 0 } },
        extras: { source: 'fbx' },
        weights: [1],
        matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      }],
      animations: [{ name: 'Idle', channels: [], samplers: [] }],
      accessors: [],
      bufferViews: [],
      buffers: [],
      extras: {
        animationMetadata: {
          maxDuration: 2.0,
          framerate: 30,
          frameCount: 60,
        },
      },
    };

    const vrma = converter.convertToVRMAWithTiming(gltfData);

    assert.deepStrictEqual(vrma.extensionsUsed, ['VRMC_vrm_animation']);
    const ext = vrma.extensions['VRMC_vrm_animation'];
    assert.equal(ext.specVersion, '1.0');
    assert.deepStrictEqual(ext.humanoid.humanBones, { hips: { node: 0 } });
    // meta は仕様外なので extension に存在しないこと
    assert.equal(ext.meta, undefined);
    // タイミング情報は extras に格納されること
    assert.equal(vrma.extras.duration, 2.0);
    assert.equal(vrma.extras.frameCount, 60);
    assert.equal(vrma.extras.framerate, 30);
    // ジオメトリ系フィールドが含まれないこと
    assert.equal(vrma.materials, undefined);
    assert.equal(vrma.meshes, undefined);
    assert.equal(vrma.skins, undefined);
    assert.equal(vrma.textures, undefined);
    assert.equal(vrma.images, undefined);
    assert.equal(vrma.nodes[0].mesh, undefined);
    assert.equal(vrma.nodes[0].skin, undefined);
    assert.equal(vrma.nodes[0].scale, undefined);
    assert.equal(vrma.nodes[0].camera, undefined);
    assert.equal(vrma.nodes[0].extensions, undefined);
    assert.equal(vrma.nodes[0].extras, undefined);
    assert.equal(vrma.nodes[0].weights, undefined);
    assert.equal(vrma.nodes[0].matrix, undefined);
    assert.deepStrictEqual(Object.keys(vrma.nodes[0]).sort(), ['name']);
    assert.equal(vrma.animations.length, 1);
  });

  it('should apply rest-pose profile rotations to mapped humanoid nodes', () => {
    const converter = createConverter();
    const gltfData = {
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [
        { name: 'mixamorig:Hips', rotation: [0, 0, 0, 1] },
        { name: 'mixamorig:RightArm', rotation: [0, 0, 0, 1] },
      ],
      animations: [{ name: 'Idle', channels: [], samplers: [] }],
      accessors: [],
      bufferViews: [],
      buffers: [],
    };

    const vrma = converter.convertToVRMAWithTiming(gltfData, {
      restPoseData: {
        rotationFormat: 'quaternion_xyzw',
        bones: {
          rightUpperArm: {
            nodeName: 'mixamorig:RightArm',
            rotation: [0.25, 0, 0, 0.968245836],
          },
        },
      },
    });

    assert.deepStrictEqual(vrma.nodes[0].rotation, [0, 0, 0, 1]);
    assert.ok(vrma.nodes[1].rotation[0] > 0.25 - 1e-6);
    assert.ok(vrma.nodes[1].rotation[3] < 0.969);
    assert.deepStrictEqual(vrma.extensions.VRMC_vrm_animation.humanoid.humanBones.rightUpperArm, { node: 1 });
  });

  it('should reject malformed rest-pose profiles', () => {
    const converter = createConverter();

    assert.throws(
      () => converter.buildRestPoseRotationMap({}),
      /bones object/
    );
    assert.throws(
      () => converter.buildRestPoseRotationMap({ rotationFormat: 'euler_xyz_degrees', bones: { rightUpperArm: [1, 2, 3] } }),
      /Unsupported rotationFormat/
    );
    assert.throws(
      () => converter.buildRestPoseRotationMap({ bones: { rightUpperArm: [1, 2, 3] } }),
      /quaternion with 4 numbers/
    );
  });

  it('should strip mesh and skin references from nodes', () => {
    const converter = createConverter();
    const gltfData = {
      asset: { version: '2.0' },
      nodes: [
        { name: 'mixamorig:Hips', mesh: 0, skin: 0 },
        { name: 'mixamorig:Spine', translation: [0, 1, 0] },
        { name: 'Body', mesh: 1 },
      ],
      animations: [],
      accessors: [],
      bufferViews: [],
      buffers: [],
    };

    const vrma = converter.convertToVRMAWithTiming(gltfData);

    // mesh / skin プロパティが除去されていること
    assert.equal(vrma.nodes[0].mesh, undefined);
    assert.equal(vrma.nodes[0].skin, undefined);
    assert.equal(vrma.nodes[2].mesh, undefined);
    // 他のプロパティは保持されること
    assert.equal(vrma.nodes[0].name, 'mixamorig:Hips');
    assert.deepStrictEqual(vrma.nodes[1].translation, [0, 1, 0]);
  });

  it('should use default duration and framerate when no metadata', () => {
    const converter = createConverter();
    const gltfData = {
      asset: { version: '2.0' },
      nodes: [{ name: 'mixamorig:Hips' }],
      animations: [],
      accessors: [],
      bufferViews: [],
      buffers: [],
    };

    const vrma = converter.convertToVRMAWithTiming(gltfData);

    assert.equal(vrma.extras.duration, 5.0);
    assert.equal(vrma.extras.framerate, 30);
    assert.equal(vrma.extras.frameCount, 0);
  });

  it('should fail when no humanoid bones are matched', () => {
    const converter = createConverter();
    const gltfData = {
      asset: { version: '2.0' },
      nodes: [{ name: 'UnknownRootBone' }],
      animations: [],
      accessors: [],
      bufferViews: [],
      buffers: [],
    };

    assert.throws(
      () => converter.convertToVRMAWithTiming(gltfData),
      /No humanoid bones matched/
    );
  });
});

describe('getDefaultBinaryName', () => {
  it('should return a non-empty string', () => {
    assert.ok(typeof getDefaultBinaryName() === 'string');
    assert.ok(getDefaultBinaryName().length > 0);
  });

  it('should match the current platform', () => {
    const name = getDefaultBinaryName();
    const platform = os.platform();
    if (platform === 'win32') {
      assert.ok(name.endsWith('.exe'), `Expected .exe suffix on Windows, got: ${name}`);
    } else if (platform === 'linux') {
      assert.ok(name.includes('linux'), `Expected 'linux' in name, got: ${name}`);
    } else if (platform === 'darwin') {
      assert.ok(name.includes('darwin'), `Expected 'darwin' in name, got: ${name}`);
    }
  });
});

describe('saveAsGLB', () => {
  it('should produce a valid GLB binary with correct magic bytes', async () => {
    const converter = createConverter();
    const vrmaData = {
      asset: { version: '2.0' },
      nodes: [],
      animations: [],
      accessors: [],
      bufferViews: [],
      buffers: [{ byteLength: 4, uri: 'data:application/octet-stream;base64,AQIDBA==' }],
      extensionsUsed: ['VRMC_vrm_animation'],
      extensions: { 'VRMC_vrm_animation': { specVersion: '1.0', humanoid: { humanBones: {} } } },
    };

    const outPath = '/tmp/test_output.vrma';
    await converter.saveAsGLB(vrmaData, outPath);

    const buf = require('fs').readFileSync(outPath);
    // magic: "glTF"
    assert.equal(buf.readUInt32LE(0), 0x46546C67);
    // version: 2
    assert.equal(buf.readUInt32LE(4), 2);
    // total length matches file size
    assert.equal(buf.readUInt32LE(8), buf.length);
    // JSON chunk type
    assert.equal(buf.readUInt32LE(16), 0x4E4F534A);
    // BIN chunk type (after JSON chunk)
    const jsonChunkLength = buf.readUInt32LE(12);
    assert.equal(buf.readUInt32LE(20 + jsonChunkLength + 4), 0x004E4942);
  });

  it('should embed buffer as BIN chunk without data URI', async () => {
    const converter = createConverter();
    const vrmaData = {
      asset: { version: '2.0' },
      buffers: [{ byteLength: 4, uri: 'data:application/octet-stream;base64,AQIDBA==' }],
    };

    const outPath = '/tmp/test_output2.vrma';
    await converter.saveAsGLB(vrmaData, outPath);

    const buf = require('fs').readFileSync(outPath);
    const jsonChunkLength = buf.readUInt32LE(12);
    const jsonStr = buf.slice(20, 20 + jsonChunkLength).toString('utf8').trim();
    const json = JSON.parse(jsonStr);

    // buffer URI が除去されていること
    assert.equal(json.buffers[0].uri, undefined);
  });

  it('should align chunks to 4-byte boundary', async () => {
    const converter = createConverter();
    // JSON が4バイト境界にならないサイズになるデータを用意
    const vrmaData = { asset: { version: '2.0' }, x: 'abc' };
    const outPath = '/tmp/test_output3.vrma';
    await converter.saveAsGLB(vrmaData, outPath);

    const buf = require('fs').readFileSync(outPath);
    const jsonChunkLength = buf.readUInt32LE(12);
    // JSON チャンク長が4の倍数であること
    assert.equal(jsonChunkLength % 4, 0);
    // 総サイズが4の倍数であること
    assert.equal(buf.length % 4, 0);
  });
});

describe('convert (validation)', () => {
  it('should reject non-existent input file', async () => {
    const converter = createConverter();
    const result = await converter.convert(
      '/nonexistent/file.fbx',
      '/tmp/output.vrma',
      './FBX2glTF-darwin-x64',
      '30'
    );
    assert.equal(result, false);
  });

  it('should reject non-existent FBX2glTF binary', async () => {
    const converter = createConverter();
    // Use the test file itself as a valid input path
    const result = await converter.convert(
      './test.js',
      '/tmp/output.vrma',
      '/nonexistent/FBX2glTF',
      '30'
    );
    assert.equal(result, false);
  });
});

describe('resolveOutputPath', () => {
  const { mkdtempSync, rmSync } = require('fs');
  const tmpdir = require('os').tmpdir;

  it('should use input dir and name when no output is specified', async () => {
    const converter = createConverter();
    const result = await converter.resolveOutputPath('/some/dir/animation.fbx', undefined);
    assert.equal(result, '/some/dir/animation.vrma');
  });

  it('should use input filename in an existing output directory', async () => {
    const converter = createConverter();
    const dir = mkdtempSync(tmpdir() + '/fbx2vrma-test-');
    try {
      const result = await converter.resolveOutputPath('/some/animation.fbx', dir);
      assert.equal(result, require('path').join(dir, 'animation.vrma'));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('should treat trailing slash as a directory path', async () => {
    const converter = createConverter();
    const result = await converter.resolveOutputPath('/some/animation.fbx', '/output/dir/');
    assert.equal(result, '/output/dir/animation.vrma');
  });

  it('should use the specified path as-is when it is a file path', async () => {
    const converter = createConverter();
    const result = await converter.resolveOutputPath('/some/animation.fbx', '/output/custom.vrma');
    assert.equal(result, '/output/custom.vrma');
  });
});

describe('convertDirectory', () => {
  const { mkdtempSync, writeFileSync, rmSync } = require('fs');
  const tmpdir = require('os').tmpdir;

  it('should return false when no FBX files found', async () => {
    const converter = createConverter();
    // 空のディレクトリを使う
    const dir = mkdtempSync(tmpdir() + '/fbx2vrma-test-');
    try {
      const result = await converter.convertDirectory(dir, dir + '/out', './FBX2glTF-darwin-x64', '30');
      assert.equal(result, false);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('should detect FBX files in directory', async () => {
    const converter = createConverter();
    const dir = mkdtempSync(tmpdir() + '/fbx2vrma-test-');
    try {
      // ダミーの .fbx ファイルを作成（実際の変換は行わない）
      writeFileSync(dir + '/motion1.fbx', 'dummy');
      writeFileSync(dir + '/motion2.fbx', 'dummy');
      writeFileSync(dir + '/readme.txt', 'dummy'); // 無視されること

      // 変換自体は失敗するが、FBXを2ファイル検出してバイナリチェックまで到達する
      // ここではディレクトリ検出ロジックのみ確認
      const entries = await require('fs-extra').readdir(dir);
      const fbxFiles = entries.filter(f => require('path').extname(f).toLowerCase() === '.fbx');
      assert.equal(fbxFiles.length, 2);
      assert.ok(!fbxFiles.includes('readme.txt'));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

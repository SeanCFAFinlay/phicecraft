// ============================================================================
// COMPRESS MODELS
//
// Blender exports the two player GLBs as plain float32 streams: about 0.95 MB
// each, almost all of it vertex data (positions, normals, UVs, four float
// skin weights per vertex). Every coach who opens the 3D view downloads and
// parses both before a single player appears.
//
// This rewrites each GLB in place, in two lossless-to-the-eye steps:
//
//   1. Quantize (KHR_mesh_quantization): normals to signed bytes, UVs to
//      unsigned shorts, skin weights to unsigned bytes that still sum to
//      exactly one. Positions stay float - a skinned mesh ignores the node
//      transform a quantized position would need to undo its scale.
//   2. Pack every stream with meshoptimizer (EXT_meshopt_compression), which
//      three's GLTFLoader decodes with its bundled MeshoptDecoder. Positions
//      go through the exponential filter (15-bit mantissa, well under a
//      tenth of a millimetre on a 2 m player).
//
// Run after `refine-hockey-models.py`; it skips a file that is already
// compressed, so running it twice is harmless:
//
//   npm run models:compress
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshoptEncoder } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = ['hockey_player.glb', 'hockey_goalie.glb'].map(name => path.join(ROOT, 'public/assets/models', name));

const MESHOPT = 'EXT_meshopt_compression';
const QUANTIZATION = 'KHR_mesh_quantization';
const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const FLOAT = 5126;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

const align4 = n => (n + 3) & ~3;

function readGlb(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a GLB`);
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength));
  const binHeader = 20 + jsonLength;
  const binLength = buffer.readUInt32LE(binHeader);
  const bin = new Uint8Array(buffer.buffer, buffer.byteOffset + binHeader + 8, binLength);
  return { json, bin };
}

function writeGlb(file, json, bin) {
  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPadded = Buffer.alloc(align4(jsonBytes.length), 0x20);
  jsonBytes.copy(jsonPadded);
  const binPadded = Buffer.alloc(align4(bin.length));
  Buffer.from(bin.buffer, bin.byteOffset, bin.length).copy(binPadded);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonPadded.length + 8 + binPadded.length, 8);
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(data.length, 0);
    head.writeUInt32LE(type, 4);
    return Buffer.concat([head, data]);
  };
  fs.writeFileSync(file, Buffer.concat([header, chunk(0x4e4f534a, jsonPadded), chunk(0x004e4942, binPadded)]));
}

/** An accessor's elements, tightly packed (any interleaving stride removed). */
function tightBytes(json, bin, accessor) {
  const view = json.bufferViews[accessor.bufferView];
  if (view.buffer !== 0) throw new Error('only single-buffer GLBs are supported');
  const elementBytes = COMPONENTS[accessor.type] * COMPONENT_BYTES[accessor.componentType];
  const stride = view.byteStride || elementBytes;
  const base = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const out = new Uint8Array(accessor.count * elementBytes);
  for (let i = 0; i < accessor.count; i++) {
    out.set(bin.subarray(base + i * stride, base + i * stride + elementBytes), i * elementBytes);
  }
  return out;
}

const floatsOf = bytes => new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));

function quantizeNormals(floats, count) {
  const out = new Int8Array(count * 4);
  for (let i = 0; i < count; i++) {
    const [x, y, z] = [floats[i * 3], floats[i * 3 + 1], floats[i * 3 + 2]];
    const length = Math.hypot(x, y, z) || 1;
    out[i * 4] = Math.round((x / length) * 127);
    out[i * 4 + 1] = Math.round((y / length) * 127);
    out[i * 4 + 2] = Math.round((z / length) * 127);
  }
  return new Uint8Array(out.buffer);
}

function quantizeUvs(floats, count) {
  const out = new Uint16Array(count * 2);
  for (let i = 0; i < count * 2; i++) out[i] = Math.round(Math.min(1, Math.max(0, floats[i])) * 65535);
  return new Uint8Array(out.buffer);
}

/** Four weights per vertex as bytes that sum to exactly 255, so skinning never drifts. */
function quantizeWeights(floats, count) {
  const out = new Uint8Array(count * 4);
  for (let i = 0; i < count; i++) {
    const w = [0, 1, 2, 3].map(k => Math.max(0, floats[i * 4 + k]));
    const total = w.reduce((a, b) => a + b, 0) || 1;
    const q = w.map(v => Math.round((v / total) * 255));
    const error = 255 - q.reduce((a, b) => a + b, 0);
    q[q.indexOf(Math.max(...q))] += error;
    out.set(q, i * 4);
  }
  return out;
}

function compress(file) {
  const { json, bin } = readGlb(file);
  if (json.extensionsUsed?.includes(MESHOPT)) {
    console.log(`${path.basename(file)}: already compressed, skipped`);
    return;
  }
  if ((json.images?.length ?? 0) > 0 || json.accessors.some(a => a.sparse)) {
    throw new Error(`${file}: images and sparse accessors are not handled`);
  }

  // What each accessor is for decides how it is quantized and encoded.
  const roles = new Map();
  for (const mesh of json.meshes) {
    for (const primitive of mesh.primitives) {
      for (const [name, index] of Object.entries(primitive.attributes)) roles.set(index, name);
      if (primitive.indices !== undefined) roles.set(primitive.indices, 'INDICES');
    }
  }
  for (const animation of json.animations ?? []) {
    for (const sampler of animation.samplers) {
      roles.set(sampler.input, 'ANIMATION');
      roles.set(sampler.output, 'ANIMATION');
    }
  }
  for (const skin of json.skins ?? []) {
    if (skin.inverseBindMatrices !== undefined) roles.set(skin.inverseBindMatrices, 'IBM');
  }

  const packed = [];
  let packedLength = 0;
  let fallbackLength = 0;
  const views = [];

  json.accessors.forEach((accessor, index) => {
    if (accessor.bufferView === undefined) return;
    const role = roles.get(index) ?? 'OTHER';
    let bytes = tightBytes(json, bin, accessor);
    let stride = COMPONENTS[accessor.type] * COMPONENT_BYTES[accessor.componentType];
    let mode = 'ATTRIBUTES';
    let filter;
    const isFloat = accessor.componentType === FLOAT;

    if (role === 'NORMAL' && isFloat) {
      bytes = quantizeNormals(floatsOf(bytes), accessor.count);
      Object.assign(accessor, { componentType: 5120, normalized: true });
      stride = 4;
    } else if (role.startsWith('TEXCOORD') && isFloat && accessor.min?.every(v => v >= 0) && accessor.max?.every(v => v <= 1)) {
      bytes = quantizeUvs(floatsOf(bytes), accessor.count);
      Object.assign(accessor, { componentType: 5123, normalized: true });
      stride = 4;
      delete accessor.min;
      delete accessor.max;
    } else if (role.startsWith('WEIGHTS') && isFloat) {
      bytes = quantizeWeights(floatsOf(bytes), accessor.count);
      Object.assign(accessor, { componentType: 5121, normalized: true });
      stride = 4;
    } else if (role === 'POSITION' && isFloat) {
      bytes = MeshoptEncoder.encodeFilterExp(floatsOf(bytes), accessor.count, 12, 15);
      filter = 'EXPONENTIAL';
    } else if (role === 'INDICES') {
      mode = 'TRIANGLES';
    }

    const isVertex = !['INDICES', 'ANIMATION', 'IBM', 'OTHER'].includes(role);
    const encodable = stride % 4 === 0 && stride <= 256 && (mode !== 'TRIANGLES' || accessor.count % 3 === 0);
    const view = { byteLength: bytes.length };
    if (isVertex) {
      view.target = ARRAY_BUFFER;
      view.byteStride = stride;
    }
    if (role === 'INDICES') view.target = ELEMENT_ARRAY_BUFFER;

    if (encodable || mode === 'TRIANGLES') {
      const encoded = MeshoptEncoder.encodeGltfBuffer(bytes, accessor.count, mode === 'TRIANGLES' ? COMPONENT_BYTES[accessor.componentType] : stride, mode);
      const extension = { buffer: 0, byteOffset: packedLength, byteLength: encoded.length, byteStride: mode === 'TRIANGLES' ? COMPONENT_BYTES[accessor.componentType] : stride, mode, count: accessor.count };
      if (filter) extension.filter = filter;
      packed.push({ offset: packedLength, data: encoded });
      packedLength = align4(packedLength + encoded.length);
      Object.assign(view, { buffer: 1, byteOffset: fallbackLength, extensions: { [MESHOPT]: extension } });
      fallbackLength = align4(fallbackLength + bytes.length);
    } else {
      packed.push({ offset: packedLength, data: bytes });
      Object.assign(view, { buffer: 0, byteOffset: packedLength });
      packedLength = align4(packedLength + bytes.length);
    }

    accessor.bufferView = views.length;
    accessor.byteOffset = 0;
    views.push(view);
  });

  const out = new Uint8Array(packedLength);
  for (const { offset, data } of packed) out.set(data, offset);

  json.bufferViews = views;
  json.buffers = [
    { byteLength: out.length },
    { byteLength: fallbackLength, extensions: { [MESHOPT]: { fallback: true } } },
  ];
  json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), MESHOPT, QUANTIZATION])];
  json.extensionsRequired = [...new Set([...(json.extensionsRequired ?? []), MESHOPT, QUANTIZATION])];

  const before = fs.statSync(file).size;
  writeGlb(file, json, out);
  const after = fs.statSync(file).size;
  console.log(`${path.basename(file)}: ${(before / 1024).toFixed(0)} KiB -> ${(after / 1024).toFixed(0)} KiB`);
}

await MeshoptEncoder.ready;
for (const file of MODELS) compress(file);

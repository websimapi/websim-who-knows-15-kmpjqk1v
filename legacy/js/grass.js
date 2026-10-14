// Shared close grass for the overworld and both films. Each instance is a
// handful of shaped blades; only their tips move, so roots stay in the soil.
import * as THREE from "three";

function bladeGeometry(blades, segments, coarse) {
  const positions = [], normals = [], colors = [], flex = [], indices = [];
  for (let b = 0; b < blades; b++) {
    const angle = b * 2.399963 + .35;
    const dx = Math.cos(angle), dz = Math.sin(angle);
    const length = (coarse ? .43 : .57) + ((b * 7) % 7) * (coarse ? .055 : .075);
    const width = (coarse ? .1 : .075) + (b % 4) * .011;
    const ox = Math.cos(b * 5.3) * .12, oz = Math.sin(b * 5.3) * .12;
    const start = positions.length / 3;
    for (let row = 0; row <= segments; row++) {
      const f = row / segments;
      const half = width * (1 - f * f) * (row === segments ? .025 : 1);
      const lean = f * f * (.13 + (b % 4) * .055);
      for (const side of [-1, 1]) {
        positions.push(ox + dx * half * side + dz * lean, length * f, oz + dz * half * side - dx * lean);
        normals.push(-dz, .32, dx);
        const shade = .6 + f * .38 + (b % 3) * .025;
        colors.push(shade * .84, shade, shade * .72);
        flex.push(f);
      }
      if (row < segments) {
        const v = start + row * 2;
        indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute("aFlex", new THREE.Float32BufferAttribute(flex, 1));
  g.setIndex(indices);
  return g;
}

export function createGrassField(scene, { capacity, blades = 5, segments = 4, coarse = false, palette = "wild", inner = 0, radius = 0, fade = 16 }) {
  const uniforms = {
    uGrassTime: { value: 0 },
    uGrassWind: { value: new THREE.Vector2(1, 0) },
    uGrassStrength: { value: .5 },
    uGrassWetness: { value: 0 },
    uGrassCenter: { value: new THREE.Vector2() },
    uGrassRange: { value: new THREE.Vector4(inner, inner ? inner + fade : 0, Math.max(0, radius - fade), radius) },
    uGrassReveal: { value: radius ? 0 : 1 },
    uGrassOpacity: { value: 1 },
  };
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, side: THREE.DoubleSide, roughness: .91,
    metalness: 0, fog: true,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
      attribute float aFlex;
      uniform float uGrassTime;
      uniform vec2 uGrassWind;
      uniform float uGrassStrength;
      uniform float uGrassWetness;`);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
      varying float vGrassFade;
      uniform vec2 uGrassCenter;
      uniform vec4 uGrassRange;
      uniform float uGrassReveal;
      uniform float uGrassOpacity;`);
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      vec2 root = instanceMatrix[3].xz;
      float distanceToPlayer = distance(root, uGrassCenter);
      float innerFade = uGrassRange.y > uGrassRange.x
        ? smoothstep(uGrassRange.x, uGrassRange.y, distanceToPlayer) : 1.0;
      float outerFade = uGrassRange.w > uGrassRange.z
        ? 1.0 - smoothstep(uGrassRange.z, uGrassRange.w, distanceToPlayer) : 1.0;
      vGrassFade = innerFade * outerFade * uGrassReveal * uGrassOpacity;
      vec2 windDir = uGrassWind;
      float along = dot(root, windDir);
      float pressure = .72 + .28 * sin(along * .08 - uGrassTime * 1.8);
      float gust = .72 + .28 * sin(uGrassTime * .73 + along * .035);
      float flexion = aFlex * aFlex;
      vec2 bend = windDir * pressure * gust * uGrassStrength * .42;
      transformed.xz += bend * flexion;
      transformed.y -= flexion * (uGrassWetness * .13 + uGrassStrength * .025);`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      uniform float uGrassWetness;
      varying float vGrassFade;`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      // Screen-door transparency keeps depth and shadows stable for overlapping blades.
      float dither = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(.06711056, .00583715))));
      if (dither > vGrassFade) discard;
      diffuseColor.rgb *= 1.0 - uGrassWetness * .22;`);
  };
  mat.customProgramCacheKey = () => "wind-grass-fade-v3";
  const geometry = bladeGeometry(blades, segments, coarse);
  // Overworld grass is split into world-space tiles. The same instances are
  // drawn, but tiles outside the camera frustum never reach the vertex shader.
  // Film grass has no moving radius, so it keeps its single draw call.
  // Small fields are cheaper as one draw call; larger fields save more GPU
  // vertex work than the extra tile draw calls cost.
  const tiled = radius > 0 && capacity >= 20000;
  const chunks = tiled ? new Map() : null;
  const tileSize = tiled ? Math.max(24, radius * .5) : 0;
  const mesh = tiled ? new THREE.Group() : new THREE.InstancedMesh(geometry, mat, capacity);
  if (!tiled) {
    mesh.count = 0;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
  }
  scene.add(mesh);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const base = new THREE.Color(palette === "wild" ? "#527b34" : "#587055");
  const alternate = new THREE.Color(palette === "wild" ? "#9fae57" : "#82916b");
  let receiveShadow = true;
  let totalCount = 0;
  const writeInstance = (target, i, p) => {
    // Sink the root fan slightly; nearby blades spread across sloping triangles.
    dummy.position.set(p.x, p.y - .115, p.z);
    dummy.rotation.set(0, p.rotation || 0, 0);
    dummy.scale.setScalar(p.scale ?? 1);
    dummy.updateMatrix();
    target.setMatrixAt(i, dummy.matrix);
    color.copy(base).lerp(alternate, p.tint ?? ((i * .61803398875) % 1) * .7);
    target.setColorAt(i, color);
  };
  return {
    mesh,
    setReceiveShadow(value) {
      receiveShadow = value;
      if (chunks) for (const chunk of chunks.values()) chunk.receiveShadow = value;
      else mesh.receiveShadow = value;
    },
    setPositions(positions) {
      const count = Math.min(capacity, positions.length);
      if (chunks) {
        const buckets = new Map();
        for (let i = 0; i < count; i++) {
          const p = positions[i];
          const key = `${Math.floor(p.x / tileSize)},${Math.floor(p.z / tileSize)}`;
          let bucket = buckets.get(key);
          if (!bucket) { bucket = []; buckets.set(key, bucket); }
          bucket.push(p);
        }
        for (const [key, chunk] of chunks) if (!buckets.has(key)) {
          mesh.remove(chunk);
          chunk.dispose();
          chunks.delete(key);
        }
        for (const [key, bucket] of buckets) {
          let chunk = chunks.get(key);
          // Interior tiles contain the exact same cell objects after a small
          // move. Leave their GPU buffers alone instead of uploading them again.
          if (chunk && chunk._points?.length === bucket.length &&
            bucket.every((point, i) => point === chunk._points[i])) continue;
          if (!chunk || chunk.instanceMatrix.count < bucket.length) {
            if (chunk) { mesh.remove(chunk); chunk.dispose(); }
            const size = Math.min(capacity, 2 ** Math.ceil(Math.log2(bucket.length)));
            chunk = new THREE.InstancedMesh(geometry, mat, size);
            chunk.castShadow = false;
            chunk.receiveShadow = receiveShadow;
            chunks.set(key, chunk);
            mesh.add(chunk);
          }
          chunk.count = bucket.length;
          for (let i = 0; i < bucket.length; i++) writeInstance(chunk, i, bucket[i]);
          chunk.instanceMatrix.needsUpdate = true;
          if (chunk.instanceColor) chunk.instanceColor.needsUpdate = true;
          chunk.computeBoundingSphere();
          // The vertex shader bends tips beyond the CPU-side blade geometry.
          chunk.boundingSphere.radius += 1;
          chunk._points = bucket;
        }
      } else {
        for (let i = 0; i < count; i++) writeInstance(mesh, i, positions[i]);
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      if (radius && totalCount === 0) uniforms.uGrassReveal.value = 0;
      totalCount = count;
    },
    animate(time, wind, wetness = 0, x = 0, z = 0, dt = 0) {
      uniforms.uGrassTime.value = time;
      uniforms.uGrassCenter.value.set(x, z);
      uniforms.uGrassReveal.value = Math.min(1, uniforms.uGrassReveal.value + dt * 2.5);
      const wx = wind.x, wz = wind.z;
      const strength = Math.hypot(wx, wz);
      uniforms.uGrassWind.value.set(wx / (strength || 1), wz / (strength || 1));
      uniforms.uGrassStrength.value = Math.max(.18, strength);
      uniforms.uGrassWetness.value = Math.max(0, Math.min(1, wetness));
    },
    getReveal() { return uniforms.uGrassReveal.value; },
    setOpacity(opacity) { uniforms.uGrassOpacity.value = opacity; },
    dispose() {
      scene.remove(mesh);
      if (chunks) {
        for (const chunk of chunks.values()) chunk.dispose();
        chunks.clear();
        mesh.clear();
      } else mesh.dispose();
      geometry.dispose();
      mat.dispose();
    },
  };
}

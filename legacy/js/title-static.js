import * as THREE from "three";

// Fresh random pixels prevent the broad bands and moire from sine-based
// screen noise. Nearest filtering keeps the snow crisp at every resolution.
export function createStaticNoise() {
  const width = 512, height = 256;
  const pixels = new Uint8Array(width * height * 4);
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  let seed = 0x29a7b813, lastFrame = -1;
  return {
    texture,
    update(time) {
      const frame = Math.floor(time * 24);
      if (frame === lastFrame) return;
      lastFrame = frame;
      for (let i = 0; i < pixels.length; i += 4) {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        pixels[i] = seed & 255;
        pixels[i + 1] = (seed >>> 8) & 255;
        pixels[i + 2] = (seed >>> 16) & 255;
        pixels[i + 3] = 255;
      }
      texture.needsUpdate = true;
    },
    dispose() { texture.dispose(); },
  };
}

export const TelevisionShader = {
  uniforms: {
    tDiffuse: { value: null }, tNoise: { value: null }, damage: { value: 0 },
    exposure: { value: 1 }, signalLoss: { value: 0 }, time: { value: 0 }, resolution: { value: new THREE.Vector2(1280, 720) },
  },
  vertexShader: `varying vec2 vUv;
    void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse,tNoise;
    uniform float damage,exposure,signalLoss,time;
    uniform vec2 resolution;
    varying vec2 vUv;
    void main(){
      vec3 random=texture2D(tNoise,vUv).rgb;
      float amount=mix(damage,1.,signalLoss);
      vec2 uv=vUv;
      // Occasional broken scanlines, without sinusoidal distortion or waves.
      float row=texture2D(tNoise,vec2(.37,vUv.y)).b;
      float tear=step(.988,row)*amount;
      uv.x=clamp(uv.x+(row-.5)*.04*tear,0.,1.);
      vec3 picture=texture2D(tDiffuse,uv).rgb;
      float gray=dot(picture,vec3(.2126,.7152,.0722));
      picture=mix(picture,vec3(gray),damage*.5);
      float snow=mix(.002,.82,step(.5,random.r));
      snow=mix(snow,random.b*.6,step(.88,random.g));
      float flecks=step(1.-amount*.5,random.g);
      vec3 col=mix(picture,vec3(snow),flecks*amount*.75);
      float coverage=mix(pow(damage,1.15)*.85,1.,signalLoss);
      col=mix(col,vec3(snow),max(coverage,tear*.7));
      col*=1.-mod(floor(vUv.y*resolution.y),2.)*.055*amount;
      // Fine film grain and a soft lens vignette for a filmed, high-detail look.
      float grain=fract(sin(dot(gl_FragCoord.xy+fract(time*7.13)*vec2(113.1,71.7),vec2(12.9898,78.233)))*43758.5453);
      col*=1.+(grain-.5)*.07;
      vec2 v=vUv-.5;
      col*=mix(1.,smoothstep(.95,.3,length(v*vec2(1.15,1.))),.65);
      col*=exposure;
      gl_FragColor=vec4(max(col,vec3(0.)),1.);
    }`,
};

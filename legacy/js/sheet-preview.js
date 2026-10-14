import * as THREE from "three";
import { Character } from "./character.js";
import { equipmentLook } from "./equipment.js";

// A small, independent render of the same character used in the world.
export class SheetPreview {
  constructor(game, actor = game.player) {
    this.game = game;
    this.actor = actor;
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "low-power" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 30);
    this.camera.position.set(0, 1.15, 4.1);
    this.camera.lookAt(0, 0.94, 0);
    this.scene.add(new THREE.HemisphereLight(0xffe7c4, 0x34291d, 2.1));
    const key = new THREE.DirectionalLight(0xffd69a, 2.3);
    key.position.set(-2, 4, 3); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x91a9ca, 1.7);
    rim.position.set(2.5, 2.4, -2.5); this.scene.add(rim);
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(1.06, 48), new THREE.MeshStandardMaterial({ color: 0x30271d, roughness: 1 }));
    this.floor.rotation.x = -Math.PI / 2; this.floor.position.y = -0.02; this.scene.add(this.floor);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.009, 5, 64), new THREE.MeshBasicMaterial({ color: 0xb58a54 }));
    this.ring.rotation.x = Math.PI / 2; this.ring.position.y = 0.005; this.scene.add(this.ring);
    this.character = new Character(this.actorLook(), { hairGuides: 40 });
    this.character.addTo(this.scene);
    this.character.object.rotation.y = 0.25;
    this.lookKey = JSON.stringify(game.state.equipment);
    this.dragX = null;
    const canvas = this.renderer.domElement;
    canvas.setAttribute("aria-label", "Drag to rotate character");
    canvas.addEventListener("pointerdown", e => { this.dragX = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", e => { if (this.dragX === null) return; this.character.object.rotation.y += (e.clientX - this.dragX) * 0.012; this.dragX = e.clientX; });
    canvas.addEventListener("pointerup", () => { this.dragX = null; });
    canvas.addEventListener("pointercancel", () => { this.dragX = null; });
  }

  mount(host) {
    this.host = host;
    host.append(this.renderer.domElement);
    this.resize();
    this.update(0);
  }

  resize() {
    const width = this.host?.clientWidth || 0, height = this.host?.clientHeight || 0;
    if (!width || !height || (width === this.width && height === this.height)) return;
    this.width = width; this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    if (!this.host?.isConnected) return;
    this.resize();
    const key = JSON.stringify(this.game.state.equipment);
    if (key !== this.lookKey) {
      this.character.setLook(this.actorLook());
      this.lookKey = key;
    }
    const morality = this.game.morality?.M || 0;
    if (morality !== this.morality) { this.character.setMorality(morality); this.morality = morality; }
    this.character.update(Math.min(dt, 0.05), { camera: this.camera, simulateHair: true });
    this.renderer.render(this.scene, this.camera);
  }

  actorLook() {
    const look = equipmentLook(this.actor.sheet.look, this.game.state.equipment);
    return this.actor === this.game.localPlayer2 ? { ...look, gear: "#46647b" } : look;
  }

  destroy() {
    this.character.dispose();
    for (const mesh of [this.floor, this.ring]) { mesh.geometry.dispose(); mesh.material.dispose(); }
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.host = null;
  }
}

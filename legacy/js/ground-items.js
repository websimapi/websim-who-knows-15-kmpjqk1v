import * as THREE from "three";
import { ITEMS } from "./items.js";
import { itemArt } from "./item-art.js";

export class GroundItems {
  constructor(game, initial = []) {
    this.game = game;
    this.entries = new Map();
    this.textures = new Map();
    for (const drop of initial) this.add(drop);
  }
  add(drop) {
    if (!drop?.id || !ITEMS[drop.key] || this.entries.has(drop.id)) return;
    let texture = this.textures.get(drop.key);
    if (!texture) {
      texture = new THREE.TextureLoader().load(itemArt(drop.key));
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      this.textures.set(drop.key, texture);
    }
    const y = this.game.world.heightAt(drop.x, drop.z);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
    sprite.position.set(drop.x, y + .5, drop.z);
    sprite.scale.set(1.05, 1.05, 1);
    this.game.scene.add(sprite);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(.42, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x100d0a, transparent: true, opacity: .55, depthWrite: false }));
    shadow.position.set(drop.x, y + .035, drop.z);
    this.game.scene.add(shadow);
    const it = { id: drop.id, kind: "ground_item", key: drop.key, pos: new THREE.Vector3(drop.x, y, drop.z), label: `Pick up ${ITEMS[drop.key].name}` };
    this.game.world.interactables.push(it);
    this.entries.set(drop.id, { drop, sprite, shadow, it });
  }
  remove(id) {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.game.scene.remove(entry.sprite, entry.shadow);
    entry.sprite.material.dispose(); entry.shadow.material.dispose(); entry.shadow.geometry.dispose();
    const index = this.game.world.interactables.indexOf(entry.it);
    if (index >= 0) this.game.world.interactables.splice(index, 1);
    this.entries.delete(id);
  }
  drop(key, actor = this.game.player) {
    const g = this.game;
    const x = actor.pos.x + Math.sin(actor.yaw || 0) * 1.1;
    const z = actor.pos.z + Math.cos(actor.yaw || 0) * 1.1;
    const item = { id: crypto.randomUUID(), key, x, z };
    if (g.social.net) g.social.net.send({ type: "item_drop", ...item });
    else { this.add(item); g.state.groundItems = [...this.entries.values()].map(e => e.drop); g.save(); }
  }
  pick(id, actor = this.game.player) {
    const entry = this.entries.get(id);
    if (!entry) return;
    if (this.game.social.net) this.game.social.net.send({ type: "item_pickup", id });
    else {
      if (!this.game.social.canCarry(entry.drop.key, actor)) { this.game.log("Your pack is too heavy.", "fail"); return; }
      const inv = this.game.social.actorInv(actor);
      inv[entry.drop.key] = (inv[entry.drop.key] || 0) + 1;
      this.game.log(`Picked up ${ITEMS[entry.drop.key].name}`);
      this.remove(id); this.game.state.groundItems = [...this.entries.values()].map(e => e.drop);
      this.game.social.renderInv(); this.game.social.renderSheet(); this.game.save();
    }
  }
  destroy() { for (const id of [...this.entries.keys()]) this.remove(id); for (const texture of this.textures.values()) texture.dispose(); }
}

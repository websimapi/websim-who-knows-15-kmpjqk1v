import * as THREE from "three";
import { d20Check, describe } from "./dice.js";
import { Actor } from "./combat.js";
import { WILDLIFE, wildCreatures, animalHandlingBonus } from "../server.js";

const $ = s => document.querySelector(s);
const SPHERE = new THREE.SphereGeometry(1, 24, 16);
const CONE = new THREE.ConeGeometry(1, 1, 14);
const mats = new Map();
function material(hex) {
  if (!mats.has(hex)) mats.set(hex, new THREE.MeshStandardMaterial({ color: hex, roughness: .78, side: THREE.DoubleSide }));
  return mats.get(hex);
}
function ellipsoid(parent, color, x, y, z, sx, sy, sz) {
  const mesh = new THREE.Mesh(SPHERE, material(color));
  mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); mesh.castShadow = true; parent.add(mesh);
  return mesh;
}
function cone(parent, color, x, y, z, sx, sy, sz, tilt = 0) {
  const mesh = new THREE.Mesh(CONE, material(color));
  mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); mesh.rotation.z = tilt; mesh.castShadow = true; parent.add(mesh);
  return mesh;
}
function makeModel(kind) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const fur = { cat:"#ac9275", rat:"#827978", dog:"#937152", bat:"#615870" }[kind];
  const dark = { cat:"#51493e", rat:"#4d474b", dog:"#4d392c", bat:"#353041" }[kind];
  const pale = { cat:"#ebdcc2", rat:"#d8b6ab", dog:"#e0c49c", bat:"#bba7bd" }[kind];
  const scale = kind === "dog" ? 1.16 : kind === "rat" ? .56 : kind === "bat" ? .85 : .82;
  const legs = [], wings = [];
  ellipsoid(body,fur,0,.49,-.04,.32,.27,.49);
  ellipsoid(body,pale,0,.46,.23,.22,.2,.27);
  ellipsoid(body,fur,0,.57,.35,.28,.23,.29);
  const head = new THREE.Group(); head.position.set(0,.69,.45); body.add(head);
  ellipsoid(head,fur,0,.02,.04,.27,.25,.26);
  for (const side of [-1,1]) {
    if (kind === "rat") {
      ellipsoid(head,pale,side*.23,.22,-.05,.14,.17,.045);
      ellipsoid(head,"#a77e80",side*.23,.22,-.009,.09,.11,.025);
    } else {
      const ear = cone(head,fur,side*.18,.31,-.03,.13,kind === "dog" ? .29 : .23,.12,side*-.12);
      ear.rotation.x = -.18;
      cone(head,pale,side*.18,.31,.045,.065,kind === "dog" ? .18 : .14,.035,side*-.12);
    }
    ellipsoid(head,pale,side*.12,.08,.245,.1,.095,.045);
    ellipsoid(head,"#f7e9cf",side*.125,.1,.284,.068,.061,.025);
    ellipsoid(head,kind === "cat" ? "#98b56d" : "#231d22",side*.125,.1,.306,.043,.048,.021);
    ellipsoid(head,"#fff7e6",side*.112,.116,.325,.013,.014,.007);
    ellipsoid(head,dark,side*.23,-.05,.19,.11,.065,.08);
  }
  ellipsoid(head,pale,0,-.105,.255,.19,.12,.15);
  ellipsoid(head,kind === "dog" ? "#292427" : "#b57f85",0,-.05,.39,.058,.04,.035);
  if (kind === "cat" || kind === "rat") for (const side of [-1,1]) for (let i=0;i<3;i++) {
    const points=[new THREE.Vector3(side*.15,-.11+i*.033,.32),new THREE.Vector3(side*.29,-.09+i*.055,.36),new THREE.Vector3(side*.4,-.13+i*.08,.35)];
    const whisker=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),6,.005,4,false),material("#eee4d0"));
    head.add(whisker);
  }
  if (kind === "cat") {
    for (const side of [-1,1]) for (let j=0;j<2;j++) ellipsoid(body,dark,side*.24,.66,-.25+j*.22,.035,.13,.085);
    ellipsoid(head,dark,0,.23,.21,.04,.12,.025);
  } else if (kind === "dog") {
    ellipsoid(body,dark,-.23,.63,-.16,.085,.16,.26);
    ellipsoid(head,pale,0,.22,.21,.065,.15,.03);
  } else if (kind === "rat") {
    ellipsoid(head,pale,0,-.15,.29,.1,.07,.13);
  }
  if (kind !== "bat") for (const z of [-.31,.3]) for (const side of [-1,1]) {
    const leg = new THREE.Group(); leg.position.set(side*.22,.42,z); body.add(leg);
    ellipsoid(leg,fur,0,-.18,0,.095,.23,.105);
    ellipsoid(leg,pale,0,-.37,.085,.11,.065,.15);
    for (let claw=-1;claw<=1;claw++) ellipsoid(leg,"#e9dbbf",claw*.048,-.4,.19,.023,.025,.055);
    legs.push(leg);
  }
  let tail = null;
  if (kind !== "bat") {
    tail = new THREE.Group(); tail.position.set(0,.57,-.45); body.add(tail);
    const points = kind === "rat" ? [[0,0,0],[0,.1,-.25],[0,.07,-.53],[0,-.04,-.75]] : [[0,0,0],[0,.13,-.23],[0,.25,-.48],[0,.36,-.57]];
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,16,kind === "rat" ? .045 : .09,8,false),material(kind === "rat" ? pale : fur)); mesh.castShadow=true; tail.add(mesh);
    if (kind === "dog") ellipsoid(tail,pale,0,.36,-.57,.105,.1,.12);
  } else {
    for (const side of [-1,1]) {
      const wing = new THREE.Group(); wing.position.set(side*.23,.64,-.06); wing.scale.x=side; body.add(wing);
      const silhouette=new THREE.Shape(); silhouette.moveTo(0,0); silhouette.lineTo(.39,.19); silhouette.lineTo(.86,.14); silhouette.lineTo(.69,-.16); silhouette.lineTo(.48,-.11); silhouette.lineTo(.27,-.27); silhouette.lineTo(.1,-.15); silhouette.closePath();
      const mesh=new THREE.Mesh(new THREE.ShapeGeometry(silhouette,12),material("#4b405b")); mesh.castShadow=true; wing.add(mesh);
      for (const [x,y] of [[.39,.19],[.86,.14],[.69,-.16]]) {
        const rib=new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(0,0,.008),new THREE.Vector3(x,y,.008)),1,.008,4,false),material(pale)); wing.add(rib);
      }
      wings.push(wing);
    }
    ellipsoid(body,pale,0,.39,.25,.12,.18,.1);
  }
  root.scale.setScalar(scale);
  return { root, body, head, legs, wings, tail, scale };
}

class HostilePetModel {
  constructor(kind) {
    this.kind = kind;
    this.rig = makeModel(kind);
    this.object = this.rig.root;
    this.height = kind === "bat" ? 1.55 : kind === "dog" ? 1.05 : kind === "rat" ? .52 : .78;
    this.speed = 0; this.time = 0; this.gait = 0; this.pose = "idle"; this.attackT = 0;
  }
  addTo(scene) { scene.add(this.object); }
  play(action) { this.pose = action; if (action === "attack") this.attackT = .32; }
  update(dt) {
    this.time += dt;
    const r = this.rig, moving = this.speed > .15 && this.pose !== "death";
    this.gait += dt * (this.speed > 3.25 ? 16 : 9) * Math.max(.7, this.speed / 2.5);
    this.attackT = Math.max(0, this.attackT - dt);
    r.root.rotation.z = this.pose === "death" ? -Math.PI / 2 : 0;
    r.body.position.y = this.pose === "death" ? 0 : moving ? Math.abs(Math.sin(this.gait)) * .05 : Math.sin(this.time * 2) * .012;
    r.body.rotation.x = this.attackT ? -.22 : moving ? Math.sin(this.gait) * .055 : 0;
    r.head.rotation.x = this.attackT ? -.28 : moving ? -r.body.rotation.x * .7 : Math.sin(this.time * 1.7) * .035;
    r.legs.forEach((leg, i) => { leg.rotation.x = moving ? Math.sin(this.gait + [0, Math.PI, Math.PI, 0][i]) * .55 : 0; });
    r.wings.forEach((wing, i) => { wing.rotation.z = (i ? 1 : -1) * (.15 + Math.sin(this.time * 15 + i * .12) * .52); });
    if (r.tail) r.tail.rotation.y = Math.sin(this.time * 6) * .25;
    if (this.kind === "bat" && this.pose !== "death") this.object.position.y += 1.25 + Math.sin(this.time * 7) * .1;
  }
  dispose() { this.object.removeFromParent(); }
}

export class WildlifeSystem {
  constructor(game, initial = null) {
    this.g = game;
    this.online = !!game.social.net;
    this.userId = this.online ? game.social.userId : "local";
    this.pets = new Map();
    this.plates = new Map();
    this.panel = $("#petPanel");
    this.active = null;
    this.viewer = null;
    this.time = 0;
    const base = wildCreatures(game.world.seed);
    const saved = this.online ? initial || [] : Object.values(game.state.pets || {});
    const changes = new Map(saved.map(p => [p.id,p]));
    for (const pet of base) {
      const prior=changes.get(pet.id);
      this.upsert(prior?.owner ? { ...pet, ...prior } : { ...pet, hp:prior?.hp ?? pet.hp, dead:!!prior?.dead });
    }
    for (const prior of saved) if (prior.owner && !this.pets.has(prior.id)) this.upsert(prior);
    this.panel.addEventListener("click", e => {
      const button = e.target.closest("button[data-pet-action]");
      if (button) this.action(button.dataset.petAction);
      else if (e.target === this.panel) this.close();
    });
  }
  upsert(data) {
    if (!WILDLIFE[data.kind] || !/^p_(marrowgate|brightwell|gallowmere)_\d+$/.test(data.id || "")) return null;
    const old = this.pets.get(data.id);
    const pet = old || { id:data.id, kind:data.kind, model:makeModel(data.kind), pos:new THREE.Vector3(), step:0, attackT:0, hurtT:0, moveT:0, gait:0, speed:0, heading:0, idleT:1.5, wanderStep:0 };
    if (!old) { this.pets.set(pet.id,pet); this.g.scene.add(pet.model.root); }
    const x=Number(data.x), z=Number(data.z), wasMine=old?.owner===this.userId;
    Object.assign(pet,{ kind:data.kind, homeX:Number(data.homeX ?? data.x), homeZ:Number(data.homeZ ?? data.z),
      hp:Math.max(0,Number(data.hp ?? WILDLIFE[data.kind].hp)), owner:data.owner || null, ownerName:data.ownerName || "", dead:!!data.dead, shooUntil:Number(data.shooUntil)||0 });
    pet.netX=x; pet.netZ=z;
    if (old && this.online && !pet.owner && Math.hypot(x-pet.x,z-pet.z)>1) { pet.wanderX=x; pet.wanderZ=z; pet.idleT=2; }
    if (!old || !this.online || (pet.owner===this.userId && (!wasMine || Math.hypot(x-pet.x,z-pet.z)>5))) {
      pet.x=x; pet.z=z;
    }
    if (!old) pet.pos.set(pet.x,this.g.world.heightAt(pet.x,pet.z),pet.z);
    if (this.active?.id === pet.id) this.render();
    return pet;
  }
  onUpdate(data) {
    const previous=this.pets.get(data.id), wasDead=previous?.dead, wasOwner=previous?.owner;
    const pet=this.upsert(data);
    if (pet && (wasDead!==pet.dead || wasOwner!==pet.owner)) this.g.renderParty?.();
    if (pet?.dead && !wasDead && pet.owner===this.userId) this.g.toast(`${WILDLIFE[pet.kind].name} fallen`,"Your companion was killed.");
  }
  serialize() { return Object.fromEntries([...this.pets.values()].map(p => [p.id,{ id:p.id,kind:p.kind,x:p.x,z:p.z,homeX:p.homeX,homeZ:p.homeZ,hp:p.hp,owner:p.owner,ownerName:p.ownerName,dead:p.dead,shooUntil:p.shooUntil }])); }
  saveLocal() { if (!this.online) { this.g.state.pets = this.serialize(); this.g.save(); } }
  ownerFor(actor = this.g.player) { return !this.online && actor && actor === this.g.localPlayer2 ? "local:2" : this.userId; }
  nearest(limit = 2.8, actor = this.g.player) {
    let found = null, best = limit;
    for (const pet of this.pets.values()) if (!pet.dead && pet.model.root.visible) {
      const d = pet.pos.distanceTo(actor.pos);
      if (d < best) { found = pet; best = d; }
    }
    return found;
  }
  open(pet, actor = this.g.player) {
    if (!pet || pet.dead || pet.pos.distanceTo(actor.pos) > 3.5) return;
    if (actor === this.g.player) this.g.resetPlayerMovement(); else { actor.autoMove = null; actor.moving = 0; }
    this.active = pet; this.viewer = actor;
    document.body.classList.toggle("pet-owner-p2", actor === this.g.localPlayer2);
    this.g.combat.face(actor,pet.pos);
    actor.model.object.rotation.y=actor.yaw;
    this.render();
  }
  close() { clearTimeout(this.tameCloseTimer); this.active = null; this.viewer = null; this.waitingTame = false; this.panel.classList.add("hidden"); document.body.classList.remove("pet-owner-p2"); }
  render() {
    const p = this.active; if (!p || p.dead) { this.close(); return; }
    const actor = this.viewer || this.g.player, spec = WILDLIFE[p.kind], own = p.owner === this.ownerFor(actor);
    const bonus = animalHandlingBonus(actor.sheet.attrs,actor.sheet.background,actor.sheet.level || 1);
    $("#petTitle").textContent = `${p.ownerName && own ? "Your " : ""}${spec.name}`;
    $("#petLine").textContent = p.owner ? `${p.ownerName || "Someone"}'s companion · ${p.hp}/${spec.hp} HP · ${spec.fighter ? "fights beside its owner" : "follows its owner"}.`
      : `Friendly ${p.kind} · ${p.hp}/${spec.hp} HP. Animal Handling ${bonus >= 0 ? "+" : ""}${bonus} · taming DC ${spec.dc}.`;
    const actions = $("#petActions"); actions.innerHTML = "";
    const add = (label,action,tone="neutral",disabled=false) => { const b=document.createElement("button"); b.type="button"; b.dataset.petAction=action; b.disabled=disabled; b.innerHTML=`<span class="n">${actions.children.length+1}</span><span class="t-${tone}">${label}</span>`; actions.append(b); };
    add("Pet","pet","kind");
    if (!p.owner) add(p.shooUntil>Date.now() ? "Tame · animal is unsettled" : "Tame · roll d20","tame","clever",p.shooUntil>Date.now());
    if (!p.owner || own) add("Shoo","shoo");
    add("Attack","attack","cruel"); add("Leave","leave","leave");
    if (!this.waitingTame) this.panel.classList.remove("hidden");
  }
  async action(action, pet = this.active) {
    if (this.waitingTame) return;
    if (action === "leave") { this.close(); return; }
    const actor = this.viewer || this.g.player;
    if (!pet || pet.dead || pet.pos.distanceTo(actor.pos) > 4.2) { this.close(); return; }
    if (action === "tame") { this.waitingTame=true; this.panel.classList.add("hidden"); await this.tame(pet, actor); return; }
    this.close();
    if (this.online) {
      if (action === "attack") actor.model.play("attack",.5);
      this.g.social.net.send({ type:"pet_action", pet:pet.id, action }); return;
    }
    if (action === "pet") this.g.toast(`You pet the ${pet.kind}`,pet.owner === this.ownerFor(actor) ? "It knows your hand." : "It stays close for a moment.");
    else if (action === "shoo") { pet.x += Math.sign(pet.x-actor.pos.x || 1)*5; pet.z += Math.sign(pet.z-actor.pos.z || 1)*5; pet.shooUntil=pet.owner ? Date.now()+15000 : 0; this.g.log(pet.owner ? `Your ${pet.kind} waits nearby for a while.` : `The ${pet.kind} scampers away.`); }
    else if (action === "attack") {
      pet.hp = Math.max(0,pet.hp - (6 + Math.floor(Math.random()*4))); pet.dead = pet.hp <= 0;
      if (pet.dead) this.g.renderParty();
      actor.model.play("attack",.5);
      this.g.log(pet.dead ? `The ${pet.kind} falls.` : `The ${pet.kind} flees, wounded.`,"fail");
      if (!pet.dead && !pet.owner) { pet.x += Math.sign(pet.x-actor.pos.x || 1)*6; pet.z += Math.sign(pet.z-actor.pos.z || 1)*6; }
    }
    this.saveLocal();
  }
  requestTame(pet, action) {
    return new Promise(resolve => {
      const timer = setTimeout(() => { if (this.tamePending?.resolve === done) { this.tamePending = null; resolve({ action, reason:"The animal did not respond." }); } }, 7000);
      const done = result => { clearTimeout(timer); this.tamePending = null; resolve(result); };
      this.tamePending = { pet:pet.id, action, resolve:done };
      this.g.social.net.send({ type:"pet_action", pet:pet.id, action });
    });
  }
  async tame(pet, actor = this.g.player) {
    const g = this.g, spec = WILDLIFE[pet.kind];
    if (pet.owner || pet.shooUntil > Date.now()) { g.toast("Animal not ready",`The ${pet.kind} needs time to settle.`); this.close(); return; }
    const bonus = animalHandlingBonus(actor.sheet.attrs,actor.sheet.background,actor.sheet.level || 1), dc = spec.dc;
    let attempts = 0;
    const roll = await g.hold.run(`${spec.name} · Animal Handling`, async () => {
      if (!this.online) return d20Check(bonus,dc);
      const reply = await this.requestTame(pet, attempts++ ? "tame_reroll" : "tame");
      if (!Number.isFinite(reply.nat)) return { nat:1, bonus, dc, total:1+bonus, success:false, crit:false, fumble:true, adv:0, error:reply.reason || "The animal is unavailable." };
      return { nat:reply.nat, bonus:reply.bonus, dc:reply.dc, total:reply.total, success:reply.ok, crit:reply.nat===20, fumble:reply.nat===1, adv:0 };
    }, r => r.error || describe(r), `d20 ${bonus >= 0 ? "+" : ""}${bonus} · DC ${dc}`, actor);
    if (roll.error) { g.toast("Taming unavailable",roll.error); this.close(); return; }
    g.log(`Animal Handling: ${describe(roll)}`,roll.success ? "crit" : "fail");
    let outcome;
    if (this.online) {
      outcome = await this.requestTame(pet,"tame_commit");
      if (outcome.phase !== "commit") { g.toast("Taming interrupted",outcome.reason || "The animal moved away."); this.close(); return; }
    } else {
      const reaction = roll.success ? null : roll.nat <= 5 || (spec.fighter && Math.random() < .45) ? "attack" : "flee";
      outcome = { ok:roll.success, reaction };
      if (roll.success) { pet.owner=this.ownerFor(actor); pet.ownerName=actor.name; }
    }
    this.close();
    if (outcome.ok) {
      g.renderParty(); g.toast(`${spec.name} tamed`,spec.fighter ? "It will fight beside you." : "It will follow you.");
      this.saveLocal();
    } else if (outcome.reaction === "attack") this.startHostile(pet, actor);
    else this.flee(pet,outcome,actor);
  }
  flee(pet,outcome={},actor=this.g.player) {
    const p=actor.pos, dx=pet.x-p.x, dz=pet.z-p.z, len=Math.hypot(dx,dz)||1;
    const x=Number.isFinite(outcome.x) ? outcome.x : pet.x+dx/len*8;
    const z=Number.isFinite(outcome.z) ? outcome.z : pet.z+dz/len*8;
    pet.fleeTarget={x,z}; pet.homeX=x; pet.homeZ=z;
    pet.shooUntil=Date.now()+12000;
    this.g.toast("Taming failed",`The ${pet.kind} bolts away.`);
    this.saveLocal();
  }
  startHostile(pet, target = this.g.player, hollowPrey = false) {
    if (pet.hostileActor || pet.dead) return;
    const g=this.g, spec=WILDLIFE[pet.kind], model=new HostilePetModel(pet.kind);
    pet.shooUntil=Date.now()+20000;
    const stats={ maxHp:pet.hp, level:1, guard:pet.kind==="dog" ? 12 : 11, reflex:12, fortitude:11, resolve:9,
      atk:pet.kind==="dog" ? 3 : 2, dmgBonus:0, abilities:[pet.kind==="dog" ? "maul" : "bite"],
      speed:pet.kind==="dog" ? 4.7 : pet.kind==="bat" ? 5 : 4.2, xp:0, resource:{cur:0} };
    const actor=new Actor({ name:hollowPrey ? spec.name : `Angry ${spec.name}`, team:hollowPrey ? "wildlife" : "enemy", kind:"wild_pet", model, pos:pet.pos, stats });
    actor.radius=pet.kind==="dog" ? .52 : pet.kind==="bat" ? .35 : .3;
    actor.wildPetId=pet.id; actor.aggro=!hollowPrey; actor.target=target;
    pet.hostileActor=g.combat.add(actor);
    pet.model.root.visible=false;
    if (!hollowPrey) {
      g.combat.engage(actor,target);
      g.toast("Taming failed",`The ${pet.kind} attacks!`);
      g.log(`The ${pet.kind} lashes out after the failed taming attempt.`,"fail");
      this.saveLocal();
    }
    return actor;
  }
  offerToHollow(hollow) {
    for (const pet of this.pets.values()) if (!pet.dead && !pet.hostileActor && pet.pos.distanceTo(hollow.pos) < 16) {
      this.startHostile(pet, hollow, true);
    }
  }
  onHostileDefeated(actor) {
    if (!actor.wildPetId) return false;
    const pet=this.pets.get(actor.wildPetId);
    if (pet) {
      pet.x=actor.pos.x; pet.z=actor.pos.z; pet.hp=0; pet.dead=true; pet.hostileActor=null;
      if (this.online) this.g.social.net.send({ type:"pet_action", pet:pet.id, action:"combat_end" });
      else this.saveLocal();
    }
    actor.fade=.01;
    this.g.renderParty();
    return true;
  }
  onResult(result) {
    const pet = this.pets.get(result.pet);
    if (!pet) {
      if (this.tamePending?.pet===result.pet && this.tamePending.action===result.action) this.tamePending.resolve({ ...result, reason:result.reason || "That animal is no longer here." });
      return;
    }
    if (this.tamePending?.pet===pet.id && this.tamePending.action===result.action) { this.tamePending.resolve(result); return; }
    if (String(result.action || "").startsWith("tame") || String(result.action || "").startsWith("combat_")) return;
    if (result.reason) this.g.toast(result.ok ? WILDLIFE[pet.kind].name : "Animal encounter",result.reason);
  }
  damage(pet,amount) {
    if (pet.dead) return;
    if (this.online) this.g.social.net.send({ type:"pet_hurt",pet:pet.id,damage:amount });
    else { pet.hp=Math.max(0,pet.hp-amount); pet.dead=pet.hp<=0; if (pet.dead) this.g.renderParty(); this.saveLocal(); }
    if (pet.dead) this.g.log(`Your ${pet.kind} has fallen.`,"fail");
  }
  update(dt) {
    this.time += dt;
    const g=this.g, now=Date.now();
    const movingAllowed=!g.paused && !g.menuOpen && !g.holdPause && !g.dialogue.open && !this.active;
    for (const p of this.pets.values()) {
      if (p.hostileActor && !g.combat.actors.includes(p.hostileActor)) p.hostileActor=null;
      if (p.hostileActor?.team === "wildlife" && !p.hostileActor.target?.alive) {
        p.x = p.hostileActor.pos.x; p.z = p.hostileActor.pos.z;
        g.combat.remove(p.hostileActor); p.hostileActor = null; p.shooUntil = now + 5000;
      }
      if (p.hostileActor && !p.hostileActor.dead && !p.hostileActor.target?.alive
        && Math.min(p.hostileActor.pos.distanceTo(g.player.pos), g.localPlayer2 ? p.hostileActor.pos.distanceTo(g.localPlayer2.pos) : Infinity)>30) {
        const actor=p.hostileActor;
        p.x=actor.pos.x; p.z=actor.pos.z; p.homeX=p.x; p.homeZ=p.z; p.hostileActor=null;
        g.combat.remove(actor);
        if (this.online) g.social.net.send({ type:"pet_action", pet:p.id, action:"combat_escape", x:p.x, z:p.z });
        else this.saveLocal();
        g.toast(`${WILDLIFE[p.kind].name} escapes`,"The fight ends as it runs off.");
      }
      const model=p.model, spec=WILDLIFE[p.kind];
      const outdoors=!g.inDungeon || (g.localPlayer2 && !g.world.inDungeon(g.localPlayer2.pos.x,g.localPlayer2.pos.z));
      const visible=!p.dead && !p.hostileActor && outdoors && Math.min(
        Math.hypot(p.x-g.camera.position.x,p.z-g.camera.position.z),
        g.camera2 ? Math.hypot(p.x-g.camera2.position.x,p.z-g.camera2.position.z) : Infinity,
      )<105;
      model.root.visible=visible;
      if (!visible) { this.plates.get(p.id)?.remove(); this.plates.delete(p.id); continue; }
      const ownerActor = p.owner === this.userId ? g.player : !this.online && p.owner === "local:2" ? g.localPlayer2 : null;
      let ownerPos=null, ownerYaw=ownerActor?.yaw || 0;
      if (p.shooUntil<=now) {
        if (ownerActor) ownerPos=ownerActor.pos;
        else if (p.owner && this.online) { const remote=[...g.social.remotes.values()].find(r=>r.info.userId===p.owner); ownerPos=remote?.pos || null; ownerYaw=remote?.yaw || 0; }
      }
      const mayFight=!!ownerActor && p.shooUntil<=now && spec.fighter && !p.dead && !ownerActor.fullyDefeated && !g.paused && !g.menuOpen && (!g.holdPause || g.holdOwner !== ownerActor) && !this.active && !g.dialogue.open && $("#petPanel").classList.contains("hidden");
      const enemyTarget=mayFight ? g.combat.actors.filter(a=>a.team==="enemy" && a.hostile && (a.aggro || ownerActor.target===a) && a.pos.distanceTo(ownerActor.pos)<10)
        .sort((a,b)=>a.pos.distanceToSquared(p.pos)-b.pos.distanceToSquared(p.pos))[0] : null;
      let tx=p.x,tz=p.z;
      const oldX=p.x, oldZ=p.z;
      if (!p.dead && movingAllowed && p.fleeTarget) {
        tx=p.fleeTarget.x; tz=p.fleeTarget.z;
        const d=Math.hypot(tx-p.x,tz-p.z);
        if (d>.35) { const step=Math.min(d,dt*(p.kind==="bat" ? 7 : 5.8)); p.x+=(tx-p.x)/d*step; p.z+=(tz-p.z)/d*step; }
        else { p.fleeTarget=null; p.idleT=3; this.saveLocal(); }
      } else if (!p.dead && movingAllowed && ownerPos && (!this.online || p.owner===this.userId)) {
        const slot=[...this.pets.values()].filter(other=>other.owner===p.owner && !other.dead).findIndex(other=>other.id===p.id);
        const ring=Math.floor(slot/4), ang=ownerYaw+Math.PI+((slot%4)-1.5)*.55, radius=2.5+ring*1.5;
        tx=enemyTarget ? enemyTarget.pos.x : ownerPos.x+Math.sin(ang)*radius;
        tz=enemyTarget ? enemyTarget.pos.z : ownerPos.z+Math.cos(ang)*radius;
        const d=Math.hypot(tx-p.x,tz-p.z);
        if (d>38) { p.x=tx; p.z=tz; p.speed=0; }
        else if (d>.35) {
          const pace=d>6 ? (p.kind==="bat" ? 6.8 : p.kind==="dog" ? 5.4 : 4.1) : (p.kind==="bat" ? 3.8 : p.kind==="dog" ? 2.6 : 2.1);
          const step=Math.min(d-.27,dt*pace); p.x+=(tx-p.x)/d*step; p.z+=(tz-p.z)/d*step;
        }
        if (this.online) { p.moveT-=dt; if (p.moveT<=0) { p.moveT=.8; g.social.net.send({type:"pet_move",pet:p.id,x:p.x,z:p.z}); } }
      } else if (!p.dead && movingAllowed && this.online && p.owner && p.owner!==this.userId) {
        const d=Math.hypot(p.netX-p.x,p.netZ-p.z);
        if (d>20) { p.x=p.netX; p.z=p.netZ; p.speed=0; }
        else { const k=1-Math.exp(-dt*8); p.x+=(p.netX-p.x)*k; p.z+=(p.netZ-p.z)*k; }
      } else if (!p.dead && movingAllowed && !p.owner) {
        p.idleT-=dt;
        if (p.idleT<=0 && (!Number.isFinite(p.wanderX) || Math.hypot(p.wanderX-p.x,p.wanderZ-p.z)<.35)) {
          const phase=(p.id.charCodeAt(p.id.length-1)||1)*.83+p.wanderStep++*2.4;
          p.wanderX=p.homeX+Math.sin(phase)*2.4; p.wanderZ=p.homeZ+Math.cos(phase)*2.4;
          p.idleT=3+Math.abs(Math.sin(phase))*2;
        }
        tx=p.wanderX ?? p.x; tz=p.wanderZ ?? p.z;
        const d=Math.hypot(tx-p.x,tz-p.z);
        if (d>.3 && d<10) { const step=Math.min(d-.2,dt*(d>4 ? 3 : p.kind==="bat" ? 2.2 : 1.35)); p.x+=(tx-p.x)/d*step; p.z+=(tz-p.z)/d*step; }
      }
      if (!p.dead && p.kind!=="bat") g.world.col.resolve(p,p.kind==="dog" ? .35 : .22);
      const moved=Math.hypot(p.x-oldX,p.z-oldZ);
      const rawSpeed=moved>8 ? 0 : Math.min(7,moved/Math.max(dt,.001));
      p.speed=THREE.MathUtils.damp(p.speed,rawSpeed,10,dt);
      const walking=!p.dead && p.speed>.18, running=walking && p.speed>3.25;
      if (moved>.012 && moved<8) {
        const target=Math.atan2(p.x-oldX,p.z-oldZ);
        p.heading+=Math.atan2(Math.sin(target-p.heading),Math.cos(target-p.heading))*(1-Math.exp(-dt*9));
      } else if (this.active?.id===p.id) {
        const watcher=this.viewer || g.player;
        const target=Math.atan2(watcher.pos.x-p.x,watcher.pos.z-p.z);
        p.heading+=Math.atan2(Math.sin(target-p.heading),Math.cos(target-p.heading))*(1-Math.exp(-dt*5));
      }
      p.pos.set(p.x,g.world.heightAt(p.x,p.z),p.z);
      model.root.position.copy(p.pos);
      model.root.rotation.y=p.heading;
      if (walking) p.gait+=dt*(running ? 16 : 9)*Math.max(.7,p.speed/(running ? 4.7 : 2.2));
      model.body.position.y=p.dead ? 0 : walking ? Math.abs(Math.sin(p.gait))*(running ? .075 : .025) : Math.sin(this.time*2+p.id.length)*.012;
      model.body.rotation.x=p.dead ? 0 : walking ? Math.sin(p.gait)*(running ? .07 : .025) : 0;
      model.head.rotation.x=p.dead ? 0 : walking ? -model.body.rotation.x*.7 : Math.sin(this.time*1.7+p.id.length)*.035;
      model.root.rotation.z=p.dead ? -Math.PI/2 : 0;
      if (p.kind==="bat" && !p.dead) { model.root.position.y+=1.25+Math.sin(this.time*(walking ? 6 : 2.4)+p.id.length)*(walking ? .12 : .055); model.wings.forEach((w,i)=>{w.rotation.z=(i ? 1 : -1)*(.15+Math.sin(this.time*(walking ? 15 : 7)+i*.12)*.52);}); }
      if (model.tail) { model.tail.rotation.y=Math.sin(this.time*(walking ? 7 : 2.3)+p.id.length)*(p.kind==="dog" ? .34 : .2); model.tail.rotation.x=walking ? -.08 : .04; }
      model.legs.forEach((leg,i)=>{ leg.rotation.x=walking ? Math.sin(p.gait+(running ? (i<2 ? 0 : Math.PI) : ([0,Math.PI,Math.PI,0][i])))*(running ? .7 : .44) : 0; leg.position.y=.42+(walking ? Math.max(0,Math.sin(p.gait+i*Math.PI))*.025 : 0); });
      if (ownerActor && !p.dead && !ownerActor.fullyDefeated && !g.paused && !g.menuOpen && (!g.holdPause || g.holdOwner !== ownerActor) && !this.active && !g.dialogue.open && $("#petPanel").classList.contains("hidden")) {
        p.attackT-=dt; p.hurtT-=dt;
        const enemies=g.combat.actors.filter(a=>a.team==="enemy" && a.hostile && (a.aggro || ownerActor.target===a) && a.pos.distanceTo(p.pos)<7);
        const enemy=enemyTarget || enemies.sort((a,b)=>a.pos.distanceToSquared(p.pos)-b.pos.distanceToSquared(p.pos))[0];
        if (enemy && spec.fighter && p.attackT<=0 && enemy.pos.distanceTo(p.pos)<2.1) {
          p.attackT=p.kind==="dog" ? 1.35 : 1.8;
          g.combat.hurt(enemy,p.kind==="dog" ? 4 : 2,ownerActor,false,`${p.kind} companion`);
        }
        if (enemy && enemy.pos.distanceTo(p.pos)<2.2 && p.hurtT<=0) {
          p.hurtT=2.5;
          this.damage(p,1+Math.floor(Math.random()*3));
        }
      }
      if (Math.min(p.pos.distanceTo(g.camera.position),g.camera2 ? p.pos.distanceTo(g.camera2.position) : Infinity)<35 && !p.dead && !this.active) {
        let plate=this.plates.get(p.id);
        if (!plate) { plate=document.createElement("div"); plate.className="nameplate animal"; $("#dice").append(plate); this.plates.set(p.id,plate); }
        const point=g.project(p.pos.clone().add(new THREE.Vector3(0,p.kind==="bat" ? 1.85 : 1.1,0)));
        plate.style.display=point.visible ? "block" : "none"; plate.style.left=point.x+"px"; plate.style.top=point.y+"px";
        const html=`${ownerActor ? "✦ " : ""}${spec.name}<i><b style="width:${p.hp/spec.hp*100}%"></b></i>`;
        if (plate._h!==html) { plate.innerHTML=html; plate._h=html; }
      } else { this.plates.get(p.id)?.remove(); this.plates.delete(p.id); }
    }
  }
  destroy() {
    clearTimeout(this.tameCloseTimer);
    if (this.tamePending) { this.tamePending.resolve({ reason:"Animal encounter ended." }); this.tamePending=null; }
    this.close();
    for (const pet of this.pets.values()) if (pet.hostileActor) this.g.combat.remove(pet.hostileActor);
    for (const plate of this.plates.values()) plate.remove();
    for (const pet of this.pets.values()) pet.model.root.removeFromParent();
    this.plates.clear(); this.pets.clear();
  }
}

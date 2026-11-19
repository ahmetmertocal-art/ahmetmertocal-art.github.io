// 3B bina: orbit model of the building with floor boxes. Loaded only when the visitor picks "3B".
// Model coordinates are Blender metres exported Y-up: three (x, y, z) = blender (x, z, -y).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// floor levels in the source model; mapped onto whatever building model is loaded (its bounding box)
const FLOORS = [[0.15, 3.45], [3.45, 6.75], [6.75, 10.05], [10.05, 13.35]], REFZ = [0.15, 15.55];

export async function start(canvas, opt) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  const dl = new DRACOLoader(); dl.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/');
  const gl = new GLTFLoader(); gl.setDRACOLoader(dl);
  const g = await gl.loadAsync('img/bina.glb');
  // The export can carry merged meshes that reach into the neighbours; bounds and view come from the building's own box
  // (BINA collection, blender x -12.32..0.02, y -1.14..18.01, z 0.15..15.55) and everything outside it is clipped away.
  const M = 1.6, X0 = -12.32 - M, X1 = 0.02 + M, Z0 = -18.01 - M, Z1 = 1.14 + M, Y0 = 0.15, Y1 = 15.55 + 1.2;
  const clip = [new THREE.Plane(new THREE.Vector3(1, 0, 0), -X0), new THREE.Plane(new THREE.Vector3(-1, 0, 0), X1),
                new THREE.Plane(new THREE.Vector3(0, 0, 1), -Z0), new THREE.Plane(new THREE.Vector3(0, 0, -1), Z1),
                new THREE.Plane(new THREE.Vector3(0, -1, 0), Y1)];
  renderer.localClippingEnabled = true;
  const bb = new THREE.Box3(new THREE.Vector3(X0 + M, Y0, Z0 + M), new THREE.Vector3(X1 - M, Y1 - 1.2, Z1 - M)),
        bc = bb.getCenter(new THREE.Vector3()), bs = bb.getSize(new THREE.Vector3());
  const cx = bc.x, cz = bc.z, R = Math.max(bs.x, bs.z, bs.y);
  const cam = new THREE.PerspectiveCamera(35, 1, 0.3, 400);
  const ctl = new OrbitControls(cam, canvas); ctl.target.set(cx, bb.min.y + bs.y * 0.42, cz); ctl.enableDamping = true;
  ctl.minDistance = R * 0.6; ctl.maxDistance = R * 3.5; ctl.maxPolarAngle = Math.PI * 0.49; ctl.autoRotate = true; ctl.autoRotateSpeed = 0.6;
  canvas.addEventListener('pointerdown', () => { ctl.autoRotate = false; }, { once: true });

  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4); sun.position.set(cx - R * 1.5, R * 2.2, cz + R * 1.2); sun.target.position.set(cx, 0, cz);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 140 });
  sun.shadow.bias = -0.0004; scene.add(sun, sun.target, new THREE.HemisphereLight(0xdfe8f2, 0x5b5246, 0.6));
  const ground = new THREE.Mesh(new THREE.CircleGeometry(R * 1.6, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8c8a80, roughness: 1 }));
  ground.position.set(cx, bb.min.y - 0.02, cz); ground.receiveShadow = true; scene.add(ground);

  g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true;
    for (const m of [].concat(o.material)) { m.clippingPlanes = clip; m.clipShadows = true; }
    if (o.material && /glass|cam/i.test(o.material.name)) { o.material.transparent = true; o.material.opacity = 0.55; o.material.color.set(0x23303a); o.material.roughness = 0.05; o.material.metalness = 0.2; o.castShadow = false; } } });
  scene.add(g.scene);

  // floor boxes: invisible hit targets, drawn when hovered or chosen
  const boxes = [];
  const zmap = z => bb.min.y + (z - REFZ[0]) / (REFZ[1] - REFZ[0]) * bs.y;
  FLOORS.forEach(([a, b], f) => {
    const z0 = zmap(a), z1 = zmap(b), w = bs.x + 0.4, d = bs.z + 0.4, h = z1 - z0 - 0.06;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: 0xd9c3a0, transparent: true, opacity: 0, depthWrite: false }));
    m.position.set(cx, (z0 + z1) / 2, cz); m.userData.f = f; m.renderOrder = 2;
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0xf3ede3, transparent: true, opacity: 0 }));
    m.add(e); m.userData.edge = e; scene.add(m); boxes.push(m);
  });
  let sel = opt.floor ?? null, hov = null;
  function paint() { for (const b of boxes) { const on = b.userData.f === sel, h = b.userData.f === hov;
    b.material.opacity = on ? 0.32 : h ? 0.18 : 0; b.userData.edge.material.opacity = on ? 0.95 : h ? 0.6 : 0; } }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function hit(e) { const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ndc, cam); const h = ray.intersectObjects(boxes, false)[0]; return h ? h.object.userData.f : null; }
  let down = null;
  canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', e => { if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return; const f = hit(e); if (f !== null) opt.onFloor(f); });
  canvas.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; const f = hit(e); if (f !== hov) { hov = f; paint(); canvas.style.cursor = f === null ? 'grab' : 'pointer'; } });
  window.__bld3d = { floor(f) { sel = f; paint(); } };
  paint();

  let placed = false;
  function size() { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
    if (!placed) { placed = true; const k = R * (w < h ? 2.6 : 1.7);   // portrait phones need more distance to fit the building
      cam.position.set(cx + k * 0.72, ctl.target.y + k * 0.42, cz + k * 0.62); } }
  new ResizeObserver(size).observe(canvas); size();
  renderer.setAnimationLoop(() => { if (canvas.hidden) return; ctl.update(); renderer.render(scene, cam); });
}

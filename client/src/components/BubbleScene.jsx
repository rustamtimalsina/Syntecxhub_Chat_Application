import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const DEPTH = 0.42;
const BUBBLES = [
  { w: 2.7, lines: [0.9, 0.55], pos: [-0.8, 1.5, 0], rot: [0.04, 0.28, -0.03], mine: false, speed: 0.9, phase: 0 },
  { w: 2.2, lines: [0.8, 0.45], pos: [1.2, 0.3, 0.6], rot: [-0.04, -0.32, 0.04], mine: true, speed: 1.1, phase: 1.7 },
  { w: 3.1, lines: [0.9, 0.7, 0.4], pos: [-0.5, -0.95, 0.2], rot: [0.03, 0.22, 0.03], mine: false, speed: 0.8, phase: 3.1 },
  { w: 1.7, lines: [0.7], pos: [1.7, -2.05, 0.8], rot: [-0.05, -0.28, -0.04], mine: true, speed: 1.2, phase: 4.6 },
];

export default function BubbleScene({ onFail }) {
  const mount = useRef(null);

  useEffect(() => {
    const el = mount.current;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      onFail?.();
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.45;

    const key = new THREE.DirectionalLight(0xffd9a8, 2.4);
    key.position.set(3, 4, 5);
    const rim = new THREE.DirectionalLight(0xffb547, 1.6);
    rim.position.set(-4, 1, -3);
    scene.add(key, rim);

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    const cluster = new THREE.Group();
    cluster.position.y = 0.2;
    scene.add(cluster);

    const otherMat = new THREE.MeshPhysicalMaterial({ color: 0x3a342d, roughness: 0.35, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.3 });
    const mineMat = new THREE.MeshPhysicalMaterial({ color: 0xffb547, roughness: 0.3, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.25 });
    const otherLine = new THREE.MeshStandardMaterial({ color: 0x9a9084, roughness: 0.6 });
    const mineLine = new THREE.MeshStandardMaterial({ color: 0x2a1c00, roughness: 0.6 });

    const geometries = [];
    const groups = BUBBLES.map((b) => {
      const h = 0.56 + b.lines.length * 0.24;
      const g = new THREE.Group();
      const bodyGeo = new RoundedBoxGeometry(b.w, h, DEPTH, 6, 0.2);
      geometries.push(bodyGeo);
      g.add(new THREE.Mesh(bodyGeo, b.mine ? mineMat : otherMat));

      b.lines.forEach((f, i) => {
        const lw = f * (b.w - 0.9);
        const lineGeo = new RoundedBoxGeometry(lw, 0.1, 0.05, 3, 0.02);
        geometries.push(lineGeo);
        const line = new THREE.Mesh(lineGeo, b.mine ? mineLine : otherLine);
        line.position.set(-b.w / 2 + 0.45 + lw / 2, ((b.lines.length - 1) / 2 - i) * 0.24, DEPTH / 2 + 0.005);
        g.add(line);
      });

      g.position.set(...b.pos);
      g.rotation.set(...b.rot);
      g.userData = { base: b.pos, rot: b.rot, speed: b.speed, phase: b.phase };
      cluster.add(g);
      return g;
    });

    const target = { x: 0, y: 0 };
    const draw = (t) => {
      groups.forEach((g, i) => {
        const d = g.userData;
        const k = THREE.MathUtils.clamp((t - i * 0.18) / 1.3, 0, 1);
        const e = 1 - Math.pow(1 - k, 3);
        g.position.y = d.base[1] + Math.sin(t * d.speed + d.phase) * 0.13 - (1 - e) * 2.2;
        g.rotation.z = d.rot[2] + Math.sin(t * d.speed * 0.8 + d.phase) * 0.02;
        g.scale.setScalar(0.85 + 0.15 * e);
      });
      cluster.rotation.y += (target.y - cluster.rotation.y) * 0.05;
      cluster.rotation.x += (target.x - cluster.rotation.x) * 0.05;
      renderer.render(scene, camera);
    };

    const clock = new THREE.Clock();
    const loop = () => draw(clock.getElapsedTime());

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.position.set(0, 0, Math.max(11, 10.5 / camera.aspect));
      camera.updateProjectionMatrix();
      if (reduce) draw(10);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const onMove = (e) => {
      target.y = (e.clientX / innerWidth - 0.5) * 0.7;
      target.x = (e.clientY / innerHeight - 0.5) * 0.35;
    };
    const onVisibility = () => renderer.setAnimationLoop(document.hidden ? null : loop);

    if (reduce) {
      draw(10);
    } else {
      renderer.setAnimationLoop(loop);
      window.addEventListener('pointermove', onMove);
      document.addEventListener('visibilitychange', onVisibility);
    }

    return () => {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVisibility);
      geometries.forEach((g) => g.dispose());
      [otherMat, mineMat, otherLine, mineLine].forEach((m) => m.dispose());
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [onFail]);

  return <div ref={mount} className="scene-mount" />;
}
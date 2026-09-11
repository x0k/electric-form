<script lang="ts">
  import { onMount } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import type { RenderScene } from './render';

  interface Props {
    /** Нейтральная сцена из modelToScene — единственный вход адаптера. */
    scene: RenderScene;
    /** Выбранный id сущности (источник истины — снаружи). */
    selectedId?: string | null;
    /** Клик по сцене: id сущности или null (клик по пустому месту). */
    onSelect?: (id: string | null) => void;
  }

  let { scene, selectedId = null, onSelect }: Props = $props();

  /** мм → м: в three.js работаем в метрах. */
  const K = 0.001;
  const WALL_COLOR = 0xe7e5e4;
  const FLOOR_COLOR = 0xf5f5f4;
  const CEIL_COLOR = 0xd6d3d1;
  const SELECT_COLOR = 0xea580c;

  let container: HTMLDivElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let webgl: 'pending' | 'ok' | 'missing' = $state('pending');

  let renderer: THREE.WebGLRenderer | null = null;
  let threeScene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let controls: OrbitControls | null = null;
  let content: THREE.Group | null = null;
  let pickables: THREE.Mesh[] = [];
  let byEntity = new Map<string, THREE.Mesh[]>();
  let raf = 0;
  let resizeObserver: ResizeObserver | null = null;
  let ready = false;

  const entityCount = $derived(scene.walls.length + scene.slabs.length);

  onMount(() => {
    if (!container || !canvas) {
      webgl = 'missing';
      return;
    }
    let three: THREE.WebGLRenderer;
    try {
      three = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch {
      webgl = 'missing';
      return;
    }
    renderer = three;
    webgl = 'ok';

    threeScene = new THREE.Scene();
    threeScene.background = new THREE.Color(0xfafaf9);

    camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);

    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.15;
    // Потолок не проваливаемся: цель всегда внутри квартиры.
    controls.maxPolarAngle = Math.PI / 2 - 0.02;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x78716c, 1.1);
    threeScene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(8, 14, 6);
    threeScene.add(dir);

    // Сетка 1 м для масштаба.
    const spanM = Math.max(
      scene.bounds.maxX - scene.bounds.minX,
      scene.bounds.maxY - scene.bounds.minY,
      1000
    );
    const gridSize = Math.ceil((spanM * K) / 2) * 2;
    const grid = new THREE.GridHelper(gridSize, gridSize, 0xa8a29e, 0xe7e5e4);
    grid.position.y = -0.01;
    threeScene.add(grid);

    frameCamera();
    rebuild();
    resize();

    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const onClick = (e: MouseEvent) => pick(e);
    canvas.addEventListener('click', onClick);

    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls?.update();
      if (renderer && threeScene && camera) {
        renderer.render(threeScene, camera);
      }
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
      canvas?.removeEventListener('click', onClick);
      controls?.dispose();
      disposeContent();
      renderer?.dispose();
      renderer = null;
      threeScene = null;
      camera = null;
      controls = null;
      ready = false;
    };
  });

  // Обновление сцены и подсветки — только после инициализации three.js.
  $effect(() => {
    if (!ready) return;
    rebuild();
  });

  $effect(() => {
    if (!ready) return;
    applyHighlight(selectedId);
  });

  function frameCamera() {
    if (!camera || !controls) return;
    const b = scene.bounds;
    const cx = ((b.minX + b.maxX) / 2) * K;
    const cz = (-(b.minY + b.maxY) / 2) * K;
    const radius = (Math.max(b.maxX - b.minX, b.maxY - b.minY) * K) / 2 || 1;
    const dist = (radius / Math.tan(THREE.MathUtils.degToRad(22.5))) * 1.25;
    camera.position.set(cx + dist * 0.45, dist * 0.85, cz + dist * 0.55);
    controls.target.set(cx, 0, cz);
    controls.update();
  }

  function rebuild() {
    if (!threeScene) return;
    disposeContent();
    content = new THREE.Group();
    pickables = [];
    byEntity = new Map();

    for (const w of scene.walls) {
      const geo = new THREE.BoxGeometry(
        w.lengthMm * K,
        w.heightMm * K,
        w.thicknessMm * K
      );
      const mat = new THREE.MeshStandardMaterial({ color: WALL_COLOR });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(w.cxMm * K, (w.heightMm * K) / 2, -w.cyMm * K);
      mesh.rotation.y = w.angleRad;
      mesh.userData.entityId = w.id;
      content.add(mesh);
      pickables.push(mesh);
      track(w.id, mesh);
    }

    for (const s of scene.slabs) {
      const shape = new THREE.Shape();
      s.points.forEach((p, i) => {
        if (i === 0) shape.moveTo(p.x, p.y);
        else shape.lineTo(p.x, p.y);
      });
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      // Shape (x, y) → мир (x, 0, −y): та же ориентация, что у стен.
      geo.rotateX(-Math.PI / 2);
      geo.scale(K, 1, K);
      const isFloor = s.kind === 'floor';
      const mat = new THREE.MeshStandardMaterial({
        color: isFloor ? FLOOR_COLOR : CEIL_COLOR,
        side: THREE.DoubleSide,
        transparent: !isFloor,
        opacity: isFloor ? 1 : 0.25,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = s.levelMm * K;
      mesh.userData.entityId = s.id;
      content.add(mesh);
      // Потолок из выбора исключён: клик сквозь него попадает в комнату.
      if (isFloor) pickables.push(mesh);
      track(s.id, mesh);
    }

    threeScene.add(content);
    applyHighlight(selectedId);
    ready = true;
  }

  function track(id: string, mesh: THREE.Mesh) {
    const list = byEntity.get(id) ?? [];
    list.push(mesh);
    byEntity.set(id, list);
  }

  function disposeContent() {
    if (!threeScene || !content) return;
    threeScene.remove(content);
    content.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material;
        mat.dispose();
      }
    });
    content = null;
    pickables = [];
    byEntity = new Map();
  }

  function applyHighlight(id: string | null | undefined) {
    for (const [entityId, meshes] of byEntity) {
      for (const mesh of meshes) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (entityId === id) {
          mat.emissive.setHex(SELECT_COLOR);
          mat.emissiveIntensity = 0.55;
        } else {
          mat.emissiveIntensity = 0;
        }
      }
    }
  }

  function pick(e: MouseEvent) {
    if (!renderer || !threeScene || !camera || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(pickables, false);
    const id =
      (hits[0]?.object.userData.entityId as string | undefined) ?? null;
    onSelect?.(id);
  }

  function resize() {
    if (!renderer || !camera || !container) return;
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
</script>

<div
  bind:this={container}
  class="plan-viewer relative h-full w-full overflow-hidden"
  data-testid="plan-viewer"
  data-entity-count={entityCount}
  data-selected={selectedId ?? ''}
  data-webgl={webgl}
>
  <canvas
    bind:this={canvas}
    data-testid="plan-canvas"
    class="block h-full w-full"
  ></canvas>
  {#if webgl === 'missing'}
    <p class="absolute inset-0 grid place-items-center bg-stone-100 text-sm">
      WebGL недоступен — 3D-просмотр невозможен
    </p>
  {/if}
</div>

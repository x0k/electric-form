<script lang="ts">
  import { onMount } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import type { RenderScene } from './render';
  import type { EditorCameraMode } from './camera';
  import {
    cameraPositionMm,
    fitDistanceMm,
    isoFrustumForBounds,
    isoPresetCorner,
    topFrustumForBounds,
  } from './camera';
  import type { Sketch } from './sketch';
  import {
    isSketchClosed,
    isStrokeClosed,
    closingStrokeAtPoint,
    sketchBadges,
  } from './sketch';
  import { snapPlanPoint, lockToAxis } from './viewport';
  import { BASE_GRID_MM, axisAngleClean, type Vec2 } from './geometry';
  import type { PlaceHit } from './placing';

  /** Спецификация госта размещения: слой + габариты-превью, мм. */
  export interface PlaceToolSpec {
    layer: 'floorObject' | 'wallObject' | 'elec' | 'light' | 'opening';
    wMm: number;
    dMm: number;
    hMm: number;
    /** Базовая высота: низ объекта / sill проёма, мм. */
    zMm: number;
    /** Поворот напольного госта, градусы. */
    rotDeg: number;
  }

  /**
   * Контекст клика по плоскости: сырая точка до снаппинга,
   * был ли Shift (лок оси) и ручка точки, если клик был по ней.
   */
  export interface PlanClickInfo {
    raw: Vec2;
    shift: boolean;
    pointId?: string;
  }

  interface Props {
    /** Нейтральная сцена из modelToScene — единственный вход адаптера. */
    scene: RenderScene;
    /**
     * Выбранные id сущностей (источник истины — снаружи).
     * Рамка выбора отдаёт сразу набор, одиночный клик — один id.
     */
    selectedIds?: string[];
    /** Клик по сцене: id сущности или null (клик по пустому месту). */
    onSelect?: (id: string | null) => void;
    /** Рамка выбора в режиме select: id точек и граней внутри. */
    onBoxSelect?: (ids: string[]) => void;
    /**
     * Разрешить рамку выбора левой кнопкой по пустому месту.
     * Включает только режим select (в draw левая тянет панораму).
     */
    boxSelect?: boolean;
    /** Режим камеры редактора (Этап 3). По умолчанию — свободная орбита. */
    cameraMode?: EditorCameraMode;
    /**
     * Угол изометрии 0..3 (диагональ). Стены на исходящих из ближнего
     * угла осях гасятся, чтобы видеть интерьер.
     */
    isoPreset?: number;
    /** Счётчик сброса вида: клик по активному углу возвращает камеру. */
    reframeNonce?: number;
    /** Редактируемый скетч контура (overlay поверх модели). */
    sketch?: Sketch | null;
    /** Шаг привязки drag/кликов, мм (кратно 1 см). */
    snapStepMm?: number;
    /** Шаг видимой сетки, мм. Снаппинг всегда точнее — до 1 см. */
    gridStepMm?: number;
    showGrid?: boolean;
    /** Drag вершины: частые preview-обновления. */
    onSketchPointMove?: (pointId: string, plan: Vec2) => void;
    /** Drag вершины: финальный коммит по отпусканию. */
    onSketchPointCommit?: (pointId: string, plan: Vec2) => void;
    /** Drag грани целиком: превью и коммит (оба конца со сдвигом). */
    onSketchSegmentMove?: (segmentId: string, a: Vec2, b: Vec2) => void;
    onSketchSegmentCommit?: (segmentId: string, a: Vec2, b: Vec2) => void;
    /** Клик по пустому месту в плоскости пола (точка уже со снаппингом). */
    onPlanClick?: (plan: Vec2, info?: PlanClickInfo) => void;
    /** Клик по значку ограничения: правка значения прямо на канвасе. */
    onBadgeClick?: (info: { segmentId: string; x: number; y: number }) => void;
    /**
     * Правый клик без drag (как в Sketcher: выход из полилинии).
     * Pan правой кнопкой с движением сюда не попадает.
     */
    onPolylineFinish?: () => void;
    /**
     * Начало резинки превью (конец активной цепочки) в мм плана.
     * null — превью нет. Курсор отслеживается внутри вьювера.
     */
    rubberFrom?: Vec2 | null;
    /** Подсвечивать ли автозамок оси (зелёная резинка при H/V). */
    rubberLockHint?: boolean;
    /**
     * Активный штрих редактора: зелёным подсвечивается замыкание
     * именно его начала. null — замыканий не предвидится.
     */
    activeStroke?: number | null;
    /**
     * Графическое размещение: какой слой кладём кликом по сцене.
     * null — обычный режим (выбор/скетч). Гост строится из габаритов.
     */
    placeTool?: PlaceToolSpec | null;
    /** Id сущностей текущего этапа — их можно таскать мышью. */
    draggableIds?: string[];
    /** Клик-подтверждение размещения (план уже со снаппингом 1 см). */
    onPlace?: (hit: PlaceHit) => void;
    /** Финал перетаскивания: гост уже погашен, меш не двигался. */
    onObjectMove?: (id: string, hit: PlaceHit) => void;
    /** Esc в режиме инструмента/перетаскивания. */
    onToolCancel?: () => void;
  }

  let {
    scene,
    selectedIds = [],
    onSelect,
    onBoxSelect,
    boxSelect = false,
    cameraMode = 'orbit',
    isoPreset = 0,
    sketch = null,
    snapStepMm = BASE_GRID_MM,
    gridStepMm = 100,
    showGrid = true,
    onSketchPointMove,
    onSketchPointCommit,
    onSketchSegmentMove,
    onSketchSegmentCommit,
    onPlanClick,
    onBadgeClick,
    onPolylineFinish,
    rubberFrom = null,
    rubberLockHint = false,
    activeStroke = null,
    reframeNonce = 0,
    placeTool = null,
    draggableIds = [],
    onPlace,
    onObjectMove,
    onToolCancel,
  }: Props = $props();

  /** мм → м: в three.js работаем в метрах. */
  const K = 0.001;
  const WALL_COLOR = 0xe7e5e4;
  const FLOOR_COLOR = 0xf5f5f4;
  const CEIL_COLOR = 0xd6d3d1;
  const DOOR_LEAF_COLOR = 0xb45309;
  const FURN_COLOR = 0xd6a35c;
  const WALLMOUNT_COLOR = 0x93c5fd;
  const SOCKET_COLOR = 0x2563eb;
  const SWITCH_COLOR = 0xea580c;
  const LIGHT_COLOR = 0xfde047;
  const SELECT_COLOR = 0xea580c;
  const SKETCH_LINE_COLOR = 0x2563eb;
  const SKETCH_POINT_COLOR = 0x2563eb;
  const SKETCH_LINE_HOVER = 0x60a5fa;
  const RUBBER_LOCK_COLOR = 0x16a34a;
  const RUBBER_DOT_COLOR = 0xea580c;
  const HANDLE_RADIUS_M = 0.045;
  const RUBBER_DOT_RADIUS_M = 0.03;
  /** Порог попадания в грань при клике по самой линии, м. */
  const SEG_PICK_THRESHOLD_M = 0.06;
  const DRAG_PX_THRESHOLD = 4;

  let container: HTMLDivElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let webgl: 'pending' | 'ok' | 'missing' = $state('pending');

  let renderer: THREE.WebGLRenderer | null = null;
  let threeScene: THREE.Scene | null = null;
  let perspCamera: THREE.PerspectiveCamera | null = null;
  let orthoCamera: THREE.OrthographicCamera | null = null;
  let activeCamera: THREE.Camera | null = null;
  let controls: OrbitControls | null = null;
  let content: THREE.Group | null = null;
  let sketchGroup: THREE.Group | null = null;
  /** Бесконечная сетка: мелкая + крупная, следуют за целью камеры. */
  let gridGroup: THREE.Group | null = null;
  let fineGrid: THREE.GridHelper | null = null;
  let coarseGrid: THREE.GridHelper | null = null;
  let gridCellKey = '';
  let pickables: THREE.Object3D[] = [];
  let sketchHandles: THREE.Mesh[] = [];
  /** Линии граней для прямого выбора (клик по самой грани). */
  let segmentLines: THREE.Line[] = [];
  /** Спрайты значков ограничений (кликабельны для правки). */
  let badgeSprites: THREE.Sprite[] = [];
  let byEntity = new Map<string, THREE.Object3D[]>();
  let raf = 0;
  let resizeObserver: ResizeObserver | null = null;
  let ready = false;
  let lastBoundsKey = '';
  let lastSizeKey = '';
  /**
   * Режим, реально применённый к three-камере. С async-runes $effect
   * срабатывает не мгновенно — тесты ждут data-framed вместо data-camera.
   */
  let framedMode: EditorCameraMode = $state('orbit');
  /** Отрендеренные гизмо скетча `хендлы:ручки` — ворота готовности для кликов. */
  let gizmoKey = $state('');
  /** Отрендеренные значки ограничений (для кликов по ним). */
  let badgeCount = $state(0);
  /** Стены, погашенные углом изометрии (ближний угол). */
  let fadedIds: string[] = $state([]);

  // Drag вершин скетча.
  let dragPointId: string | null = null;
  let downPx: { x: number; y: number } | null = null;
  let dragging = false;
  let suppressClick = false;
  /** Дистанция pointerdown→pointerup: отличаем клик от orbit-drag. */
  let lastPointerTravel = 0;
  /** Id точек скетча, уже заведённые в byEntity (для чистки подсветки). */
  let indexedSketchIds: string[] = [];
  /** Preselect под курсором (как в Sketcher), null — нет. */
  let hoveredId: string | null = $state(null);
  /** Конец резинки превью в мм плана (со снаппингом), null — скрыта. */
  let rubberTip: Vec2 | null = $state(null);
  /** Shift при текущем положении курсора (лок оси превью). */
  let rubberShift = $state(false);
  /** Превью показывает состояние, которое реально применится. */
  let rubberLocked = $state(false);
  let rubberGroup: THREE.Group | null = null;
  /** Сырая точка старта drag (для Shift-лока перемещения). */
  let dragStartRaw: Vec2 | null = null;
  /** Drag грани: id, стартовые концы и сырой старт (для сдвига). */
  let dragSegId: string | null = null;
  let dragSegOrig: { a: Vec2; b: Vec2 } | null = null;
  /** Рамка выбора (как в Sketcher): старт в px канваса, null — нет жеста. */
  let boxStart: { x: number; y: number } | null = null;
  let boxing = false;
  let boxRect: { x: number; y: number; w: number; h: number } | null =
    $state(null);

  // Графическое размещение и перетаскивание объектов (этапы 5a–11).
  // Гост — один переиспользуемый меш: ни одного ребилда сцены на движение.
  let ghost: THREE.Mesh | null = null;
  let ghostSig: string | null = null;
  /** Позиция госта «x,y» для e2e; '' — гост скрыт. */
  let ghostKey = $state('');
  /** Стена под гостом для e2e (поиск точки стены свипом); '' — пол/нет. */
  let ghostWall = $state('');
  /** Тащим объект: id + захват (курсор минус центр, мм плана). */
  let objDragId: string | null = null;
  let objDragGrab: Vec2 | null = null;
  let objDragHit: PlaceHit | null = null;
  const GHOST_COLOR = 0x16a34a;
  /** Высота подвеса госта света — как у рендера светильников. */
  const LIGHT_GHOST_Y_M = 2.6;

  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  const entityCount = $derived(
    scene.walls.length +
      scene.slabs.length +
      (scene.openings?.length ?? 0) +
      (scene.floorObjects?.length ?? 0) +
      (scene.wallObjects?.length ?? 0) +
      (scene.elec?.length ?? 0) +
      (scene.lights?.length ?? 0)
  );
  const sketchPointCount = $derived(
    sketch ? Object.keys(sketch.points).length : 0
  );
  const sketchClosed = $derived(sketch ? isSketchClosed(sketch) : false);
  const sketchSegmentCount = $derived(sketch ? sketch.segments.length : 0);
  const sketchBadgeCount = $derived(sketch ? sketchBadges(sketch).length : 0);
  /** Значения dimensions для тестов: `s1:H;s2:6000`, сортировка по граням. */
  const sketchDims = $derived(
    sketch
      ? sketchBadges(sketch)
          .map((b) => `${b.segment}:${b.labels.join(',')}`)
          .sort()
          .join(';')
      : ''
  );

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

    perspCamera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, -500, 500);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x78716c, 1.1);
    threeScene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(8, 14, 6);
    threeScene.add(dir);

    switchCamera();
    rebuild();
    resize();

    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const onClick = (e: MouseEvent) => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      pick(e);
    };
    // Правая кнопка без drag — выход из полилинии (как в Sketcher).
    // Pan с движением отфильтровывается по дистанции pointerdown→up.
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (lastPointerTravel > DRAG_PX_THRESHOLD) {
        lastPointerTravel = 0;
        return;
      }
      lastPointerTravel = 0;
      onPolylineFinish?.();
    };
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('pointerleave', onPointerLeave);

    // Esc отменяет размещение/перетаскивание. Скетч-режим его не видит:
    // там placeTool пуст и objDragId не выставляется. В полях ввода — игнор.
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      const t = ev.target as HTMLElement | null;
      const tag = t?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (objDragId) {
        cancelObjDrag();
        suppressClick = true;
      } else if (placeTool) {
        hideGhost();
        onToolCancel?.();
      }
    };
    window.addEventListener('keydown', onKey);

    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls?.update();
      recenterGrid();
      updateGridFade();
      if (renderer && threeScene && activeCamera) {
        renderer.render(threeScene, activeCamera);
      }
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
      canvas?.removeEventListener('click', onClick);
      canvas?.removeEventListener('contextmenu', onContextMenu);
      canvas?.removeEventListener('pointerdown', onPointerDown);
      canvas?.removeEventListener('pointermove', onPointerMove);
      canvas?.removeEventListener('pointerup', onPointerUp);
      canvas?.removeEventListener('pointercancel', onPointerCancel);
      canvas?.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('keydown', onKey);
      controls?.dispose();
      disposeContent();
      disposeSketch();
      disposeGrid();
      if (rubberGroup && threeScene) {
        threeScene.remove(rubberGroup);
        rubberGroup.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.geometry.dispose();
            (mesh.material as THREE.Material).dispose();
          }
          const line = obj as THREE.Line;
          if (line.isLine) {
            line.geometry.dispose();
            (line.material as THREE.Material).dispose();
          }
        });
        rubberGroup = null;
      }
      renderer?.dispose();
      renderer = null;
      threeScene = null;
      disposeGhost();
      perspCamera = null;
      orthoCamera = null;
      activeCamera = null;
      controls = null;
      ready = false;
    };
  });

  // Обновления после инициализации three.js. Явные чтения пропсов —
  // иначе runes-эффект не подпишется на их изменения.
  $effect(() => {
    void scene;
    if (!ready) return;
    rebuild();
  });

  $effect(() => {
    void cameraMode;
    void isoPreset;
    void reframeNonce;
    if (!ready) return;
    switchCamera();
    applyFade();
  });

  $effect(() => {
    void sketch;
    if (!ready) return;
    rebuildSketch();
    applyHighlight(selectedIds, hoveredId);
  });

  $effect(() => {
    void gridStepMm;
    void showGrid;
    if (!ready) return;
    rebuildGrid();
  });

  $effect(() => {
    if (!ready) return;
    applyHighlight(selectedIds, hoveredId);
  });

  // Резинка следит за концом цепочки без полного ребилда оверлея.
  $effect(() => {
    void rubberFrom;
    void rubberLockHint;
    void rubberShift;
    void rubberLocked;
    if (!ready) return;
    updateRubber();
  });

  // Инструмент выключили — гост гаснет.
  $effect(() => {
    if (!placeTool) hideGhost();
  });

  function boundsKey(): string {
    const b = scene.bounds;
    return `${b.minX}:${b.minY}:${b.maxX}:${b.maxY}`;
  }

  function worldCenter(): THREE.Vector3 {
    const b = scene.bounds;
    return new THREE.Vector3(
      ((b.minX + b.maxX) / 2) * K,
      0,
      (-(b.minY + b.maxY) / 2) * K
    );
  }

  function containerAspect(): number {
    if (!container) return 1;
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    return w / h;
  }

  /** Переключение камеры редактора: top/iso — орто, orbit — перспектива. */
  function switchCamera() {
    if (!perspCamera || !orthoCamera || !canvas) return;
    const target = worldCenter();
    const distMm = fitDistanceMm(scene.bounds);

    controls?.dispose();
    controls = null;

    if (cameraMode === 'orbit') {
      activeCamera = perspCamera;
      const pos = cameraPositionMm('orbit', scene.bounds, distMm);
      perspCamera.aspect = containerAspect();
      perspCamera.updateProjectionMatrix();
      perspCamera.position.set(pos.x * K, pos.y * K, pos.z * K);
      perspCamera.up.set(0, 1, 0);
      controls = new OrbitControls(perspCamera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.15;
      // Потолок не проваливаемся: цель всегда внутри квартиры.
      controls.maxPolarAngle = Math.PI / 2 - 0.02;
    } else {
      activeCamera = orthoCamera;
      const aspect = containerAspect();
      const frustum =
        cameraMode === 'top'
          ? topFrustumForBounds(scene.bounds, aspect)
          : isoFrustumForBounds(scene.bounds, aspect);
      orthoCamera.left = frustum.left * K;
      orthoCamera.right = frustum.right * K;
      orthoCamera.top = frustum.top * K;
      orthoCamera.bottom = frustum.bottom * K;
      orthoCamera.near = frustum.near * K;
      orthoCamera.far = frustum.far * K;
      orthoCamera.updateProjectionMatrix();
      const pos = cameraPositionMm(
        cameraMode,
        scene.bounds,
        distMm * 2,
        isoPreset
      );
      orthoCamera.position.set(pos.x * K, pos.y * K, pos.z * K);
      if (cameraMode === 'top') {
        // Верх экрана = +Y плана (север сверху).
        orthoCamera.up.set(0, 0, -1);
      } else {
        orthoCamera.up.set(0, 1, 0);
      }
      orthoCamera.lookAt(target);
      controls = new OrbitControls(orthoCamera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.15;
      controls.target.copy(target);
      if (cameraMode === 'top') {
        // Вид сверху: только панорама и зум, без вращения.
        controls.enableRotate = false;
        controls.screenSpacePanning = true;
      } else {
        controls.maxPolarAngle = Math.PI / 2 - 0.02;
      }
      controls.minZoom = 0.25;
      controls.maxZoom = 100;
    }
    controls.target.copy(target);
    controls.update();
    framedMode = cameraMode;
  }

  function rebuild() {
    if (!threeScene) return;
    disposeContent();
    // Сцена сменилась — жест прерван, гост прячем (спецификация жива).
    cancelObjDrag();
    hideGhost();
    // Карта подсветки сброшена — старые id скетча больше не валидны.
    indexedSketchIds = [];
    content = new THREE.Group();
    pickables = [];
    byEntity = new Map();
    sketchHandles = [];
    segmentLines = [];

    // Стены — кусками между проёмами (честные дыры, не накладки).
    // wallSegs всегда есть из modelToScene; фолбэк — цельные боксы
    // для сцен, собранных вручную (тесты/харнесы старого формата).
    const segs =
      scene.wallSegs ??
      scene.walls.map((w) => ({
        kind: 'wallSeg' as const,
        wallId: w.id,
        segIndex: 0,
        cxMm: w.cxMm,
        cyMm: w.cyMm,
        lengthMm: w.lengthMm + (w.extAMm ?? 0) + (w.extBMm ?? 0),
        angleRad: w.angleRad,
        thicknessMm: w.thicknessMm,
        heightMm: w.heightMm,
      }));
    for (const sg of segs) {
      const geo = new THREE.BoxGeometry(
        sg.lengthMm * K,
        sg.heightMm * K,
        sg.thicknessMm * K
      );
      const mat = new THREE.MeshStandardMaterial({ color: WALL_COLOR });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(sg.cxMm * K, (sg.heightMm * K) / 2, -sg.cyMm * K);
      mesh.rotation.y = sg.angleRad;
      mesh.userData.entityId = sg.wallId;
      content.add(mesh);
      pickables.push(mesh);
      track(sg.wallId, mesh);
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

    // Проёмы — настоящие дыры в стене (куски выше), поэтому видимого
    // меша нет. Невидимый pick-бокс сохраняет выбор и drag: opacity 0,
    // но луч его ловит (visible=true, depthWrite=false — ничего не рисует).
    for (const o of scene.openings ?? []) {
      const wall = scene.walls.find((w) => w.id === o.wallId);
      const thickM = (wall?.thicknessMm ?? 200) * K;
      const hM = o.heightMm * K;
      const geo = new THREE.BoxGeometry(o.widthMm * K, hM, thickM * 1.04);
      const mat = new THREE.MeshStandardMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        o.cxMm * K,
        o.sillMm * K + hM / 2 || hM / 2,
        -o.cyMm * K
      );
      mesh.rotation.y = o.angleRad;
      mesh.userData.entityId = o.id;
      content.add(mesh);
      pickables.push(mesh);
      track(o.id, mesh);
      // Дверное полотно: тонкая створка под углом 30° для читаемости.
      if (o.openingKind === 'door') {
        const leafGeo = new THREE.BoxGeometry(o.widthMm * K, hM, 0.04);
        const leafMat = new THREE.MeshStandardMaterial({
          color: DOOR_LEAF_COLOR,
        });
        const leaf = new THREE.Mesh(leafGeo, leafMat);
        const hx = Math.cos(o.angleRad);
        const hz = -Math.sin(o.angleRad);
        leaf.position.set(
          (o.p0.x * K + o.cxMm * K) / 2 + hz * 0.2,
          hM / 2,
          (-o.p0.y * K + -o.cyMm * K) / 2 + hx * 0.2
        );
        leaf.rotation.y = o.angleRad + Math.PI / 6;
        leaf.userData.entityId = o.id;
        content.add(leaf);
        track(o.id, leaf);
      }
    }

    // Напольные объекты: боксы на полу по габаритам каталога.
    for (const f of scene.floorObjects ?? []) {
      const geo = new THREE.BoxGeometry(f.wMm * K, f.hMm * K, f.dMm * K);
      const mat = new THREE.MeshStandardMaterial({ color: FURN_COLOR });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(f.cxMm * K, (f.hMm * K) / 2, -f.cyMm * K);
      mesh.rotation.y = f.angleRad;
      mesh.userData.entityId = f.id;
      content.add(mesh);
      pickables.push(mesh);
      track(f.id, mesh);
    }

    // Навесные: боксы на стене на высоте монтажа.
    for (const m of scene.wallObjects ?? []) {
      const geo = new THREE.BoxGeometry(m.wMm * K, m.hMm * K, m.depthMm * K);
      const mat = new THREE.MeshStandardMaterial({ color: WALLMOUNT_COLOR });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        m.xMm * K,
        m.zMm * K + (m.hMm * K) / 2 || (m.hMm * K) / 2,
        -m.yMm * K
      );
      mesh.rotation.y = m.angleRad;
      mesh.userData.entityId = m.id;
      content.add(mesh);
      pickables.push(mesh);
      track(m.id, mesh);
    }

    // Электрика: розетки — синие кубики, выключатели — оранжевые.
    for (const e of scene.elec ?? []) {
      const geo = new THREE.BoxGeometry(0.09, 0.09, 0.03);
      const mat = new THREE.MeshStandardMaterial({
        color: e.elecKind === 'socket' ? SOCKET_COLOR : SWITCH_COLOR,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(e.xMm * K, e.zMm * K, -e.yMm * K);
      mesh.userData.entityId = e.id;
      content.add(mesh);
      pickables.push(mesh);
      track(e.id, mesh);
    }

    // Свет: светящиеся сферы на потолке (y = 2.6 м визуально).
    for (const l of scene.lights ?? []) {
      const geo = new THREE.SphereGeometry(
        l.lightKind === 'spot' ? 0.05 : 0.09,
        16,
        12
      );
      const mat = new THREE.MeshStandardMaterial({
        color: LIGHT_COLOR,
        emissive: LIGHT_COLOR,
        emissiveIntensity: 0.9,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(l.xMm * K, 2.6, -l.yMm * K);
      mesh.userData.entityId = l.id;
      content.add(mesh);
      pickables.push(mesh);
      track(l.id, mesh);
    }

    threeScene.add(content);
    rebuildGrid();
    rebuildSketch();
    applyFade();
    applyHighlight(selectedIds, hoveredId);

    // Камера следит за габаритами только при их изменении,
    // чтобы не сбрасывать ручное позиционирование пользователя.
    const key = boundsKey();
    if (key !== lastBoundsKey) {
      lastBoundsKey = key;
      switchCamera();
    }
    ready = true;
  }

  function rebuildSketch() {
    if (!threeScene) return;
    disposeSketch();
    sketchHandles = [];
    segmentLines = [];
    badgeSprites = [];
    if (!sketch) {
      gizmoKey = '0:0';
      badgeCount = 0;
      return;
    }
    sketchGroup = new THREE.Group();

    // Каждая грань — своя линия: прямой выбор кликом по грани,
    // без ручек-призраков.
    for (const seg of sketch.segments) {
      const a = sketch.points[seg.a];
      const b = sketch.points[seg.b];
      if (!a || !b) continue;
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(a.x * K, 0.02, -a.y * K),
        new THREE.Vector3(b.x * K, 0.02, -b.y * K),
      ]);
      const mat = new THREE.LineBasicMaterial({
        color: SKETCH_LINE_COLOR,
        depthTest: false,
        transparent: true,
      });
      const line = new THREE.Line(geo, mat);
      // Overlay всегда поверх модели — как гизмо редактора.
      line.renderOrder = 998;
      line.userData.entityId = seg.id;
      line.userData.segmentId = seg.id;
      sketchGroup.add(line);
      segmentLines.push(line);
      track(seg.id, line);
    }

    const handleGeo = new THREE.SphereGeometry(HANDLE_RADIUS_M, 16, 12);
    for (const p of Object.values(sketch.points)) {
      const mat = new THREE.MeshStandardMaterial({
        color: SKETCH_POINT_COLOR,
        depthTest: false,
        transparent: true,
      });
      const mesh = new THREE.Mesh(handleGeo.clone(), mat);
      mesh.renderOrder = 999;
      mesh.position.set(p.x * K, 0.02, -p.y * K);
      mesh.userData.entityId = p.id;
      mesh.userData.sketchPointId = p.id;
      sketchGroup.add(mesh);
      sketchHandles.push(mesh);
      pickables.push(mesh);
      track(p.id, mesh);
    }
    indexedSketchIds = [
      ...Object.keys(sketch.points),
      ...sketch.segments.map((s) => s.id),
    ];
    gizmoKey = `${sketchHandles.length}:${segmentLines.length}`;

    // Значки ограничений на геометрии (как глифы в Sketcher).
    for (const badge of sketchBadges(sketch)) {
      const dim = badge.labels.some((l) => /^\d+$/.test(l));
      const sprite = makeBadgeSprite(
        badge.labels.join('·'),
        dim ? 'dim' : 'geom'
      );
      sprite.position.set(badge.x * K, 0.06, -badge.y * K);
      sprite.userData.badgeFor = badge.segment;
      sketchGroup.add(sprite);
      badgeSprites.push(sprite);
    }
    badgeCount = badgeSprites.length;

    threeScene.add(sketchGroup);
  }

  function rebuildGrid() {
    if (!threeScene) return;
    disposeGrid();
    if (!showGrid) return;
    // Бесконечная сетка: большая, следует за целью камеры (см. loop),
    // мелкая по шагу привязки + крупная ×10 для ориентации.
    gridGroup = new THREE.Group();
    const fineStepM = (gridStepMm > 0 ? gridStepMm : 100) * K;
    const sizeM = 120;
    fineGrid = new THREE.GridHelper(
      sizeM,
      Math.round(sizeM / fineStepM),
      0xd6d3d1,
      0xd6d3d1
    );
    coarseGrid = new THREE.GridHelper(
      sizeM,
      Math.round(sizeM / (fineStepM * 10)),
      0xa8a29e,
      0xa8a29e
    );
    for (const g of [fineGrid, coarseGrid]) {
      // Сетка лежит НА полу (y=0 — верх плиты), иначе пол её прячет.
      g.position.y = 0.01;
      const m = g.material as THREE.Material;
      m.transparent = true;
      m.opacity = 0.9;
      gridGroup.add(g);
    }
    threeScene.add(gridGroup);
    recenterGrid(true);
  }

  /** Держать сетку под камерой: снап позиций, чтобы линии не плыли. */
  function recenterGrid(force = false) {
    if (!gridGroup || !fineGrid || !coarseGrid || !controls) return;
    const t = controls.target;
    const fineStepM = (gridStepMm > 0 ? gridStepMm : 100) * K;
    const fx = Math.round(t.x / fineStepM) * fineStepM;
    const fz = Math.round(t.z / fineStepM) * fineStepM;
    const cx = Math.round(t.x);
    const cz = Math.round(t.z);
    const key = `${fx}:${fz}:${cx}:${cz}`;
    if (!force && key === gridCellKey) return;
    gridCellKey = key;
    fineGrid.position.set(fx, 0.01, fz);
    coarseGrid.position.set(cx, 0.01, cz);
  }

  /** Мелкая сетка гаснет при сильном отдалении (иначе муар). */
  function updateGridFade() {
    if (!fineGrid || !activeCamera) return;
    if (activeCamera instanceof THREE.OrthographicCamera) {
      fineGrid.visible = activeCamera.zoom > 0.35;
    } else if (controls) {
      fineGrid.visible = activeCamera.position.distanceTo(controls.target) < 30;
    }
  }

  function track(id: string, obj: THREE.Object3D) {
    const list = byEntity.get(id) ?? [];
    list.push(obj);
    byEntity.set(id, list);
  }

  /**
   * Гашение ближних стен в изометрии: стены на осях исходящего
   * к камере угла становятся прозрачными — виден интерьер.
   * В остальных режимах все стены непрозрачны.
   */
  function applyFade() {
    const faded = new Set<string>();
    if (cameraMode === 'iso' && content) {
      // База угла — контур пола (внутренний), а не расширенные bounds:
      // стыки стен лежат ровно на его вершинах.
      const floor = scene.slabs.find((s) => s.kind === 'floor');
      const base = floor
        ? {
            minX: Math.min(...floor.points.map((p) => p.x)),
            minY: Math.min(...floor.points.map((p) => p.y)),
            maxX: Math.max(...floor.points.map((p) => p.x)),
            maxY: Math.max(...floor.points.map((p) => p.y)),
          }
        : scene.bounds;
      const corner = isoPresetCorner(base, isoPreset);
      for (const w of scene.walls) {
        const near = (x: number, y: number) =>
          Math.hypot(x - corner.x, y - corner.y) <= 1;
        if (near(w.axMm, w.ayMm) || near(w.bxMm, w.byMm)) {
          faded.add(w.id);
        }
      }
    }
    fadedIds = [...faded].sort();
    if (!content) return;
    const wallIds = new Set(scene.walls.map((w) => w.id));
    content.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const id = mesh.userData.entityId as string | undefined;
      if (!id || !wallIds.has(id)) return;
      // Погашенные скрываем полностью: виден чистый интерьер.
      mesh.userData.faded = faded.has(id);
      mesh.visible = !faded.has(id);
    });
    updateCeiling();
  }

  /** Потолок виден только сверху: в изометрии/орбите он закрывал бы интерьер. */
  function updateCeiling() {
    if (!content) return;
    const show = cameraMode === 'top';
    content.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const slab = scene.slabs.find((s) => s.id === mesh.userData.entityId);
      if (slab?.kind === 'ceiling') {
        mesh.visible = show;
      }
    });
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

  function disposeSketch() {
    if (!threeScene || !sketchGroup) {
      sketchGroup = null;
      return;
    }
    for (const pid of indexedSketchIds) byEntity.delete(pid);
    indexedSketchIds = [];
    threeScene.remove(sketchGroup);
    sketchGroup.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
      const line = obj as THREE.Line;
      if ((line as THREE.Line).isLine) {
        line.geometry.dispose();
        const mat = line.material as THREE.Material;
        mat.dispose();
      }
      const sprite = obj as THREE.Sprite;
      if (sprite.isSprite) {
        const mat = sprite.material as THREE.SpriteMaterial;
        mat.map?.dispose();
        mat.dispose();
      }
    });
    sketchGroup = null;
    pickables = pickables.filter((o) => {
      const u = (o as THREE.Mesh).userData;
      return !u?.sketchPointId && !u?.segmentId;
    });
  }

  function disposeGrid() {
    if (!threeScene || !gridGroup) {
      gridGroup = null;
      fineGrid = null;
      coarseGrid = null;
      return;
    }
    threeScene.remove(gridGroup);
    gridGroup.traverse((obj) => {
      const line = obj as THREE.LineSegments;
      if (line.isLineSegments) {
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      }
    });
    gridGroup = null;
    fineGrid = null;
    coarseGrid = null;
  }

  function applyHighlight(
    ids: readonly string[],
    hovered: string | null | undefined
  ) {
    for (const [entityId, meshes] of byEntity) {
      const isSelected = ids.includes(entityId);
      for (const mesh of meshes) {
        const mat = (mesh as THREE.Mesh).material as THREE.Material | undefined;
        if (!mat) continue;
        if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
          const std = mat as THREE.MeshStandardMaterial;
          if (isSelected) {
            std.emissive.setHex(SELECT_COLOR);
            std.emissiveIntensity = 0.55;
          } else if (entityId === hovered) {
            // Preselect под курсором — слабее выбора.
            std.emissive.setHex(SELECT_COLOR);
            std.emissiveIntensity = 0.28;
          } else {
            std.emissiveIntensity = 0;
          }
        } else if ((mat as THREE.LineBasicMaterial).isLineBasicMaterial) {
          // Грани: выбор и preselect — цветом линии.
          (mat as THREE.LineBasicMaterial).color.setHex(
            isSelected
              ? SELECT_COLOR
              : entityId === hovered
                ? SKETCH_LINE_HOVER
                : SKETCH_LINE_COLOR
          );
        }
      }
    }
  }

  /** Табличка значка ограничения — CanvasTexture-спрайт.
   * Driving-размеры (длина) красные, геометрия (H/V) синяя, как в Sketcher. */
  function makeBadgeSprite(text: string, tone: 'geom' | 'dim'): THREE.Sprite {
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 80;
    const mat = new THREE.SpriteMaterial({
      depthTest: false,
      transparent: true,
    });
    const sprite = new THREE.Sprite(mat);
    const ctx = c.getContext('2d');
    const dim = tone === 'dim';
    if (ctx) {
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.strokeStyle = dim ? '#dc2626' : '#1d4ed8';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(4, 4, 152, 72, 18);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = dim ? '#7f1d1d' : '#1e3a8a';
      ctx.font = 'bold 38px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 80, 44);
    }
    mat.map = new THREE.CanvasTexture(c);
    mat.needsUpdate = true;
    sprite.scale.set(0.32, 0.16, 1);
    sprite.renderOrder = 1000;
    return sprite;
  }

  /** Резинка превью: сплошная линия от конца цепочки к курсору + точка. */
  function updateRubber() {
    if (!rubberFrom || !rubberTip) {
      if (rubberGroup) rubberGroup.visible = false;
      return;
    }
    if (!threeScene) return;
    if (!rubberGroup) {
      rubberGroup = new THREE.Group();
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]);
      const mat = new THREE.LineBasicMaterial({
        color: SKETCH_LINE_COLOR,
        depthTest: false,
        transparent: true,
      });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(RUBBER_DOT_RADIUS_M, 12, 8),
        new THREE.MeshBasicMaterial({
          color: RUBBER_DOT_COLOR,
          depthTest: false,
          transparent: true,
        })
      );
      rubberGroup.add(line, dot);
      rubberGroup.renderOrder = 1001;
      threeScene.add(rubberGroup);
    }
    const line = rubberGroup.children[0] as THREE.Line;
    const dot = rubberGroup.children[1] as THREE.Mesh;
    const pos = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    pos.setXYZ(0, rubberFrom.x * K, 0.03, -rubberFrom.y * K);
    pos.setXYZ(1, rubberTip.x * K, 0.03, -rubberTip.y * K);
    pos.needsUpdate = true;
    dot.position.set(rubberTip.x * K, 0.03, -rubberTip.y * K);
    (line.material as THREE.LineBasicMaterial).color.setHex(
      rubberLocked ? RUBBER_LOCK_COLOR : SKETCH_LINE_COLOR
    );
    rubberGroup.visible = true;
  }

  function hideRubber() {
    rubberTip = null;
    rubberLocked = false;
    if (rubberGroup) rubberGroup.visible = false;
  }

  function ndcFromEvent(e: MouseEvent | PointerEvent): THREE.Vector2 | null {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  /* ---------- Графическое размещение: гост, хит, drag ---------- */

  function disposeGhost() {
    if (ghost) {
      threeScene?.remove(ghost);
      ghost.geometry.dispose();
      (ghost.material as THREE.Material).dispose();
    }
    ghost = null;
    ghostSig = null;
  }

  function hideGhost() {
    ghostKey = '';
    ghostWall = '';
    if (ghost) ghost.visible = false;
  }

  /** Перестроить гост, только если сменилась спецификация. */
  function ensureGhost(sig: string, build: () => THREE.Mesh) {
    if (!threeScene) return;
    if (ghost && ghostSig === sig) {
      ghost.visible = true;
      return;
    }
    disposeGhost();
    ghost = build();
    ghostSig = sig;
    ghost.visible = true;
    ghost.renderOrder = 997;
    // В pickables не кладём: гост никогда не перехватывает луч.
    threeScene.add(ghost);
  }

  function ghostMesh(
    kind: 'box' | 'sphere',
    sxM: number,
    syM: number,
    szM: number
  ): THREE.Mesh {
    const geo =
      kind === 'box'
        ? new THREE.BoxGeometry(
            Math.max(sxM, 0.02),
            Math.max(syM, 0.02),
            Math.max(szM, 0.02)
          )
        : new THREE.SphereGeometry(Math.max(sxM / 2, 0.03), 16, 12);
    const mat = new THREE.MeshStandardMaterial({
      color: GHOST_COLOR,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    return new THREE.Mesh(geo, mat);
  }

  function wallAngleOf(wallId: string): number | null {
    const w = scene.walls.find((x) => x.id === wallId);
    return w ? w.angleRad : null;
  }

  /** Центр объекта сцены в плане по id (захват при drag). */
  function objectCenterOf(id: string): (Vec2 & { angleRad: number }) | null {
    const f = (scene.floorObjects ?? []).find((o) => o.id === id);
    if (f) return { x: f.cxMm, y: f.cyMm, angleRad: f.angleRad };
    const m = (scene.wallObjects ?? []).find((o) => o.id === id);
    if (m) return { x: m.xMm, y: m.yMm, angleRad: m.angleRad };
    const e = (scene.elec ?? []).find((o) => o.id === id);
    if (e) return { x: e.xMm, y: e.yMm, angleRad: 0 };
    const l = (scene.lights ?? []).find((o) => o.id === id);
    if (l) return { x: l.xMm, y: l.yMm, angleRad: 0 };
    const o = (scene.openings ?? []).find((x) => x.id === id);
    if (o) return { x: o.cxMm, y: o.cyMm, angleRad: o.angleRad };
    return null;
  }

  /** Габариты госта перетаскиваемого объекта — из сцены, метры + высота. */
  function dragGhostDims(id: string): {
    kind: 'box' | 'sphere';
    sx: number;
    sy: number;
    sz: number;
    yM: number;
  } | null {
    const f = (scene.floorObjects ?? []).find((o) => o.id === id);
    if (f) {
      return {
        kind: 'box',
        sx: f.wMm * K,
        sy: f.hMm * K,
        sz: f.dMm * K,
        yM: (f.hMm * K) / 2,
      };
    }
    const m = (scene.wallObjects ?? []).find((o) => o.id === id);
    if (m) {
      return {
        kind: 'box',
        sx: m.wMm * K,
        sy: m.hMm * K,
        sz: m.depthMm * K,
        yM: m.zMm * K + (m.hMm * K) / 2,
      };
    }
    const e = (scene.elec ?? []).find((o) => o.id === id);
    if (e) {
      return { kind: 'box', sx: 0.09, sy: 0.09, sz: 0.03, yM: e.zMm * K };
    }
    const l = (scene.lights ?? []).find((o) => o.id === id);
    if (l) {
      return {
        kind: 'sphere',
        sx: 0.18,
        sy: 0.18,
        sz: 0.18,
        yM: LIGHT_GHOST_Y_M,
      };
    }
    const o = (scene.openings ?? []).find((x) => x.id === id);
    if (o) {
      const wall = scene.walls.find((w) => w.id === o.wallId);
      return {
        kind: 'box',
        sx: o.widthMm * K,
        sy: o.heightMm * K,
        sz: (wall?.thicknessMm ?? 200) * K,
        yM: o.sillMm * K + (o.heightMm * K) / 2,
      };
    }
    return null;
  }

  /** Стена под курсором (погашенные пропускаем — клик идёт сквозь). */
  function wallHitAt(
    ndc: THREE.Vector2
  ): { wallId: string; point: THREE.Vector3 } | null {
    const ray = makeRay(ndc);
    if (!ray) return null;
    const wallIds = new Set(scene.walls.map((w) => w.id));
    const hits = ray.intersectObjects(pickables, false);
    const hit = hits.find(
      (h) =>
        !h.object.userData.faded &&
        wallIds.has(h.object.userData.entityId as string)
    );
    if (!hit) return null;
    return { wallId: hit.object.userData.entityId as string, point: hit.point };
  }

  /** Объект текущего этапа под курсором (кандидат на drag). */
  function modelObjectAt(ndc: THREE.Vector2): string | null {
    if (draggableIds.length === 0) return null;
    const ray = makeRay(ndc);
    if (!ray) return null;
    const ids = new Set(draggableIds);
    const hits = ray.intersectObjects(pickables, false);
    const hit = hits.find(
      (h) =>
        !h.object.userData.faded &&
        ids.has(h.object.userData.entityId as string)
    );
    return (hit?.object.userData.entityId as string | undefined) ?? null;
  }

  /** Пол под курсором (для госта: вне комнаты гост не показываем). */
  function floorHitAt(ndc: THREE.Vector2): boolean {
    const ray = makeRay(ndc);
    if (!ray) return false;
    const floorIds = new Set(
      scene.slabs.filter((s) => s.kind === 'floor').map((s) => s.id)
    );
    if (floorIds.size === 0) return false;
    const hits = ray.intersectObjects(pickables, false);
    return hits.some((h) => floorIds.has(h.object.userData.entityId as string));
  }

  /**
   * Полный хит курсора: снапнутый план + сырой + стена.
   * Высоты в хите нет сознательно: высота всегда из конфига инструмента,
   * иначе гост врал бы (показывает одно, ставится другое).
   */
  function modelHit(ndc: THREE.Vector2): PlaceHit | null {
    const raw = rawPlane(ndc);
    if (!raw) return null;
    const wall = wallHitAt(ndc);
    return { plan: snapLocked(raw, null), raw, wallId: wall?.wallId };
  }

  /** Гост размещения следует за курсором (снап 1 см, доворот к стене). */
  function updateToolGhost(hit: PlaceHit) {
    const spec = placeTool;
    if (!spec || !threeScene) return;
    const isSphere = spec.layer === 'light';
    ensureGhost(`tool:${spec.layer}:${spec.wMm}:${spec.dMm}:${spec.hMm}`, () =>
      ghostMesh(
        isSphere ? 'sphere' : 'box',
        spec.wMm * K,
        (isSphere ? spec.wMm : spec.hMm) * K,
        (isSphere ? spec.wMm : spec.dMm) * K
      )
    );
    if (!ghost) return;
    let angle = (spec.rotDeg * Math.PI) / 180;
    if (hit.wallId) {
      const wa = wallAngleOf(hit.wallId);
      if (wa !== null) {
        angle = spec.layer === 'floorObject' ? wa + angle : wa;
      }
    }
    const yM =
      spec.layer === 'light'
        ? LIGHT_GHOST_Y_M
        : spec.layer === 'floorObject'
          ? (spec.hMm * K) / 2
          : spec.zMm * K + (spec.hMm * K) / 2;
    ghost.position.set(hit.plan.x * K, yM, -hit.plan.y * K);
    ghost.rotation.set(0, angle, 0);
    ghostKey = `${hit.plan.x},${hit.plan.y}`;
    ghostWall = hit.wallId ?? '';
  }

  /** Гост перетаскивания: габариты объекта, позиция — adjusted-хит. */
  function updateDragGhost(plan: Vec2) {
    if (!objDragId) return;
    const dims = dragGhostDims(objDragId);
    if (!dims) return;
    ensureGhost(`drag:${objDragId}`, () =>
      ghostMesh(dims.kind, dims.sx, dims.sy, dims.sz)
    );
    if (!ghost) return;
    const c = objectCenterOf(objDragId);
    ghost.position.set(plan.x * K, dims.yM, -plan.y * K);
    ghost.rotation.set(0, c?.angleRad ?? 0, 0);
    ghostKey = `${plan.x},${plan.y}`;
  }

  /** Хит с вычетом захвата: объект не прыгает к курсору, а едет за ним. */
  function adjustedDragHit(ndc: THREE.Vector2): PlaceHit | null {
    const base = modelHit(ndc);
    if (!base || !objDragGrab) return base;
    const raw = base.raw ?? base.plan;
    const plan = snapLocked(
      { x: raw.x - objDragGrab.x, y: raw.y - objDragGrab.y },
      null
    );
    return { ...base, plan };
  }

  function cancelObjDrag() {
    objDragId = null;
    objDragGrab = null;
    objDragHit = null;
    hideGhost();
    if (controls) controls.enabled = true;
    if (canvas) canvas.style.cursor = '';
  }

  function pick(e: MouseEvent) {
    if (!activeCamera || !canvas) return;
    // Игнорируем клики после orbit-drag: это вращение, а не выбор.
    if (lastPointerTravel > DRAG_PX_THRESHOLD) {
      lastPointerTravel = 0;
      return;
    }
    lastPointerTravel = 0;
    const ndc = ndcFromEvent(e);
    if (!ndc) return;
    // Режим размещения: клик ставит объект, выбора нет.
    if (placeTool && !objDragId) {
      const hit = modelHit(ndc);
      if (hit) {
        hideGhost();
        onPlace?.(hit);
      }
      return;
    }
    // Хендлы скетча — первичны (гизмо поверх модели, даже под стенами).
    const handleId = handleAt(ndc);
    if (handleId) {
      // Клик по началу штриха — замыкание, а не выбор. В info идёт
      // СЫРОЙ raw события (с Shift-локом): редактору нужен угол ребра,
      // а не вырожденная точка ручки.
      if (onPlanClick && isClosableFirstPoint(handleId) && sketch) {
        const p = sketch.points[handleId];
        const raw0 = rawPlane(ndc);
        const raw =
          raw0 && e.shiftKey && rubberFrom
            ? lockToAxis(raw0, rubberFrom)
            : (raw0 ?? (p ? { x: p.x, y: p.y } : null));
        onSelect?.(null);
        if (p && raw) {
          onPlanClick(
            { x: p.x, y: p.y },
            {
              raw,
              shift: e.shiftKey,
              pointId: handleId,
            }
          );
        }
        return;
      }
      onSelect?.(handleId);
      return;
    }
    // Клик по значку ограничения — правка прямо на канвасе.
    const badgeSeg = badgeAt(ndc);
    if (badgeSeg) {
      onSelect?.(badgeSeg);
      onBadgeClick?.({
        segmentId: badgeSeg,
        x: e.clientX,
        y: e.clientY,
      });
      return;
    }
    // Клик по самой грани — выбор сегмента.
    const gripId = segmentAt(ndc);
    if (gripId) {
      onSelect?.(gripId);
      return;
    }
    const ray = makeRay(ndc);
    if (!ray) return;
    const hits = ray.intersectObjects(pickables, false);
    // Погашенные стены прозрачны: клик идёт сквозь них в интерьер.
    const hit = hits.find((h) => !h.object.userData.faded);
    const id = (hit?.object.userData.entityId as string | undefined) ?? null;
    onSelect?.(id);
    if (id === null && onPlanClick) {
      const raw = rawPlane(ndc);
      if (!raw) return;
      const origin = e.shiftKey ? rubberFrom : null;
      onPlanClick(snapLocked(raw, origin), {
        raw,
        shift: e.shiftKey,
      });
    }
  }

  /** Пересечение луча с плоскостью пола — сырая точка, без снаппинга. */
  function rawPlane(ndc: THREE.Vector2): Vec2 | null {
    const ray = makeRay(ndc);
    if (!ray) return null;
    const out = new THREE.Vector3();
    if (!ray.ray.intersectPlane(groundPlane, out)) return null;
    return { x: out.x / K, y: -out.z / K };
  }

  /** Сырая точка → Shift-лок (если origin) → снаппинг 1 см. */
  function snapLocked(raw: Vec2, shiftOrigin: Vec2 | null): Vec2 {
    const locked = shiftOrigin ? lockToAxis(raw, shiftOrigin) : raw;
    try {
      return snapPlanPoint(locked, snapStepMm);
    } catch {
      return snapPlanPoint(locked, BASE_GRID_MM);
    }
  }

  /** Пересечение луча с плоскостью пола → точка плана со снаппингом. */
  function planePoint(
    ndc: THREE.Vector2,
    shiftOrigin: Vec2 | null
  ): Vec2 | null {
    const raw = rawPlane(ndc);
    if (!raw) return null;
    return snapLocked(raw, shiftOrigin);
  }

  /**
   * Луч из NDC со свежими матрицами. Нужно, т.к. three.js обновляет
   * matrixWorld только на рендере: после программного ребилда сцены
   * и до следующего кадра (медленный SwiftShader!) рейкаст иначе идёт
   * по устаревшим матрицам и стабильно мажет мимо свежих гизмо.
   */
  function makeRay(ndc: THREE.Vector2): THREE.Raycaster | null {
    if (!activeCamera) return null;
    activeCamera.updateMatrixWorld();
    threeScene?.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, activeCamera);
    // Нужна спрайтам (значки ограничений) для рейкаста.
    ray.camera = activeCamera;
    return ray;
  }

  function handleAt(ndc: THREE.Vector2): string | null {
    if (sketchHandles.length === 0) return null;
    const ray = makeRay(ndc);
    if (!ray) return null;
    const hits = ray.intersectObjects(sketchHandles, false);
    return (
      (hits[0]?.object.userData.sketchPointId as string | undefined) ?? null
    );
  }

  function segmentAt(ndc: THREE.Vector2): string | null {
    if (segmentLines.length === 0) return null;
    const ray = makeRay(ndc);
    if (!ray) return null;
    // Клик по самой грани: порог попадания вокруг линии.
    ray.params.Line.threshold = SEG_PICK_THRESHOLD_M;
    const hits = ray.intersectObjects(segmentLines, false);
    return (hits[0]?.object.userData.segmentId as string | undefined) ?? null;
  }

  function badgeAt(ndc: THREE.Vector2): string | null {
    if (badgeSprites.length === 0) return null;
    const ray = makeRay(ndc);
    if (!ray) return null;
    const hits = ray.intersectObjects(badgeSprites, false);
    return (hits[0]?.object.userData.badgeFor as string | undefined) ?? null;
  }

  /**
   * Клик по началу НЕзамкнутого штриха (≥2 сегментов) — намерение
   * его замкнуть. По замкнутому — обычный выбор.
   */
  function isClosableFirstPoint(pid: string): boolean {
    if (!sketch) return false;
    const st = closingStrokeAtPoint(sketch, pid);
    return st !== null && !isStrokeClosed(sketch, st);
  }

  /** Пиксели события относительно контейнера (для рамки выбора). */
  function containerPx(
    e: MouseEvent | PointerEvent
  ): { x: number; y: number } | null {
    if (!container) return null;
    const r = container.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onPointerDown(e: PointerEvent) {
    downPx = { x: e.clientX, y: e.clientY };
    // Свежая дистанция для каждого нажатия: travel от прошлого pan
    // правой кнопкой не должен гасить следующий левый клик.
    lastPointerTravel = 0;
    dragStartRaw = null;
    boxStart = null;
    boxing = false;
    boxRect = null;
    if (!canvas) return;
    const ndc = ndcFromEvent(e);
    if (!ndc) return;
    const pid = handleAt(ndc);
    if (pid) {
      dragPointId = pid;
      dragging = false;
      dragStartRaw = rawPlane(ndc);
      canvas.setPointerCapture?.(e.pointerId);
      return;
    }
    // Drag грани целиком (в любом режиме): дальше порога — перенос.
    if (e.button === 0 && sketch) {
      const sid = segmentAt(ndc);
      const seg = sid ? sketch.segments.find((s) => s.id === sid) : undefined;
      const a = seg ? sketch.points[seg.a] : undefined;
      const b = seg ? sketch.points[seg.b] : undefined;
      const start = rawPlane(ndc);
      if (seg && a && b && start) {
        dragSegId = sid;
        dragging = false;
        dragSegOrig = {
          a: { x: a.x, y: a.y },
          b: { x: b.x, y: b.y },
        };
        try {
          dragStartRaw = snapPlanPoint(start, snapStepMm);
        } catch {
          dragStartRaw = snapPlanPoint(start, BASE_GRID_MM);
        }
        canvas.setPointerCapture?.(e.pointerId);
        return;
      }
    }
    // Drag объекта текущего этапа (вне режима размещения): дальше
    // порога — тянем, без движения — клик-выбор. Скетч важнее.
    // Захват бьёт постановку: в place-режиме pointerdown по объекту
    // начинает drag, клик по пустому — ставит (см. pick).
    if (e.button === 0 && !sketch && draggableIds.length > 0) {
      const ndc = ndcFromEvent(e);
      const id = ndc ? modelObjectAt(ndc) : null;
      if (id) {
        objDragId = id;
        dragging = false;
        // Камеру гасим сразу: иначе первые пиксели жеста крутят вид.
        if (controls) controls.enabled = false;
        const c = objectCenterOf(id);
        const raw = ndc ? rawPlane(ndc) : null;
        objDragGrab =
          c && raw ? { x: raw.x - c.x, y: raw.y - c.y } : { x: 0, y: 0 };
        objDragHit = null;
        canvas.setPointerCapture?.(e.pointerId);
        return;
      }
    }
    // Рамка выбора: левая по пустому в режиме select (в draw — панорама).
    if (e.button === 0 && boxSelect && !segmentAt(ndc)) {
      const rel = containerPx(e);
      if (rel) {
        boxStart = rel;
        canvas.setPointerCapture?.(e.pointerId);
        if (controls) controls.enabled = false;
      }
    }
  }

  /** Экранные координаты мировой точки (для рамки выбора). */
  function toScreen(
    wx: number,
    wy: number,
    wz: number
  ): { x: number; y: number } | null {
    if (!activeCamera || !canvas) return null;
    activeCamera.updateMatrixWorld();
    const v = new THREE.Vector3(wx, wy, wz).project(activeCamera);
    const r = canvas.getBoundingClientRect();
    return {
      x: r.left + ((v.x + 1) / 2) * r.width,
      y: r.top + ((1 - v.y) / 2) * r.height,
    };
  }

  /** Id точек и граней скетча внутри рамки (сегмент — по середине). */
  function idsInBox(rect: {
    x: number;
    y: number;
    w: number;
    h: number;
  }): string[] {
    if (!sketch || !container) return [];
    const cr = container.getBoundingClientRect();
    const x0 = Math.min(rect.x, rect.x + rect.w);
    const x1 = Math.max(rect.x, rect.x + rect.w);
    const y0 = Math.min(rect.y, rect.y + rect.h);
    const y1 = Math.max(rect.y, rect.y + rect.h);
    // toScreen отдаёт координаты вьюпорта — переводим в контейнер.
    const inside = (p: { x: number; y: number }) => {
      const lx = p.x - cr.left;
      const ly = p.y - cr.top;
      return lx >= x0 && lx <= x1 && ly >= y0 && ly <= y1;
    };
    const out: string[] = [];
    for (const p of Object.values(sketch.points)) {
      const s = toScreen(p.x * K, 0.02, -p.y * K);
      if (s && inside(s)) out.push(p.id);
    }
    for (const seg of sketch.segments) {
      const a = sketch.points[seg.a];
      const b = sketch.points[seg.b];
      if (!a || !b) continue;
      const s = toScreen(((a.x + b.x) / 2) * K, 0.02, (-(a.y + b.y) / 2) * K);
      if (s && inside(s)) out.push(seg.id);
    }
    return out;
  }

  function onPointerMove(e: PointerEvent) {
    if (!canvas) return;
    // Перетаскивание объекта: гост едет за курсором с вычетом захвата.
    if (objDragId) {
      if (!downPx) return;
      const dist = Math.hypot(e.clientX - downPx.x, e.clientY - downPx.y);
      if (!dragging && dist < DRAG_PX_THRESHOLD) return;
      if (!dragging) {
        dragging = true;
        suppressClick = true;
        if (controls) controls.enabled = false;
        canvas.style.cursor = 'grabbing';
        if (rubberGroup) rubberGroup.visible = false;
      }
      const ndc = ndcFromEvent(e);
      if (!ndc) return;
      const hit = adjustedDragHit(ndc);
      if (!hit) return;
      objDragHit = hit;
      updateDragGhost(hit.plan);
      return;
    }
    // Режим размещения: гост-превью под курсором (без зажатой кнопки).
    // Гост — только над комнатой или стеной, иначе он врёт.
    if (placeTool) {
      if (e.buttons !== 0) {
        hideGhost();
        return;
      }
      const ndc = ndcFromEvent(e);
      if (!ndc) return;
      const hit = modelHit(ndc);
      if (!hit || (!hit.wallId && !floorHitAt(ndc))) {
        hideGhost();
        if (canvas) canvas.style.cursor = '';
        return;
      }
      updateToolGhost(hit);
      canvas.style.cursor = 'crosshair';
      return;
    }
    // Наведение на таскаемый объект: grab-курсор + preselect.
    if (e.buttons === 0 && draggableIds.length > 0 && !sketch) {
      const ndc = ndcFromEvent(e);
      const id = ndc ? modelObjectAt(ndc) : null;
      canvas.style.cursor = id ? 'grab' : '';
      if (hoveredId !== id) {
        hoveredId = id;
        applyHighlight(selectedIds, hoveredId);
      }
      return;
    }
    // Перенос грани целиком: дальше порога — тянем оба конца.
    if (dragSegId && dragSegOrig && dragStartRaw && downPx) {
      const dist = Math.hypot(e.clientX - downPx.x, e.clientY - downPx.y);
      if (!dragging && dist < DRAG_PX_THRESHOLD) return;
      if (!dragging) {
        dragging = true;
        suppressClick = true;
        if (controls) controls.enabled = false;
        canvas.style.cursor = 'move';
        if (rubberGroup) rubberGroup.visible = false;
      }
      const ndc = ndcFromEvent(e);
      if (!ndc) return;
      const raw = rawPlane(ndc);
      if (!raw) return;
      let cur: Vec2;
      try {
        cur = snapPlanPoint(raw, snapStepMm);
      } catch {
        cur = snapPlanPoint(raw, BASE_GRID_MM);
      }
      const dx = cur.x - dragStartRaw.x;
      const dy = cur.y - dragStartRaw.y;
      onSketchSegmentMove?.(
        dragSegId,
        { x: dragSegOrig.a.x + dx, y: dragSegOrig.a.y + dy },
        { x: dragSegOrig.b.x + dx, y: dragSegOrig.b.y + dy }
      );
      return;
    }
    // Жест рамки: радвинули дальше порога — рисуем прямоугольник.
    if (boxStart && !dragPointId) {
      const rel = containerPx(e);
      if (!rel) return;
      const travel = Math.hypot(rel.x - boxStart.x, rel.y - boxStart.y);
      if (travel > DRAG_PX_THRESHOLD || boxing) {
        boxing = true;
        suppressClick = true;
        boxRect = {
          x: Math.min(boxStart.x, rel.x),
          y: Math.min(boxStart.y, rel.y),
          w: Math.abs(rel.x - boxStart.x),
          h: Math.abs(rel.y - boxStart.y),
        };
        canvas.style.cursor = 'crosshair';
      }
      return;
    }
    if (!dragPointId || !downPx) {
      // Hover: preselect, курсор и резинка (только без зажатой кнопки).
      if (
        e.buttons !== 0 ||
        (sketchHandles.length === 0 && segmentLines.length === 0 && !rubberFrom)
      )
        return;
      const ndc = ndcFromEvent(e);
      if (!ndc) return;
      // Хендлы скетча — первичны (гизмо поверх модели, даже под стенами).
      const hid = handleAt(ndc);
      const gid = hid ? null : segmentAt(ndc);
      hoveredId = hid ?? gid;
      // Наведение на начало активного штриха — превью замыкания.
      const closePreview =
        !!rubberFrom &&
        !!hid &&
        !!sketch &&
        activeStroke !== null &&
        closingStrokeAtPoint(sketch, hid) === activeStroke &&
        !isStrokeClosed(sketch, activeStroke);
      canvas.style.cursor = hid
        ? closePreview
          ? 'pointer'
          : 'grab'
        : gid
          ? 'move'
          : rubberFrom
            ? 'crosshair'
            : '';
      rubberShift = e.shiftKey;
      const raw = rawPlane(ndc);
      if (rubberFrom && raw) {
        const target = e.shiftKey ? lockToAxis(raw, rubberFrom) : raw;
        rubberTip = snapLocked(target, null);
        // Зеркало правила авто-фиксации из редактора: точная ось
        // снапнутого конца или чистый сырой угол (с выпрямлением).
        // Для замыкания — тот же замер от конца штриха: зелень врёт,
        // только если курсор уйдёт между наведением и кликом.
        const exactTip =
          rubberTip.x === rubberFrom.x
            ? 'vertical'
            : rubberTip.y === rubberFrom.y
              ? 'horizontal'
              : null;
        const cleanRaw = axisAngleClean(target, rubberFrom);
        const cleanAxis =
          cleanRaw === 'h'
            ? 'horizontal'
            : cleanRaw === 'v'
              ? 'vertical'
              : null;
        const closeAngleOk =
          closePreview && axisAngleClean(target, rubberFrom) !== null;
        rubberLocked =
          closeAngleOk ||
          e.shiftKey ||
          (rubberLockHint && (exactTip !== null || cleanAxis !== null));
      } else {
        rubberTip = null;
        rubberLocked = false;
      }
      applyHighlight(selectedIds, hoveredId);
      updateRubber();
      return;
    }
    const dist = Math.hypot(e.clientX - downPx.x, e.clientY - downPx.y);
    if (!dragging && dist < DRAG_PX_THRESHOLD) return;
    if (!dragging) {
      dragging = true;
      suppressClick = true;
      // Камера не пересоздаётся — просто игнорирует ввод на время drag.
      if (controls) controls.enabled = false;
      canvas.style.cursor = 'grabbing';
      if (rubberGroup) rubberGroup.visible = false;
    }
    const ndc = ndcFromEvent(e);
    if (!ndc) return;
    const plan = planePoint(ndc, e.shiftKey ? dragStartRaw : null);
    if (plan) onSketchPointMove?.(dragPointId, plan);
  }

  function finishDrag(e: PointerEvent, commit: boolean) {
    if (downPx) {
      lastPointerTravel = Math.hypot(
        e.clientX - downPx.x,
        e.clientY - downPx.y
      );
    }
    if (dragPointId && dragging) {
      const ndc = ndcFromEvent(e);
      const plan = ndc
        ? planePoint(ndc, e.shiftKey ? dragStartRaw : null)
        : null;
      if (plan && commit) onSketchPointCommit?.(dragPointId, plan);
      if (controls) controls.enabled = true;
    }
    if (dragSegId && dragging) {
      const ndc = ndcFromEvent(e);
      const raw = ndc ? rawPlane(ndc) : null;
      if (raw && commit && dragSegOrig && dragStartRaw) {
        let cur: Vec2;
        try {
          cur = snapPlanPoint(raw, snapStepMm);
        } catch {
          cur = snapPlanPoint(raw, BASE_GRID_MM);
        }
        const dx = cur.x - dragStartRaw.x;
        const dy = cur.y - dragStartRaw.y;
        onSketchSegmentCommit?.(
          dragSegId,
          { x: dragSegOrig.a.x + dx, y: dragSegOrig.a.y + dy },
          { x: dragSegOrig.b.x + dx, y: dragSegOrig.b.y + dy }
        );
      }
      if (controls) controls.enabled = true;
    }
    dragPointId = null;
    dragging = false;
    downPx = null;
    dragStartRaw = null;
    dragSegId = null;
    dragSegOrig = null;
    boxStart = null;
    boxing = false;
    boxRect = null;
    if (canvas) canvas.style.cursor = '';
  }

  function onPointerUp(e: PointerEvent) {
    // Финал перетаскивания объекта: гост уже погашен, сцена
    // перестроится сама, если операция staged (иначе ничего не сдвинулось).
    if (objDragId) {
      const id = objDragId;
      const wasDragging = dragging;
      const hit = objDragHit;
      if (downPx) {
        lastPointerTravel = Math.hypot(
          e.clientX - downPx.x,
          e.clientY - downPx.y
        );
      }
      cancelObjDrag();
      // Click после жеста гасим всегда: иначе он бы ставил новый объект.
      suppressClick = true;
      if (wasDragging && hit) {
        onObjectMove?.(id, hit);
      } else {
        // Клик без движения — выбор объекта.
        onSelect?.(id);
      }
      downPx = null;
      return;
    } // Финал рамки: отдать набор и съесть клик, чтобы не чистил выбор.
    if (boxing) {
      if (boxRect) onBoxSelect?.(idsInBox(boxRect));
      suppressClick = true;
      lastPointerTravel = 0;
      boxStart = null;
      boxing = false;
      boxRect = null;
      downPx = null;
      if (controls) controls.enabled = true;
      if (canvas) canvas.style.cursor = '';
      return;
    }
    finishDrag(e, true);
  }

  function onPointerCancel(e: PointerEvent) {
    if (objDragId) cancelObjDrag();
    finishDrag(e, false);
  }

  function onPointerLeave() {
    hoveredId = null;
    hideRubber();
    hideGhost();
    if (objDragId) cancelObjDrag();
    applyHighlight(selectedIds, null);
    if (canvas) canvas.style.cursor = '';
  }

  function resize() {
    if (!renderer || !container) return;
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    const sizeKey = `${w}x${h}`;
    // Без этого ResizeObserver зацикливается: setSize меняет canvas,
    // что снова дёргает observer при auto-высоте родителя.
    if (sizeKey === lastSizeKey) return;
    lastSizeKey = sizeKey;
    renderer.setSize(w, h, false);
    if (perspCamera) {
      perspCamera.aspect = w / h;
      perspCamera.updateProjectionMatrix();
    }
    if (orthoCamera && activeCamera === orthoCamera) {
      // Пересчитываем орто-фрустум под новый aspect.
      const aspect = w / h;
      const frustum =
        cameraMode === 'top'
          ? topFrustumForBounds(scene.bounds, aspect)
          : isoFrustumForBounds(scene.bounds, aspect);
      orthoCamera.left = frustum.left * K;
      orthoCamera.right = frustum.right * K;
      orthoCamera.top = frustum.top * K;
      orthoCamera.bottom = frustum.bottom * K;
      orthoCamera.updateProjectionMatrix();
    }
  }
</script>

<div
  bind:this={container}
  class="plan-viewer relative h-full w-full overflow-hidden"
  style="width: 100%; height: 100%; position: relative; overflow: hidden;"
  data-testid="plan-viewer"
  data-entity-count={entityCount}
  data-selected={selectedIds.join(',')}
  data-webgl={webgl}
  data-camera={cameraMode}
  data-framed={framedMode}
  data-iso-corner={isoPreset}
  data-faded={fadedIds.join(',')}
  data-sketch-points={sketchPointCount}
  data-sketch-segments={sketchSegmentCount}
  data-gizmo={gizmoKey}
  data-badges={sketchBadgeCount}
  data-sprites={badgeCount}
  data-pts={sketch
    ? Object.values(sketch.points)
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .map((p) => `${p.id}=${p.x},${p.y}`)
        .join(' ')
    : ''}
  data-dims={sketchDims}
  data-rubber={rubberTip ? `${rubberTip.x},${rubberTip.y}` : ''}
  data-hover={hoveredId ?? ''}
  data-place={placeTool ? placeTool.layer : ''}
  data-ghost={ghostKey}
  data-ghost-wall={ghostWall}
  data-sketch-closed={sketchClosed ? 'true' : 'false'}
>
  <canvas
    bind:this={canvas}
    data-testid="plan-canvas"
    class="block h-full w-full"
    style="display: block; width: 100%; height: 100%;"
  ></canvas>
  {#if boxRect}
    <div
      data-testid="box-rect"
      class="pointer-events-none absolute z-20 border-2 border-primary bg-primary/10"
      style="left: {boxRect.x}px; top: {boxRect.y}px; width: {boxRect.w}px; height: {boxRect.h}px;"
    ></div>
  {/if}
  {#if webgl === 'missing'}
    <p class="absolute inset-0 grid place-items-center bg-stone-100 text-sm">
      WebGL недоступен — 3D-просмотр невозможен
    </p>
  {/if}
</div>

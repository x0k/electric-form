<script lang="ts">
  import { onMount } from 'svelte';
  import PlanViewer, { type PlanClickInfo } from './PlanViewer.svelte';
  import FeatureTreePanel, { type DraftStage } from './FeatureTreePanel.svelte';
  import type { Feature } from './history';
  import { stageLabel } from './history';
  import { ensureGcsLoaded, isGcsLoaded } from './gcs';
  import { modelToScene } from './render';
  import { createEmptyApartment } from './model';
  import { sketchToLayoutOps } from './layout';
  import { PenLine, Ruler, Magnet } from '@lucide/svelte';
  import {
    createSketch,
    isSketchClosed,
    closingStrokeAtPoint,
    sketchAddConstraint,
    sketchAddPoint,
    sketchAddSegment,
    sketchClose,
    sketchDeletePoint,
    sketchDeleteSegment,
    sketchFromOutline,
    sketchMovePoint,
    sketchMoveSegment,
    sketchRemoveConstraint,
    sketchAutoAxis,
    strokeSegments,
    type Sketch,
  } from './sketch';
  import { SNAP_STEPS_MM } from './geometry';
  import { lockToAxis } from './viewport';
  import type { Vec2 } from './geometry';
  import type { Operation } from './operations';

  /**
   * Полноценный редактор контура (вид сверху): polyline-черновик,
   * constraints, commit. Ничего не знает об истории — отдаёт готовый
   * набор операций наверх через onCommit.
   */

  interface Props {
    initialOutline: Vec2[] | null;
    initialRoomName: string;
    committed: boolean;
    features: Feature[];
    previewIndex: number | null;
    onTogglePreview: (index: number) => void;
    onEditFeature: (index: number) => void;
    onCommit: (payload: { ops: Operation[]; roomName: string }) => void;
  }

  let {
    initialOutline,
    initialRoomName,
    committed,
    features,
    previewIndex,
    onTogglePreview,
    onEditFeature,
    onCommit,
  }: Props = $props();

  function loadInitial(): {
    sketch: Sketch;
    points: number;
    segs: number;
    error: string | null;
  } {
    if (!initialOutline) {
      return { sketch: createSketch(), points: 0, segs: 0, error: null };
    }
    const r = sketchFromOutline(initialOutline);
    if (!r.ok) {
      return {
        sketch: createSketch(),
        points: 0,
        segs: 0,
        error: `Не удалось загрузить контур: ${r.error.message}`,
      };
    }
    return {
      sketch: r.value,
      points: Object.keys(r.value.points).length,
      segs: r.value.segments.length,
      error: null,
    };
  }

  const boot = loadInitial();
  const emptyScene = modelToScene(createEmptyApartment());

  /** Режим инструмента: draw — клики строят, select — выбор по умолчанию,
   * когда никакой другой инструмент не взят (отдельной кнопки нет). */
  type ToolMode = 'draw' | 'select';
  let toolMode: ToolMode = $state('draw');
  /** Численный решатель готов (WASM грузится асинхронно при монтировании). */
  let gcsReady = $state(isGcsLoaded());

  onMount(() => {
    ensureGcsLoaded().then(
      () => {
        gcsReady = true;
      },
      () => {
        gcsReady = false;
      }
    );
  });
  /** Залипший инструмент ограничения (как в Sketcher): клики по граням применяют. */
  type ConstraintTool = 'axis' | 'length' | 'coincident' | null;
  let constraintTool: ConstraintTool = $state(null);
  /** Первая точка пары совпадения (инструмент ждёт вторую). */
  let coincidentFirst: string | null = $state(null);
  let sketch: Sketch = $state(boot.sketch);
  let pointSeq = $state(boot.points);
  let segSeq = $state(boot.segs);
  let strokeSeq = $state(0);
  let constraintSeq = $state(0);
  /** Активный штрих и его конец. null — штриха нет, пустой клик начнёт новый. */
  let activeStroke: number | null = $state(null);
  let chainEnd: string | null = $state(null);
  /**
   * Первая точка штриха, созданная с нуля и пока ни с чем не соединённая.
   * Отмена штриха (Esc/правая/выкл инструмента) её удаляет — висячего
   * мусора в скетче не остаётся.
   */
  let pendingFreshPoint: string | null = $state(null);
  let snapStepMm: number = $state(10);
  let showGrid = $state(true);
  /** Авто-фиксация H/V при рисовании (как в Sketcher, отключаемая). */
  let autoConstraints = $state(true);
  /** Набор выбранных (рамка отдаёт сразу много, клик — один). */
  let selectedIds: string[] = $state([]);
  /** Редактор размера на канвасе: грань + позиция + черновое значение. */
  let dimPopup: {
    segmentId: string;
    x: number;
    y: number;
    value: number;
  } | null = $state(null);
  let message: string | null = $state(boot.error);
  // Контракт: страница монтирует редактор через {#key} при каждой смене
  // initial-данных, поэтому захват начальных пропсов здесь корректен.
  let roomName = $state(initialRoomName);

  /** Начало резинки превью: конец активного штриха в режиме контура. */
  const rubberFrom = $derived.by(() => {
    if (toolMode !== 'draw' || !chainEnd) return null;
    const p = sketch.points[chainEnd];
    return p ? { x: p.x, y: p.y } : null;
  });

  function say(text: string | null) {
    message = text;
  }

  /** Этап в работе для дерева: до первого commit — черновик планировки. */
  const draftStage = $derived.by((): DraftStage | null =>
    committed ? null : { index: 0, label: stageLabel('layout') }
  );

  /** Полилиния — тоггл: повторный клик возвращает в выбор по умолчанию. */
  function toggleDrawTool() {
    if (toolMode === 'draw') {
      toolMode = 'select';
      dropFreshPoint();
      activeStroke = null;
      chainEnd = null;
      say(null);
    } else {
      // Взаимоисключение с constraints: липкий инструмент снимается.
      constraintTool = null;
      coincidentFirst = null;
      toolMode = 'draw';
      say(null);
    }
  }

  /**
   * Убрать висячее начало отменённого штриха: точка, созданная с нуля
   * и так ни с чем не соединённая. Соединённые точки не трогаем.
   */
  function dropFreshPoint() {
    const pid = pendingFreshPoint;
    pendingFreshPoint = null;
    if (!pid || !sketch.points[pid]) return;
    const touched = sketch.segments.some((s) => s.a === pid || s.b === pid);
    if (touched) return;
    const r = sketchDeletePoint(sketch, pid);
    if (r.ok) {
      sketch = r.value;
      selectedIds = selectedIds.filter((id) => id !== pid);
    }
  }

  function handlePlanClick(plan: Vec2, info?: PlanClickInfo) {
    if (!gcsReady) {
      say('Решатель загружается…');
      return;
    }
    // Инструмент совпадения работает и тут: вьювер не знает про инструменты
    // и шлёт начала штрихов сюда же.
    if (constraintTool === 'coincident' && info?.pointId) {
      handleCoincidentPick(info.pointId);
      return;
    }
    // Клик по ручке в режиме выбора — просто выбор (даже начала штриха).
    if (toolMode === 'select') {
      selectedIds = info?.pointId ? [info.pointId] : [];
      return;
    }
    // Клик по началу штриха в режиме контура.
    if (info?.pointId) {
      // Конец своего же активного штриха — прерывание, не замыкание.
      if (info.pointId === chainEnd) {
        finishStroke();
        selectedIds = [info.pointId];
        return;
      }
      const st = closingStrokeAtPoint(sketch, info.pointId);
      // Замыкается ТОЛЬКО активный штрих. Чужое начало при простое
      // возобновляет свой штрих с его конца (а не замыкает сюрпризом).
      if (st !== null && !isSketchClosed(sketch, st)) {
        if (st === activeStroke) {
          segSeq += 1;
          const closeId = `s${segSeq}`;
          const r = sketchClose(sketch, closeId, st);
          if (!r.ok) {
            segSeq -= 1;
            say(`Не замкнут: ${r.error.message}`);
            return;
          }
          sketch = r.value;
          activeStroke = null;
          chainEnd = null;
          pendingFreshPoint = null;
          selectedIds = [];
          say(null);
          sketch = maybeAutoConstrain(sketch, closeId, {
            force: info.shift,
            raw: info.raw,
            straighten: false,
            // Замыкающая грань идёт из конца цепочки: подтянуть можно его.
            moveA: true,
          });
          return;
        }
        if (chainEnd === null) {
          const ends = strokeSegments(sketch, st);
          const lastId = ends.length > 0 ? ends[ends.length - 1].b : null;
          if (lastId && sketch.points[lastId]) {
            activeStroke = st;
            chainEnd = lastId;
            selectedIds = [info.pointId];
            say(`Продолжение штриха ${st + 1} с его конца.`);
            return;
          }
        }
      }
      if (st !== null && isSketchClosed(sketch, st)) {
        selectedIds = [info.pointId];
        return;
      }
      // Иначе — соединить конец активного штриха с точкой
      // (или вооружиться ею для нового штриха).
      if (chainEnd === null) {
        strokeSeq += 1;
        activeStroke = strokeSeq;
        chainEnd = info.pointId;
        selectedIds = [info.pointId];
        say('Начало нового штриха в выбранной точке.');
        return;
      }
      segSeq += 1;
      const sid = `s${segSeq}`;
      const r = sketchAddSegment(
        sketch,
        sid,
        chainEnd,
        info.pointId,
        activeStroke ?? 0
      );
      if (!r.ok) {
        segSeq -= 1;
        say(`Не соединено: ${r.error.message}`);
        return;
      }
      sketch = r.value;
      chainEnd = info.pointId;
      selectedIds = [info.pointId];
      say(null);
      sketch = maybeAutoConstrain(sketch, sid, {
        force: info.shift,
        raw: info.raw,
        straighten: false,
      });
      return;
    }
    // Пустое место: продолжение штриха или новый с свободного места.
    // С активным инструментом ограничений точки не ставим.
    if (constraintTool) {
      say(`Инструмент ${constraintToolLabel(constraintTool)}: кликайте грани.`);
      return;
    }
    pointSeq += 1;
    const pid = `p${pointSeq}`;
    if (chainEnd === null) {
      // Прошлый штрих могли парковать со висячим началом — чистим.
      dropFreshPoint();
      strokeSeq += 1;
      const st = strokeSeq;
      const r = sketchAddPoint(sketch, pid, plan);
      if (!r.ok) {
        pointSeq -= 1;
        strokeSeq -= 1;
        say(`Точка не добавлена: ${r.error.message}`);
        return;
      }
      sketch = r.value;
      activeStroke = st;
      chainEnd = pid;
      pendingFreshPoint = pid;
      selectedIds = [pid];
      say(null);
      return;
    }
    segSeq += 1;
    const sid = `s${segSeq}`;
    const st = activeStroke ?? 0;
    const rp = sketchAddPoint(sketch, pid, plan);
    if (!rp.ok) {
      pointSeq -= 1;
      segSeq -= 1;
      say(`Точка не добавлена: ${rp.error.message}`);
      return;
    }
    const rs = sketchAddSegment(rp.value, sid, chainEnd, pid, st);
    if (!rs.ok) {
      // Точка осталась висячей — честно говорим, чинится удалением.
      sketch = rp.value;
      segSeq -= 1;
      say(`Не соединено: ${rs.error.message}`);
      return;
    }
    // Замер угла — от прежнего конца (до переприсвоения chainEnd).
    const fromPt = sketch.points[chainEnd];
    const clickRaw = info?.raw ?? plan;
    const effRaw =
      info?.shift && fromPt ? lockToAxis(clickRaw, fromPt) : clickRaw;
    sketch = rs.value;
    chainEnd = pid;
    selectedIds = [pid];
    say(null);
    sketch = maybeAutoConstrain(sketch, sid, {
      force: info?.shift ?? false,
      raw: effRaw,
      straighten: true,
    });
  }

  /**
   * Авто-constraints как в Sketcher: Shift — всегда; иначе — если сырой
   * отрезок шёл чисто вдоль оси. Свежую точку при этом выпрямляем на ось
   * (общие узлы не двигаем). Тихо: не сошлось — оставляем как есть.
   */
  function maybeAutoConstrain(
    s: Sketch,
    segId: string,
    opts: { force: boolean; raw: Vec2; straighten: boolean; moveA?: boolean }
  ): Sketch {
    const fixed = sketchAutoAxis(s, segId, opts.raw, {
      force: opts.force,
      enabled: autoConstraints,
      moveB: opts.straighten,
      moveA: opts.moveA,
    });
    if (!fixed) return s;
    constraintSeq += 1;
    const r = sketchAddConstraint(fixed.sketch, {
      id: `c${constraintSeq}`,
      type: fixed.type,
      segment: segId,
    });
    if (!r.ok) {
      constraintSeq -= 1;
      return s;
    }
    return r.value;
  }

  function handleMove(pointId: string, plan: Vec2) {
    if (!gcsReady) return;
    const r = sketchMovePoint(sketch, pointId, plan);
    if (!r.ok) {
      say(`Перемещение отклонено: ${r.error.message}`);
      return;
    }
    sketch = r.value.sketch;
    say(
      r.value.conflicts.length > 0
        ? r.value.conflicts.map((c) => c.message).join('; ')
        : null
    );
  }

  /** Перенос грани целиком: жёсткий сдвиг обоих концов + solver. */
  function handleSegmentMove(segmentId: string, a: Vec2, _b: Vec2) {
    const seg = sketch.segments.find((s) => s.id === segmentId);
    const pa = seg ? sketch.points[seg.a] : undefined;
    const pb = seg ? sketch.points[seg.b] : undefined;
    if (!seg || !pa || !pb) return;
    const r = sketchMoveSegment(sketch, segmentId, {
      x: a.x - pa.x,
      y: a.y - pa.y,
    });
    if (!r.ok) {
      say(`Перемещение отклонено: ${r.error.message}`);
      return;
    }
    sketch = r.value.sketch;
    say(
      r.value.conflicts.length > 0
        ? r.value.conflicts.map((c) => c.message).join('; ')
        : null
    );
  }

  /** Починить конец штриха после удалений (конец могли снести). */
  function repairChain() {
    if (!chainEnd || !sketch.points[chainEnd]) {
      chainEnd = null;
      activeStroke = null;
      pendingFreshPoint = null;
    }
  }

  function handleAddConstraint(input: {
    segment: string;
    type: 'horizontal' | 'vertical' | 'length';
    lengthMm: number;
  }) {
    if (!gcsReady) {
      say('Решатель загружается…');
      return;
    }
    if (!input.segment) {
      say('Выберите сегмент для constraint.');
      return;
    }
    constraintSeq += 1;
    const cid = `c${constraintSeq}`;
    const r =
      input.type === 'length'
        ? sketchAddConstraint(sketch, {
            id: cid,
            type: 'length',
            segment: input.segment,
            lengthMm: input.lengthMm,
          })
        : sketchAddConstraint(sketch, {
            id: cid,
            type: input.type,
            segment: input.segment,
          });
    if (!r.ok) {
      constraintSeq -= 1;
      say(`Constraint отклонён: ${r.error.message}`);
      return;
    }
    sketch = r.value;
    say(`Constraint ${cid} применён.`);
  }

  function constraintToolLabel(tool: Exclude<ConstraintTool, null>): string {
    return tool === 'axis' ? 'ось' : tool === 'length' ? 'длина' : 'совпадение';
  }

  /** Взять/снять инструмент ограничения (взаимоисключение с полилинией). */
  function toggleConstraintTool(tool: Exclude<ConstraintTool, null>) {
    constraintTool = constraintTool === tool ? null : tool;
    coincidentFirst = null;
    if (constraintTool) {
      // Полилиния паркуется: висячее начало без граней — в корзину,
      // остальная геометрия цела, продолжить можно позже.
      dropFreshPoint();
      toolMode = 'select';
      activeStroke = null;
      chainEnd = null;
      say(
        `Инструмент ${constraintToolLabel(tool)}: ` +
          (tool === 'coincident' ? 'кликайте две точки.' : 'кликайте грани.')
      );
    } else {
      say(null);
    }
  }

  /** Клик точкой при инструменте совпадения: первая — вооружить, вторая — склеить. */
  function handleCoincidentPick(pointId: string) {
    if (!coincidentFirst) {
      coincidentFirst = pointId;
      selectedIds = [pointId];
      say('Совпадение: кликните вторую точку.');
      return;
    }
    if (pointId === coincidentFirst) {
      coincidentFirst = null;
      selectedIds = [];
      say(null);
      return;
    }
    constraintSeq += 1;
    const cid = `c${constraintSeq}`;
    const r = sketchAddConstraint(sketch, {
      id: cid,
      type: 'coincident',
      points: [coincidentFirst, pointId],
    });
    if (!r.ok) {
      constraintSeq -= 1;
      say(`Constraint отклонён: ${r.error.message}`);
      return;
    }
    sketch = r.value;
    selectedIds = [coincidentFirst, pointId];
    coincidentFirst = null;
    say(`Constraint ${cid} применён: точки склеены.`);
  }

  /** Клик гранью при активном инструменте. Ось вычисляется из геометрии,
   * длина открывает редактор значения прямо на канвасе. */
  function applyToolToSegment(segmentId: string) {
    if (!constraintTool || constraintTool === 'coincident') return;
    if (constraintTool === 'length') {
      openDimPopup(segmentId, null);
      return;
    }
    const seg = sketch.segments.find((s) => s.id === segmentId);
    const a = seg ? sketch.points[seg.a] : undefined;
    const b = seg ? sketch.points[seg.b] : undefined;
    if (!seg || !a || !b) return;
    handleAddConstraint({
      segment: segmentId,
      type:
        Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'horizontal' : 'vertical',
      lengthMm: 0,
    });
  }

  function segmentLengthMm(segmentId: string): number | null {
    const seg = sketch.segments.find((s) => s.id === segmentId);
    const a = seg ? sketch.points[seg.a] : undefined;
    const b = seg ? sketch.points[seg.b] : undefined;
    if (!seg || !a || !b) return null;
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  /** Длина грани, уже зафиксированная (для редактора значения). */
  function lengthConstraintOf(segmentId: string): number | null {
    const c = sketch.constraints.find(
      (x) => x.type === 'length' && x.segment === segmentId
    );
    return c && c.type === 'length' ? c.lengthMm : null;
  }

  /** Редактор размера на канвасе (как в Sketcher): позиция клика + значение. */
  function openDimPopup(
    segmentId: string,
    at: { x: number; y: number } | null
  ) {
    const existing = lengthConstraintOf(segmentId);
    const current = segmentLengthMm(segmentId);
    dimPopup = {
      segmentId,
      x: at?.x ?? 0,
      y: at?.y ?? 0,
      // Текущее (округлённое) или уже зафиксированное значение.
      value:
        existing ?? (current !== null ? Math.round(current / 10) * 10 : 1000),
    };
    selectedIds = [segmentId];
  }

  /** Применить значение из редактора: заменить длину, пересчитать. */
  function applyDimPopup() {
    if (!dimPopup) return;
    const { segmentId, value } = dimPopup;
    const existing = sketch.constraints.find(
      (x) => x.type === 'length' && x.segment === segmentId
    );
    if (existing) {
      const r = sketchRemoveConstraint(sketch, existing.id);
      if (r.ok) sketch = r.value;
    }
    dimPopup = null;
    handleAddConstraint({
      segment: segmentId,
      type: 'length',
      lengthMm: value,
    });
  }

  function closeDimPopup() {
    dimPopup = null;
  }

  function handleSelect(id: string | null) {
    // Инструмент совпадения: нужны две точки, режимы не важны.
    if (constraintTool === 'coincident') {
      if (id && sketch.points[id]) {
        handleCoincidentPick(id);
        return;
      }
      if (id) say('Совпадение: кликните точку (нужны две).');
      return;
    }
    // Инструмент ограничения первичнее режимов: грань — применить.
    if (constraintTool && id && sketch.segments.some((s) => s.id === id)) {
      applyToolToSegment(id);
      selectedIds = [id];
      return;
    }
    // Одиночные клики (не начала штрихов — те идут через замыкание).
    if (id === null || toolMode === 'select') {
      selectedIds = id ? [id] : [];
      return;
    }
    // Режим контура: клик по грани — выбор.
    if (!sketch.points[id]) {
      selectedIds = [id];
      return;
    }
    if (chainEnd === null) {
      // Свежий инструмент: вооружиться точкой, новый штрих начнётся с неё.
      strokeSeq += 1;
      activeStroke = strokeSeq;
      chainEnd = id;
      selectedIds = [id];
      say('Начало нового штриха в выбранной точке.');
      return;
    }
    if (id === chainEnd) {
      // Клик по концу активного штриха прерывает его.
      finishStroke();
      selectedIds = [id];
      return;
    }
    // Клик по любой другой точке соединяет её с концом активного штриха
    // (включая точки других штрихов — общая вершина).
    segSeq += 1;
    const sid = `s${segSeq}`;
    const st = activeStroke ?? 0;
    const r = sketchAddSegment(sketch, sid, chainEnd, id, st);
    if (!r.ok) {
      segSeq -= 1;
      say(`Не соединено: ${r.error.message}`);
      return;
    }
    sketch = r.value;
    chainEnd = id;
    selectedIds = [id];
    say(null);
    // Соединяем существующие узлы: геометрию не двигаем, только фиксация.
    sketch = maybeAutoConstrain(sketch, sid, {
      force: false,
      raw: sketch.points[id],
      straighten: false,
    });
  }

  /** Прервать активный штрих (клик по его концу). Инструмент остаётся. */
  function finishStroke() {
    activeStroke = null;
    chainEnd = null;
    // Явный конец штриха — точка остаётся осознанно, не мусор.
    pendingFreshPoint = null;
    say('Штрих завершён — клик с свободного места начнёт новый.');
  }

  function handleDeleteSelection() {
    if (selectedIds.length === 0) return;
    // Точки первыми (уносят инцидентные грани), затем грани;
    // NOT_FOUND терпим — объект мог уйти каскадом.
    let failures = 0;
    for (const id of selectedIds) {
      if (!sketch.points[id]) continue;
      const r = sketchDeletePoint(sketch, id);
      if (!r.ok && r.error.code !== 'NOT_FOUND') failures += 1;
      else if (r.ok) sketch = r.value;
    }
    for (const id of selectedIds) {
      if (!sketch.segments.some((s) => s.id === id)) continue;
      const r = sketchDeleteSegment(sketch, id);
      if (!r.ok && r.error.code !== 'NOT_FOUND') failures += 1;
      else if (r.ok) sketch = r.value;
    }
    selectedIds = [];
    repairChain();
    say(failures > 0 ? `Не всё удалено: ошибок ${failures}.` : null);
  }

  /** Выход из полилинии (Esc / правая кнопка, как в Sketcher). */
  function finishPolyline() {
    // Инструмент снимается первым — он липкий, но не вечный.
    if (constraintTool) {
      constraintTool = null;
      coincidentFirst = null;
      say(null);
    }
    if (toolMode === 'draw') {
      toolMode = 'select';
      // Висячее начало без граней — в корзину, остальное остаётся;
      // продолжить — клик по концу штриха в контуре.
      dropFreshPoint();
      activeStroke = null;
      chainEnd = null;
      say('Полилиния завершена — режим выбора.');
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
      return;
    }
    if (e.key === 'Escape') {
      if (dimPopup) {
        closeDimPopup();
        say(null);
        return;
      }
      if (constraintTool) {
        constraintTool = null;
        coincidentFirst = null;
        say(null);
        return;
      }
      if (toolMode === 'draw') finishPolyline();
      else selectedIds = [];
      return;
    }
    if (e.key === 'p' || e.key === 'P' || e.key === 'ф' || e.key === 'Ф') {
      toggleDrawTool();
      return;
    }
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    handleDeleteSelection();
  }

  function handleDeleteConstraint(constraintId: string) {
    const r = sketchRemoveConstraint(sketch, constraintId);
    if (!r.ok) {
      say(`Не удалено: ${r.error.message}`);
      return;
    }
    sketch = r.value;
    say(null);
  }

  function handleCommit() {
    const ops = sketchToLayoutOps(sketch, { roomName });
    if (!ops.ok) {
      say(`Commit невозможен: ${ops.error.message}`);
      return;
    }
    onCommit({ ops: ops.value, roomName });
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div
  class="relative h-screen w-full overflow-hidden bg-base-100"
  data-testid="sketch-editor"
  data-gcs={gcsReady ? 'ready' : ''}
>
  <div class="absolute left-3 top-3 z-10 max-w-[calc(100%-22rem)]">
    <div
      class="flex flex-wrap items-center gap-2 rounded-box bg-base-100/95 p-2 shadow-xl backdrop-blur"
      role="toolbar"
      aria-label="Скетч"
    >
      <div class="join" role="group" aria-label="Инструмент">
        <button
          class="btn btn-sm join-item"
          class:btn-primary={toolMode === 'draw'}
          data-testid="tool-draw"
          title="Полилиния (P) — повторный клик возвращает в выбор"
          aria-label="Инструмент polyline"
          aria-pressed={toolMode === 'draw'}
          onclick={toggleDrawTool}
        >
          <PenLine size={16} />
        </button>
      </div>
      {#if constraintTool}
        <span class="badge badge-sm badge-primary" data-testid="active-tool">
          {constraintToolLabel(constraintTool)}
        </span>
      {/if}
      <div
        class="join"
        role="group"
        aria-label="Инструменты ограничений"
        title="Взять инструмент и кликать грани"
      >
        <button
          class="btn btn-sm join-item font-mono"
          class:btn-primary={constraintTool === 'axis'}
          data-testid="apply-axis"
          title="Инструмент: ось — горизонталь или вертикаль по геометрии грани"
          onclick={() => toggleConstraintTool('axis')}
        >
          H/V
        </button>
        <button
          class="btn btn-sm join-item"
          class:btn-primary={constraintTool === 'length'}
          data-testid="apply-length"
          title="Инструмент: размер — клик гранью открывает значение"
          aria-label="Инструмент размера"
          onclick={() => toggleConstraintTool('length')}
        >
          <Ruler size={16} />
        </button>
        <button
          class="btn btn-sm join-item"
          class:btn-primary={constraintTool === 'coincident'}
          data-testid="apply-coincident"
          title="Инструмент: совпадение двух точек"
          aria-label="Инструмент совпадения"
          onclick={() => toggleConstraintTool('coincident')}
        >
          <Magnet size={16} />
        </button>
      </div>
      <span class="text-sm opacity-70" data-testid="selection-count">
        Выбрано: {selectedIds.length}
      </span>
      <label class="ml-2 flex items-center gap-1 text-sm">
        Шаг:
        <select
          class="select select-sm select-bordered"
          bind:value={snapStepMm}
        >
          {#each SNAP_STEPS_MM as step (step)}
            <option value={step}>
              {step >= 10 ? `${step / 10} см` : `${step} мм`}
            </option>
          {/each}
        </select>
      </label>
      <label class="flex cursor-pointer items-center gap-1 text-sm">
        <input
          type="checkbox"
          class="checkbox checkbox-sm"
          bind:checked={showGrid}
        />
        Сетка
      </label>
      <label
        class="flex cursor-pointer items-center gap-1 text-sm"
        title="Авто-фиксация горизонтали/вертикали при рисовании, как в Sketcher"
      >
        <input
          type="checkbox"
          class="checkbox checkbox-sm"
          data-testid="auto-constraints"
          bind:checked={autoConstraints}
        />
        Авто H/V
      </label>
    </div>
  </div>

  {#if message}
    <div class="pointer-events-none absolute bottom-3 left-3 z-10 max-w-md">
      <p class="alert alert-sm py-2 text-sm shadow-xl" role="status">
        {message}
      </p>
    </div>
  {/if}

  {#if dimPopup}
    {@const popup = dimPopup}
    {@const segConstraints = sketch.constraints.filter(
      (c) => c.type !== 'coincident' && c.segment === popup.segmentId
    )}
    <div
      class="absolute z-30 w-56 rounded-box bg-base-100 p-2 text-sm shadow-2xl"
      style="left: {Math.min(
        popup.x + 12,
        typeof window !== 'undefined' ? window.innerWidth - 240 : popup.x
      )}px; top: {popup.y + 12}px;"
      data-testid="dim-popup"
      role="dialog"
      aria-label="Размер грани"
    >
      <p class="mb-1 font-mono text-xs opacity-70">{popup.segmentId}</p>
      <label class="flex items-center gap-2">
        <input
          type="number"
          class="input input-sm input-bordered flex-1"
          data-testid="dim-value"
          title="Длина грани, мм"
          min="100"
          step="10"
          autofocus
          bind:value={popup.value}
          onkeydown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') applyDimPopup();
          }}
        />
        <button
          class="btn btn-sm btn-primary"
          data-testid="dim-apply"
          title="Применить размер"
          onclick={applyDimPopup}
        >
          ✓
        </button>
      </label>
      {#if segConstraints.length > 0}
        <ul class="mt-1 flex flex-col gap-1">
          {#each segConstraints as c (c.id)}
            <li class="flex items-center gap-2 font-mono text-xs">
              <span class="flex-1">
                {c.type}{c.type === 'length'
                  ? ` ${(c as { lengthMm: number }).lengthMm}`
                  : ''}
              </span>
              <button
                class="btn btn-ghost btn-xs"
                title="Снять ограничение"
                aria-label={`Снять ограничение ${c.id}`}
                onclick={() => handleDeleteConstraint(c.id)}
              >
                ×
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

  <div class="absolute inset-0">
    <PlanViewer
      scene={emptyScene}
      {selectedIds}
      cameraMode="top"
      {sketch}
      {showGrid}
      snapStepMm={Number(snapStepMm)}
      gridStepMm={100}
      onSelect={handleSelect}
      onBadgeClick={({ segmentId, x, y }) => openDimPopup(segmentId, { x, y })}
      onBoxSelect={(ids) => (selectedIds = ids)}
      boxSelect={toolMode === 'select'}
      onPlanClick={handlePlanClick}
      onSketchPointMove={handleMove}
      onSketchPointCommit={handleMove}
      onSketchSegmentMove={handleSegmentMove}
      onSketchSegmentCommit={handleSegmentMove}
      onPolylineFinish={finishPolyline}
      {rubberFrom}
      rubberLockHint={autoConstraints}
      {activeStroke}
    />
  </div>

  <div
    class="absolute bottom-3 right-3 top-3 z-10 flex w-80 max-w-[85vw] flex-col gap-3 overflow-y-auto"
  >
    <FeatureTreePanel
      {features}
      {previewIndex}
      {onTogglePreview}
      {onEditFeature}
      {draftStage}
    >
      {#snippet footer()}
        <button
          class="btn btn-sm btn-primary w-full"
          data-testid="commit-layout"
          disabled={sketch.segments.length === 0}
          onclick={handleCommit}
        >
          Продолжить
        </button>
      {/snippet}
    </FeatureTreePanel>
  </div>
</div>

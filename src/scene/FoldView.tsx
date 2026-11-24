import { useEffect, useMemo, useState, type ReactElement } from "react";
import * as THREE from "three";
import Viewport from "./Viewport";

// prettier-ignore
type Model = { P2:[number,number]; P3:[number,number,number]; Face:{id:string;corners:Model['P3'][]}; Member:{faceId:string;index:number}; Group:{canonical:string;aliases:string[];members:Model['Member'][]}; Groups:{groups:Model['Group'][];byMember:Map<string,Model['Group']>;byAlias:Map<string,Model['Group']>}; Part:{kind:'face'|'edge'|'vertex';alias:string;testId:string;foldedId:string;flat:Model['P3'][];folded:Model['P3'][];object:THREE.Mesh}; Corr:{face:Map<string,string>;edge:Map<string,string>;vertex:Map<string,string>;edgePoints:Map<string,[Model['P3'],Model['P3']]>;vertexPoints:Map<string,Model['P3']>}; Folded:Map<string,{foldedId:string;corners:Model['P3'][]}>; Layout:{faces?:unknown;kind?:unknown;sideLengths?:unknown}; FoldResult:{ok?:unknown;reasons?:unknown;faces?:unknown;transforms?:unknown;faceTransforms?:unknown;correspondence?:unknown;correspondences?:unknown;mapping?:unknown;parts?:unknown;inverse?:unknown}; Props:{layout:Model['Layout']|null|undefined;foldResult?:Model['FoldResult']|null;foldProgress?:number|null;selectedPartId?:string|null;onSelectPart?:((partId:string|null)=>void)|null;readOnly?:boolean|null} };
export type FoldViewLayout = Model["Layout"];
export type FoldViewFoldResult = Model["FoldResult"];
export type FoldViewProps = Model["Props"];

// prettier-ignore
const CAMERA = { position: [7, 5, 9] as const, target: [0, 0, 0] as const, fov: 50 };
// prettier-ignore
const UP = new THREE.Vector3(0, 1, 0);
// prettier-ignore
const REASONS: Record<string, string> = { INVALID_INPUT: "전개도 형식이 올바르지 않습니다.", EMPTY_LAYOUT: "배치에 면이 없습니다.", DISCONNECTED_FACE: "연결되지 않은 면이 있습니다.", EDGE_LENGTH_MISMATCH: "맞닿는 변의 길이가 다릅니다.", OVERLAP_2D: "전개도 면이 겹쳤습니다.", FACE_OVERLAP_3D: "접힌 면이 같은 자리에 겹칩니다.", UNMATCHED_EDGE: "모서리가 짝을 이루지 못했습니다.", UNMATCHED_VERTEX: "꼭짓점이 짝을 이루지 못했습니다." };
// prettier-ignore
const EMPTY_GROUPS: Model['Groups'] = { groups: [], byMember: new Map(), byAlias: new Map() }, emptyCorr = (): Model['Corr'] => ({ face: new Map(), edge: new Map(), vertex: new Map(), edgePoints: new Map(), vertexPoints: new Map() }), rec = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null, num = (value: unknown, fallback = 0): number => { const parsed = typeof value === "number" ? value : Number(value); return Number.isFinite(parsed) ? parsed : fallback; }, vec2 = (value: unknown, a = "x", b = "y"): Model['P2'] | null => { const item = rec(value); return Array.isArray(value) ? [num(value[0]), num(value[1])] : item && (a in item || b in item) ? [num(item[a]), num(item[b])] : null; }, vec3 = (value: unknown): Model['P3'] | null => { const item = rec(value); return Array.isArray(value) && value.length >= 3 ? [num(value[0]), num(value[1]), num(value[2])] : item && ("x" in item || "y" in item || "z" in item) ? [num(item.x), num(item.y), num(item.z)] : null; }, first = (value: unknown): string | null => typeof value === "string" ? (value || null) : Array.isArray(value) ? (value.find((item): item is string => typeof item === "string" && item.length > 0) ?? null) : null, pointKey = (point: Model['P3']): string => [point[0], point[1]].join(",");

// prettier-ignore
function facesOf(layout: Model['Layout'] | null | undefined): Model['Face'][] | null {
  const root = rec(layout);
  if (!root || !Array.isArray(root.faces) || (root.kind !== "cube" && root.kind !== "cuboid")) return null;
  const sides = root.sideLengths;
  if (!Array.isArray(sides) || sides.length !== 3 || !sides.every((side) => num(side) > 0)) return null;
  if (root.kind === "cube" && !sides.every((side) => Math.abs(num(side) - num(sides[0])) < 1e-6)) return null;
  const ids = new Set<string>(), faces: Model['Face'][] = [];
  for (const entry of root.faces) {
    const item = rec(entry), id = item?.id, origin = vec2(item?.origin), size = vec2(item?.size, "width", "height") ?? vec2(item?.size, "w", "h");
    if (typeof id !== "string" || !id || ids.has(id) || !origin || !size || size[0] <= 0 || size[1] <= 0) return null;
    const turn = ((Math.round(num(item?.quarterTurns)) % 4) + 4) % 4, w = turn % 2 === 1 ? size[1] : size[0], h = turn % 2 === 1 ? size[0] : size[1], [x, y] = origin;
    faces.push({ id, corners: [[x, y, 0], [x + w, y, 0], [x + w, y + h, 0], [x, y + h, 0]] });
    ids.add(id);
  }
  return faces;
}

// prettier-ignore
function groupsOf(faces: Model['Face'][], kind: "edge" | "vertex"): Model['Groups'] {
  const groups = new Map<string, Model['Group']>(), byMember = new Map<string, Model['Group']>(), byAlias = new Map<string, Model['Group']>();
  for (const face of faces) for (let index = 0; index < 4; index += 1) {
    const point = face.corners[index], key = kind === "edge" ? [pointKey(point), pointKey(face.corners[(index + 1) % 4])].sort().join("|") : pointKey(point);
    let group = groups.get(key);
    if (!group) { group = { canonical: "", aliases: [], members: [] }; groups.set(key, group); }
    group.members.push({ faceId: face.id, index });
    byMember.set(face.id + ":" + index, group);
  }
  for (const group of groups.values()) {
    const ids = [...new Set(group.members.map((member) => member.faceId))].sort(), index = group.members[0].index, short = kind === "edge" ? "e" : "v";
    group.canonical = ids.length > 1 ? (kind === "edge" ? "E:" : "V:") + ids.join(":") : ids[0] + ":" + short + index;
    group.aliases = [...new Set([group.canonical, ...group.members.flatMap((member) => [member.faceId + ":" + kind + ":" + member.index, member.faceId + ":" + short + member.index])])];
    for (const alias of group.aliases) byAlias.set(alias, group);
  }
  return { groups: [...groups.values()], byMember, byAlias };
}

// prettier-ignore
function foldedOf(result: unknown, faces: Model['Face'][]): Model['Folded'] {
  const map: Model['Folded'] = new Map(), root = rec(result);
  if (!root) return map;
  const ids = new Map<string, string>(), link = rec(root.correspondence) ?? rec(root.correspondences);
  const put = (faceId: unknown, foldedId: unknown): void => { if (typeof faceId === "string" && typeof foldedId === "string") ids.set(faceId, foldedId); };
  if (Array.isArray(link?.faces)) for (const entry of link.faces) { const item = rec(entry); put(item?.faceId, item?.foldedFaceId); }
  else if (link) for (const [id, value] of Object.entries(link)) if (faces.some((face) => face.id === id)) put(id, first(value));
  const entries: Array<{ id: string; value: unknown }> = [];
  for (const source of [root.transforms, root.faceTransforms]) {
    if (Array.isArray(source)) for (const entry of source) { const item = rec(entry), id = item?.id ?? item?.faceId; if (typeof id === "string") entries.push({ id, value: entry }); }
    else { const item = rec(source); if (item) for (const [id, value] of Object.entries(item)) entries.push({ id, value }); }
  }
  if (Array.isArray(root.faces)) for (const entry of root.faces) {
    const item = rec(entry), id = first(item?.id) ?? first(item?.foldedFaceId), sourceId = first(item?.faceId);
    if (id) entries.push({ id, value: entry });
    if (sourceId) { entries.push({ id: sourceId, value: entry }); put(sourceId, id); }
  }
  for (const face of faces) {
    const foldedId = ids.get(face.id) ?? face.id, entry = entries.find((item) => item.id === face.id) ?? entries.find((item) => item.id === foldedId);
    const item = rec(entry?.value), raw = item ? item.corners ?? item.vertices ?? item.points : Array.isArray(entry?.value) ? entry.value : null;
    if (!Array.isArray(raw)) continue;
    const corners = raw.map(vec3).filter((point): point is Model['P3'] => point !== null);
    if (corners.length < 4) continue;
    const info = { foldedId, corners: corners.slice(0, 4) };
    map.set(face.id, info);
    map.set(foldedId, info);
  }
  return map;
}

// prettier-ignore
function corrOf(result: unknown, faces: Model['Face'][], folded: Model['Folded'], edges: Model['Groups'], vertices: Model['Groups']): Model['Corr'] {
  const corr = emptyCorr(), root = rec(result), link = rec(root?.correspondence) ?? rec(root?.correspondences);
  const setGroup = (map: Map<string, string>, group: Model['Group'], target: string): void => { group.aliases.forEach((alias) => map.set(alias, target)); };
  for (const face of faces) corr.face.set(face.id, folded.get(face.id)?.foldedId ?? face.id);
  for (const group of edges.groups) setGroup(corr.edge, group, group.canonical);
  for (const group of vertices.groups) setGroup(corr.vertex, group, group.canonical);
  if (!root) return corr;
  if (Array.isArray(link?.faces)) for (const entry of link.faces) { const item = rec(entry), id = first(item?.faceId), target = first(item?.foldedFaceId); if (id && target) corr.face.set(id, target); }
  if (Array.isArray(link?.edges)) for (const entry of link.edges) {
    const item = rec(entry), target = first(item?.foldedEdgeId);
    if (!target) continue;
    const points = Array.isArray(item?.points3d) ? item.points3d.map(vec3) : [];
    if (points[0] && points[1]) corr.edgePoints.set(target, [points[0], points[1]]);
    if (Array.isArray(item?.positions2d)) for (const position of item.positions2d) { const part = rec(position), group = edges.byMember.get((first(part?.faceId) ?? "") + ":" + num(part?.edgeIndex)); if (group) setGroup(corr.edge, group, target); }
  }
  if (Array.isArray(link?.vertices)) for (const entry of link.vertices) {
    const item = rec(entry), target = first(item?.foldedVertexId);
    if (!target) continue;
    const point = vec3(item?.point3d);
    if (point) corr.vertexPoints.set(target, point);
    if (Array.isArray(item?.positions2d)) for (const position of item.positions2d) { const part = rec(position), group = vertices.byMember.get((first(part?.faceId) ?? "") + ":" + num(part?.vertexIndex)); if (group) setGroup(corr.vertex, group, target); }
  }
  for (const source of [link, root.mapping, root.parts]) {
    const item = rec(source);
    if (!item) continue;
    for (const [key, value] of Object.entries(item)) {
      const target = first(value);
      if (!target) continue;
      if (faces.some((face) => face.id === key)) corr.face.set(key, target);
      const edge = edges.byAlias.get(key), vertex = vertices.byAlias.get(key);
      if (edge) setGroup(corr.edge, edge, target);
      if (vertex) setGroup(corr.vertex, vertex, target);
    }
  }
  for (const group of edges.groups) {
    const target = corr.edge.get(group.canonical) ?? group.canonical, member = group.members[0];
    const corners = folded.get(member.faceId)?.corners ?? folded.get(corr.face.get(member.faceId) ?? "")?.corners, face = faces.find((item) => item.id === member.faceId);
    if (corners) corr.edgePoints.set(target, [corners[member.index], corners[(member.index + 1) % 4]]);
    else if (face) corr.edgePoints.set(target, [face.corners[member.index], face.corners[(member.index + 1) % 4]]);
  }
  for (const group of vertices.groups) {
    const target = corr.vertex.get(group.canonical) ?? group.canonical, member = group.members[0];
    const corners = folded.get(member.faceId)?.corners ?? folded.get(corr.face.get(member.faceId) ?? "")?.corners, face = faces.find((item) => item.id === member.faceId);
    const point = corners?.[member.index] ?? face?.corners[member.index];
    if (point) corr.vertexPoints.set(target, point);
  }
  return corr;
}

// prettier-ignore
function highlightedOf(selected: string | null, corr: Model['Corr']): Set<string> { const out = new Set<string>(); if (!selected) return out; out.add(selected); for (const map of [corr.face, corr.edge, corr.vertex]) { const direct = map.get(selected); if (direct) out.add(direct); for (const [key, value] of map) if (key === selected || value === selected) out.add(key); } return out; }
// prettier-ignore
const centerOf = (points: Model['P3'][]): Model['P3'] => points.length === 0 ? [0, 0, 0] : points.reduce<Model['P3']>((sum, point) => [sum[0] + point[0] / points.length, sum[1] + point[1] / points.length, sum[2] + point[2] / points.length], [0, 0, 0]);
// prettier-ignore
function setFace(mesh: THREE.Mesh, points: Model['P3'][]): void { const attribute = mesh.geometry.getAttribute("position") as THREE.BufferAttribute; (attribute.array as Float32Array).set([...points[0], ...points[1], ...points[2], ...points[0], ...points[2], ...points[3]]); attribute.needsUpdate = true; mesh.geometry.computeVertexNormals(); }
// prettier-ignore
function place(mesh: THREE.Mesh, from: Model['P3'], to: Model['P3']): void { const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), direction = b.clone().sub(a); mesh.position.copy(a.add(b).multiplyScalar(0.5)); mesh.scale.set(1, Math.max(direction.length(), 0.0001), 1); mesh.quaternion.setFromUnitVectors(UP, direction.normalize()); }
// prettier-ignore
function build(faces: Model['Face'][], folded: Model['Folded'], corr: Model['Corr'], edges: Model['Groups'], vertices: Model['Groups']) {
  const all = faces.flatMap((face) => face.corners);
  for (const info of folded.values()) all.push(...info.corners);
  const center = centerOf(all), shift = (point: Model['P3']): Model['P3'] => [point[0] - center[0], point[1] - center[1], point[2] - center[2]];
  const scene = new THREE.Scene(), group = new THREE.Group(), parts: Model['Part'][] = [];
  scene.add(group);
  const mesh = (geometry: THREE.BufferGeometry, color: number, pickId: string): THREE.Mesh => { const item = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide })); item.userData.pickId = pickId; group.add(item); return item; };
  for (const face of faces) {
    const flat = face.corners.map(shift), foldedId = corr.face.get(face.id) ?? face.id, target = folded.get(face.id)?.corners ?? folded.get(foldedId)?.corners ?? flat;
    const item = mesh(new THREE.BufferGeometry(), 0x8ecae6, foldedId);
    item.geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(18), 3));
    setFace(item, flat);
    parts.push({ kind: "face", alias: foldedId, testId: face.id, foldedId, flat, folded: target.map(shift), object: item });
  }
  for (const info of edges.groups) {
    const member = info.members[0], face = faces.find((item) => item.id === member.faceId);
    if (!face) continue;
    const flat = [face.corners[member.index], face.corners[(member.index + 1) % 4]].map(shift) as [Model['P3'], Model['P3']], target = corr.edge.get(info.canonical) ?? info.canonical;
    const corners = folded.get(member.faceId)?.corners ?? folded.get(corr.face.get(member.faceId) ?? "")?.corners;
    const foldedPoints = corr.edgePoints.get(target) ?? (corners ? [corners[member.index], corners[(member.index + 1) % 4]] : flat);
    const item = mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 8), 0x2b2d42, target);
    place(item, flat[0], flat[1]);
    parts.push({ kind: "edge", alias: target, testId: member.faceId + ":edge:" + member.index, foldedId: target, flat, folded: foldedPoints.map(shift), object: item });
  }
  for (const info of vertices.groups) {
    const member = info.members[0], face = faces.find((item) => item.id === member.faceId);
    if (!face) continue;
    const flat = [shift(face.corners[member.index])], target = corr.vertex.get(info.canonical) ?? info.canonical;
    const corners = folded.get(member.faceId)?.corners ?? folded.get(corr.face.get(member.faceId) ?? "")?.corners;
    const point = corr.vertexPoints.get(target) ?? corners?.[member.index] ?? face.corners[member.index];
    const item = mesh(new THREE.SphereGeometry(0.07, 12, 8), 0x495057, target);
    item.position.set(...shift(point));
    parts.push({ kind: "vertex", alias: target, testId: member.faceId + ":vertex:" + member.index, foldedId: target, flat, folded: [shift(point)], object: item });
  }
  return { scene, parts, pickables: parts.map((part) => part.object), hasFold: folded.size > 0 };
}
// prettier-ignore
const pointsAt = (part: Model['Part'], progress: number): Model['P3'][] => part.flat.map((point, index) => { const target = part.folded[index] ?? point; return [point[0] + (target[0] - point[0]) * progress, point[1] + (target[1] - point[1]) * progress, point[2] + (target[2] - point[2]) * progress]; });
// prettier-ignore
const project = (point: Model['P3']): Model['P2'] => [(point[0] - point[2]) * 0.87, (point[0] + point[2]) * 0.5 - point[1]];
// prettier-ignore
function overlayOf(parts: Model['Part'][], progress: number) { const raw = parts.map((part) => ({ part, points: pointsAt(part, progress).map(project) })), all = raw.flatMap((item) => item.points); if (all.length === 0) return []; const xs = all.map((point) => point[0]), ys = all.map((point) => point[1]); const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys); const scale = Math.min(320 / Math.max(maxX - minX, 1), 200 / Math.max(maxY - minY, 1)), dx = 200 - ((minX + maxX) / 2) * scale, dy = 140 - ((minY + maxY) / 2) * scale; return raw.map((item) => ({ part: item.part, points: item.points.map(([x, y]) => [x * scale + dx, y * scale + dy] as Model['P2']) })); }

// prettier-ignore
export default function FoldView({ layout, foldResult, foldProgress, selectedPartId, onSelectPart, readOnly }: FoldViewProps): ReactElement {
  const [retry, setRetry] = useState(0), [buildFailed, setBuildFailed] = useState(false);
  const faces = useMemo(() => facesOf(layout), [layout]);
  const root = rec(foldResult), ok = root ? root.ok !== false : false, progress = Math.min(1, Math.max(0, num(foldProgress)));
  const selected = typeof selectedPartId === "string" && selectedPartId.trim() ? selectedPartId : null;
  const folded = useMemo(() => (faces ? foldedOf(root, faces) : new Map()), [root, faces]);
  const edges = useMemo(() => (faces ? groupsOf(faces, "edge") : EMPTY_GROUPS), [faces]);
  const vertices = useMemo(() => (faces ? groupsOf(faces, "vertex") : EMPTY_GROUPS), [faces]);
  const corr = useMemo(() => (faces ? corrOf(root, faces, folded, edges, vertices) : emptyCorr()), [root, faces, folded, edges, vertices]);
  const scene = useMemo(() => { if (!faces) return null; try { return build(faces, folded, corr, edges, vertices); } catch { return null; } }, [faces, folded, corr, edges, vertices, retry]);
  useEffect(() => { setBuildFailed(scene === null); }, [scene]);
  const highlighted = useMemo(() => (ok && scene && !buildFailed && selected ? highlightedOf(selected, corr) : new Set<string>()), [ok, scene, buildFailed, selected, corr]);
  useEffect(() => { if (!scene) return; for (const part of scene.parts) { const points = pointsAt(part, progress); if (part.kind === "face") setFace(part.object, points); else if (part.kind === "edge") place(part.object, points[0], points[1]); else part.object.position.set(...points[0]); const marked = highlighted.has(part.alias) || highlighted.has(part.foldedId); const color = marked ? 0xffd166 : part.kind === "face" ? (ok ? 0x8ecae6 : 0xb8b8b8) : part.kind === "edge" ? 0x2b2d42 : 0x495057; (part.object.material as THREE.MeshStandardMaterial).color.setHex(color); } }, [scene, progress, highlighted, ok]);
  const overlay = useMemo(() => (scene ? overlayOf(scene.parts, progress) : []), [scene, progress]);
  const reasons = root && Array.isArray(root.reasons) ? root.reasons : [];
  const state = !ok ? (progress >= 0.95 ? "unclosed" : "flat") : progress <= 0.05 ? "flat" : progress >= 0.95 ? "closed" : "folding";
  const stateText = state === "closed" ? "닫힌 입체" : state === "folding" ? "접는 중 " + Math.round(progress * 100) + "%" : state === "unclosed" ? "닫히지 않은 배열" : "평면 전개도";
  const select = (id: string) => onSelectPart?.(id);
  if (!faces) return <section className="fold-view" data-error="INVALID_LAYOUT"><p role="alert">전개도 배치가 올바르지 않아 장면을 표시할 수 없습니다.</p></section>;
  if (buildFailed || !scene) return <section className="fold-view" data-error="SCENE_INIT_FAILED"><p role="alert">3D 장면을 열지 못했습니다. 창을 다시 열어 주세요.</p><button type="button" onClick={() => setRetry((value) => value + 1)}>다시 열기</button></section>;
  return (
    <section className="fold-view" data-fold-progress={progress} data-fold-state={state} data-fold-ok={String(ok)} data-readonly={String(Boolean(readOnly))} data-selected-part-id={selected ?? ""} aria-label="전개도 접기 보기">
      <div className="fold-view__status" data-testid="fold-state">{stateText}</div>
      <div className="fold-view__stage" style={{ position: "relative", height: 260 }}>
        <Viewport sceneId="fold-view" scene={scene.scene} camera={CAMERA} pickables={scene.pickables} onPick={(id) => { if (id) select(id); }} ariaLabelKo="전개도 접기 3D 장면" />
        <svg viewBox="0 0 400 280" role="img" aria-label="접힌 전개도와 대응 부분" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
          {overlay.map(({ part, points }) => {
            const marked = highlighted.has(part.alias) || highlighted.has(part.foldedId);
            const keySelect = (event: { key: string }) => { if (event.key === "Enter" || event.key === " ") select(part.alias); };
            const common = { "data-part-id": part.alias, "data-correspondence-id": part.foldedId, style: { pointerEvents: "auto" as const }, tabIndex: onSelectPart ? 0 : -1, onKeyDown: keySelect };
            if (part.kind === "face") return <polygon key={part.testId} {...common} points={points.map(([x, y]) => x + "," + y).join(" ")} className={marked ? "is-highlighted" : undefined} data-testid={"fold-face-" + part.testId} onClick={() => select(part.alias)}><title>{part.testId}</title></polygon>;
            if (part.kind === "edge") return <line key={part.testId} {...common} x1={points[0][0]} y1={points[0][1]} x2={points[1][0]} y2={points[1][1]} className={marked ? "is-highlighted" : undefined} data-testid={"fold-edge-" + part.testId} onClick={() => select(part.alias)} />;
            return <circle key={part.testId} {...common} cx={points[0][0]} cy={points[0][1]} r={4} className={marked ? "is-highlighted" : undefined} data-testid={"fold-vertex-" + part.testId} onClick={() => select(part.alias)} />;
          })}
          {!ok && reasons.map((reason) => { const item = rec(reason); return vec2(item?.location ?? item?.at ?? item?.position ?? item); }).filter((point): point is Model['P2'] => point !== null).map(([x, y], index) => <circle key={index} cx={200 + x * 24} cy={140 + y * 24} r={6} className="fold-view__issue" data-testid={"fold-issue-" + index} />)}
        </svg>
      </div>
      {!scene.hasFold && <p data-testid="fold-unavailable">접기 결과가 없어 평면 전개도만 표시합니다.</p>}
      {!ok && <ul className="fold-view__reasons" data-testid="fold-reasons">{reasons.map((reason, index) => <li key={index}>{typeof reason === "string" ? reason : REASONS[String(rec(reason)?.code ?? "")] ?? String(rec(reason)?.code ?? "면의 위치와 겹침을 확인하세요.")}</li>)}</ul>}
    </section>
  );
}

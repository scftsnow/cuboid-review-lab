import * as THREE from "three";

export type ScenePointerGesture =
  | { kind: "tap"; pickId: string | null }
  | { kind: "rotate"; deltaX: number; deltaY: number }
  | { kind: "cancel" };

export type AttachScenePointerOptions = {
  element: HTMLElement;
  camera: THREE.Camera;
  pickables: readonly THREE.Object3D[];
  onGesture(gesture: ScenePointerGesture): void;
  dragThresholdPx?: number;
};

function hasPickId(node: THREE.Object3D): boolean {
  return Object.prototype.hasOwnProperty.call(node.userData, "pickId");
}

export function attachScenePointer(
  options: AttachScenePointerOptions,
): () => void {
  const { element, camera, pickables, onGesture } = options;

  if (!element) {
    throw new TypeError("attachScenePointer requires an element");
  }
  if (!camera) {
    throw new TypeError("attachScenePointer requires a camera");
  }
  if (typeof onGesture !== "function") {
    throw new TypeError("attachScenePointer requires onGesture");
  }

  const pickableObjects = Array.isArray(pickables) ? [...pickables] : [];
  const threshold =
    typeof options.dragThresholdPx === "number" && options.dragThresholdPx >= 0
      ? options.dragThresholdPx
      : 8;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  let activePointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let dragging = false;

  function pickAt(clientX: number, clientY: number): string | null {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return null;
    }

    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);

    for (const hit of raycaster.intersectObjects(pickableObjects, true)) {
      let node: THREE.Object3D | null = hit.object;
      while (node) {
        if (hasPickId(node)) {
          const pickId = node.userData.pickId;
          return typeof pickId === "string" && pickId.length > 0
            ? pickId
            : null;
        }
        node = node.parent;
      }
    }
    return null;
  }

  function onPointerDown(event: PointerEvent): void {
    if (activePointerId !== null) {
      return;
    }
    activePointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    dragging = false;
  }

  function onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== activePointerId) {
      return;
    }
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (Math.hypot(deltaX, deltaY) > threshold) {
      dragging = true;
    }
  }

  function finishPointer(): void {
    activePointerId = null;
    startX = 0;
    startY = 0;
    dragging = false;
  }

  function onPointerUp(event: PointerEvent): void {
    if (event.pointerId !== activePointerId) {
      return;
    }
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    const becameDrag = dragging || Math.hypot(deltaX, deltaY) > threshold;
    finishPointer();

    if (becameDrag) {
      onGesture({ kind: "rotate", deltaX, deltaY });
      return;
    }
    onGesture({ kind: "tap", pickId: pickAt(event.clientX, event.clientY) });
  }

  function onPointerCancel(event: PointerEvent): void {
    if (event.pointerId !== activePointerId) {
      return;
    }
    finishPointer();
    onGesture({ kind: "cancel" });
  }

  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("pointermove", onPointerMove);
  element.addEventListener("pointerup", onPointerUp);
  element.addEventListener("pointercancel", onPointerCancel);

  return () => {
    element.removeEventListener("pointerdown", onPointerDown);
    element.removeEventListener("pointermove", onPointerMove);
    element.removeEventListener("pointerup", onPointerUp);
    element.removeEventListener("pointercancel", onPointerCancel);
  };
}

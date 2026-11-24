import { useEffect, useRef, useState, type ReactElement } from 'react';
import * as THREE from 'three';
import { attachScenePointer, type ScenePointerGesture } from './pointer';

export interface ViewportErrorInfo {
  code: 'WEBGL_INIT_FAILED';
  sceneId: string;
  messageKo: string;
}

export interface ViewportProps {
  sceneId: string;
  scene: THREE.Scene | null;
  camera: {
    position: readonly [number, number, number];
    target: readonly [number, number, number];
    fov?: number;
  };
  pickables?: readonly THREE.Object3D[];
  onPick?: (pickId: string | null) => void;
  ariaLabelKo: string;
}

type FailureState = {
  code: 'WEBGL_INIT_FAILED' | 'POINTER_ATTACH_FAILED';
  sceneId: string;
  messageKo: string;
};

const EMPTY_PICKABLES: readonly THREE.Object3D[] = [];
const ROTATE_SPEED = 0.005;

export function Viewport({
  sceneId,
  scene,
  camera: cameraConfig,
  pickables = EMPTY_PICKABLES,
  onPick,
  ariaLabelKo,
}: ViewportProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const onPickRef = useRef(onPick);
  const [failure, setFailure] = useState<FailureState | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const [positionX, positionY, positionZ] = cameraConfig.position;
  const [targetX, targetY, targetZ] = cameraConfig.target;
  const fov = cameraConfig.fov ?? 50;

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    setFailure(null);

    const container = containerRef.current;
    if (!container || !scene) {
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailure({
        code: 'WEBGL_INIT_FAILED',
        sceneId,
        messageKo:
          sceneId +
          ' 장면을 열 수 없습니다. 브라우저의 3D 기능을 확인한 뒤 다시 열어 주세요.',
      });
      return;
    }

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    container.appendChild(canvas);

    const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 1000);
    const target = new THREE.Vector3(targetX, targetY, targetZ);
    camera.position.set(positionX, positionY, positionZ);
    camera.lookAt(target);

    let frame = 0;
    let disposed = false;
    let detachPointer: (() => void) | undefined;
    let resizeObserver: ResizeObserver | undefined;
    const spherical = new THREE.Spherical();

    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const dispose = () => {
      if (disposed) {
        return;
      }
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      detachPointer?.();
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      renderer.dispose();
      canvas.remove();
    };

    function handleContextLost(event: Event) {
      event.preventDefault();
      setFailure({
        code: 'WEBGL_INIT_FAILED',
        sceneId,
        messageKo: sceneId + ' 장면 연결이 끊겼습니다. 다시 열어 주세요.',
      });
      dispose();
    }

    const applyRotation = (deltaX: number, deltaY: number) => {
      const offset = camera.position.clone().sub(target);
      spherical.setFromVector3(offset);
      spherical.theta -= deltaX * ROTATE_SPEED;
      spherical.phi = Math.max(
        0.01,
        Math.min(Math.PI - 0.01, spherical.phi - deltaY * ROTATE_SPEED),
      );
      offset.setFromSpherical(spherical);
      camera.position.copy(target).add(offset);
      camera.lookAt(target);
    };

    const handleGesture = (gesture: ScenePointerGesture) => {
      if (gesture.kind === 'tap') {
        onPickRef.current?.(gesture.pickId);
        return;
      }
      if (gesture.kind === 'rotate') {
        applyRotation(gesture.deltaX, gesture.deltaY);
      }
    };

    canvas.addEventListener('webglcontextlost', handleContextLost);

    try {
      detachPointer = attachScenePointer({
        element: canvas,
        camera,
        pickables,
        onGesture: handleGesture,
      });
    } catch {
      setFailure({
        code: 'POINTER_ATTACH_FAILED',
        sceneId,
        messageKo:
          sceneId + ' 장면의 터치 조작을 연결하지 못했습니다. 다시 열어 주세요.',
      });
      dispose();
      return;
    }

    resize();
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);
    }

    const render = () => {
      if (disposed) {
        return;
      }
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();

    return dispose;
  }, [
    sceneId,
    scene,
    positionX,
    positionY,
    positionZ,
    targetX,
    targetY,
    targetZ,
    fov,
    pickables,
    retryToken,
  ]);

  const state = !scene ? 'empty' : failure ? 'error' : 'ready';

  return (
    <div
      ref={containerRef}
      className="viewport"
      data-testid="viewport"
      data-scene-id={sceneId}
      data-state={state}
      aria-label={ariaLabelKo}
      role="region"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 240 }}
    >
      {!scene ? (
        <p className="viewport-empty" role="status">
          장면이 아직 준비되지 않았어요.
        </p>
      ) : null}
      {scene && failure ? (
        <div className="viewport-error" role="alert">
          <strong>{failure.code}</strong>
          <p>{failure.messageKo}</p>
          <p>화면 ID: {failure.sceneId}</p>
          <button type="button" onClick={() => setRetryToken((value) => value + 1)}>
            다시 열기
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default Viewport;

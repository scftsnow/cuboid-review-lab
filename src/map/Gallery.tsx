import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { foldNetLayout, type FoldReasonCode, type FoldResult } from '../geometry/netFold';
import {
  validateNetLayout,
  type NetIssueCode,
  type NetLayout,
  type SolidKind,
} from '../geometry/netLayout';
import { getExhibit, getNotice } from '../progress/store';
import FoldView from '../scene/FoldView';

export type GalleryProps = {
  galleryKind: SolidKind;
  onBackToMap: () => void;
};

const KIND_LABEL: Record<SolidKind, string> = {
  cube: '정육면체',
  cuboid: '직육면체',
};

const FOLD_REASON: Record<FoldReasonCode, string> = {
  INVALID_INPUT: '저장된 전개도의 형식이 올바르지 않습니다.',
  EMPTY_LAYOUT: '저장된 전개도에 면이 없습니다.',
  DISCONNECTED_FACE: '면이 연결되지 않아 입체로 닫히지 않습니다.',
  EDGE_LENGTH_MISMATCH: '맞닿는 변의 길이가 달라 닫히지 않습니다.',
  OVERLAP_2D: '전개도 면이 겹쳐 닫히지 않습니다.',
  FACE_OVERLAP_3D: '접힌 면이 같은 자리에 겹칩니다.',
  UNMATCHED_EDGE: '모서리가 짝을 이루지 못해 닫히지 않습니다.',
  UNMATCHED_VERTEX: '꼭짓점이 짝을 이루지 못해 닫히지 않습니다.',
};

const NET_ISSUE: Record<NetIssueCode, string> = {
  INVALID_DIMENSIONS: '치수가 올바르지 않습니다.',
  DUPLICATE_FACE_ID: '면 ID가 중복되었습니다.',
  INVALID_FACE_SIZE: '면 크기가 배치와 맞지 않습니다.',
  FACE_OVERLAP: '면이 겹쳤습니다.',
  PARTIAL_EDGE_CONTACT: '변이 일부만 맞닿았습니다.',
  INCOMPLETE_FACE_SET: '면이 부족합니다.',
  EXTRA_FACE: '면이 많습니다.',
};

export function Gallery({ galleryKind, onBackToMap }: GalleryProps): ReactElement {
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [foldProgress, setFoldProgress] = useState(1);
  const kind = galleryKind === 'cube' || galleryKind === 'cuboid' ? galleryKind : null;

  const stored = useMemo(() => {
    if (kind === null) {
      return { layout: null as NetLayout | null, notice: null as string | null };
    }
    try {
      return { layout: getExhibit(kind), notice: getNotice() };
    } catch {
      return {
        layout: null as NetLayout | null,
        notice: '저장된 전시를 읽지 못했습니다. 지도로 돌아가 다시 열어 주세요.',
      };
    }
  }, [kind]);

  const validation = useMemo(
    () => (stored.layout === null ? null : validateNetLayout(stored.layout)),
    [stored.layout],
  );

  const fold = useMemo(() => {
    if (kind === null || stored.layout === null || validation?.ok !== true) {
      return null;
    }
    return foldNetLayout(stored.layout);
  }, [kind, stored.layout, validation]);

  const label = kind === null ? '전시' : KIND_LABEL[kind];
  let status = label + ' 전시를 열었습니다.';
  let content: ReactElement;

  const foldView = (layout: NetLayout, result: FoldResult): ReactElement => (
    <div data-testid="gallery-exhibit">
      <FoldView
        layout={layout}
        foldResult={result}
        foldProgress={foldProgress}
        selectedPartId={selectedPartId}
        onSelectPart={setSelectedPartId}
        readOnly
      />
      <label className="gallery__fold-control">
        <span>접기 정도</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={foldProgress}
          aria-label="접기 정도"
          aria-valuetext={`${Math.round(foldProgress * 100)}% 접기`}
          data-testid="gallery-fold-slider"
          onChange={(event) => setFoldProgress(Number(event.currentTarget.value))}
        />
        <output>{Math.round(foldProgress * 100)}%</output>
      </label>
    </div>
  );

  if (kind === null) {
    status = '전시 종류를 알 수 없습니다. 지도에서 다시 선택해 주세요.';
    content = (
      <p className="gallery__message" data-testid="gallery-invalid-kind" role="alert">
        {status}
      </p>
    );
  } else if (stored.layout === null) {
    status = label + ' 전시가 없습니다. 전개도를 완성하면 여기에 전시됩니다.';
    content = (
      <p className="gallery__message" data-testid="gallery-empty">
        {status}
      </p>
    );
  } else if (validation === null || !validation.ok) {
    status = '저장된 전개도 형식이 올바르지 않습니다. 작품은 그대로 유지됩니다.';
    const issues = validation?.issues.map((issue) => NET_ISSUE[issue.code]).filter(Boolean).join(' ') ?? '';
    content = (
      <div className="gallery__message" data-testid="gallery-invalid" role="alert">
        <p>{status}</p>
        {issues !== '' && <p>{issues}</p>}
      </div>
    );
  } else if (fold === null) {
    status = '저장된 전개도를 확인할 수 없습니다.';
    content = (
      <p className="gallery__message" data-testid="gallery-unavailable" role="alert">
        {status}
      </p>
    );
  } else if (!fold.ok) {
    status = '저장된 전개도를 목표 입체로 닫을 수 없습니다. 작품은 그대로 유지됩니다.';
    const reasons = fold.reasons.map((reason) => FOLD_REASON[reason.code]).filter(Boolean).join(' ');
    content = (
      <div className="gallery__message" data-testid="gallery-fold-error" role="alert">
        <p>{status}</p>
        {reasons !== '' && <p>{reasons}</p>}
        {foldView(stored.layout, fold)}
      </div>
    );
  } else {
    status = '저장된 ' + label + ' 전개도를 같은 면 배치로 다시 접었습니다.';
    content = foldView(stored.layout, fold);
  }

  return (
    <section className="gallery" data-testid="gallery" data-kind={kind ?? 'unknown'}>
      <header className="gallery__header">
        <h1>{label} 전시</h1>
        <p className="gallery__status" data-testid="gallery-status" aria-live="polite">
          {stored.notice === null ? status : stored.notice + ' ' + status}
        </p>
      </header>
      {content}
      <button className="gallery__back" type="button" data-testid="gallery-back" onClick={onBackToMap}>
        지도로 돌아가기
      </button>
    </section>
  );
}

export default Gallery;

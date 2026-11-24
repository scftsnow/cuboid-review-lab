import { createElement, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, ReactElement } from "react";
import type { NetFace, NetLayout } from "../geometry/netLayout";
// prettier-ignore
import { expectedFaceInventory, rotateNetFace, translateNetFace } from "../geometry/netLayout";
// prettier-ignore
type Notice='INVALID_LAYOUT_INPUT'|'LOCKED_FACE'|'NO_FACE_INVENTORY'|'UNKNOWN_PART_ID';
// prettier-ignore
type Mode='predict'|'repair'|'partial'|'blank';
type Rect = { x: number; y: number; w: number; h: number };
type Point = [number, number];
// prettier-ignore
type Props={kind:'cube'|'cuboid';mode?:Mode|null;sideLengths:readonly [number,number,number];
  layout?:NetLayout|null;selectedPartId?:string|null;highlightedPartIds?:readonly string[]|null;
  fixedFaceIds?:readonly string[];onChange?:(layout:NetLayout)=>void;
  onSelect?:(partId:string)=>void;onNotice?:(code:Notice)=>void};
// prettier-ignore
const MODES:readonly Mode[]=['predict','repair','partial','blank'],EDGES=[0,1,2,3] as const;
// prettier-ignore
function rectOf(face:NetFace):Rect {const swap=face.quarterTurns%2===1;return {x:face.origin.x,y:face.origin.y,w:swap?face.size.height:face.size.width,h:swap?face.size.width:face.size.height}}
// prettier-ignore
function sizeKey(width:number,height:number):string {return width<=height?width+'x'+height:height+'x'+width}
// prettier-ignore
function canonicalPartId(value:string):string {
  const edge=/^([^:]+):e([0-3])$/.exec(value); if(edge)return edge[1]+':edge:'+edge[2];
  const vertex=/^([^:]+):v([0-3])$/.exec(value); if(vertex)return vertex[1]+':vertex:'+vertex[2];
  return value;
}
// prettier-ignore
function faceIdOf(partId:string):string {return partId.split(':')[0]??''}
// prettier-ignore
function edgeBand(rect:Rect,index:number):Rect {
  return index===0?{x:rect.x,y:rect.y-0.12,w:rect.w,h:0.24}:index===1?{x:rect.x+rect.w-0.12,y:rect.y,w:0.24,h:rect.h}:index===2?{x:rect.x,y:rect.y+rect.h-0.12,w:rect.w,h:0.24}:{x:rect.x-0.12,y:rect.y,w:0.24,h:rect.h};
}
// prettier-ignore
function vertices(rect:Rect):readonly Point[] {return [[rect.x,rect.y],[rect.x+rect.w,rect.y],[rect.x+rect.w,rect.y+rect.h],[rect.x,rect.y+rect.h]]}
// prettier-ignore
function boundsOf(rects:readonly Rect[]) {
  return rects.reduce((b,r)=>({minX:Math.min(b.minX,r.x-1),minY:Math.min(b.minY,r.y-1),maxX:Math.max(b.maxX,r.x+r.w+1),maxY:Math.max(b.maxY,r.y+r.h+1)}),{minX:0,minY:0,maxX:8,maxY:8});
}
// prettier-ignore
function knownPartIdsOf(faces:readonly NetFace[]):ReadonlySet<string> {
  const ids=new Set<string>();
  faces.forEach(face=>{
    ids.add(face.id);
    EDGES.forEach(index=>ids.add(face.id+':edge:'+index));
    vertices(rectOf(face)).forEach((_point,index)=>ids.add(face.id+':vertex:'+index));
  });
  return ids;
}
// prettier-ignore
export function NetBoard(props:Props):ReactElement|null {
  const {kind,mode,sideLengths,layout,selectedPartId,highlightedPartIds,fixedFaceIds,onChange,onSelect,onNotice}=props;
  const validKind=kind==='cube'||kind==='cuboid';
  const validSides=Array.isArray(sideLengths)&&sideLengths.length===3&&
    sideLengths.every(v=>Number.isFinite(v)&&v>0)&&
    (kind!=='cube'||sideLengths.every(v=>v===sideLengths[0]));
  const currentMode=mode&&MODES.includes(mode)?mode:'predict';
  const boardLayout=useMemo<NetLayout>(()=>layout&&Array.isArray(layout.faces)?layout:
    {kind:validKind?kind:'cube',sideLengths:validSides?sideLengths:[1,1,1],faces:[]},
    [layout,kind,sideLengths,validKind,validSides]);
  const faces=boardLayout.faces;
  const selected=typeof selectedPartId==='string'?canonicalPartId(selectedPartId.trim()):'';
  const highlights=useMemo(()=>{
    const source=Array.isArray(highlightedPartIds)?highlightedPartIds:selected?[selected]:[];
    return new Set(source.map(id=>typeof id==='string'?canonicalPartId(id.trim()):'').filter(Boolean));
  },[highlightedPartIds,selected]);
  const knownIds=useMemo(()=>knownPartIdsOf(faces),[faces]);
  const activeId=selected?faceIdOf(selected):'';
  const active=faces.find(face=>face.id===activeId)??null;
  const locked=active!==null&&(fixedFaceIds??[]).includes(active.id);
  const [paletteIndex,setPaletteIndex]=useState<number|null>(null);
  const lastNotice=useRef('');
  const palette=useMemo(()=>validKind&&validSides?expectedFaceInventory(kind,sideLengths).flatMap((item,groupIndex)=>
    Array.from({length:item.count},(_unused,copy)=>({key:groupIndex+'-'+copy,width:item.width,height:item.height,count:item.count}))):[],
    [kind,sideLengths,validKind,validSides]);
  const placed=useMemo(()=>{
    const counts=new Map<string,number>();
    faces.forEach(face=>{const key=sizeKey(face.size.width,face.size.height);counts.set(key,(counts.get(key)??0)+1)});
    return counts;
  },[faces]);
  useEffect(()=>{
    if(!validKind||!validSides){
      if(lastNotice.current!=='INVALID_LAYOUT_INPUT'){
        lastNotice.current='INVALID_LAYOUT_INPUT';onNotice?.('INVALID_LAYOUT_INPUT');
      }
      return;
    }
    if(selected&&!knownIds.has(selected)&&![...highlights].some(id=>knownIds.has(id))){
      const marker='UNKNOWN:'+selected;
      if(lastNotice.current!==marker){lastNotice.current=marker;onNotice?.('UNKNOWN_PART_ID')}
      return;
    }
    lastNotice.current='';
  },[validKind,validSides,selected,highlights,knownIds,onNotice]);
  if(!validKind||!validSides)return null;
  const rects=faces.map(rectOf),bounds=boundsOf(rects),notify=(code:Notice)=>onNotice?.(code);
  const highlight=(partId:string)=>highlights.has(partId)?{'data-highlighted-2d':''}:{};
  const choose=(partId:string,event:MouseEvent)=>{event.stopPropagation();onSelect?.(partId)};
  const place=(x:number,y:number,event:MouseEvent)=>{
    event.stopPropagation();
    if(!onChange)return;
    if(active){
      if(locked){notify('LOCKED_FACE');return}
      const moved=translateNetFace(active,{x,y});
      onChange({...boardLayout,faces:faces.map(face=>face.id===active.id?moved:face)});
      return;
    }
    const item=paletteIndex===null?undefined:palette[paletteIndex];
    if(!item||(placed.get(sizeKey(item.width,item.height))??0)>=item.count){notify('NO_FACE_INVENTORY');return}
    const used=new Set(faces.map(face=>face.id));
    let number=1; while(used.has('F'+number))number+=1;
    onChange({...boardLayout,faces:[...faces,{id:'F'+number,origin:{x,y},
      size:{width:item.width,height:item.height},quarterTurns:0}]});
  };
  const rotate=()=>{
    if(!onChange||!active)return;
    if(locked){notify('LOCKED_FACE');return}
    const quarterTurns=((active.quarterTurns+1)%4) as NetFace['quarterTurns'];
    onChange({...boardLayout,faces:faces.map(face=>
      face.id===active.id?rotateNetFace(active,quarterTurns):face)});
  };
  const remove=()=>{
    if(!onChange||!active)return;
    if(locked){notify('LOCKED_FACE');return}
    onChange({...boardLayout,faces:faces.filter(face=>face.id!==active.id)});
  };
  return (
    <section className="net-board-root" data-net-board-root="" data-topic={kind==='cube'?'cube':'rect'} data-mode={currentMode}>
      <div className="face-palette-list" role="group" aria-label="면 팔레트">
        {palette.map((item,index)=>{
          const remaining=item.count-(placed.get(sizeKey(item.width,item.height))??0);
          return createElement('face-palette',{
            key:item.key,className:'face-palette','data-face-kind':kind==='cube'?'cube-face':'rect-face',
            'data-width':item.width,'data-height':item.height,'data-remaining':remaining,
            'data-active':paletteIndex===index?'true':'false',
            onClick:(event:MouseEvent)=>{
              event.stopPropagation();
              if(remaining<=0){notify('NO_FACE_INVENTORY');return}
              setPaletteIndex(index);
            },
          },item.width+'×'+item.height);
        })}
      </div>
      <svg className="net-grid" aria-label="전개도 격자"
        viewBox={`${bounds.minX-0.5} ${bounds.minY-0.5} ${bounds.maxX-bounds.minX+2} ${bounds.maxY-bounds.minY+2}`}>
        {Array.from({length:bounds.maxY-bounds.minY+1},(_row,row)=>
          Array.from({length:bounds.maxX-bounds.minX+1},(_cell,column)=>{
            const x=bounds.minX+column,y=bounds.minY+row;
            if(rects.some(r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h))return null;
            return <rect key={x+','+y} className="net-cell" data-grid-cell="" data-grid-x={x} data-grid-y={y}
              x={x+0.05} y={y+0.05} width={0.9} height={0.9} onClick={event=>place(x,y,event)} />;
          }))}
        {faces.map(face=>{
          const rect=rectOf(face);
          return <g key={face.id} className="net-board" data-face-id={face.id} data-grid-x={face.origin.x}
            data-grid-y={face.origin.y} data-rot={face.quarterTurns*90} data-part-id={face.id}
            {...highlight(face.id)} onClick={event=>choose(face.id,event)}>
            <rect className="net-face-shape" x={rect.x} y={rect.y} width={rect.w} height={rect.h} />
            <text className="net-face-label" x={rect.x+0.2} y={rect.y+0.5} pointerEvents="none">{face.id}</text>
            {EDGES.map(index=>{
              const partId=face.id+':edge:'+index,band=edgeBand(rect,index);
              return <rect key={partId} className="net-edge-hit" data-part-id={partId} {...highlight(partId)}
                x={band.x} y={band.y} width={band.w} height={band.h} onClick={event=>choose(partId,event)} />;
            })}
            {vertices(rect).map((point,index)=>{
              const partId=face.id+':vertex:'+index;
              return <circle key={partId} className="net-vertex-hit" data-part-id={partId} {...highlight(partId)}
                cx={point[0]} cy={point[1]} r={0.18} onClick={event=>choose(partId,event)} />;
            })}
          </g>;
        })}
      </svg>
      <div className="net-board-actions" role="group" aria-label="전개도 조작">
        <button type="button" data-board-action="rotate" disabled={!active} onClick={rotate}>회전</button>
        <button type="button" data-board-action="remove" disabled={!active} onClick={remove}>제거</button>
        <button type="button" data-board-action="clear-selection" disabled={!selected&&highlights.size===0} onClick={()=>onSelect?.('')}>선택 해제</button>
      </div>
    </section>
  );
}
export default NetBoard;

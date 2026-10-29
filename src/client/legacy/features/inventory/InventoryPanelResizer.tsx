import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, RefObject } from "react";
import { useUiStore } from "../../store/ui";


const DEFAULT_WIDTH = 356;
const MIN_WIDTH = 300;
const HARD_MAX_WIDTH = 720;
const MAIN_MIN_WIDTH = 320;
const HANDLE_WIDTH = 10;


interface InventoryPanelResizerProps {
  workspaceRef: RefObject<HTMLDivElement | null>;
}


export function InventoryPanelResizer({ workspaceRef }: InventoryPanelResizerProps) {
  const storedWidth = useUiStore((state) => state.inventoryPanelWidth);
  const storeWidth = useUiStore((state) => state.setInventoryPanelWidth);
  const desiredWidthRef = useRef(storedWidth);
  const currentWidthRef = useRef(DEFAULT_WIDTH);
  const dragRef = useRef<{ pointerId: number; right: number } | null>(null);
  const [currentWidth, setCurrentWidth] = useState(DEFAULT_WIDTH);
  const [maxWidth, setMaxWidth] = useState(HARD_MAX_WIDTH);

  const bounds = () => {
    const workspace = workspaceRef.current;
    const workspaceWidth = workspace?.getBoundingClientRect().width || workspace?.clientWidth || window.innerWidth;
    return {
      min: MIN_WIDTH,
      max: Math.max(MIN_WIDTH, Math.min(HARD_MAX_WIDTH, workspaceWidth - MAIN_MIN_WIDTH - HANDLE_WIDTH)),
    };
  };

  const applyWidth = (rawWidth: number, commit: boolean) => {
    const range = bounds();
    const numeric = Number.isFinite(rawWidth) ? rawWidth : DEFAULT_WIDTH;
    const width = Math.round(Math.min(range.max, Math.max(range.min, numeric)));
    workspaceRef.current?.style.setProperty("--inventory-panel-width", `${width}px`);
    currentWidthRef.current = width;
    setCurrentWidth(width);
    setMaxWidth(range.max);
    if (commit) {
      desiredWidthRef.current = width;
      storeWidth(width);
    }
  };

  const endDrag = (commit: boolean) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    document.body.classList.remove("is-resizing-inventory-panel");
    if (commit) storeWidth(currentWidthRef.current);
  };

  useEffect(() => {
    desiredWidthRef.current = storedWidth;
    applyWidth(storedWidth, false);
  }, [storedWidth]);

  useEffect(() => {
    const handleResize = () => applyWidth(desiredWidthRef.current, false);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      document.body.classList.remove("is-resizing-inventory-panel");
    };
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const rect = workspace.getBoundingClientRect();
    dragRef.current = { pointerId: event.pointerId, right: rect.right };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    document.body.classList.add("is-resizing-inventory-panel");
    applyWidth(rect.right - event.clientX, false);
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    applyWidth(drag.right - event.clientX, false);
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.type !== "pointercancel") applyWidth(drag.right - event.clientX, false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    endDrag(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 64 : 16;
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = currentWidthRef.current + step;
    if (event.key === "ArrowRight") next = currentWidthRef.current - step;
    if (event.key === "Home") next = MIN_WIDTH;
    if (event.key === "End") next = bounds().max;
    if (next == null) return;
    event.preventDefault();
    applyWidth(next, true);
  };

  return (
    <div
      className="inventory-panel-resizer"
      role="separator"
      tabIndex={0}
      aria-label="调整仓库侧边栏宽度"
      aria-orientation="vertical"
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={Math.round(maxWidth)}
      aria-valuenow={currentWidth}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={() => endDrag(true)}
    />
  );
}

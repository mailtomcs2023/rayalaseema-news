// react-grid-layout@1.5.3 ships no types and the @types/react-grid-layout
// package on npm is a deprecated empty stub. Module-level shim so the
// /epaper editor page (which uses GridLayout + Layout) compiles.
//
// Just the surface the editor actually touches — Layout (rectangle in the
// grid) and the default GridLayout component. Everything else lands as
// `any`; library behaviour is JS-runtime untyped.
declare module "react-grid-layout" {
  import type { ComponentType, ReactNode } from "react";

  export interface Layout {
    i: string;
    x: number;
    y: number;
    w: number;
    h: number;
    minW?: number;
    maxW?: number;
    minH?: number;
    maxH?: number;
    moved?: boolean;
    static?: boolean;
    isDraggable?: boolean;
    isResizable?: boolean;
    resizeHandles?: string[];
    isBounded?: boolean;
  }

  export interface GridLayoutProps {
    className?: string;
    style?: Record<string, unknown>;
    width: number;
    autoSize?: boolean;
    cols?: number;
    draggableCancel?: string;
    draggableHandle?: string;
    compactType?: "vertical" | "horizontal" | null;
    layout?: Layout[];
    margin?: [number, number];
    containerPadding?: [number, number];
    rowHeight?: number;
    isDraggable?: boolean;
    isResizable?: boolean;
    isBounded?: boolean;
    useCSSTransforms?: boolean;
    transformScale?: number;
    allowOverlap?: boolean;
    preventCollision?: boolean;
    resizeHandles?: string[];
    // First arg of every callback is the latest layout. Trailing args
    // (oldItem, newItem, placeholder, mouseEvent, htmlElement) are accepted
    // as opaque so consumers can supply whatever subset they need.
    onLayoutChange?: (layout: Layout[]) => void;
    onDragStart?:    (layout: Layout[], ...rest: any[]) => void;
    onDrag?:         (layout: Layout[], ...rest: any[]) => void;
    onDragStop?:     (layout: Layout[], ...rest: any[]) => void;
    onResizeStart?:  (layout: Layout[], ...rest: any[]) => void;
    onResize?:       (layout: Layout[], ...rest: any[]) => void;
    onResizeStop?:   (layout: Layout[], ...rest: any[]) => void;
    children?: ReactNode;
  }

  const GridLayout: ComponentType<GridLayoutProps>;
  export default GridLayout;
}

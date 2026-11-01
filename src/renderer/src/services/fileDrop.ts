import { useEffect, useRef, type RefObject } from 'react'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { isRunningInTauri } from '@renderer/services/tauriBridge'

interface DropTarget {
  element: HTMLElement
  onDrop: (paths: string[]) => void
  onDraggingChange: (isDragging: boolean) => void
}

const dropTargets = new Set<DropTarget>()
let activeTarget: DropTarget | null = null
let subscription: Promise<() => void> | null = null

function findTargetAt(x: number, y: number): DropTarget | null {
  const elementUnderCursor = document.elementFromPoint(x, y)
  if (!elementUnderCursor) return null
  let best: DropTarget | null = null
  for (const target of dropTargets) {
    if (!target.element.contains(elementUnderCursor)) continue
    if (!best || best.element.contains(target.element)) {
      best = target
    }
  }
  return best
}

function setActiveTarget(next: DropTarget | null): void {
  if (activeTarget === next) return
  activeTarget?.onDraggingChange(false)
  activeTarget = next
  activeTarget?.onDraggingChange(true)
}

function ensureSubscription(): void {
  if (subscription || !isRunningInTauri()) return
  subscription = getCurrentWebview().onDragDropEvent((event) => {
    const payload = event.payload
    if (payload.type === 'leave') {
      setActiveTarget(null)
      return
    }
    const scale = window.devicePixelRatio || 1
    const target = findTargetAt(payload.position.x / scale, payload.position.y / scale)
    if (payload.type === 'drop') {
      setActiveTarget(null)
      if (target && payload.paths.length > 0) {
        target.onDrop(payload.paths)
      }
      return
    }
    setActiveTarget(target)
  })
}

export function useNativeFileDrop(
  elementRef: RefObject<HTMLElement | null>,
  onDrop: (paths: string[]) => void,
  onDraggingChange: (isDragging: boolean) => void
): void {
  const handlers = useRef({ onDrop, onDraggingChange })
  handlers.current = { onDrop, onDraggingChange }

  useEffect(() => {
    const element = elementRef.current
    if (!element || !isRunningInTauri()) return
    const target: DropTarget = {
      element,
      onDrop: (paths) => handlers.current.onDrop(paths),
      onDraggingChange: (isDragging) => handlers.current.onDraggingChange(isDragging)
    }
    dropTargets.add(target)
    ensureSubscription()
    return () => {
      if (activeTarget === target) {
        activeTarget = null
      }
      dropTargets.delete(target)
    }
  }, [elementRef])
}

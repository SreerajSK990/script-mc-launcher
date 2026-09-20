import React, { useEffect, useRef } from 'react'
import {
  SkinViewer,
  WalkingAnimation,
  RunningAnimation,
  FlyingAnimation,
  IdleAnimation,
  WaveAnimation
} from 'skinview3d'
import type { SkinModelType } from '@shared/types/skins'

export type SkinAnimationType = 'idle' | 'walk' | 'run' | 'fly' | 'wave' | 'none'

interface SkinViewer3DProps {
  skinUrl: string
  model?: SkinModelType
  width?: number
  height?: number
  animation?: SkinAnimationType
  autoRotate?: boolean
  className?: string
}

export const SkinViewer3D: React.FC<SkinViewer3DProps> = ({
  skinUrl,
  model = 'classic',
  width = 300,
  height = 420,
  animation = 'walk',
  autoRotate = false,
  className = ''
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const viewerRef = useRef<SkinViewer | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return

    const viewer = new SkinViewer({
      canvas: canvasRef.current,
      width,
      height,
      skin: skinUrl,
      model: model === 'slim' ? 'slim' : 'default'
    })

    viewer.camera.position.z = 65
    viewer.camera.position.y = -2
    viewer.autoRotate = autoRotate
    viewer.autoRotateSpeed = 1.2

    // Apply animation
    applyAnimation(viewer, animation)

    viewerRef.current = viewer

    return () => {
      viewer.dispose()
      viewerRef.current = null
    }
  }, [])

  // Update skin texture or model
  useEffect(() => {
    if (!viewerRef.current || !skinUrl) return
    try {
      viewerRef.current.loadSkin(skinUrl, {
        model: model === 'slim' ? 'slim' : 'default'
      })
    } catch (err) {
      console.warn('Failed to load skin into 3D viewer:', err)
    }
  }, [skinUrl, model])

  // Update animation
  useEffect(() => {
    if (!viewerRef.current) return
    applyAnimation(viewerRef.current, animation)
  }, [animation])

  // Update autoRotate
  useEffect(() => {
    if (!viewerRef.current) return
    viewerRef.current.autoRotate = autoRotate
  }, [autoRotate])

  // Resize canvas when width/height changes
  useEffect(() => {
    if (!viewerRef.current) return
    viewerRef.current.setSize(width, height)
  }, [width, height])

  function applyAnimation(viewer: SkinViewer, anim: SkinAnimationType) {
    switch (anim) {
      case 'idle':
        viewer.animation = new IdleAnimation()
        break
      case 'walk':
        viewer.animation = new WalkingAnimation()
        break
      case 'run':
        viewer.animation = new RunningAnimation()
        break
      case 'fly':
        viewer.animation = new FlyingAnimation()
        break
      case 'wave':
        viewer.animation = new WaveAnimation()
        break
      case 'none':
      default:
        viewer.animation = null
        break
    }
  }

  return (
    <div className={`relative flex items-center justify-center select-none ${className}`}>
      <canvas
        ref={canvasRef}
        className="cursor-grab active:cursor-grabbing rounded-2xl drop-shadow-2xl"
      />
    </div>
  )
}

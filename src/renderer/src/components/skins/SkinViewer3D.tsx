import React, { useEffect, useRef } from 'react'
import {
  SkinViewer,
  WalkingAnimation,
  RunningAnimation,
  FlyingAnimation,
  IdleAnimation,
  WaveAnimation
} from 'skinview3d'
import type { SkinModelType, BackEquipmentType } from '@shared/types/skins'

export type SkinAnimationType = 'idle' | 'walk' | 'run' | 'fly' | 'wave' | 'none'

interface SkinViewer3DProps {
  skinUrl: string
  model?: SkinModelType
  capeUrl?: string | null
  backEquipment?: BackEquipmentType
  width?: number
  height?: number
  animation?: SkinAnimationType
  autoRotate?: boolean
  className?: string
}

export const SkinViewer3D: React.FC<SkinViewer3DProps> = ({
  skinUrl,
  model = 'classic',
  capeUrl = null,
  backEquipment = 'cape',
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
      zoom: 0.95
    })

    viewer.autoRotate = autoRotate
    viewer.autoRotateSpeed = 1.0

    applyAnimation(viewer, animation)

    if (skinUrl) {
      viewer
        .loadSkin(skinUrl, {
          model: model === 'slim' ? 'slim' : 'default'
        })
        .then(() => {
          viewer.playerObject.skin.visible = true
        })
        .catch((err) => {
          console.warn('Initial skin load failed:', err)
        })
    }

    if (capeUrl && backEquipment !== 'none') {
      viewer
        .loadCape(capeUrl, {
          backEquipment: backEquipment === 'elytra' ? 'elytra' : 'cape'
        })
        .catch((err) => {
          console.warn('Initial cape load failed:', err)
        })
    }

    viewerRef.current = viewer

    return () => {
      viewer.dispose()
      viewerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!viewerRef.current || !skinUrl) return
    viewerRef.current
      .loadSkin(skinUrl, {
        model: model === 'slim' ? 'slim' : 'default'
      })
      .then(() => {
        if (viewerRef.current) {
          viewerRef.current.playerObject.skin.visible = true
        }
      })
      .catch((err) => {
        console.warn('Failed to load skin into 3D viewer:', err)
      })
  }, [skinUrl, model])

  useEffect(() => {
    if (!viewerRef.current) return
    if (capeUrl && backEquipment !== 'none') {
      try {
        const res = viewerRef.current.loadCape(capeUrl, {
          backEquipment: backEquipment === 'elytra' ? 'elytra' : 'cape'
        })
        if (res && typeof res.catch === 'function') {
          res.catch((err) => {
            console.warn('Failed to update cape in 3D viewer:', err)
          })
        }
      } catch (err) {
        console.warn('Failed to update cape in 3D viewer:', err)
      }
    } else {
      try {
        viewerRef.current.loadCape(null)
      } catch {}
    }
  }, [capeUrl, backEquipment])


  useEffect(() => {
    if (!viewerRef.current) return
    applyAnimation(viewerRef.current, animation)
  }, [animation])

  useEffect(() => {
    if (!viewerRef.current) return
    viewerRef.current.autoRotate = autoRotate
  }, [autoRotate])

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

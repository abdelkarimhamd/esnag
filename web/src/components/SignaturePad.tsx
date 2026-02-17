import { Box, Button, Stack, Typography } from '@mui/material'
import { useEffect, useRef, useState, type PointerEvent } from 'react'

interface SignaturePadProps {
  onSignatureChange: (dataUrl: string | null) => void
  disabled?: boolean
  width?: number
  height?: number
}

export const SignaturePad = ({
  onSignatureChange,
  disabled = false,
  width = 640,
  height = 220,
}: SignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    context.fillStyle = '#FFFFFF'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.strokeStyle = '#111827'
    context.lineWidth = 2.4
  }, [])

  const resolvePoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) {
      return { x: 0, y: 0 }
    }

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    }
  }

  const startDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
    if (disabled) {
      return
    }

    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) {
      return
    }

    const point = resolvePoint(event)
    context.beginPath()
    context.moveTo(point.x, point.y)
    setIsDrawing(true)
  }

  const draw = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || disabled) {
      return
    }

    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) {
      return
    }

    const point = resolvePoint(event)
    context.lineTo(point.x, point.y)
    context.stroke()
  }

  const stopDrawing = () => {
    if (!isDrawing) {
      return
    }

    setIsDrawing(false)

    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    onSignatureChange(canvas.toDataURL('image/png'))
  }

  const clear = () => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) {
      return
    }

    context.fillStyle = '#FFFFFF'
    context.fillRect(0, 0, canvas.width, canvas.height)
    onSignatureChange(null)
  }

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">Digital Signature</Typography>

      <Box
        sx={{
          border: '1px dashed #94A3B8',
          borderRadius: 2,
          bgcolor: '#FFFFFF',
          overflow: 'hidden',
        }}
      >
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          style={{ width: '100%', height: `${height}px`, display: 'block', touchAction: 'none' }}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerLeave={stopDrawing}
        />
      </Box>

      <Box>
        <Button variant="outlined" size="small" onClick={clear} disabled={disabled}>
          Clear Signature
        </Button>
      </Box>
    </Stack>
  )
}

import { useMemo } from 'react'
import qrcode from 'qrcode-generator'

/** Renders an otpauth:// URI as an SVG QR code (dark on light in both themes). */
export function TotpQrCode({ uri, label }: { uri: string; label: string }) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(uri)
    qr.make()
    const count = qr.getModuleCount()
    let d = ''
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`
      }
    }
    return { size: count, path: d }
  }, [uri])

  return (
    <svg className="qr-code" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <path d={path} />
    </svg>
  )
}

/** Groups a base32 secret in blocks of four for manual entry. */
export function formatSecret(secret: string) {
  return secret.replace(/(.{4})/g, '$1 ').trim()
}

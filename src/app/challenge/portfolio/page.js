const orientedContainDataURL = async (url, outW, outH) => {
  try {
    const [img, exif] = await Promise.all([loadImage(url), exifr.parse(url)])
    const orientation = exif?.Orientation || 1

    // Handle EXIF rotation first (optional: apply as in `drawOriented`)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = outW
    canvas.height = outH

    // Clear background to white
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, outW, outH)

    let drawW = outW
    let drawH = (img.height / img.width) * drawW
    if (drawH > outH) {
      drawH = outH
      drawW = (img.width / img.height) * drawH
    }

    const offsetX = (outW - drawW) / 2
    const offsetY = (outH - drawH) / 2

    ctx.drawImage(img, offsetX, offsetY, drawW, drawH)
    return canvas.toDataURL('image/jpeg', 0.92)
  } catch (err) {
    console.warn('[orientedContainDataURL] fallback', url, err)
    return await orientedDataURL(url, outW, outH) // fallback to crop logic
  }
}
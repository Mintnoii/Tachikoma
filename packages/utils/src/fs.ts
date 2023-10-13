export const downloadBlob = (fileName: string, res: any) => {
  const urlObject = window.URL || window.webkitURL || window
  const aLink = document.createElementNS('http://www.w3.org/1999/xhtml', 'a')
  const blob = new Blob([res], { type: res.type })
  const blobUrl = urlObject.createObjectURL(blob)
  aLink.setAttribute('href', blobUrl)
  aLink.setAttribute('download', fileName)
  aLink.click()
  urlObject.revokeObjectURL(blobUrl)
}

export const convertFileToBlob = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        const blob = new Blob([reader.result], { type: file.type })
        resolve(blob)
      } else {
        reject(new Error('Failed to convert file to Blob.'))
      }
    }
    reader.onerror = () => {
      reject(new Error('Failed to read file.'))
    }
    reader.readAsArrayBuffer(file)
  })
}

export const download = async (args: { url: string; filename: string }): Promise<boolean> => {
  try {
    const response = await fetch(args.url)
    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}`)
    }
    const blob = await response.blob()
    downloadBlob(args.filename, blob)
    return true
  } catch (error) {
    console.error('Download error:', error)
    return false
  }
}

export default {
  download,
  downloadBlob,
  convertFileToBlob,
}

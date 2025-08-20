export function safeFileName(original = 'upload.jpg') {
  const extMatch = original.match(/\.[a-zA-Z0-9]+$/);
  const ext = (extMatch ? extMatch[0] : '.jpg').toLowerCase();

  const base = original.replace(/\.[^/.]+$/, '');
  const safeBase = base
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();

  return `${safeBase || 'upload'}${ext}`;
}

export function makeUploadPath(userId, prefix, file) {
  const name = safeFileName(file?.name || 'photo.jpg');
  return `${userId}/${prefix}-${Date.now()}-${name}`;
}

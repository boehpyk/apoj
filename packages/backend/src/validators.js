export function validateInputFile(file) {
    if (!file) throw new Error('No file');
    if (!file.mimetype.startsWith('audio')) throw new Error('Invalid type');
    if (file.file.truncated) throw new Error('File too large');
}
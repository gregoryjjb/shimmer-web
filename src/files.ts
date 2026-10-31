export const blobToDataURL = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image'));
    reader.readAsDataURL(blob);
  });

export const fileToString = async (f: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsText(f, 'UTF-8');

    reader.onload = (event) => {
      const raw = event.target?.result || '';

      if (typeof raw === 'string') {
        resolve(raw);
      } else {
        reject(`expected string, got ${typeof raw}`);
      }
    };

    reader.onerror = (event) => {
      reject(event.target?.error || new Error(`Unknown error while reading ${f.name}`));
    };
  });
};

import { Track } from './timeline-data';

export const toLegacyFormat = (tracks: Track[]) => {
  return {
    projectData: {
      name: 'Old format name',
      id: 'old_format_id',
    },
    tracks: tracks.map((track, i) => ({
      id: i,
      keyframes: track.keyframes.map((k) => ({
        time: k.timestamp,
        state: k.value,
      })),
    })),
  };
};

export const downloadFile = (name: string, contents: string) => {
  const file = new File([contents], name, { type: 'text/json' });
  const url = URL.createObjectURL(file);

  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

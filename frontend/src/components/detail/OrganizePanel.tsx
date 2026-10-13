import { useState } from 'react';
import { useTranscriptMutations } from '../../hooks/useTranscripts';

interface OrganizePanelProps {
  transcriptId: string;
  initialFolder: string;
  initialTags: string[];
}

export function OrganizePanel({ transcriptId, initialFolder, initialTags }: OrganizePanelProps) {
  const [folder, setFolder] = useState(initialFolder);
  const [tags, setTags] = useState(initialTags.join(', '));
  const { updateMeta } = useTranscriptMutations();

  function save() {
    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    updateMeta.mutate(
      { id: transcriptId, patch: { folder, tags: tagList } },
      { onError: (err) => alert((err as Error).message) },
    );
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>Organize</h3>
      <label>
        Folder{' '}
        <input
          type="text"
          placeholder="e.g. Interviews"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
        />
      </label>
      <label>
        Tags (comma separated){' '}
        <input
          type="text"
          placeholder="e.g. demo, important"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </label>
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={save}>
        Save folder &amp; tags
      </button>
    </div>
  );
}

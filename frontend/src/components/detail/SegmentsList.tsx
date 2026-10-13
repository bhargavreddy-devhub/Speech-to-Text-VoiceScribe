import { formatClock } from '../../utils/format';
import type { SegmentOut, SpeakerSegmentOut } from '../../types';

interface SegmentsListProps {
  segments: SegmentOut[];
  speakers: SpeakerSegmentOut[];
  onSeek: (start: number) => void;
}

export function SegmentsList({ segments, speakers, onSeek }: SegmentsListProps) {
  if (!segments.length) return null;
  return (
    <div className="segments-list">
      {segments.map((seg, i) => {
        const speaker = speakers.find((s) => seg.start >= s.start && seg.start < s.end);
        return (
          <div className="segment-row" key={i} onClick={() => onSeek(seg.start)}>
            <span className="ts">{formatClock(seg.start)}</span>
            {speaker && <span className="speaker">{speaker.speaker}</span>}
            <span>{seg.text}</span>
          </div>
        );
      })}
    </div>
  );
}

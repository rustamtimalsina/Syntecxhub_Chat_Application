import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2 } from 'lucide-react';

const formatSeconds = (sec) => {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

export default function AudioMessage({ audio, isMine }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(audio.duration || 0);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onTimeUpdate = () => setCurrentTime(el.currentTime);
    const onLoadedMetadata = () => {
      if (el.duration && !isNaN(el.duration)) setDuration(el.duration);
    };
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };

    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('loadedmetadata', onLoadedMetadata);
    el.addEventListener('ended', onEnded);

    return () => {
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('loadedmetadata', onLoadedMetadata);
      el.removeEventListener('ended', onEnded);
    };
  }, []);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      el.play().then(() => setPlaying(true)).catch(() => {});
    }
  };

  const onSeek = (e) => {
    const el = audioRef.current;
    if (!el) return;
    const next = parseFloat(e.target.value);
    el.currentTime = next;
    setCurrentTime(next);
  };

  const toggleSpeed = () => {
    const nextSpeed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(nextSpeed);
    if (audioRef.current) audioRef.current.playbackRate = nextSpeed;
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`audio-message ${isMine ? 'mine' : ''}`}>
      <audio ref={audioRef} src={audio.url} preload="metadata" />

      <button
        type="button"
        className="audio-play-btn"
        onClick={togglePlay}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
      >
        {playing ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: 2 }} />}
      </button>

      <div className="audio-track-wrap">
        <div className="audio-slider-container">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={onSeek}
            className="audio-range"
            aria-label="Audio scrubber"
          />
          <div className="audio-bar-fill" style={{ width: `${progressPct}%` }} />
        </div>

        <div className="audio-meta">
          <span className="mono">{formatSeconds(currentTime)} / {formatSeconds(duration)}</span>
          <button
            type="button"
            className="audio-speed-btn mono"
            onClick={toggleSpeed}
            title="Change playback speed"
          >
            {speed}x
          </button>
        </div>
      </div>

      <Volume2 size={16} className="audio-vol-icon" />
    </div>
  );
}

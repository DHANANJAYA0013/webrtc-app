import { useEffect, useRef } from "react";

export default function VideoTile({ stream, label, isLocal = false, peerId }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const shortId = peerId ? peerId.slice(0, 6) : null;

  return (
    <div className={`video-tile ${isLocal ? "local" : "remote"}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className="video-el"
      />
      <div className="video-label">
        <span className="label-dot" />
        {label || (shortId ? `Peer · ${shortId}` : "Unknown")}
      </div>
    </div>
  );
}

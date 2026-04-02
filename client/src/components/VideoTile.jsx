import { useEffect, useRef } from "react";

export default function VideoTile({
  stream,
  label,
  isLocal = false,
  peerId,
  isVideoEnabled = true,
  isAudioEnabled = true,
  isScreenSharing = false,
}) {
  const videoRef = useRef(null);

  const shortId = peerId ? peerId.slice(0, 6) : null;
  const videoTrack = stream?.getVideoTracks?.()[0];
  const trackSettings = videoTrack?.getSettings?.() || {};
  const isTrackScreenShare =
    Boolean(trackSettings.displaySurface) ||
    /screen|display|window/i.test(videoTrack?.label || "");
  const shouldShowVideo = isVideoEnabled && Boolean(videoTrack);

  useEffect(() => {
    if (!videoRef.current || !stream || !shouldShowVideo) return;

    const el = videoRef.current;
    el.muted = isLocal;

    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }

    const tryPlay = () => {
      const playPromise = el.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          // Some browsers require additional readiness/user interaction.
        });
      }
    };

    if (el.readyState >= 1) {
      tryPlay();
    } else {
      el.onloadedmetadata = tryPlay;
    }

    return () => {
      el.onloadedmetadata = null;
    };
  }, [isLocal, stream, shouldShowVideo]);

  return (
    <div
      className={`video-tile ${isLocal ? "local" : "remote"} ${
        isScreenSharing || isTrackScreenShare ? "screen-share" : ""
      }`}
    >
      {shouldShowVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="video-el"
        />
      ) : (
        <div className="video-placeholder">
          <span className="avatar-circle">
            {(label || shortId || "U").slice(0, 1).toUpperCase()}
          </span>
          <p>Camera Off</p>
        </div>
      )}
      <div className="video-label">
        <span className="label-dot" />
        {label || (shortId ? `Peer · ${shortId}` : "Unknown")}
        {!isAudioEnabled && <span className="muted-chip">Muted</span>}
      </div>
    </div>
  );
}

import VideoTile from "./VideoTile";

export default function Room({ localStream, remoteStreams, roomId, onLeave }) {
  const peerCount = remoteStreams.length;

  const gridClass =
    peerCount === 0
      ? "grid-solo"
      : peerCount === 1
      ? "grid-duo"
      : peerCount <= 3
      ? "grid-trio"
      : "grid-multi";

  return (
    <div className="room">
      {/* Header */}
      <header className="room-header">
        <div className="room-brand">
          <svg width="22" height="22" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="23" stroke="currentColor" strokeWidth="2.5" />
            <path d="M14 20C14 18.343 15.343 17 17 17H25C26.657 17 28 18.343 28 20V28C28 29.657 26.657 31 25 31H17C15.343 31 14 29.657 14 28V20Z" stroke="currentColor" strokeWidth="2.5" />
            <path d="M28 22L34 19V29L28 26V22Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
          </svg>
          <span>NexMeet</span>
        </div>

        <div className="room-info">
          <span className="room-badge">
            <span className="live-dot" />
            LIVE
          </span>
          <span className="room-id-tag">Room: {roomId}</span>
          <span className="peer-count">
            {peerCount + 1} participant{peerCount !== 0 ? "s" : ""}
          </span>
        </div>

        <button className="btn-leave" onClick={onLeave}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Leave
        </button>
      </header>

      {/* Remote Streams */}
      <main className="streams-area">
        {peerCount === 0 ? (
          <div className="waiting-state">
            <div className="waiting-pulse" />
            <p>Waiting for others to join…</p>
            <p className="waiting-hint">Share room ID <strong>{roomId}</strong> with your friends</p>
          </div>
        ) : (
          <section className="remote-section">
            <div className={`remote-grid ${gridClass}`}>
              {remoteStreams.map(({ peerId, stream }) => (
                <VideoTile key={peerId} stream={stream} peerId={peerId} />
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Local Video (always pinned bottom-right) */}
      <div className="local-pip">
        <VideoTile stream={localStream} label="You" isLocal />
      </div>
    </div>
  );
}

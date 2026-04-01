export default function Controls({
  isVideoEnabled,
  isAudioEnabled,
  isScreenSharing,
  isChatOpen,
  unreadCount = 0,
  onToggleVideo,
  onToggleAudio,
  onToggleScreenShare,
  onToggleChat,
  onLeave,
}) {
  return (
    <div className="controls-bar">
      <button
        className={`control-btn ${isVideoEnabled ? "" : "off"}`}
        onClick={onToggleVideo}
        title={isVideoEnabled ? "Turn video off" : "Turn video on"}
      >
        {isVideoEnabled ? "Video On" : "Video Off"}
      </button>

      <button
        className={`control-btn ${isAudioEnabled ? "" : "off"}`}
        onClick={onToggleAudio}
        title={isAudioEnabled ? "Mute microphone" : "Unmute microphone"}
      >
        {isAudioEnabled ? "Audio On" : "Muted"}
      </button>

      <button
        className={`control-btn ${isScreenSharing ? "active" : ""}`}
        onClick={onToggleScreenShare}
        title={isScreenSharing ? "Stop screen sharing" : "Start screen sharing"}
      >
        {isScreenSharing ? "Stop Share" : "Share Screen"}
      </button>

      <button
        className={`control-btn chat-btn ${isChatOpen ? "active" : ""}`}
        onClick={onToggleChat}
        title="Toggle chat"
      >
        Chat
        {unreadCount > 0 && (
          <span className="chat-unread-badge">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      <button className="control-btn danger" onClick={onLeave} title="Leave call">
        Leave
      </button>
    </div>
  );
}

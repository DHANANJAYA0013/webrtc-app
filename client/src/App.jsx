import { useWebRTC } from "./hooks/useWebRTC";
import Lobby from "./components/Lobby";
import Room from "./components/Room";
import "./App.css";

export default function App() {
  const {
    selfId,
    localStream,
    remoteStreams,
    chatMessages,
    mediaStateByPeer,
    isInCall,
    roomId,
    error,
    isVideoEnabled,
    isAudioEnabled,
    isScreenSharing,
    startCall,
    sendChatMessage,
    toggleVideo,
    toggleAudio,
    toggleScreenShare,
    leaveCall,
  } = useWebRTC();

  return (
    <div className="app">
      {!isInCall && (
        <Lobby
          onJoin={(room) => {
            if (!room || !room.trim()) return;
            startCall(room.trim());
          }}
          error={error}
        />
      )}

      {isInCall && (
        <Room
          localStream={localStream}
          remoteStreams={remoteStreams}
          roomId={roomId}
          chatMessages={chatMessages}
          onSendChatMessage={sendChatMessage}
          selfId={selfId}
          mediaStateByPeer={mediaStateByPeer}
          isVideoEnabled={isVideoEnabled}
          isAudioEnabled={isAudioEnabled}
          isScreenSharing={isScreenSharing}
          onToggleVideo={toggleVideo}
          onToggleAudio={toggleAudio}
          onToggleScreenShare={toggleScreenShare}
          onLeave={() => {
            leaveCall();
          }}
        />
      )}

    </div>


  );
}
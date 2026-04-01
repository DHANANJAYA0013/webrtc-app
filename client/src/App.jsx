import { useWebRTC } from "./hooks/useWebRTC";
import Lobby from "./components/Lobby";
import Room from "./components/Room";
import "./App.css";

export default function App() {
  const {
    selfId,
    selfName,
    localStream,
    remoteStreams,
    peerNames,
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
          onJoin={({ roomId: room, userName }) => {
            if (!room || !room.trim() || !userName || !userName.trim()) return;
            startCall(room.trim(), userName.trim());
          }}
          error={error}
        />
      )}

      {isInCall && (
        <Room
          localStream={localStream}
          remoteStreams={remoteStreams}
          roomId={roomId}
          peerNames={peerNames}
          chatMessages={chatMessages}
          onSendChatMessage={sendChatMessage}
          selfId={selfId}
          selfName={selfName}
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
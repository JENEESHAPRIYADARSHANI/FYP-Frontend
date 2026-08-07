// Google's public STUN server. A TURN server only gets added if cross-network
// testing shows NAT traversal actually failing (see build guideline, phase 8).
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

export function createPeerConnection() {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS });
}

// Client-side call recording. There's no media server or file storage in
// this project (yet), so recording happens entirely in the browser: both
// video feeds are composited onto a canvas (so the file shows the actual
// conversation, not just one side), both audio tracks are mixed with the
// Web Audio API, and a MediaRecorder turns that combined stream into a
// downloadable .webm — saved straight to the recording person's device,
// nothing ever leaves it.

const FRAME_RATE = 25;

function pickMimeType() {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function createCallRecorder({ localVideoEl, remoteVideoEl, localStream, remoteStream }) {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");

  let rafId = null;
  function drawFrame() {
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (remoteVideoEl && remoteVideoEl.readyState >= 2) {
      ctx.drawImage(remoteVideoEl, 0, 0, canvas.width, canvas.height);
    }

    if (localVideoEl && localVideoEl.readyState >= 2 && localVideoEl.videoWidth) {
      const pipWidth = canvas.width * 0.22;
      const pipHeight = pipWidth * (localVideoEl.videoHeight / localVideoEl.videoWidth);
      const x = canvas.width - pipWidth - 24;
      const y = canvas.height - pipHeight - 24;
      ctx.save();
      // Mirror the self-view in the recording too, matching what's shown live.
      ctx.translate(x + pipWidth, y);
      ctx.scale(-1, 1);
      ctx.drawImage(localVideoEl, 0, 0, pipWidth, pipHeight);
      ctx.restore();
    }

    rafId = requestAnimationFrame(drawFrame);
  }
  rafId = requestAnimationFrame(drawFrame);

  const canvasStream = canvas.captureStream(FRAME_RATE);

  const audioCtx = new AudioContext();
  const destination = audioCtx.createMediaStreamDestination();
  [localStream, remoteStream].forEach((stream) => {
    if (!stream?.getAudioTracks?.().length) return;
    try {
      audioCtx.createMediaStreamSource(stream).connect(destination);
    } catch {
      // A track already routed elsewhere can occasionally refuse a second
      // source node — recording still proceeds with whichever side connected.
    }
  });

  const combined = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...destination.stream.getAudioTracks(),
  ]);

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(combined, mimeType ? { mimeType } : undefined);
  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start(1000);

  function stop() {
    return new Promise((resolve) => {
      recorder.onstop = () => {
        cancelAnimationFrame(rafId);
        audioCtx.close().catch(() => {});
        resolve(new Blob(chunks, { type: mimeType || "video/webm" }));
      };
      recorder.stop();
    });
  }

  return { stop };
}

export function downloadRecording(blob, roomCode) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.href = url;
  link.download = `hastha-${roomCode}-${stamp}.webm`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

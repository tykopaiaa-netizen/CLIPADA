// Mediabunny 1.61.1, MPL-2.0. Packaged worker.
const mediaStreamTrackProcessorWorkerCode = () => {
    const sendMessage = (message, transfer) => {
        if (transfer) {
            self.postMessage(message, { transfer });
        }
        else {
            self.postMessage(message);
        }
    };
    // Immediately send a message to the main thread, letting them know of the support
    sendMessage({
        type: 'support',
        supported: typeof MediaStreamTrackProcessor !== 'undefined',
    });
    const abortControllers = new Map();
    const activeTracks = new Map();
    self.addEventListener('message', (event) => {
        const message = event.data;
        switch (message.type) {
            case 'videoTrack':
                {
                    activeTracks.set(message.trackId, message.track);
                    const processor = new MediaStreamTrackProcessor({ track: message.track });
                    const consumer = new WritableStream({
                        write: (videoFrame) => {
                            if (!activeTracks.has(message.trackId)) {
                                videoFrame.close();
                                return;
                            }
                            // Send it to the main thread
                            sendMessage({
                                type: 'videoFrame',
                                trackId: message.trackId,
                                videoFrame,
                            }, [videoFrame]);
                        },
                    });
                    const abortController = new AbortController();
                    abortControllers.set(message.trackId, abortController);
                    processor.readable.pipeTo(consumer, {
                        signal: abortController.signal,
                    }).catch((error) => {
                        // Handle AbortError silently
                        if (error instanceof DOMException && error.name === 'AbortError')
                            return;
                        sendMessage({
                            type: 'error',
                            trackId: message.trackId,
                            error,
                        });
                    });
                }
                ;
                break;
            case 'stopTrack':
                {
                    const abortController = abortControllers.get(message.trackId);
                    if (abortController) {
                        abortController.abort();
                        abortControllers.delete(message.trackId);
                    }
                    const track = activeTracks.get(message.trackId);
                    track?.stop();
                    activeTracks.delete(message.trackId);
                    sendMessage({
                        type: 'trackStopped',
                        trackId: message.trackId,
                    });
                }
                ;
                break;
            default: assertNever(message);
        }
    });
};
mediaStreamTrackProcessorWorkerCode();

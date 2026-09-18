import { sameViewport } from './geometry.js';
export const FRAME_MAX_AGE = 30000;
const MAX_BUFFER_BYTES = 24 * 1024 * 1024;
const MAX_BUFFER_FRAMES = 4;
export function sameBounds(left, right) {
    return ['x', 'y', 'width', 'height'].every((key) => {
        const coordinate = key;
        return Math.abs(left[coordinate] - right[coordinate]) <= 1;
    });
}
/** Matching is deliberately strict: no image is better than a plausible wrong one. */
export function frameMatchesAction(frame, guideId, action) {
    const snapshot = frame.snapshot;
    if (frame.guideId !== guideId || snapshot.documentToken !== action.documentToken ||
        snapshot.stateRevision !== action.stateRevision || !snapshot.toolbarHidden ||
        frame.capturedAt > action.observedAt || action.observedAt - frame.capturedAt > FRAME_MAX_AGE ||
        !sameViewport(snapshot.viewport, action.viewport) || !action.box) {
        return false;
    }
    const target = snapshot.targets.find((item) => item.token === action.targetToken);
    return Boolean(target && sameBounds(target.box, action.box));
}
/** A bounded, worker-local cache. Only privacy-masked PNGs may be inserted. */
export class FrameBuffer {
    frames = [];
    add(frame) {
        if (frame.image.blob.size > MAX_BUFFER_BYTES || !frame.snapshot.toolbarHidden)
            return;
        this.frames.push(frame);
        let bytes = this.frames.reduce((total, item) => total + item.image.blob.size, 0);
        while (this.frames.length > MAX_BUFFER_FRAMES || bytes > MAX_BUFFER_BYTES) {
            bytes -= this.frames.shift()?.image.blob.size ?? 0;
        }
    }
    find(guideId, action) {
        for (let index = this.frames.length - 1; index >= 0; index -= 1) {
            const frame = this.frames[index];
            if (frame && frameMatchesAction(frame, guideId, action))
                return frame;
        }
        return undefined;
    }
    clear() { this.frames = []; }
}

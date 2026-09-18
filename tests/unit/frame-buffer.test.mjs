import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameBuffer, frameMatchesAction, sameBounds, FRAME_MAX_AGE } from '../../dist/core/frame-buffer.js';
const box = { x: 20, y: 30, width: 100, height: 40 };
const viewport = { width: 1000, height: 800, scrollX: 0, scrollY: 0 };
function frame(overrides = {}) {
  return { guideId: 'guide-one', snapshot: { documentToken: 'doc-one', origin: 'https://example.org', stateRevision: 4, interactionRevision: 1, toolbarHidden: true, viewport, protectedAreas: [], targets: [{ token: 'target-one', box }] }, capturedAt: 1000, image: { blob: new Blob(['masked']), width: 1000, height: 800 }, ...overrides };
}
function action(overrides = {}) {
  return { eventId: 'event-one', kind: 'click', label: 'Save', documentToken: 'doc-one', targetToken: 'target-one', stateRevision: 4, observedAt: 1200, box, viewport, ...overrides };
}
test('an exact pre-click frame matches its visible control', () => assert.equal(frameMatchesAction(frame(), 'guide-one', action()), true));
for (const [name, patch] of [
  ['a different document', { documentToken: 'doc-two' }],
  ['a new page revision', { stateRevision: 5 }],
  ['a different scroll position', { viewport: { ...viewport, scrollY: 100 } }],
  ['an altered viewport width', { viewport: { ...viewport, width: 800 } }],
  ['a newly created control', { targetToken: 'new-target' }],
  ['a moved target', { box: { ...box, x: 100 } }],
  ['a resized target', { box: { ...box, width: 300 } }],
  ['an absent target rectangle', { box: null }],
  ['a future screenshot', { observedAt: 999 }],
  ['an expired frame', { observedAt: 1000 + FRAME_MAX_AGE + 1 }],
]) {
  test(`reject ${name}`, () => assert.equal(frameMatchesAction(frame(), 'guide-one', action(patch)), false));
}
test('frames from a different guide cannot be reused', () => assert.equal(frameMatchesAction(frame(), 'another-guide', action()), false));
test('a visible toolbar disqualifies the image', () => { const entry = frame(); entry.snapshot.toolbarHidden = false; assert.equal(frameMatchesAction(entry, 'guide-one', action()), false); });
test('an occluded target not in the frame cannot be annotated', () => { const entry = frame(); entry.snapshot.targets = []; assert.equal(frameMatchesAction(entry, 'guide-one', action()), false); });
test('subpixel layout rounding is tolerated', () => assert.equal(sameBounds(box, { ...box, x: 20.4, width: 100.4 }), true));
test('more than one pixel of target movement is not tolerated', () => assert.equal(sameBounds(box, { ...box, y: 32 }), false));
test('buffer chooses newest qualifying pre-action frame, not newer post-action image', () => {
  const buffer = new FrameBuffer();
  buffer.add(frame());
  buffer.add(frame({ capturedAt: 1100 }));
  buffer.add(frame({ capturedAt: 1300 }));
  assert.equal(buffer.find('guide-one', action()).capturedAt, 1100);
});
test('several separate clicks may reference the same stable state', () => {
  const buffer = new FrameBuffer();
  buffer.add(frame());
  assert.equal(buffer.find('guide-one', action()).capturedAt, 1000);
  assert.equal(buffer.find('guide-one', action({ eventId: 'event-two', observedAt: 1400 })).capturedAt, 1000);
});
test('only four frames are retained', () => {
  const buffer = new FrameBuffer();
  for (let index = 0; index < 5; index++)
    buffer.add(frame({ capturedAt: 1000 + index * 100 }));
  assert.equal(buffer.find('guide-one', action({ observedAt: 1050 })), undefined);
  assert.equal(buffer.find('guide-one', action({ observedAt: 1150 })).capturedAt, 1100);
});
test('oversized frames are not retained', () => {
  const buffer = new FrameBuffer();
  buffer.add(frame({ image: { blob: { size: 25 * 1024 * 1024 }, width: 1, height: 1 } }));
  assert.equal(buffer.find('guide-one', action()), undefined);
});
test('combined memory budget evicts older entries', () => {
  const buffer = new FrameBuffer();
  const image = { blob: { size: 13 * 1024 * 1024 }, width: 1, height: 1 };
  buffer.add(frame({ image }));
  buffer.add(frame({ image, capturedAt: 1100 }));
  assert.equal(buffer.find('guide-one', action({ observedAt: 1050 })), undefined);
});
test('toolbar-visible images cannot enter the buffer', () => {
  const buffer = new FrameBuffer();
  const entry = frame();
  entry.snapshot.toolbarHidden = false;
  buffer.add(entry);
  assert.equal(buffer.find('guide-one', action()), undefined);
});
test('clearing the buffer releases every retained frame', () => {
  const buffer = new FrameBuffer();
  buffer.add(frame());
  buffer.clear();
  assert.equal(buffer.find('guide-one', action()), undefined);
});

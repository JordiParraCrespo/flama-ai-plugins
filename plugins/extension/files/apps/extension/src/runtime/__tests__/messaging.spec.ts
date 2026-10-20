import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { broadcast, listen, MessageError, send } from '../messaging';
import { createFakeChrome, type FakeChrome } from './fake-chrome';

/**
 * The bus every context talks over. What breaks if these fail: a handler's
 * error arrives as `undefined` and the caller carries on as if it worked; a
 * web page's message is answered; two contexts answer one message.
 */
describe('messaging', () => {
  let fake: FakeChrome;

  beforeEach(() => {
    fake = createFakeChrome();
    vi.stubGlobal('chrome', fake.chrome);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('carries a message to the context that answers it and the answer back', async () => {
    fake.as('sidepanel');
    const handler = vi.fn(async () => undefined);
    listen({ 'session/changed': handler });

    fake.as('popup');
    await expect(send('session/changed')).resolves.toBeUndefined();
    expect(handler).toHaveBeenCalledOnce();
  });

  it("re-throws a handler's failure at the caller, code included", async () => {
    fake.as('worker');
    listen({
      'session/changed': () => {
        throw new MessageError('nope', 'signed-out');
      },
    });

    fake.as('popup');
    const failure = send('session/changed');
    await expect(failure).rejects.toBeInstanceOf(MessageError);
    await expect(failure).rejects.toMatchObject({ message: 'nope', code: 'signed-out' });
  });

  it('answers nothing that did not come from this extension', async () => {
    fake.as('worker');
    const handler = vi.fn(async () => undefined);
    listen({ 'session/changed': handler });

    await expect(
      fake.sendFrom({ id: 'some-other-extension' }, { flama: 1, type: 'session/changed' }),
    ).rejects.toThrow('Receiving end does not exist');
    expect(handler).not.toHaveBeenCalled();
  });

  it('leaves a message it has no handler for to the context that has one', async () => {
    fake.as('worker');
    listen({});
    fake.as('sidepanel');
    listen({ 'session/changed': async () => undefined });

    fake.as('popup');
    await expect(send('session/changed')).resolves.toBeUndefined();
  });

  it('ignores anything on the bus that is not one of our envelopes', async () => {
    fake.as('worker');
    const handler = vi.fn(async () => undefined);
    listen({ 'session/changed': handler });

    fake.as('popup');
    await expect(chrome.runtime.sendMessage({ type: 'session/changed' })).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  it('broadcasts quietly when no other page is open', async () => {
    fake.as('popup');
    await expect(broadcast('session/changed')).resolves.toBeUndefined();
  });

  it('broadcasts quietly when the only context listening has no handler for it', async () => {
    vi.spyOn(chrome.runtime, 'sendMessage').mockRejectedValueOnce(
      new Error('The message port closed before a response was received.'),
    );
    await expect(broadcast('session/changed')).resolves.toBeUndefined();
  });

  it('still surfaces any other failure of a broadcast', async () => {
    vi.spyOn(chrome.runtime, 'sendMessage').mockRejectedValueOnce(
      new Error('Extension context invalidated.'),
    );
    await expect(broadcast('session/changed')).rejects.toThrow('context invalidated');
  });

  it('stops answering once the listener is removed', async () => {
    fake.as('worker');
    const stop = listen({ 'session/changed': async () => undefined });
    stop();

    fake.as('popup');
    await expect(send('session/changed')).rejects.toThrow('Receiving end does not exist');
  });
});

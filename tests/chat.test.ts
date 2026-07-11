import { test, expect } from 'bun:test'
import { WebView } from 'bun'
import index from '../demo/index.html'

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor(
  view: WebView,
  predicate: string,
  name: string,
  timeout = 30000,
) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const result = await view.evaluate(predicate)
      if (result) return result
    } catch {
      // ignore
    }
    await wait(500)
  }

  const text = await view.evaluate('document.body.innerText')
  const errorMsg = await view.evaluate(
    '(() => { const el = document.querySelector(\'[data-testid="error-message"]\'); return el ? el.innerText : null; })()',
  )
  console.log(`--- [DEBUG ${name}] Page text: ---`)
  console.log(text)
  if (errorMsg) {
    console.log(`--- [DEBUG ${name}] UI Error Message: ---`)
    console.log(errorMsg)
  }
  throw new Error(`Timeout waiting for ${predicate} on ${name}`)
}

test('1-on-1 chat connection and messaging', async () => {
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    routes: {
      '/': index,
    },
  })

  const url = server.url.toString()
  const hostView = new WebView()
  const joinerView = new WebView()

  try {
    await hostView.navigate(url)
    await joinerView.navigate(url)

    // Wait for hydration via data-testid
    console.log('--- WAITING FOR HYDRATION ---')
    await waitFor(
      hostView,
      'document.querySelector(\'[data-testid="host-button"]\') !== null',
      'HOST_INIT',
    )
    await waitFor(
      joinerView,
      'document.querySelector(\'[data-testid="host-button"]\') !== null',
      'JOINER_INIT',
    )

    // Host Step
    console.log('--- HOST: Starting session ---')
    await hostView.evaluate(
      'document.querySelector(\'[data-testid="host-button"]\').click()',
    )

    console.log('--- HOST: Waiting for offer token ---')
    const offerToken = (await waitFor(
      hostView,
      '(() => { const el = document.querySelector(\'[data-testid="offer-token"]\'); return el && el.value ? el.value : null; })()',
      'HOST_OFFER',
      30000,
    )) as string
    console.log('--- HOST: Offer token generated ---')
    expect(offerToken).toBeTruthy()

    // Joiner Step
    console.log('--- JOINER: Joining session ---')
    await joinerView.evaluate(
      'document.querySelector(\'[data-testid="join-button"]\').click()',
    )

    console.log('--- JOINER: Inputting offer token ---')
    await waitFor(
      joinerView,
      'document.querySelector(\'[data-testid="offer-input"]\') !== null',
      'JOINER_INPUT_READY',
    )
    await joinerView.evaluate(`(() => {
      const el = document.querySelector('[data-testid="offer-input"]');
      if (el) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(el, ${JSON.stringify(offerToken)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`)

    await wait(1000)
    console.log('--- JOINER: Generating answer ---')
    await joinerView.evaluate(
      'document.querySelector(\'[data-testid="generate-answer-button"]\').click()',
    )

    console.log('--- JOINER: Waiting for answer token ---')
    const answerToken = (await waitFor(
      joinerView,
      '(() => { const el = document.querySelector(\'[data-testid="answer-token"]\'); return el && el.value ? el.value : null; })()',
      'JOINER_ANSWER',
      30000,
    )) as string
    console.log('--- JOINER: Answer token generated ---')
    expect(answerToken).toBeTruthy()

    // Connect Host Step
    console.log('--- HOST: Inputting answer token ---')
    await hostView.evaluate(`(() => {
      const el = document.querySelector('[data-testid="answer-input"]');
      if (el) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(el, ${JSON.stringify(answerToken)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`)

    await wait(1000)
    console.log('--- HOST: Connecting ---')
    await hostView.evaluate(
      'document.querySelector(\'[data-testid="connect-button"]\').click()',
    )

    // Verify Connection (Exact status match to prevent false positives from 'disconnected')
    console.log('--- WAITING FOR CONNECTION ---')
    const exactStatusCheck =
      "(() => { const el = document.querySelector('[data-testid=\"status-badge\"]'); return el && el.innerText.trim().toLowerCase() === 'connected' ? 'connected' : null; })()"
    await waitFor(hostView, exactStatusCheck, 'HOST_CONNECTION', 60000)
    await waitFor(joinerView, exactStatusCheck, 'JOINER_CONNECTION', 60000)
    console.log('--- CONNECTED! ---')

    // Messaging Test
    console.log('--- TESTING MESSAGING ---')
    const testMessage =
      'Hello from Host! ' + Math.random().toString(36).substring(7)

    // Host sends message
    await hostView.evaluate(`(() => {
      const input = document.querySelector('[data-testid="chat-input"]');
      const button = document.querySelector('[data-testid="send-button"]');
      if (input && button) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(testMessage)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        button.click();
      }
    })()`)

    console.log('--- WAITING FOR MESSAGE ON JOINER ---')
    await waitFor(
      joinerView,
      `(() => { const el = document.querySelector('[data-testid="chat-messages"]'); return el && el.innerText.includes(${JSON.stringify(testMessage)}) ? true : null; })()`,
      'JOINER_MSG',
      20000,
    )
    console.log('--- MESSAGE RECEIVED BY JOINER! ---')

    const replyMessage =
      'Hello back from Joiner! ' + Math.random().toString(36).substring(7)

    // Joiner sends reply
    await joinerView.evaluate(`(() => {
      const input = document.querySelector('[data-testid="chat-input"]');
      const button = document.querySelector('[data-testid="send-button"]');
      if (input && button) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(replyMessage)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        button.click();
      }
    })()`)

    console.log('--- WAITING FOR REPLY ON HOST ---')
    await waitFor(
      hostView,
      `(() => { const el = document.querySelector('[data-testid="chat-messages"]'); return el && el.innerText.includes(${JSON.stringify(replyMessage)}) ? true : null; })()`,
      'HOST_MSG',
      10000,
    )
    console.log('--- REPLY RECEIVED BY HOST! ---')
  } finally {
    hostView.close()
    joinerView.close()
    server.stop(true)
  }
}, 300000)

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

    // Wait for hydration
    console.log('--- WAITING FOR HYDRATION ---')
    await waitFor(
      hostView,
      "document.body.innerText.includes('Host Session')",
      'HOST_INIT',
    )
    await waitFor(
      joinerView,
      "document.body.innerText.includes('Host Session')",
      'JOINER_INIT',
    )

    // Host Step
    console.log('--- HOST: Starting session ---')
    await hostView.evaluate(
      "Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Host')).click()",
    )

    console.log('--- HOST: Waiting for offer token ---')
    const offerToken = (await waitFor(
      hostView,
      "(() => { const el = Array.from(document.querySelectorAll('textarea')).find(t => t.placeholder.includes('Generating') || t.readOnly); return el && el.value ? el.value : null; })()",
      'HOST_OFFER',
      30000,
    )) as string
    console.log('--- HOST: Offer token generated ---')
    expect(offerToken).toBeTruthy()

    // Joiner Step
    console.log('--- JOINER: Joining session ---')
    await joinerView.evaluate(
      "Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Join')).click()",
    )

    console.log('--- JOINER: Inputting offer token ---')
    await waitFor(
      joinerView,
      "document.querySelectorAll('textarea').length > 0",
      'JOINER_INPUT_READY',
    )
    await joinerView.evaluate(`(() => {
      const el = Array.from(document.querySelectorAll('textarea')).find(t => t.placeholder.includes('Paste'));
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
      "Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Generate Answer')).click()",
    )

    console.log('--- JOINER: Waiting for answer token ---')
    const answerToken = (await waitFor(
      joinerView,
      "(() => { const el = Array.from(document.querySelectorAll('textarea')).find(t => t.readOnly && t.value && !t.value.startsWith('eyJzZHAiOnsidHlwZSI6Im9mZmVyI')); return el ? el.value : null; })()",
      'JOINER_ANSWER',
      30000,
    )) as string
    console.log('--- JOINER: Answer token generated ---')
    expect(answerToken).toBeTruthy()

    // Connect Host Step
    console.log('--- HOST: Inputting answer token ---')
    await hostView.evaluate(`(() => {
      const el = Array.from(document.querySelectorAll('textarea')).find(t => t.placeholder.includes('Paste'));
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
      "Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Connect').click()",
    )

    // Verify Connection
    console.log('--- WAITING FOR CONNECTION ---')
    await waitFor(
      hostView,
      "document.body.innerText.toLowerCase().includes('connected')",
      'HOST_CONNECTION',
      60000,
    )
    await waitFor(
      joinerView,
      "document.body.innerText.toLowerCase().includes('connected')",
      'JOINER_CONNECTION',
      60000,
    )
    console.log('--- CONNECTED! ---')

    // Messaging Test
    console.log('--- TESTING MESSAGING ---')
    const testMessage =
      'Hello from Host! ' + Math.random().toString(36).substring(7)

    // Host sends message
    await hostView.evaluate(`(() => {
      const input = document.querySelector('input[type="text"]');
      const button = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Send');
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
      `document.body.innerText.includes(${JSON.stringify(testMessage)})`,
      'JOINER_MSG',
      20000,
    )
    console.log('--- MESSAGE RECEIVED BY JOINER! ---')

    const replyMessage =
      'Hello back from Joiner! ' + Math.random().toString(36).substring(7)

    // Joiner sends reply
    await joinerView.evaluate(`(() => {
      const input = document.querySelector('input[type="text"]');
      const button = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Send');
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
      `document.body.innerText.includes(${JSON.stringify(replyMessage)})`,
      'HOST_MSG',
      10000,
    )
    console.log('--- REPLY RECEIVED BY HOST! ---')
  } finally {
    hostView.close()
    joinerView.close()
    server.stop()
  }
}, 300000)

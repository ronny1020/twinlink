import { test, expect } from 'bun:test'
import { WebView } from 'bun'
import index from '../demo/index.html'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(view: WebView, predicate: string, timeout = 10000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const result = await view.evaluate(predicate)
      if (result) return result
    } catch {
      // ignore errors during evaluation
    }
    await wait(200)
  }

  throw new Error(`Timeout waiting for ${predicate}`)
}

test('1-on-1 chat connection and messaging', async () => {
  const server = Bun.serve({
    port: 0,
    routes: {
      '/': index,
    },
  })

  const url = server.url.toString() + '?noice=true'
  const hostView = new WebView()
  const joinerView = new WebView()

  try {
    await hostView.navigate(url)
    await joinerView.navigate(url)

    // Host Step
    console.log('--- HOST: Starting session ---')
    await wait(1000)
    await hostView.evaluate(
      "Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Host')).click()",
    )

    console.log('--- HOST: Waiting for offer token ---')
    const offerToken = (await waitFor(
      hostView,
      "(() => { const el = document.querySelectorAll('textarea')[0]; return el && el.value ? el.value : null; })()",
      20000,
    )) as string
    console.log(
      '--- HOST: Offer token generated (length:',
      offerToken.length,
      ') ---',
    )
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
    )
    await joinerView.evaluate(`(() => {
      const el = document.querySelector('textarea');
      if (el) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(el, ${JSON.stringify(offerToken)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`)

    await wait(500)
    console.log('--- JOINER: Generating answer ---')
    await joinerView.evaluate(
      "Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Answer')).click()",
    )

    console.log('--- JOINER: Waiting for answer token ---')
    const answerToken = (await waitFor(
      joinerView,
      "(() => { const el = document.querySelectorAll('textarea')[1]; return el && el.value ? el.value : null; })()",
      20000,
    )) as string
    console.log(
      '--- JOINER: Answer token generated (length:',
      answerToken.length,
      ') ---',
    )
    expect(answerToken).toBeTruthy()

    // Connect Host Step
    console.log('--- HOST: Inputting answer token ---')
    await hostView.evaluate(`(() => {
      const el = document.querySelectorAll('textarea')[1];
      if (el) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(el, ${JSON.stringify(answerToken)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`)

    await wait(500)
    console.log('--- HOST: Connecting ---')
    await hostView.evaluate(
      "Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Connect')).click()",
    )

    // Verify Connection
    console.log('--- WAITING FOR CONNECTION ---')
    const hostStatus = await waitFor(
      hostView,
      "document.querySelector('strong').innerText === 'connected' ? 'connected' : null",
      20000,
    )
    const joinerStatus = await waitFor(
      joinerView,
      "document.querySelector('strong').innerText === 'connected' ? 'connected' : null",
      20000,
    )

    console.log('--- CONNECTION ESTABLISHED ---')
    expect(hostStatus).toBe('connected')
    expect(joinerStatus).toBe('connected')

    // Messaging
    console.log('--- SENDING MESSAGE ---')
    const messageText = 'Hello from Host!'
    await hostView.evaluate(`(() => {
      const el = document.querySelector('input[placeholder="Type a message..."]');
      if (el) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, ${JSON.stringify(messageText)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`)
    await hostView.evaluate(
      "Array.from(document.querySelectorAll('button')).find(b => b.innerText === 'Send').click()",
    )

    // Verify message on joiner side
    console.log('--- WAITING FOR MESSAGE ON JOINER ---')
    const received = await waitFor(
      joinerView,
      `document.body.innerText.includes('${messageText}')`,
    )
    expect(received).toBeTruthy()
    console.log('--- TEST PASSED ---')
  } finally {
    hostView.close()
    joinerView.close()
    server.stop()
  }
}, 40000)

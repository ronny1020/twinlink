import index from './index.html'

const server = Bun.serve({
  port: 3000,
  routes: {
    '/': index,
  },
  development: true, // Enable HMR
})

console.log(`Demo server running at ${server.url}`)

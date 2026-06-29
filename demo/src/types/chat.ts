export type ChatMessage = {
  type: 'chat'
  text: string
}

export type Message = {
  id: string
  text: string
  sender: 'me' | 'them'
  timestamp: number
}

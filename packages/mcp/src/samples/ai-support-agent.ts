const FENCE = "```";

export const AI_SUPPORT_AGENT = `arch "AI Support Agent" v0.1

component widget "Chat Widget" @chat_ui {
  desc "Embedded in the app and the help center. Streams replies as they're written."
}

component guardrails "Guardrails" @guardrails {
  desc "Checks every turn both ways: prompt injection coming in, PII and off-policy promises going out."
}

component agent "Support Agent" @agent {
  desc "Answers from the help center, and looks up orders and issues refunds through MCP tools."
  src "services/agent"
  instructions markdown ${FENCE}
  - Answer only from retrieved articles, and link the ones you used.
  - Never promise a refund: the refunds tool decides what policy allows.
  - If the customer asks for a person, say one will follow up, and stop.
  ${FENCE}
}

component llm "Claude" @anthropic

component memory "Conversations" @memory {
  desc "Every conversation, plus a running summary per customer so the next chat picks up where the last one left off."
}

component evals "Evals" @evals {
  desc "Nightly: grades a sample of yesterday's conversations for accuracy, tone and policy."
}

component tools "MCP Servers" {
  component orders "Orders" @mcp {
    desc "Read-only lookups against the order service."
    tools table ${FENCE}
    | tool        | does                          |
    | ----------- | ----------------------------- |
    | get_order   | status, items and tracking    |
    | list_orders | a customer's recent orders    |
    ${FENCE}
  }
  component refunds "Refunds" @mcp {
    desc "Refunds up to $50 inside the return window. Anything bigger waits for a person."
    tools table ${FENCE}
    | tool          | does                            |
    | ------------- | ------------------------------- |
    | check_refund  | what policy allows for an order |
    | create_refund | issues it, or asks for approval |
    ${FENCE}
  }
}

component team "Support Team" @human_review {
  desc "Approves refunds over the limit, with the conversation and the agent's reasoning attached."
}

component knowledge "Knowledge Base" @knowledge_base {
  component ingest "Ingestion" @worker {
    desc "Re-chunks and re-embeds a help-center article whenever it's published or edited."
  }
  component embeddings "Embeddings" @openai
  component retriever "Retriever" @rag {
    desc "Hybrid search over help-center chunks; returns the best five with their article links."
  }
  component vectors "Chunks" @pgvector
}

agent -> knowledge.retriever @http : "search"
agent -> llm @http : "messages"
agent -> memory : "history"
agent -> tools.orders @mcp

agent -> tools.refunds @mcp : "create_refund" {
  call json ${FENCE}
  { "order_id": "uuid", "amount_cents": "int", "reason": "text" }
  ${FENCE}
}

evals -> memory @reads : "nightly"
guardrails -> agent @http
knowledge.ingest -> knowledge.embeddings @http
knowledge.ingest -> knowledge.vectors @writes
knowledge.retriever -> knowledge.embeddings @http : "embed query"
knowledge.retriever -> knowledge.vectors @sql : "similarity"
tools.refunds -> team @event : "needs approval"
widget -> guardrails @http : "chat"

layout {
  agent: { at: [15, 8], size: [4, 3] }
  evals: { at: [28, 15], size: [4, 3] }
  guardrails: { at: [8, 8], size: [4, 3] }
  knowledge: { at: [0, 17], size: [20, 12], display: plane }
  knowledge.embeddings: { at: [8, 2], size: [4, 3] }
  knowledge.ingest: { at: [1, 5], size: [4, 3] }
  knowledge.retriever: { at: [15, 5], size: [4, 3] }
  knowledge.vectors: { at: [8, 8], size: [4, 3] }
  llm: { at: [22, 8], size: [4, 3] }
  memory: { at: [21, 15], size: [4, 3] }
  team: { at: [27, 2], size: [4, 3] }
  tools: { at: [10, 0], size: [14, 6], display: plane }
  tools.orders: { at: [1, 2], size: [4, 3] }
  tools.refunds: { at: [9, 2], size: [4, 3] }
  widget: { at: [1, 8], size: [4, 3] }
}
`;

const FENCE = "```";

export const AI_SUPPORT_AGENT = `arch "AI Support Agent" v0.2

component widget "Chat Widget" @chat_ui {
  shape browser
  desc "Embedded in the app and the help center. Streams replies as they're written."
}

component guardrails "Guardrails" @guardrails {
  shape shield
  desc "Checks every turn both ways: prompt injection coming in, PII and off-policy promises going out."
}

component agent "Support Agent" @agent {
  shape robot
  desc "Answers from the help center, and looks up orders and issues refunds through MCP tools."
  src "services/agent"
  instructions markdown ${FENCE}
  - Answer only from retrieved articles, and link the ones you used.
  - Never promise a refund: the refunds tool decides what policy allows.
  - If the customer asks for a person, say one will follow up, and stop.
  ${FENCE}
}

component llm "Claude" @anthropic {
  shape cloud
}

component memory "Conversations" @memory {
  shape cylinder
  desc "Every conversation, plus a running summary per customer so the next chat picks up where the last one left off."
}

component evals "Evals" @evals {
  shape gauge
  desc "Nightly: grades a sample of yesterday's conversations for accuracy, tone and policy."
}

plane tools "MCP Servers" {
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
    color amber
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
  shape people
  color amber
  desc "Approves refunds over the limit, with the conversation and the agent's reasoning attached."
}

component knowledge "Knowledge Base" @knowledge_base {
  shape book
  component ingest "Ingestion" @worker {
    shape gear
    desc "Re-chunks and re-embeds a help-center article whenever it's published or edited."
  }
  component embeddings "Embeddings" @openai {
    shape cloud
  }
  component retriever "Retriever" @rag {
    shape search
    desc "Hybrid search over help-center chunks; returns the best five with their article links."
  }
  component vectors "Chunks" @pgvector {
    shape cylinder
  }
}

agent -> knowledge.retriever @http : "search"
agent -> llm @http : "messages"
agent -> memory : "history"
agent -> orders @mcp

agent -> refunds @mcp : "create_refund" {
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
refunds -> team @event : "needs approval"
widget -> guardrails @http : "chat"

layout {
  agent: { at: [15, 8], size: [4, 3] }
  evals: { at: [28, 15], size: [4, 3] }
  guardrails: { at: [8, 8], size: [4, 3] }
  knowledge: { at: [15, 15], size: [4, 3] }
  knowledge.embeddings: { at: [7, 0], size: [4, 3] }
  knowledge.ingest: { at: [0, 3], size: [4, 3] }
  knowledge.retriever: { at: [14, 3], size: [4, 3] }
  knowledge.vectors: { at: [7, 6], size: [4, 3] }
  llm: { at: [22, 8], size: [4, 3] }
  memory: { at: [21, 15], size: [4, 3] }
  orders: { at: [1, 2], size: [4, 3] }
  refunds: { at: [9, 2], size: [4, 3] }
  team: { at: [27, 2], size: [4, 3] }
  tools: { at: [10, 0], size: [14, 6] }
  widget: { at: [1, 8], size: [4, 3] }
}
`;

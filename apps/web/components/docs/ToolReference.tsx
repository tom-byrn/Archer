import { Fragment } from "react";
import {
  RESOURCES_INTRO,
  referenceIntro,
  type CodeBlock,
  type Reference,
  type ToolEntry,
} from "@archer/mcp/toolReference";
import { renderInline } from "@/lib/docs";
import { highlightArch } from "@/lib/highlightArch";

// The generated part of /docs/mcp: every tool as the server lists it, with its
// example. Rendered inside the page's `.spec` article, so it takes its type
// styles from there (and the `spec-*` classes in globals.css). Agents get the
// same reference as markdown (referenceMarkdown, in the page's `.md`).

/** Markdown we wrote (intros, notes). */
const Inline = ({ markdown, as: Tag = "p" }: { markdown: string; as?: "p" | "li" }) => (
  <Tag dangerouslySetInnerHTML={{ __html: renderInline(markdown) }} />
);

/** Text from the server (written for agents): plain, with `code` spans. */
const CodeSpans = ({ text }: { text: string }) =>
  text.split(/`([^`]+)`/).map((part, i) =>
    i % 2 === 1 ? <code key={i}>{part}</code> : <Fragment key={i}>{part}</Fragment>,
  );

/** Archer source colored like the editor's code view. */
function Highlighted({ source }: { source: string }) {
  return highlightArch(source).map((tokens, i) => (
    <Fragment key={i}>
      {i > 0 && "\n"}
      {tokens.map((t, j) =>
        t.className ? (
          <span key={j} className={t.className}>
            {t.text}
          </span>
        ) : (
          t.text
        ),
      )}
    </Fragment>
  ));
}

function Code({ block }: { block: CodeBlock }) {
  return (
    <>
      {block.label && (
        <p className="spec-caption">
          <code>{block.label}</code>
        </p>
      )}
      <pre>
        <code className={`language-${block.lang}`}>
          {block.lang === "arch" ? <Highlighted source={block.code} /> : block.code}
        </code>
      </pre>
    </>
  );
}

function Tool({ tool }: { tool: ToolEntry }) {
  return (
    <section className="spec-tool">
      <h4 id={tool.id}>
        <a href={`#${tool.id}`}>
          <code>{tool.name}</code>
        </a>
      </h4>
      <p className="spec-caption">
        <strong>{tool.title}</strong> · {tool.access}
      </p>
      {tool.description.map((p, i) => (
        <p key={i}>
          <CodeSpans text={p} />
        </p>
      ))}
      {tool.params.length === 0 ? (
        <p>No parameters.</p>
      ) : (
        <>
          <p className="spec-caption">Parameters</p>
          <dl className="spec-params">
            {tool.params.map((p) => (
              <div key={p.name}>
                <dt>
                  <code>{p.name}</code> <span className="spec-type">{p.type}</span>
                  {p.required && <span className="spec-required">required</span>}
                </dt>
                {p.description && <dd>{p.description}</dd>}
              </div>
            ))}
          </dl>
          <p className="spec-caption">Example call</p>
          {tool.call.map((block, i) => (
            <Code key={i} block={block} />
          ))}
        </>
      )}
      <p className="spec-caption">{tool.params.length === 0 ? "Example result" : "Result"}</p>
      <Code block={tool.result} />
      {tool.notes.length > 0 && (
        <ul>
          {tool.notes.map((note, i) => (
            <Inline key={i} as="li" markdown={note} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function ToolReference({ reference }: { reference: Reference }) {
  return (
    <>
      <Inline markdown={referenceIntro(reference)} />
      <div className="spec-table">
        <table>
          <thead>
            <tr>
              <th>Group</th>
              <th>Tools</th>
            </tr>
          </thead>
          <tbody>
            {reference.groups.map((g) => (
              <tr key={g.id}>
                <td>
                  <a href={`#${g.id}`}>{g.title}</a>
                </td>
                <td>
                  {g.tools.map((t, i) => (
                    <Fragment key={t.id}>
                      {i > 0 && " · "}
                      <a href={`#${t.id}`}>
                        <code>{t.name}</code>
                      </a>
                    </Fragment>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reference.groups.map((g) => (
        <Fragment key={g.id}>
          <h3 id={g.id}>
            <a href={`#${g.id}`}>{g.title}</a>
          </h3>
          <Inline markdown={g.intro} />
          {g.tools.map((t) => (
            <Tool key={t.id} tool={t} />
          ))}
        </Fragment>
      ))}

      <h3 id={reference.resourcesId}>
        <a href={`#${reference.resourcesId}`}>Resources</a>
      </h3>
      <Inline markdown={RESOURCES_INTRO} />
      <dl className="spec-params">
        {reference.resources.map((r) => (
          <div key={r.uri}>
            <dt>
              <code>{r.uri}</code> <span className="spec-type">{r.mimeType}</span>
            </dt>
            <dd>
              <strong>{r.title}.</strong> <CodeSpans text={r.description} />
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

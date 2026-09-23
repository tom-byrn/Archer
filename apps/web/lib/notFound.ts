/**
 * The 404 page's document: the visitor's request as a tiny Archer diagram
 * whose last hop points at a page that was never declared. The problem shown
 * under it is the real validator's output, not copy, so the page can't drift
 * from the language (`test/notFound.test.ts` keeps it canonical and failing
 * the way the page says).
 */

import { componentPaths, parse, pathToString, validate, type Diagnostic } from "@archer/lang";

export const NOT_FOUND_SOURCE = `arch "Your Request" v0.1

component you "You" @browser

component archer "Archer" @vercel.nextjs

archer -> page : "render"
you -> archer @http
`;

export interface NotFoundProblem {
  diagnostic: Diagnostic;
  /** The connection endpoint that doesn't resolve, underlined on the diagnostic's line. */
  missing?: string;
}

/** The validator's errors for `NOT_FOUND_SOURCE`. */
export function notFoundProblems(): NotFoundProblem[] {
  const { doc, diagnostics } = parse(NOT_FOUND_SOURCE);
  const declared = componentPaths(doc);
  return [...diagnostics, ...validate(doc)]
    .filter((d) => d.severity === "error")
    .map((diagnostic) => {
      const line = diagnostic.span?.start.line;
      const connection = doc.connections.find((c) => c.span.start.line === line);
      const missing = connection
        ? [connection.source, connection.target].map(pathToString).find((p) => !declared.has(p))
        : undefined;
      return { diagnostic, missing };
    });
}

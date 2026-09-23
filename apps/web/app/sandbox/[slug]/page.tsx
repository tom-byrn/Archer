import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SandboxEditor } from "@/components/SandboxEditor";
import { EXAMPLES, findExample } from "@/lib/examples";

type Props = { params: Promise<{ slug: string }> };

// One page per docs example, prerendered at build time; other slugs are 404s.
export const dynamicParams = false;

export function generateStaticParams() {
  return EXAMPLES.map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const example = findExample((await params).slug);
  return { title: example ? `${example.title} · Sandbox · Archer` : "Sandbox · Archer" };
}

/**
 * `/sandbox/<slug>`: a docs example ("Open in sandbox") in the real editor.
 * Public (see middleware.ts), so no account is needed, and nothing is saved.
 */
export default async function SandboxPage({ params }: Props) {
  const example = findExample((await params).slug);
  if (!example) notFound();
  return (
    <SandboxEditor
      source={example.source}
      back={{ href: `/language/examples#${example.slug}`, label: "Back to examples" }}
    />
  );
}

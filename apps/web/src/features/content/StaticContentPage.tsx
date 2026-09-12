import { STATIC_CONTENT, type ContentKey } from './content';

export interface StaticContentPageProps {
  pageKey: ContentKey;
}

export function StaticContentPage({ pageKey }: StaticContentPageProps) {
  const content = STATIC_CONTENT[pageKey];

  return (
    <article className="static-content">
      <h1>{content.title}</h1>
      {content.intro ? <p className="static-content__intro">{content.intro}</p> : null}
      {content.blocks.map((block, index) => (
        <section key={`${pageKey}-${index}`} className="static-content__section">
          {block.heading ? <h2>{block.heading}</h2> : null}
          {block.paragraphs.map((paragraph, paragraphIndex) => (
            <p key={paragraphIndex}>{paragraph}</p>
          ))}
        </section>
      ))}
    </article>
  );
}
import { publicPageMetadata } from '../../marketing/public-metadata';
import { PublicPage } from '../../marketing/sections';
import { SupportForm } from '../support-form';

export const metadata = publicPageMetadata({
  title: 'New support request — FounderChatters',
  description:
    'Send a support request to the FounderChatters team. This form is not indexed.',
  path: '/support/new',
  index: false,
});

export default async function SupportNewPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  return (
    <PublicPage>
      <section className="fc-mkt-prose">
        <p className="fc-label fc-mkt-kicker">Support</p>
        <h1 className="fc-h1">New support request</h1>
        <p className="fc-body">
          Tell the team what you need help with. If you are signed in, the
          request is attached to your account. Guests can still submit.
        </p>
      </section>
      <SupportForm initialCategory={category} />
    </PublicPage>
  );
}

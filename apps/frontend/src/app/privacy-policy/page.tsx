import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | BIZGITAL Insight Capture Bridge',
  description:
    'Privacy Policy for the BIZGITAL Insight Capture Bridge Chrome extension.'
};

const LAST_UPDATED = 'May 8, 2026';

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="rounded-3xl border border-border/80 bg-card/80 p-6 shadow-sm backdrop-blur sm:p-8">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          BIZGITAL Insight Capture Bridge
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground sm:text-4xl">Privacy Policy</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

        <section className="mt-8 space-y-4 text-sm leading-7 text-foreground/95 sm:text-base">
          <h2 className="text-xl font-semibold text-foreground">1. Scope</h2>
          <p>
            This Privacy Policy applies to the BIZGITAL Insight Capture Bridge browser extension
            used by authorized BIZGITAL team members for internal reporting workflows.
          </p>
          <p>
            The extension helps users capture insight views from supported web pages and transfer
            the result into internal BIZGITAL reporting processes.
          </p>
        </section>

        <section className="mt-8 space-y-4 text-sm leading-7 text-foreground/95 sm:text-base">
          <h2 className="text-xl font-semibold text-foreground">2. Data We Handle</h2>
          <p>
            The extension may handle website content that is required to perform a user-requested
            capture action, including page text and screenshot output from the target page.
          </p>
          <p>The extension may also store limited technical settings and runtime status data:</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>Local app origin setting for internal routing.</li>
            <li>Temporary runtime status and capture progress logs.</li>
          </ul>
        </section>

        <section className="mt-8 space-y-4 text-sm leading-7 text-foreground/95 sm:text-base">
          <h2 className="text-xl font-semibold text-foreground">3. How We Use Data</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>To execute user-initiated insight capture workflows.</li>
            <li>To generate and save capture files requested by the user.</li>
            <li>To provide runtime feedback, status, and troubleshooting visibility.</li>
            <li>To operate and improve the extension for its single internal purpose.</li>
          </ul>
        </section>

        <section className="mt-8 space-y-4 text-sm leading-7 text-foreground/95 sm:text-base">
          <h2 className="text-xl font-semibold text-foreground">4. Data Sharing</h2>
          <p>
            We do not sell user data. We do not transfer user data to third parties except when
            required to provide the extension&apos;s core internal functionality, comply with law,
            or protect security and integrity.
          </p>
          <p>
            Data handled by this extension is intended for BIZGITAL internal reporting use and is
            not used for unrelated advertising or creditworthiness decisions.
          </p>
        </section>

        <section className="mt-8 space-y-4 text-sm leading-7 text-foreground/95 sm:text-base">
          <h2 className="text-xl font-semibold text-foreground">5. Storage and Retention</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>
              In-memory/session runtime status is retained only as needed during browser session
              activity.
            </li>
            <li>Local extension settings remain until changed or cleared by the user/admin.</li>
            <li>Capture files saved to disk remain until deleted by the user or admin.</li>
          </ul>
        </section>

        <section className="mt-8 space-y-4 text-sm leading-7 text-foreground/95 sm:text-base">
          <h2 className="text-xl font-semibold text-foreground">6. Security</h2>
          <p>
            We apply reasonable technical and organizational safeguards to protect data handled by
            this extension, including permission-scoped access and secure internal workflows.
          </p>
        </section>

        <section className="mt-8 space-y-4 text-sm leading-7 text-foreground/95 sm:text-base">
          <h2 className="text-xl font-semibold text-foreground">7. Your Choices</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>You can disable or uninstall the extension at any time.</li>
            <li>You can remove downloaded capture files from local storage at any time.</li>
            <li>You can clear extension data using browser extension management tools.</li>
          </ul>
        </section>

        <section className="mt-8 space-y-4 text-sm leading-7 text-foreground/95 sm:text-base">
          <h2 className="text-xl font-semibold text-foreground">8. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Material changes will be reflected
            by updating the Last updated date on this page.
          </p>
        </section>

        <section className="mt-8 space-y-4 text-sm leading-7 text-foreground/95 sm:text-base">
          <h2 className="text-xl font-semibold text-foreground">9. Contact</h2>
          <p>
            For privacy questions about this extension, contact BIZGITAL through your internal
            administrator or the official website at{' '}
            <Link className="text-primary underline underline-offset-4" href="https://report.bizgital.com/">
              https://report.bizgital.com/
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}

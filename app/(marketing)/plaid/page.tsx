export default function PlaidRedirectPage() {
  return (
    <main>
      <h1>Return to today.money</h1>
      <p>If you opened this in a browser, tap below to return to the app.</p>
      <a className="cta" href="https://today.money/plaid">
        Return to App
      </a>
      <script
        dangerouslySetInnerHTML={{
          __html: `window.setTimeout(() => { try { window.close(); } catch (_) {} }, 800);`,
        }}
      />
    </main>
  );
}

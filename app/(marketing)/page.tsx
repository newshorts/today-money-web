export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <h1>today.money</h1>
        <p>
          A focused daily budget for iOS. Connect Plaid or use manual mode and get a clean “Remaining
          Today” number.
        </p>
        <a className="cta" href="https://apps.apple.com" rel="noreferrer">
          Download on iOS
        </a>
        <nav className="nav" aria-label="Site links">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/support">Support</a>
        </nav>
      </section>
    </main>
  );
}

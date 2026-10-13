export default function PricingPage() {
  return (
    <section className="page">
      <h2 style={{ textAlign: 'center' }}>Pricing</h2>
      <p className="muted" style={{ textAlign: 'center' }}>
        Simple plans. No credit card required for Free.
      </p>
      <div className="plan-grid">
        <div className="plan-card">
          <h3>Free</h3>
          <div className="plan-price">
            $0<span>/mo</span>
          </div>
          <ul>
            <li>120 minutes of transcription / month</li>
            <li>All languages &amp; live recording</li>
            <li>TXT / SRT / VTT / MD export</li>
            <li>7-day transcript history</li>
          </ul>
          <a href="#/register" className="btn btn-ghost">
            Get started
          </a>
        </div>
        <div className="plan-card featured">
          <h3>Pro</h3>
          <div className="plan-price">
            $12<span>/mo</span>
          </div>
          <ul>
            <li>1,500 minutes of transcription / month</li>
            <li>AI summaries, meeting notes &amp; Q&amp;A</li>
            <li>DOCX / PDF export, batch uploads</li>
            <li>Unlimited transcript history</li>
          </ul>
          <button className="btn btn-primary" disabled title="Payments aren't wired up in this build yet">
            Coming soon
          </button>
        </div>
        <div className="plan-card">
          <h3>Team</h3>
          <div className="plan-price">
            $39<span>/mo</span>
          </div>
          <ul>
            <li>Everything in Pro</li>
            <li>Shared folders &amp; shareable links</li>
            <li>Admin usage dashboard</li>
            <li>Priority processing</li>
          </ul>
          <button className="btn btn-ghost" disabled title="Payments aren't wired up in this build yet">
            Coming soon
          </button>
        </div>
      </div>
      <p className="muted" style={{ textAlign: 'center', marginTop: 18 }}>
        Pro/Team checkout isn't connected to a real payment processor in this build — ask the
        maintainer to wire up Stripe before launch.
      </p>
    </section>
  );
}

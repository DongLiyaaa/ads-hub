export default function StatCard({ icon: Icon, label, value, note, rawValue }) {
  return (
    <article className="stat-card">
      <div className="stat-card__topline">
        <span className="stat-card__label">{label}</span>
        <span className="stat-card__icon"><Icon size={19} strokeWidth={1.8} aria-hidden="true" /></span>
      </div>
      <div className="stat-card__value" title={rawValue}>{value}</div>
      <div className="stat-card__note">{note}</div>
    </article>
  );
}
